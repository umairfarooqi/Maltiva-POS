// @vitest-environment node
import Database from 'better-sqlite3';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { isolatedServer } from './helpers/isolated-server';
import { reviewSale, saleFixture } from './helpers/sale-fixtures';
import { INITIAL_PRODUCTS } from '../src/data/initialData';
let server: Awaited<ReturnType<typeof isolatedServer>>, db: InstanceType<typeof Database>;
beforeAll(async () => { server = await isolatedServer(); db = new Database(server.dbPath); }, 30000);
afterAll(async () => { db?.close(); await server?.cleanup(); });
it('profit API excludes cancelled sales from rows, counts and every financial total', async () => {
  for (const suffix of ['kept', 'cancelled']) {
    const sale = await reviewSale(server.url, saleFixture(suffix), server.token);
    const result = await server.request('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sale) });
    expect(result.status).toBe(201);
  }
  db.prepare("UPDATE orders SET status='cancelled' WHERE id=?").run('sale-cancelled');
  const report = await (await server.request('/api/reports/profit')).json();
  expect(report.orderCount).toBe(1); expect(report.orders.map((o: any) => o.id)).toEqual(['sale-kept']);
  expect(report.totalRevenuePaisa).toBe(99000); expect(report.totalCostPaisa).toBe(55000); expect(report.totalProfitPaisa).toBe(44000);
});
it('zero-price dishes survive catalog reload and can be sold with exact zero payment and stock deduction', async () => {
  const product = { ...INITIAL_PRODUCTS[0], moneySchemaVersion: 2, id: 'free-fixture', name: 'Free water', pricePaisa: 0, costPricePaisa: 500, stockQuantity: 8, isDeal: false, bundledProducts: [], variations: [] };
  const saved = await server.request('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(product) }); expect(saved.status).toBe(201);
  for (const route of ['/api/products', '/api/data', '/api/data?scope=catalog']) {
    const data = await (await server.request(route)).json();
    expect((Array.isArray(data) ? data : data.products).find((p: any) => p.id === product.id)).toMatchObject({ pricePaisa: 0, stockQuantity: 8 });
  }
  const base = saleFixture('free'); base.items = [{ ...base.items[0], productId: product.id }];
  const sale = await reviewSale(server.url, base, server.token);
  expect(sale.totalPaisa).toBe(0);
  const result = await server.request('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sale, cashTenderedPaisa: 0, changeDuePaisa: 0 }) });
  expect(result.status).toBe(201);
  const order = (await result.json()).order; expect(order.totalPaisa).toBe(0); expect(order.profitPaisa).toBe(-500);
  expect(db.prepare('SELECT stockQuantity FROM products WHERE id=?').get(product.id)).toMatchObject({ stockQuantity: 7 });
});
