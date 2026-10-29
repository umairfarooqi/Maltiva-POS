// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INITIAL_PRODUCTS } from '../src/data/initialData';
import { isolatedServer } from './helpers/isolated-server';
import { reviewSale, saleFixture } from './helpers/sale-fixtures';
import type { Product } from '../src/types/pos';

describe('catalog edits preserve authoritative stock', () => {
  let server: Awaited<ReturnType<typeof isolatedServer>>, db: InstanceType<typeof Database>;
  let second: ChildProcess | undefined, secondUrl: string;
  let product: Product;
  let sequence = 0;
  const request = (route: string, method: string, body?: unknown, url = server.url) => fetch(`${url}${route}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${server.token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const edit = (body: unknown = product, url = server.url) => request(`/api/products/${product.id}`, 'PUT', body, url);
  const adjust = (delta: number, operationId: string, type = delta < 0 ? 'waste' : 'restock', url = server.url) =>
    request('/api/inventory/adjust', 'POST', { operationId, productId: product.id, changeAmount: delta, type, reason: 'Stock regression check' }, url);
  async function reviewed(suffix: string) {
    const order = saleFixture(`catalog-stock-${sequence}-${suffix}`);
    order.items[0].productId = product.id;
    return reviewSale(server.url, order, server.token);
  }
  const quantity = () => (db.prepare('SELECT stockQuantity FROM products WHERE id=?').get(product.id) as any).stockQuantity;
  const ledgerCount = () => (db.prepare('SELECT count(*) AS n FROM stock_movements WHERE product_id=?').get(product.id) as any).n;

  beforeAll(async () => {
    server = await isolatedServer(); db = new Database(server.dbPath);
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
  beforeEach(async () => {
    sequence++;
    const response = await request('/api/products', 'POST', { ...INITIAL_PRODUCTS[0], id: `catalog-stock-${sequence}`,
      moneySchemaVersion: 2, stockQuantity: 20, variations: [], bundledProducts: [] });
    expect(response.status).toBe(201); product = await response.json();
  });

  it.each([false, true])('preserves a sale decrement during a stale name/price edit (deal=%s)', async isDeal => {
    const setup = await edit({ ...product, isDeal }); expect(setup.status).toBe(200);
    product = await setup.json();
    const stale = structuredClone(product);
    const sale = await request('/api/orders', 'POST', await reviewed('stale'));
    expect(sale.status).toBe(201); expect(quantity()).toBe(19);
    const response = await edit({ ...stale, name: 'Renamed after sale', pricePaisa: stale.pricePaisa + 100 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ name: 'Renamed after sale', pricePaisa: stale.pricePaisa + 100, stockQuantity: 19, isDeal });
    expect(quantity()).toBe(19); expect(ledgerCount()).toBe(1);
    const stored = db.prepare('SELECT previousStock,changeAmount,newStock FROM inventory_logs WHERE productId=?').all(product.id);
    expect(stored).toEqual([{ previousStock: 20, changeAmount: -1, newStock: 19 }]);
  });

  it('preserves restock and waste deltas when an older form is saved repeatedly', async () => {
    expect((await adjust(5, `restock-${sequence}`)).status).toBe(200);
    expect((await edit()).status).toBe(200); expect(quantity()).toBe(25);
    expect((await adjust(-3, `waste-${sequence}`)).status).toBe(200);
    const response = await edit(); expect(response.status).toBe(200);
    expect((await response.json()).stockQuantity).toBe(22);
    expect(quantity()).toBe(22); expect(ledgerCount()).toBe(2);
  });

  it('ignores forged stock, timestamps and unknown database fields on catalog updates', async () => {
    for (const stockQuantity of [-100, 999999, 0, null]) {
      const response = await edit({ ...product, stockQuantity, createdAt: '1900-01-01', updatedAt: '1900-01-01', price_paisa: 1 });
      expect(response.status).toBe(200);
      const saved = await response.json();
      expect(saved.stockQuantity).toBe(20); expect(saved.pricePaisa).toBe(product.pricePaisa);
      expect(saved.createdAt).toBe(product.createdAt); expect(saved.updatedAt).not.toBe('1900-01-01');
    }
    expect(ledgerCount()).toBe(0);
  });

  it('serializes simultaneous sales, adjustments and stale edits across two servers', async () => {
    const sales = await Promise.all(Array.from({ length: 10 }, (_, index) => reviewed(`race-${index}`)));
    const responses = await Promise.all([
      ...sales.map((order, index) => request('/api/orders', 'POST', order, index % 2 ? server.url : secondUrl)),
      ...Array.from({ length: 10 }, (_, index) => adjust(1, `race-restock-${sequence}-${index}`, 'restock', index % 2 ? secondUrl : server.url)),
      ...Array.from({ length: 10 }, (_, index) => edit({ ...product, description: `Edit ${index}` }, index % 2 ? server.url : secondUrl)),
    ]);
    expect(responses.map(response => response.status)).toEqual([...Array(10).fill(201), ...Array(20).fill(200)]);
    expect(quantity()).toBe(20); expect(ledgerCount()).toBe(20);
    expect(db.prepare('SELECT SUM(delta) AS delta FROM stock_movements WHERE product_id=?').get(product.id)).toEqual({ delta: 0 });
  }, 30000);

  it('replays an adjustment once after a stale edit and rolls back a failed stock log', async () => {
    expect((await adjust(4, `retry-${sequence}`)).status).toBe(200);
    expect((await edit()).status).toBe(200);
    expect((await adjust(4, `retry-${sequence}`)).status).toBe(200);
    expect(quantity()).toBe(24); expect(ledgerCount()).toBe(1);
    db.exec("CREATE TRIGGER fail_stock_log BEFORE INSERT ON inventory_logs BEGIN SELECT RAISE(ABORT,'forced log failure'); END");
    try { expect((await adjust(1, `failed-${sequence}`)).status).toBe(400); }
    finally { db.exec('DROP TRIGGER fail_stock_log'); }
    expect(quantity()).toBe(24); expect(ledgerCount()).toBe(1);
  });

  it.each([-1, 1.5, null, '20', Number.MAX_SAFE_INTEGER + 1])('rejects invalid opening stock %s without creating a product', async stockQuantity => {
    const id = `invalid-opening-${sequence}`;
    const response = await request('/api/products', 'POST', { ...product, id, stockQuantity });
    expect(response.status).toBe(400);
    expect(db.prepare('SELECT id FROM products WHERE id=?').get(id)).toBeUndefined();
  });

  it('allows zero/default opening stock and returns 404 for a deleted catalog item', async () => {
    const { stockQuantity: _quantity, ...zero } = product;
    const response = await request('/api/products', 'POST', { ...zero, id: `zero-opening-${sequence}` });
    expect(response.status).toBe(201); expect((await response.json()).stockQuantity).toBe(0);
    expect((await request(`/api/products/${product.id}`, 'DELETE')).status).toBe(200);
    expect((await edit()).status).toBe(404);
  });
});
