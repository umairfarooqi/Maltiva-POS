// @vitest-environment node
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isolatedServer } from './helpers/isolated-server';
import { reviewSale, saleFixture } from './helpers/sale-fixtures';

describe('full database backup and transactional restore', () => {
  let server: Awaited<ReturnType<typeof isolatedServer>>, db: InstanceType<typeof Database>, token: string;
  let sequence = 0;
  const call = (route: string, body?: any, auth = token, method = body === undefined ? 'GET' : 'POST') => fetch(`${server.url}${route}`, {
    method, headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  async function login(username = 'admin') {
    const response = await call('/api/auth/login', { username, password: 'fixture-only-secret' }, '');
    expect(response.status).toBe(200); return (await response.json()).token;
  }
  async function makeBackup() {
    const response = await call('/api/maintenance/backups', {});
    const body = await response.json(); expect(body, JSON.stringify(body)).toHaveProperty('filename');
    expect(response.status).toBe(201);
    const download = await call(`/api/maintenance/backups/${body.filename}`);
    expect(download.status).toBe(200);
    return { ...body, bytes: Buffer.from(await download.arrayBuffer()) };
  }
  const previewRequest = (bytes: Buffer, auth = token) => fetch(`${server.url}/api/maintenance/restore/preview`, {
    method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/octet-stream' }, body: new Uint8Array(bytes).buffer,
  });
  async function preview(bytes: Buffer) {
    const response = await previewRequest(bytes); const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200); return body;
  }
  const restore = (review: any, extra = {}) => call('/api/maintenance/restore', { token: review.token, password: 'fixture-only-secret', confirmation: 'RESTORE', ...extra });
  async function sale(suffix: string) {
    const order = await reviewSale(server.url, { ...saleFixture(`backup-${sequence}-${suffix}`),
      databaseGeneration: (db.prepare("SELECT value FROM settings WHERE key='databaseGeneration'").get() as any).value }, token);
    const response = await call('/api/orders', order); expect(response.status).toBe(201); return (await response.json()).order;
  }
  beforeAll(async () => { server = await isolatedServer(); db = new Database(server.dbPath); }, 30000);
  afterAll(async () => { db?.close(); await server?.cleanup(); });
  beforeEach(async () => { sequence++; token = await login(); });

  it('captures committed WAL contents and all sale/payment/stock data without the browser cache', async () => {
    db.pragma('wal_autocheckpoint=0');
    const saved = await sale('wal');
    const stock = db.prepare('SELECT stockQuantity FROM products WHERE id=?').get(saved.items[0].productId);
    const backup = await makeBackup();
    const file = path.join(path.dirname(server.dbPath), 'check-download.db'); fs.writeFileSync(file, backup.bytes);
    const copy = new Database(file, { readonly: true });
    try {
      expect(copy.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(copy.prepare('SELECT id,total_paisa FROM orders WHERE id=?').get(saved.id)).toEqual({ id: saved.id, total_paisa: saved.totalPaisa });
      expect(copy.prepare('SELECT stockQuantity FROM products WHERE id=?').get(saved.items[0].productId)).toEqual(stock);
      for (const table of ['order_items', 'payments', 'stock_movements', 'inventory_logs', 'order_counters', 'checkout_intents', 'users', 'settings']) {
        expect(copy.prepare(`SELECT count(*) n FROM ${table}`).get()).toEqual(db.prepare(`SELECT count(*) n FROM ${table}`).get());
      }
    } finally { copy.close(); }
    expect((await (await call('/api/maintenance/backups')).json()).backups.some((entry: any) => entry.filename === backup.filename)).toBe(true);
  });

  it('restores the complete snapshot, keeps an exact safety copy, revokes sessions and does not reuse issued tokens', async () => {
    const before = await sale('before'), backup = await makeBackup();
    const after = await sale('after');
    db.prepare('UPDATE products SET name=? WHERE id=?').run('Changed after backup', before.items[0].productId);
    const currentOrders = (db.prepare('SELECT count(*) n FROM orders').get() as any).n;
    const review = await preview(backup.bytes);
    expect(review.current.counts.orders).toBe(currentOrders);
    expect(review.backup.counts.orders).toBe(currentOrders - 1);
    const response = await restore(review); const result = await response.json(); expect(response.status, JSON.stringify(result)).toBe(200);
    expect(db.prepare('SELECT id FROM orders WHERE id=?').get(after.id)).toBeUndefined();
    expect(db.prepare('SELECT id FROM orders WHERE id=?').get(before.id)).toBeTruthy();
    expect((db.prepare('SELECT name FROM products WHERE id=?').get(before.items[0].productId) as any).name).not.toBe('Changed after backup');
    expect((db.prepare('SELECT count(*) n FROM auth_sessions').get() as any).n).toBe(0);
    const original = new Database(path.join(path.dirname(server.dbPath), 'backups', backup.filename), { readonly: true });
    try {
      for (const table of ['categories', 'products', 'users', 'orders', 'order_items', 'payments', 'stock_movements', 'inventory_logs', 'checkout_intents', 'tables', 'schema_migrations', 'legacy_money_audit']) {
        expect(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).toEqual(original.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
      }
    } finally { original.close(); }
    expect((await call('/api/auth/session')).status).toBe(401);
    const safety = new Database(path.join(path.dirname(server.dbPath), 'backups', result.safetyFilename), { readonly: true });
    try { expect(safety.prepare('SELECT id FROM orders WHERE id=?').get(after.id)).toBeTruthy(); expect(safety.pragma('integrity_check', { simple: true })).toBe('ok'); }
    finally { safety.close(); }
    token = await login(); const next = await sale('next');
    expect(next.tokenNumber).toBeGreaterThan(after.tokenNumber);
    const replay = await call('/api/orders', { idempotencyKey: before.idempotencyKey });
    expect(replay.status).toBe(201); expect((await replay.json()).order.tokenNumber).toBe(before.tokenNumber);
    const stale = await call('/api/orders', { ...after, id: `${after.id}-stale`, idempotencyKey: `${after.idempotencyKey}-stale`, persistenceState: 'pending' });
    expect(stale.status).toBe(409); expect((await stale.json()).code).toBe('DATABASE_CHANGED');
    const legacy = await call('/api/orders/quote', { ...after, databaseGeneration: undefined });
    expect(legacy.status).toBe(409); expect((await legacy.json()).code).toBe('DATABASE_CHANGED');
    await server.stop(); await server.start();
    expect((await call('/api/auth/session', undefined, token)).status).toBe(200);
  });

  it('rejects malformed and browser JSON uploads without changing any server data', async () => {
    const before = db.prepare('SELECT * FROM orders').all();
    for (const bytes of [Buffer.from('{}'), Buffer.from('SQLite format 3\0' + 'x'.repeat(300))]) expect((await previewRequest(bytes)).status).toBe(400);
    expect(db.prepare('SELECT * FROM orders').all()).toEqual(before);
  });

  it('rejects incompatible schema, broken references and missing administrator accounts', async () => {
    const backup = await makeBackup();
    for (const sql of ['CREATE TABLE unexpected (id TEXT)', "UPDATE order_items SET orderId='missing-order'", "UPDATE users SET active=0 WHERE role='admin'"]) {
      const file = path.join(path.dirname(server.dbPath), `bad-${Math.random()}.db`); fs.writeFileSync(file, backup.bytes);
      const copy = new Database(file); copy.pragma('foreign_keys=OFF'); copy.exec(sql); copy.pragma('wal_checkpoint(TRUNCATE)'); copy.close();
      expect((await previewRequest(fs.readFileSync(file))).status).toBe(400);
    }
  });

  it('requires admin permission on every backup/restore route and does not permit path traversal', async () => {
    const cashier = await login('cashier');
    expect((await call('/api/users', { username: 'backup-manager', name: 'Manager', role: 'manager', password: 'fixture-only-secret', pin: '2468' })).status).toBe(201);
    const manager = await login('backup-manager');
    for (const auth of ['', cashier, manager]) {
      const expected = auth ? 403 : 401;
      expect((await call('/api/maintenance/backups', undefined, auth)).status).toBe(expected);
      expect((await call('/api/maintenance/backups', {}, auth)).status).toBe(expected);
      expect((await call('/api/maintenance/backups/backup-nope.db', undefined, auth)).status).toBe(expected);
      expect((await previewRequest(Buffer.from('{}'), auth)).status).toBe(expected);
      expect((await call('/api/maintenance/restore/preview/missing', undefined, auth, 'DELETE')).status).toBe(expected);
      expect((await call('/api/maintenance/restore', {}, auth)).status).toBe(expected);
    }
    expect((await call('/api/maintenance/backups/%2e%2e%5cmaltiva_pos.db')).status).toBe(404);
  });

  it('requires password and confirmation and binds the preview to its authenticated session', async () => {
    const backup = await makeBackup(), review = await preview(backup.bytes);
    expect((await restore(review, { password: 'incorrect' })).status).toBe(400);
    expect((await restore(review, { confirmation: '' })).status).toBe(400);
    const anotherSession = await login();
    expect((await call('/api/maintenance/restore', { token: review.token, password: 'fixture-only-secret', confirmation: 'RESTORE' }, anotherSession)).status).toBe(409);
    expect((await call('/api/auth/session')).status).toBe(200);
  });

  it('refuses restore when sales changed after the preview', async () => {
    const backup = await makeBackup(), review = await preview(backup.bytes), saved = await sale('after-preview');
    const response = await restore(review);
    expect(response.status).toBe(409); expect((await response.json()).error).toContain('changed after preview');
    expect(db.prepare('SELECT id FROM orders WHERE id=?').get(saved.id)).toBeTruthy();
  });

  it('rate limits repeated incorrect restore passwords', async () => {
    expect((await call('/api/users', { username: 'restore-rate-limit', name: 'Restore admin', role: 'admin', password: 'fixture-only-secret', pin: '4567' })).status).toBe(201);
    token = await login('restore-rate-limit');
    const backup = await makeBackup(), review = await preview(backup.bytes);
    for (let attempt = 0; attempt < 5; attempt++) expect((await restore(review, { password: 'incorrect' })).status).toBe(400);
    expect((await restore(review)).status).toBe(429);
    expect((await call('/api/auth/session')).status).toBe(200);
  });
});
