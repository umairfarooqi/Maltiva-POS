// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { businessDate } from '../src/services/orderNumbering';
import { toMoneyRow } from '../src/services/moneyMigration';
import { isolatedServer } from './helpers/isolated-server';
import { reviewSale, saleFixture } from './helpers/sale-fixtures';

describe('authoritative order numbering across terminals and restarts', () => {
  let server: Awaited<ReturnType<typeof isolatedServer>>;
  let db: InstanceType<typeof Database>;
  let second: ChildProcess | undefined;
  let secondUrl: string;
  let quote: Awaited<ReturnType<typeof reviewSale>>;
  let cutoff: number;
  let original: any;
  const post = (order: any, url = server.url) => fetch(`${url}/api/orders`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${server.token}`, 'Idempotency-Key': order.idempotencyKey },
    body: JSON.stringify(order) });
  const input = (suffix: string) => ({ ...quote, id: `numbered-${suffix}`, idempotencyKey: `number-key-${suffix}`,
    orderNumber: '#SAME-BROWSER-NUMBER', tokenNumber: -42, businessDate: '1900-01-01',
    items: quote.items.map((item, index) => ({ ...item, id: `number-line-${suffix}-${index}` })) });

  beforeAll(async () => {
    server = await isolatedServer(); db = new Database(server.dbPath);
    // Keep the real-clock test away from a rollover; boundary cases use fixed dates.
    cutoff = (new Date().getUTCHours() + 12) % 24;
    db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('timezone', 'UTC');
    db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('day_cutoff_hour', String(cutoff));
    db.prepare('UPDATE products SET stockQuantity=5000 WHERE id=?').run(saleFixture().items[0].productId);
    const date = businessDate(new Date(), 'UTC', cutoff);
    const legacy = saleFixture('existing-number');
    const row = toMoneyRow('orders', { ...legacy, idempotency_key: legacy.idempotencyKey,
      orderNumber: `#F${date.replaceAll('-', '')}-0042`, tokenNumber: 88, createdAt: new Date().toISOString() });
    const columns = new Set((db.prepare('PRAGMA table_info(orders)').all() as { name: string }[]).map(column => column.name));
    const entries = Object.entries(row).filter(([key]) => columns.has(key)).map(([key, value]) => [key, typeof value === 'boolean' ? Number(value) : value] as const);
    db.prepare(`INSERT INTO orders (${entries.map(([key]) => `"${key}"`).join(',')}) VALUES (${entries.map(() => '?').join(',')})`).run(...entries.map(([, value]) => value));
    quote = await reviewSale(server.url, saleFixture('reviewed-number'), server.token);
    const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
    const port = (reservation.address() as net.AddressInfo).port;
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    secondUrl = `http://127.0.0.1:${port}`;
    second = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), MALTIVA_POS_DB_DIR: path.dirname(server.dbPath) },
      stdio: ['ignore', 'ignore', 'ignore'] });
    for (let attempt = 0; attempt < 150; attempt++) {
      if (second.exitCode !== null) throw new Error('Second server exited');
      try { if ((await fetch(`${secondUrl}/api/health`)).ok) return; } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Second server did not start');
  }, 30000);
  afterAll(async () => {
    if (second && second.exitCode === null) { const exited = once(second, 'exit'); second.kill('SIGTERM'); await exited; }
    db?.close(); await server?.cleanup();
  });

  it('ignores conflicting client numbers and seeds past historical references without changing them', async () => {
    const legacyBefore = db.prepare('SELECT * FROM orders WHERE id=?').get('sale-existing-number');
    const first = await post(input('first')); expect(first.status).toBe(201);
    original = (await first.json()).order;
    expect(original.orderNumber).toMatch(/-0043$/);
    expect(original.tokenNumber).toBe(89);
    expect(original.businessDate).toBe(businessDate(new Date(), 'UTC', cutoff));
    const duplicateBrowser = await post(input('another-browser'), secondUrl); expect(duplicateBrowser.status).toBe(201);
    const next = (await duplicateBrowser.json()).order;
    expect(next.orderNumber).not.toBe(original.orderNumber);
    expect(next.tokenNumber).toBe(90);
    expect(db.prepare('SELECT * FROM orders WHERE id=?').get('sale-existing-number')).toEqual(legacyBefore);
    expect(db.prepare('SELECT reason FROM inventory_logs WHERE reason=?').get(`Order ${original.orderNumber}`)).toBeTruthy();
    const replayLegacy = await post({ idempotencyKey: 'key-existing-number' });
    expect(replayLegacy.status).toBe(201);
    expect((await replayLegacy.json()).order).toMatchObject({ orderNumber: (legacyBefore as any).orderNumber, tokenNumber: 88 });
  });

  it('rolls back counter values as well as all sale ledgers on failure', async () => {
    const counters = db.prepare('SELECT * FROM order_counters ORDER BY name').all();
    db.exec("CREATE TRIGGER numbering_fail BEFORE INSERT ON payments BEGIN SELECT RAISE(ABORT,'forced failure'); END");
    try { expect((await post(input('rollback'))).status).toBe(500); }
    finally { db.exec('DROP TRIGGER numbering_fail'); }
    expect(db.prepare('SELECT * FROM order_counters ORDER BY name').all()).toEqual(counters);
    expect(db.prepare('SELECT count(*) AS n FROM orders WHERE id=?').get('numbered-rollback')).toEqual({ n: 0 });
    const response = await post(input('after-rollback')); expect(response.status).toBe(201);
    expect((await response.json()).order.tokenNumber).toBe(91);
  });

  it('issues 1,000 sequential sales without repeating order numbers or wrapping tokens', async () => {
    const orders = new Set<string>(), tokens = new Set<number>();
    for (let index = 0; index < 1000; index++) {
      const response = await post(input(`sequential-${index}`));
      expect(response.status).toBe(201);
      const order = (await response.json()).order;
      expect(orders.has(order.orderNumber)).toBe(false); expect(tokens.has(order.tokenNumber)).toBe(false);
      orders.add(order.orderNumber); tokens.add(order.tokenNumber);
    }
    expect(orders.size).toBe(1000); expect(tokens.size).toBe(1000);
    expect(Math.max(...tokens)).toBe(1091);
  }, 60000);

  it('issues 50 simultaneous sales across two server processes with unique numbers', async () => {
    const responses = await Promise.all(Array.from({ length: 50 }, (_, index) => post(input(`concurrent-${index}`), index % 2 ? server.url : secondUrl)));
    expect(responses.map(response => response.status)).toEqual(Array(50).fill(201));
    const orders = await Promise.all(responses.map(async response => (await response.json()).order));
    expect(new Set(orders.map(order => order.orderNumber)).size).toBe(50);
    expect(new Set(orders.map(order => order.tokenNumber)).size).toBe(50);
    expect(Math.min(...orders.map(order => order.tokenNumber))).toBe(1092);
    expect(Math.max(...orders.map(order => order.tokenNumber))).toBe(1141);
  }, 30000);

  it('allocates once when the same recovery key is submitted concurrently from both processes', async () => {
    const before = db.prepare('SELECT * FROM order_counters ORDER BY name').all() as any[];
    const responses = await Promise.all(Array.from({ length: 10 }, (_, index) => post(input('same-key'), index % 2 ? server.url : secondUrl)));
    expect(responses.map(response => response.status)).toEqual(Array(10).fill(201));
    const orders = await Promise.all(responses.map(async response => (await response.json()).order));
    expect(new Set(orders.map(order => order.orderNumber)).size).toBe(1);
    expect(new Set(orders.map(order => order.tokenNumber)).size).toBe(1);
    expect(db.prepare('SELECT count(*) AS n FROM orders WHERE id=?').get('numbered-same-key')).toEqual({ n: 1 });
    const after = db.prepare('SELECT * FROM order_counters ORDER BY name').all() as any[];
    expect(after.map(row => row.value)).toEqual(before.map(row => row.value + 1));
  });

  it('continues counters after restart and accepts requests without client ticket fields', async () => {
    await server.stop(); await server.start();
    const order = input('restart'); delete (order as any).orderNumber; delete (order as any).tokenNumber;
    const response = await post(order); expect(response.status).toBe(201);
    expect((await response.json()).order.tokenNumber).toBe(1143);
    const replay = await post({ idempotencyKey: 'number-key-first' }, secondUrl);
    expect(replay.status).toBe(201);
    expect((await replay.json()).order).toMatchObject({ orderNumber: original.orderNumber, tokenNumber: original.tokenNumber, businessDate: original.businessDate });
  });

  it('returns original numbers before pricing or allocation even after a business-day change and catalog deletion', async () => {
    const before = db.prepare('SELECT * FROM order_counters ORDER BY business_date,name').all();
    db.prepare('UPDATE settings SET value=? WHERE key=?').run('Etc/GMT-14', 'timezone');
    db.prepare('UPDATE settings SET value=? WHERE key=?').run('0', 'day_cutoff_hour');
    expect(businessDate(new Date(), 'Etc/GMT-14')).not.toBe(original.businessDate);
    db.prepare('DELETE FROM products WHERE id=?').run(quote.items[0].productId);
    const replay = await post({ idempotencyKey: 'number-key-first', orderNumber: '#FORGED', tokenNumber: 999999 });
    expect(replay.status).toBe(201);
    expect((await replay.json()).order).toMatchObject({ orderNumber: original.orderNumber, tokenNumber: original.tokenNumber,
      businessDate: original.businessDate, totalPaisa: original.totalPaisa });
    expect(db.prepare('SELECT * FROM order_counters ORDER BY business_date,name').all()).toEqual(before);
  });
});
