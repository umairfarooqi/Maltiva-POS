// @vitest-environment node
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedServer } from './helpers/isolated-server';
import { reviewSale, saleFixture } from './helpers/sale-fixtures';

describe('strict atomic inventory', () => {
  let server: Awaited<ReturnType<typeof isolatedServer>>; let db: InstanceType<typeof Database>;
  beforeAll(async () => { server = await isolatedServer(); db = new Database(server.dbPath); }, 15000);
  afterAll(async () => { db?.close(); await server?.cleanup(); });
  function stock(amount: number) { db.prepare('UPDATE products SET stockQuantity=? WHERE id=?').run(amount, saleFixture().items[0].productId); }
  async function post(path: string, order: unknown) { return fetch(`${server.url}/api/orders${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) }); }
  it('aggregates separate customized lines of the same product', async () => {
    stock(1); const order = saleFixture('aggregate'); order.items.push({ ...order.items[0], id: 'second-line', notes: 'Different preparation' });
    const response = await post('/quote', order); expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('Insufficient stock');
  });
  it('rechecks stale quotes inside the transaction and rolls back without a payment', async () => {
    stock(1); const order = await reviewSale(server.url, saleFixture('stale-stock')); stock(0);
    expect((await post('', order)).status).toBe(409);
    expect(db.prepare('SELECT count(*) AS count FROM orders WHERE id=?').get(order.id)).toEqual({ count: 0 });
    expect(db.prepare('SELECT count(*) AS count FROM payments WHERE order_id=?').get(order.id)).toEqual({ count: 0 });
  });
  it('allows only one of two competing quotes and replays the winner without checking depleted stock', async () => {
    stock(1);
    const first = await reviewSale(server.url, saleFixture('stock-race-a'));
    const second = await reviewSale(server.url, saleFixture('stock-race-b'));
    const responses = await Promise.all([post('', first), post('', second)]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    const winner = responses[0].status === 201 ? first : second;
    expect((await post('', winner)).status).toBe(201);
    expect(db.prepare('SELECT stockQuantity FROM products WHERE id=?').get(first.items[0].productId)).toEqual({ stockQuantity: 0 });
  });
  it('acknowledges stock changes atomically and replays one operation only once', async () => {
    stock(2);
    const operation = { operationId: 'restock-once', productId: saleFixture().items[0].productId, changeAmount: 3, type: 'restock', reason: 'Delivery', userId: 'admin', userName: 'Admin' };
    const adjust = (body: unknown) => fetch(`${server.url}/api/inventory/adjust`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const response = await adjust(operation); expect(response.status).toBe(200);
    expect((await response.json()).product.stockQuantity).toBe(5);
    expect((await adjust(operation)).status).toBe(200);
    expect(db.prepare('SELECT stockQuantity FROM products WHERE id=?').get(operation.productId)).toEqual({ stockQuantity: 5 });
    expect((await adjust({ ...operation, operationId: 'invalid-waste', type: 'waste', changeAmount: -6 })).status).toBe(400);
    expect(db.prepare('SELECT count(*) AS count FROM inventory_logs WHERE id=?').get('invalid-waste')).toEqual({ count: 0 });
  });
});
