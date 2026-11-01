// @vitest-environment node
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedServer } from './helpers/isolated-server';
import { reviewSale, saleFixture } from './helpers/sale-fixtures';
import { loadOrderHistory } from '../src/services/orderSnapshots';

describe('batched history and lightweight catalog loading', () => {
  let server: Awaited<ReturnType<typeof isolatedServer>>, db: InstanceType<typeof Database>, cashier: string;
  let template: any, item: any, payment: any;
  const call = (suffix: string, token = server.token) => fetch(server.url + suffix, { headers: { Authorization: `Bearer ${token}` } });
  const clone = (table: string, row: any) => {
    const keys = Object.keys(row); db.prepare(`INSERT INTO ${table} (${keys.map(key => `"${key}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(key => row[key]));
  };
  const fill = (from: number, to: number) => db.transaction(() => {
    for (let n = from; n < to; n++) {
      const id = `history-load-${n}`;
      clone('orders', { ...template, id, orderNumber: `#LOAD-${n}`, idempotency_key: `load-key-${n}`, tokenNumber: n + 2 });
      clone('order_items', { ...item, id: `item-load-${n}`, orderId: id });
      clone('payments', { ...payment, id: `payment-load-${n}`, order_id: id });
    }
    db.prepare('UPDATE order_counters SET value=?').run(to + 1);
  }).immediate();
  beforeAll(async () => {
    server = await isolatedServer(); db = new Database(server.dbPath);
    const sale = await reviewSale(server.url, saleFixture('load-template'), server.token);
    const response = await fetch(server.url + '/api/orders', { method: 'POST', headers: { Authorization: `Bearer ${server.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(sale) });
    expect(response.status).toBe(201);
    template = db.prepare('SELECT * FROM orders WHERE id=?').get(sale.id);
    item = db.prepare('SELECT * FROM order_items WHERE orderId=?').get(sale.id);
    payment = db.prepare('SELECT * FROM payments WHERE order_id=?').get(sale.id);
    cashier = (await (await fetch(server.url + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'cashier', password: 'fixture-only-secret' }) })).json()).token;
  }, 30000);
  afterAll(async () => { db?.close(); await server?.cleanup(); });
  it('uses four history SELECTs at both 1,000 and 10,000 orders while preserving snapshots', async () => {
    let previous = 0;
    for (const size of [1000, 10000]) {
      fill(previous, size); previous = size;
      const queries: string[] = [];
      const reader = new Database(server.dbPath, { readonly: true, verbose: (sql: string) => { queries.push(sql); } });
      try {
        const started = performance.now(), history = loadOrderHistory(reader), elapsed = performance.now() - started;
        expect(history).toHaveLength(size + 1);
        expect(queries.filter(sql => /^SELECT/i.test(sql))).toHaveLength(4);
        expect(elapsed).toBeLessThan(5000);
        const saved = history.find(order => order.id === template.id)!;
        expect(JSON.parse(JSON.stringify(saved))).toEqual(await (await call('/api/receipts/' + template.id)).json());
        expect(saved).toMatchObject({ totalPaisa: 99000, cashTenderedPaisa: 100000, changeDuePaisa: 1000, persistenceState: 'saved' });
        expect(saved.items[0]).toMatchObject({ notes: 'No onion', unitPricePaisa: 99000, unitCostPaisa: 55000 });
      } finally { reader.close(); }
    }
  }, 15000);
  it('keeps full reporting history complete while catalog responses exclude history, staff and logs', async () => {
    const fullResponse = await call('/api/data'); const fullText = await fullResponse.text(); const full = JSON.parse(fullText);
    const catalogResponse = await call('/api/data?scope=catalog'); const catalogText = await catalogResponse.text(); const catalog = JSON.parse(catalogText);
    const fullBytes = Buffer.byteLength(fullText), catalogBytes = Buffer.byteLength(catalogText);
    expect(full.historyIncluded).toBe(true); expect(full.orders).toHaveLength(10001);
    expect(catalog).toMatchObject({ historyIncluded: false, orders: [], users: [], inventoryLogs: [], tables: [] });
    expect(catalog.products).toEqual(full.products); expect(catalog.printerSettings).toEqual(full.printerSettings);
    expect(catalogBytes).toBeLessThan(fullBytes / 20);
    console.info(`Loading fixture: ${full.orders.length} orders; full ${fullBytes} bytes; catalog ${catalogBytes} bytes; history SELECTs 4.`);
  }, 15000);
  it('preserves cashier privacy and authorization for both scopes', async () => {
    expect((await call('/api/data?scope=catalog', '')).status).toBe(401);
    expect((await call('/api/data?scope=invalid')).status).toBe(400);
    for (const suffix of ['/api/data', '/api/data?scope=catalog']) {
      const data = await (await call(suffix, cashier)).json();
      expect(data.users).toEqual([]); expect(data.inventoryLogs).toEqual([]);
      expect(data.products[0]).not.toHaveProperty('costPricePaisa');
      for (const order of data.orders.slice(0, 2)) {
        expect(order).not.toHaveProperty('profitPaisa'); expect(order.items[0]).not.toHaveProperty('unitCostPaisa');
      }
    }
  }, 15000);
});
