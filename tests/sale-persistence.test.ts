// @vitest-environment node
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedServer } from './helpers/isolated-server';
import { saleFixture } from './helpers/sale-fixtures';

describe('phase 1 atomic sale lifecycle', () => {
  let server: Awaited<ReturnType<typeof isolatedServer>>;
  let db: any;
  beforeAll(async () => { server = await isolatedServer(); db = new Database(server.dbPath); }, 15000);
  afterAll(async () => { db?.close(); await server?.cleanup(); });
  const count = (table: string, orderId: string) => db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${table === 'orders' ? 'id' : table === 'order_items' ? 'orderId' : table === 'stock_movements' ? 'ref' : 'order_id'} = ?`).get(orderId).n;
  async function submit(order: ReturnType<typeof saleFixture>) {
    return fetch(`${server.url}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': order.idempotencyKey }, body: JSON.stringify(order) });
  }
  it('returns 201 and persists order, items, payment, stock movement and complete bootstrap snapshots', async () => {
    const order = saleFixture('valid');
    const response = await submit(order);
    expect(response.status).toBe(201);
    expect(count('orders', order.id)).toBe(1);
    expect(count('order_items', order.id)).toBe(1);
    expect(count('payments', order.id)).toBe(1);
    expect(count('stock_movements', order.id)).toBe(1);
    expect(db.prepare('SELECT amount, tendered FROM payments WHERE order_id = ?').get(order.id)).toEqual({ amount: 990, tendered: 1000 });
    expect(db.prepare('SELECT stockQuantity FROM products WHERE id = ?').get(order.items[0].productId).stockQuantity).toBe(998);
    const bootstrap = await (await fetch(`${server.url}/api/data`)).json();
    expect(bootstrap.tables).toEqual([]);
    expect(bootstrap.orders.find((saved: any) => saved.id === order.id).items[0]).toMatchObject({ notes: 'No onion', quantity: 1, unitPrice: 990 });
  });
  it('replaying one key with another payload returns the original sale without another stock deduction', async () => {
    const order = saleFixture('duplicate');
    expect((await submit(order)).status).toBe(201);
    const replay = await submit({ ...order, id: 'different-id', total: 1 });
    expect(replay.status).toBe(201);
    expect((await replay.json()).order).toMatchObject({ id: order.id, total: 990 });
    expect(count('orders', order.id)).toBe(1);
    expect(count('payments', order.id)).toBe(1);
    expect(count('stock_movements', order.id)).toBe(1);
    expect(db.prepare('SELECT stockQuantity FROM products WHERE id = ?').get(order.items[0].productId).stockQuantity).toBe(997);
  });
  it.each(['order_items', 'payments', 'stock_movements', 'inventory_logs'])('failure inserting %s rolls back every sale record and stock', async table => {
    const order = saleFixture(`rollback-${table}`);
    const previous = db.prepare('SELECT stockQuantity FROM products WHERE id = ?').get(order.items[0].productId).stockQuantity;
    db.exec(`CREATE TRIGGER fail_step BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'forced persistence failure'); END`);
    try {
      expect((await submit(order)).status).toBe(500);
      for (const ledger of ['orders', 'order_items', 'payments', 'stock_movements']) expect(count(ledger, order.id)).toBe(0);
      expect(db.prepare('SELECT stockQuantity FROM products WHERE id = ?').get(order.items[0].productId).stockQuantity).toBe(previous);
      expect(db.prepare('SELECT count(*) AS n FROM inventory_logs WHERE reason = ?').get(`Order ${order.orderNumber}`).n).toBe(0);
    } finally { db.exec('DROP TRIGGER fail_step'); }
  });
  it('reports which browser outbox keys have already committed', async () => {
    const response = await fetch(`${server.url}/api/orders/pending-status?key=key-valid&key=never-sent`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ pendingKeys: ['never-sent'], savedOrders: [{ id: 'sale-valid', idempotencyKey: 'key-valid' }] });
  });
});
