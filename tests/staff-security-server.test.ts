// @vitest-environment node
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedServer } from './helpers/isolated-server';

describe('staff account history, host guard and self-service re-authentication', () => {
  let server: Awaited<ReturnType<typeof isolatedServer>>;
  let db: InstanceType<typeof Database>;
  let adminToken = '';
  const call = (route: string, token: string, method = 'GET', body?: unknown) => fetch(server.url + route, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const login = async (username: string, secret: string) => {
    const res = await fetch(server.url + '/api/auth/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: secret }) });
    return (await res.json()).token as string;
  };
  const events = async () => (await (await call('/api/users/events', adminToken)).json()).events as any[];
  /** Raw request so the Host header can be set to anything. */
  const withHost = (host: string) => new Promise<number>((resolve, reject) => {
    const { port } = new URL(server.url);
    http.get({ host: '127.0.0.1', port, path: '/api/health', headers: { Host: host } }, res => {
      res.resume(); resolve(res.statusCode!);
    }).on('error', reject);
  });

  beforeAll(async () => {
    server = await isolatedServer();
    db = new Database(server.dbPath);
    adminToken = server.token;
  }, 30000);
  afterAll(async () => { db?.close(); await server?.cleanup(); });

  it('answers only to known host names, which blocks DNS rebinding', async () => {
    const { port } = new URL(server.url);
    expect(await withHost(`127.0.0.1:${port}`)).toBe(200);
    expect(await withHost(`localhost:${port}`)).toBe(200);
    expect(await withHost(`attacker.example:${port}`)).toBe(421);
    expect(await withHost('127.0.0.1.attacker.example')).toBe(421);
  });

  it('records who created, promoted, suspended, reactivated and reset each account', async () => {
    const created = await call('/api/users', adminToken, 'POST',
      { name: 'Audit Target', username: 'audit.target', role: 'cashier', password: 'target-secret', pin: '2580' });
    expect(created.status).toBe(201);
    const { id } = await created.json();
    expect((await call(`/api/users/${id}`, adminToken, 'PUT', { role: 'manager' })).status).toBe(200);
    expect((await call(`/api/users/${id}`, adminToken, 'PUT', { active: false })).status).toBe(200);
    expect((await call(`/api/users/${id}`, adminToken, 'PUT', { active: true })).status).toBe(200);
    expect((await call(`/api/users/${id}/reset-pin`, adminToken, 'POST', { pin: '1470' })).status).toBe(200);

    const history = (await events()).filter(event => event.targetId === id).reverse();
    expect(history.map(event => [event.action, event.detail])).toEqual([
      ['created', 'cashier'], ['role_changed', 'cashier to manager'], ['suspended', ''],
      ['reactivated', ''], ['pin_changed', 'reset and unlocked'],
    ]);
    for (const event of history) expect(event).toMatchObject({ actorId: 'user-admin', actorUsername: 'admin', targetUsername: 'audit.target' });
  });

  it('does not record anything for a rejected change, and rejects a non-boolean status', async () => {
    const before = (await events()).length;
    expect((await call('/api/users/user-cashier', adminToken, 'PUT', { active: 'false' })).status).toBe(400);
    expect((await call('/api/users/user-cashier', adminToken, 'PUT', { role: 'owner' })).status).toBe(400);
    expect((await events()).length).toBe(before);
    expect(db.prepare("SELECT active FROM users WHERE id='user-cashier'").get()).toEqual({ active: 1 });
  });

  it('shows account history to administrators only', async () => {
    const cashier = await login('cashier', 'fixture-only-secret');
    expect((await call('/api/users/events', cashier)).status).toBe(403);
    const till = await login('admin', '1234');
    expect((await call('/api/users/events', till)).status).toBe(403);
  });

  it('keeps account history when an older backup without it is restored', async () => {
    const backupPath = join(dirname(server.dbPath), 'pre-history-backup.db');
    await db.backup(backupPath);
    const older = new Database(backupPath); older.exec('DROP TABLE staff_events'); older.pragma('wal_checkpoint(TRUNCATE)'); older.close();
    const before = await events();
    expect(before.length).toBeGreaterThan(0);
    const preview = await fetch(server.url + '/api/maintenance/restore/preview', { method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${adminToken}` }, body: readFileSync(backupPath) });
    expect(preview.status).toBe(200);
    const restore = await call('/api/maintenance/restore', adminToken, 'POST',
      { token: (await preview.json()).token, password: 'fixture-only-secret', confirmation: 'RESTORE' });
    expect(restore.status).toBe(200);
    adminToken = await login('admin', 'fixture-only-secret');
    expect((await events()).map(event => event.id)).toEqual(before.map(event => event.id));
  });

  it('keeps every email unique and rejects malformed ones and short new passwords', async () => {
    const create = (overrides: object) => call('/api/users', adminToken, 'POST',
      { name: 'Email Check', username: 'email.check', role: 'cashier', password: 'long-enough', pin: '3690', ...overrides });
    // The fixture cashier uses cashier@maltivacrust.com: another account may not claim it.
    expect((await create({ email: 'CASHIER@maltivacrust.com' })).status).toBe(409);
    expect((await create({ email: 'not-an-email' })).status).toBe(400);
    const short = await create({ password: 'short7!' });
    expect(short.status).toBe(400);
    expect((await short.json()).error).toBe('Password must be at least 8 characters.');
    expect((await call('/api/users/user-cashier/reset-pin', adminToken, 'POST', { pin: '1357', password: 'short7!' })).status).toBe(400);
    const ok = await create({ email: 'Email.Check@Example.com' });
    expect(ok.status).toBe(201);
    expect((await ok.json()).email).toBe('email.check@example.com');
  });

  it('sends a generic message for database errors instead of internal details', async () => {
    db.exec("CREATE TRIGGER fail_category BEFORE INSERT ON categories BEGIN SELECT RAISE(ABORT, 'secret internal detail'); END");
    try {
      const res = await call('/api/categories', adminToken, 'POST', { name: 'Leaky', icon: 'x' });
      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toContain('secret internal detail');
    } finally { db.exec('DROP TRIGGER fail_category'); }
    // Validation messages written for staff are still shown.
    const invalid = await call('/api/inventory/adjust', adminToken, 'POST', { operationId: 'op-1', productId: 'x', changeAmount: 1, type: 'bogus' });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toBe('Invalid stock operation');
  });

  it('hashes plain-text credentials left by older versions when the server starts', async () => {
    db.prepare(`INSERT INTO users (id, name, username, email, password, pin, role, active)
      VALUES ('legacy-plain', 'Legacy Plain', 'legacy.plain', 'legacy.plain@fixture.test', 'plain-text-pass', '4444', 'cashier', 1)`).run();
    await server.stop(); await server.start();
    const row = db.prepare("SELECT password, pin FROM users WHERE id = 'legacy-plain'").get() as any;
    expect(row.password).toMatch(/^s1\$/);
    expect(row.pin).toMatch(/^s1\$/);
    const plain = db.prepare("SELECT count(*) n FROM users WHERE (password IS NOT NULL AND password NOT LIKE 's1$%') OR (pin IS NOT NULL AND pin NOT LIKE 's1$%')").get();
    expect(plain).toEqual({ n: 0 });
    expect(await login('legacy.plain', 'plain-text-pass')).toBeTruthy();
  }, 30000);

  it('requires your current password to change your own PIN or password', async () => {
    const own = '/api/users/user-admin';
    for (const [route, method] of [[`${own}/reset-pin`, 'POST'], [own, 'PUT']] as const) {
      const missing = await call(route, adminToken, method, { pin: '8080' });
      expect(missing.status).toBe(400);
      expect((await missing.json()).code).toBe('CURRENT_PASSWORD_REQUIRED');
      expect((await call(route, adminToken, method, { pin: '8080', currentPassword: 'not-my-password' })).status).toBe(400);
    }
    // The session survives the refusals; a name change needs no password.
    expect((await call(own, adminToken, 'PUT', { name: 'Admin Renamed' })).status).toBe(200);
    const ok = await call(`${own}/reset-pin`, adminToken, 'POST', { pin: '8080', currentPassword: 'fixture-only-secret' });
    expect(ok.status).toBe(200);
    expect((await call('/api/auth/session', adminToken)).status).toBe(401);
    const latest = (await (await call('/api/users/events', await login('admin', 'fixture-only-secret'))).json()).events[0];
    expect(latest).toMatchObject({ action: 'pin_changed', actorId: 'user-admin', targetId: 'user-admin' });
  });
});
