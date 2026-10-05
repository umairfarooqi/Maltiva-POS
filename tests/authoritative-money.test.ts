// @vitest-environment node
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedServer } from './helpers/isolated-server';
import { reviewSale, saleFixture } from './helpers/sale-fixtures';
describe('authoritative money lifecycle', () => {
  let server: Awaited<ReturnType<typeof isolatedServer>>, db: any;
  beforeAll(async () => { server = await isolatedServer(); db = new Database(server.dbPath); }, 30000);
  afterAll(async () => { db?.close(); await server?.cleanup(); });
  async function submit(order: any) { return fetch(`${server.url}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': order.idempotencyKey }, body: JSON.stringify(order) }); }
  it('ignores forged totals/costs/names and saves database prices with tax-exclusive profit', async () => {
    db.exec("UPDATE products SET price_paisa=33300,cost_price_paisa=20000 WHERE id='deal-maltiva-special'; UPDATE settings SET value='1000' WHERE key='taxBp'");
    const reviewed = await reviewSale(server.url, saleFixture('authoritative'));
    const response = await submit({ ...reviewed, totalPaisa: 1, profitPaisa: 999999, taxPaisa: 0, profitIncomplete: true,
      items: reviewed.items.map(i => ({ ...i, unitPricePaisa: 1, unitCostPaisa: 0, productName: 'Forged name' })) });
    expect(response.status).toBe(201);
    const order = (await response.json()).order;
    expect(order).toMatchObject({ totalPaisa: 36630, taxPaisa: 3330, netRevenuePaisa: 33300, profitPaisa: 13300, moneySchemaVersion: 2, profitIncomplete: false });
    expect(order.items[0]).toMatchObject({ unitPricePaisa: 33300, unitCostPaisa: 20000, netRevenuePaisa: 33300 });
    expect(order.items[0].productName).not.toBe('Forged name');
    expect(db.prepare("SELECT typeof(total_paisa) AS type FROM orders WHERE id='sale-authoritative'").get().type).toBe('integer');
  });
  it('rejects a changed quote and underpayment without any ledger writes', async () => {
    const reviewed = await reviewSale(server.url, saleFixture('changed'));
    db.exec("UPDATE products SET price_paisa=33400,cost_price_paisa=99999 WHERE id='deal-maltiva-special'");
    expect((await submit(reviewed)).status).toBe(409);
    const updated = await reviewSale(server.url, reviewed);
    expect((await submit({ ...updated, cashTenderedPaisa: updated.totalPaisa - 1 })).status).toBe(400);
    for (const [table, col] of [['orders','id'],['order_items','orderId'],['payments','order_id'],['stock_movements','ref']]) {
      expect(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${col}='sale-changed'`).get().n).toBe(0);
    }
  });
  it('replays the original sale after catalog deletion and returns unchanged profit', async () => {
    db.exec("DELETE FROM products WHERE id='deal-maltiva-special'");
    const response = await submit({ idempotencyKey: 'key-authoritative' });
    expect(response.status).toBe(201);
    expect((await response.json()).order).toMatchObject({ totalPaisa: 36630, profitPaisa: 13300 });
  });
  it('validates required, unknown and duplicate options and reads variation deltas from SQLite', async () => {
    const base = saleFixture('options'); base.items[0].productId = 'prod-fajita-pizza';
    const quote = async (input: any) => fetch(`${server.url}/api/orders/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    expect((await quote(base)).status).toBe(400);
    const selected = { groupId: 'var-faj-size', optionId: 'opt-med', priceDeltaPaisa: 1, costDeltaPaisa: 1 };
    base.items[0].selectedVariations = [selected as any];
    const response = await quote(base); expect(response.status).toBe(200);
    expect((await response.json()).items[0]).toMatchObject({ unitPricePaisa: 125000, unitCostPaisa: 66000 });
    base.items[0].selectedVariations.push(selected as any);
    expect((await quote(base)).status).toBe(400);
    base.items[0].selectedVariations = [{ ...selected, optionId: 'unknown' } as any];
    expect((await quote(base)).status).toBe(400);
  });
  it('requires review for an unquoted legacy request and disallows unauthorized discounts', async () => {
    const base = saleFixture('legacy-unquoted'); base.items[0].productId = 'prod-fries';
    // Use an existing product ID rather than trusting legacy snapshots.
    base.items[0].productId = db.prepare('SELECT id FROM products LIMIT 1').get().id;
    base.items[0].selectedVariations = [];
    expect((await submit(base)).status).toBe(409);
    expect((await submit({ ...base, discountPaisa: 100 })).status).toBe(400);
  });
  it('supports inclusive tax and zero costs with decimal catalog/settings persistence', async () => {
    const bootstrap = await (await fetch(`${server.url}/api/data`)).json();
    const product = { ...bootstrap.products.find((p: any) => p.id === 'deal-crown-crust'), pricePaisa: 36630, costPricePaisa: 0 };
    const update = await fetch(`${server.url}/api/products/${product.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(product) });
    expect(update.status).toBe(200);
    const settings = await fetch(`${server.url}/api/settings/printer`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taxBp: 1000, taxInclusive: true }) });
    expect(settings.status).toBe(200);
    const sale = saleFixture('inclusive'); sale.items[0].productId = product.id;
    const reviewed = await reviewSale(server.url, sale);
    const response = await submit(reviewed); expect(response.status).toBe(201);
    expect((await response.json()).order).toMatchObject({ totalPaisa: 36630, taxPaisa: 3330, netRevenuePaisa: 33300, profitPaisa: 33300, totalCostPaisa: 0, taxInclusive: true });
    const invalid = await fetch(`${server.url}/api/products/${product.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...product, pricePaisa: 1.1 }) });
    expect(invalid.status).toBe(400);
    db.prepare('UPDATE products SET cost_price_paisa=NULL WHERE id=?').run(product.id);
    const missingCost = await fetch(`${server.url}/api/orders/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sale) });
    expect(missingCost.status).toBe(400);
    db.prepare('UPDATE products SET cost_price_paisa=0 WHERE id=?').run(product.id);
  });
});
