// @vitest-environment node
import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isolatedServer } from './helpers/isolated-server';
import { saleFixture } from './helpers/sale-fixtures';

describe('simple checkout with server-owned cashier recovery', () => {
  let server: Awaited<ReturnType<typeof isolatedServer>>, db: InstanceType<typeof Database>;
  let a: any, b: any, tokenA: string, tokenB: string, sequence = 0;
  const request = (route: string, token: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') =>
    fetch(`${server.url}${route}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const input = () => ({ ...saleFixture(`origin-${sequence}`), cashierId: a.id, cashierName: a.name, cashierRole: a.role });
  const quote = (order: any, token = tokenA) => request('/api/orders/quote', token, order);
  const post = (order: any, token = tokenB) => request('/api/orders', token, order);
  async function reviewed(order = input(), token = tokenA) {
    const response = await quote(order, token); expect(response.status).toBe(200);
    return { ...order, ...await response.json() };
  }
  const ledgerCount = (table: string, id: string) => {
    const column = table === 'orders' ? 'id' : table === 'order_items' ? 'orderId' : table === 'stock_movements' ? 'ref' : 'order_id';
    return (db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column}=?`).get(id) as any).n;
  };
  beforeAll(async () => { server = await isolatedServer(); db = new Database(server.dbPath); }, 30000);
  afterAll(async () => { db?.close(); await server?.cleanup(); });
  beforeEach(async () => {
    sequence++;
    const staff = async (suffix: string) => {
      const username = `origin-${sequence}-${suffix}`;
      const created = await request('/api/users', server.token, { username, name: `Cashier ${suffix} ${sequence}`,
        role: 'cashier', pin: '2468', password: 'origin-secret' });
      expect(created.status).toBe(201);
      const user = await created.json();
      const login = await request('/api/auth/login', '', { username, password: 'origin-secret' });
      expect(login.status).toBe(200);
      return { user, token: (await login.json()).token };
    };
    const first = await staff('A'), second = await staff('B');
    a = first.user; b = second.user; tokenA = first.token; tokenB = second.token;
    db.prepare('UPDATE products SET stockQuantity=100,isAvailable=1,price_paisa=99000,cost_price_paisa=55000 WHERE id=?').run(input().items[0].productId);
  });

  it('records the reviewed operator without creating an order, token or payment', async () => {
    const order = input(), before = db.prepare('SELECT * FROM order_counters').all();
    const reviewedOrder = await reviewed({ ...order, cashierName: 'Forged name', cashierRole: 'admin' });
    expect(reviewedOrder).toMatchObject({ cashierId: a.id, cashierName: a.name, cashierRole: 'cashier' });
    expect(db.prepare('SELECT cashier_id,order_id FROM checkout_intents WHERE idempotency_key=?').get(order.idempotencyKey))
      .toEqual({ cashier_id: a.id, order_id: order.id });
    expect(db.prepare('SELECT * FROM order_counters').all()).toEqual(before);
    for (const table of ['orders', 'order_items', 'payments', 'stock_movements']) expect(ledgerCount(table, order.id)).toBe(0);
  });

  it('preserves cashier A when B recovers a reviewed sale after logout and server restart', async () => {
    const order = await reviewed();
    expect((await request('/api/auth/logout', tokenA, {})).status).toBe(200);
    await server.stop(); await server.start();
    const response = await post({ ...order, cashierId: b.id, cashierName: 'Forged', cashierRole: 'admin', recordedById: a.id });
    expect(response.status).toBe(201);
    const saved = (await response.json()).order;
    expect(saved).toMatchObject({ cashierId: a.id, cashierName: a.name, cashierRole: 'cashier',
      recordedById: b.id, recordedByName: b.name, recordedByRole: 'cashier', status: 'completed' });
    expect(saved.tokenNumber).toBeGreaterThan(0);
    expect(db.prepare('SELECT user_id FROM stock_movements WHERE ref=?').get(order.id)).toEqual({ user_id: a.id });
    for (const table of ['orders', 'order_items', 'payments', 'stock_movements']) expect(ledgerCount(table, order.id)).toBe(1);
    const replay = await post({ idempotencyKey: order.idempotencyKey });
    expect(replay.status).toBe(201);
    expect((await replay.json()).order).toMatchObject({ orderNumber: saved.orderNumber, tokenNumber: saved.tokenNumber, cashierId: a.id, recordedById: b.id });
  });

  it('does not transfer ownership by changing basket contents or payment method', async () => {
    const order = await reviewed();
    for (const changed of [
      { ...order, items: order.items.map((item: any) => ({ ...item, quantity: 2 })) },
      { ...order, items: order.items.map((item: any) => ({ ...item, notes: 'Different instructions' })) },
      { ...order, paymentMethod: 'card', cashTenderedPaisa: undefined },
    ]) {
      const response = await quote(changed, tokenB);
      expect(response.status).toBe(409); expect((await response.json()).code).toBe('RECOVERY_OWNER_REQUIRED');
      expect((await post(changed)).status).toBe(409);
    }
    expect(ledgerCount('orders', order.id)).toBe(0);
    const changed = await reviewed({ ...order, items: order.items.map((item: any) => ({ ...item, notes: 'Original cashier approved this change' })) });
    expect((await post(changed)).status).toBe(201);
  });

  it('allows price review while preserving the operator of an unchanged pending basket', async () => {
    const order = await reviewed();
    db.prepare('UPDATE products SET price_paisa=100000 WHERE id=?').run(order.items[0].productId);
    expect((await post(order)).status).toBe(409);
    const updated = await reviewed(order, tokenB);
    expect(updated).toMatchObject({ cashierId: a.id, totalPaisa: 100000 });
    const response = await post(updated); expect(response.status).toBe(201);
    expect((await response.json()).order).toMatchObject({ cashierId: a.id, recordedById: b.id, totalPaisa: 100000 });
  });

  it('keeps unregistered offline sales for the original cashier instead of guessing an owner', async () => {
    const source = await reviewed();
    const offline = { ...source, id: `${source.id}-offline`, idempotencyKey: `${source.idempotencyKey}-offline`, persistenceState: 'pending' };
    for (const response of [await post(offline), await quote(offline, tokenB), await quote({ ...offline, persistenceState: undefined }, tokenB)]) {
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'RECOVERY_OWNER_REQUIRED', error: expect.stringContaining(a.name) });
    }
    db.prepare('UPDATE products SET isAvailable=0 WHERE id=?').run(offline.items[0].productId);
    const unavailable = await post(offline);
    expect(unavailable.status).toBe(409); expect((await unavailable.json()).code).toBe('RECOVERY_OWNER_REQUIRED');
    db.prepare('UPDATE products SET isAvailable=1 WHERE id=?').run(offline.items[0].productId);
    expect(ledgerCount('orders', offline.id)).toBe(0);
    expect(db.prepare('SELECT * FROM checkout_intents WHERE idempotency_key=?').get(offline.idempotencyKey)).toBeUndefined();
    const approved = await reviewed(offline);
    const response = await post(approved); expect(response.status).toBe(201);
    expect((await response.json()).order).toMatchObject({ cashierId: a.id, recordedById: b.id });
  });

  it('forces completed status and prevents a paid sale being hidden by client cancellation', async () => {
    const order = await reviewed();
    const response = await post({ ...order, status: 'cancelled', recordedById: 'forged' });
    expect(response.status).toBe(201);
    expect((await response.json()).order).toMatchObject({ status: 'completed', recordedById: b.id });
    expect(db.prepare('SELECT status FROM orders WHERE id=?').get(order.id)).toEqual({ status: 'completed' });
    expect(ledgerCount('payments', order.id)).toBe(1);
  });

  it('preserves reviewed operator snapshots even after a name change or deactivation', async () => {
    const order = await reviewed();
    expect((await request(`/api/users/${a.id}`, server.token, { name: 'Renamed cashier', active: false }, 'PUT')).status).toBe(200);
    const response = await post(order); expect(response.status).toBe(201);
    expect((await response.json()).order).toMatchObject({ cashierId: a.id, cashierName: a.name, recordedById: b.id });
  });

  it('returns the original saved receipt before checking changed stock, catalog or ownership', async () => {
    const order = await reviewed();
    const first = await post(order, tokenA); expect(first.status).toBe(201); const saved = (await first.json()).order;
    db.prepare('UPDATE products SET isAvailable=0,stockQuantity=0 WHERE id=?').run(order.items[0].productId);
    const replay = await post({ idempotencyKey: order.idempotencyKey, cashierId: b.id });
    expect(replay.status).toBe(201);
    expect((await replay.json()).order).toMatchObject({ cashierId: a.id, recordedById: a.id, orderNumber: saved.orderNumber, tokenNumber: saved.tokenNumber });
    const requote = await quote({ idempotencyKey: order.idempotencyKey }, tokenB);
    expect(requote.status).toBe(200); expect((await requote.json()).cashierId).toBe(a.id);
    expect(ledgerCount('orders', order.id)).toBe(1);
  });

  it('does not allow the same order identity to be reserved under a different recovery key', async () => {
    const order = await reviewed();
    const conflict = await quote({ ...order, idempotencyKey: `${order.idempotencyKey}-different` }, tokenA);
    expect(conflict.status).toBe(409); expect((await conflict.json()).code).toBe('RECOVERY_OWNER_REQUIRED');
    expect(ledgerCount('orders', order.id)).toBe(0);
    expect((await post(order)).status).toBe(201);
  });
});
