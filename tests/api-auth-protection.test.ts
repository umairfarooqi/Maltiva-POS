// @vitest-environment node
import { createHmac } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedServer } from './helpers/isolated-server';
import { reviewSale, saleFixture } from './helpers/sale-fixtures';

describe('default-deny API access and confidential response fields', () => {
  let server: Awaited<ReturnType<typeof isolatedServer>>;
  let db: InstanceType<typeof Database>;
  let cashierToken: string;
  let managerToken: string;
  const call = (method: string, route: string, token?: string, body: unknown = {}) => fetch(`${server.url}${route}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
  });
  beforeAll(async () => {
    server = await isolatedServer();
    db = new Database(server.dbPath);
    cashierToken = (await (await call('POST', '/api/auth/login', undefined,
      { username: 'cashier', password: 'fixture-only-secret' })).json()).token;
    const created = await call('POST', '/api/users', server.token,
      { name: 'Manager', username: 'manager', password: 'manager-secret', pin: '2468', role: 'manager' });
    expect(created.status).toBe(201);
    managerToken = (await (await call('POST', '/api/auth/login', undefined,
      { username: 'manager', pin: '2468' })).json()).token;
  }, 30000);
  afterAll(async () => { db?.close(); await server?.cleanup(); });

  const protectedRoutes = [
    ['GET', '/api/data'], ['GET', '/api/products'], ['POST', '/api/products'],
    ['PUT', '/api/products/deal-maltiva-special'], ['DELETE', '/api/products/deal-maltiva-special'],
    ['POST', '/api/categories'], ['PUT', '/api/categories/cat-pizza'], ['DELETE', '/api/categories/cat-pizza'],
    ['POST', '/api/inventory/adjust'], ['GET', '/api/orders/pending-status'],
    ['POST', '/api/orders/quote'], ['POST', '/api/orders'], ['GET', '/api/reports/profit'],
    ['GET', '/api/users'], ['POST', '/api/users'], ['PUT', '/api/users/user-cashier'],
    ['POST', '/api/users/user-cashier/reset-pin'], ['GET', '/api/settings/printer'],
    ['PUT', '/api/settings/printer'], ['POST', '/api/auth/approve'], ['POST', '/api/auth/logout'],
    ['GET', '/api/future-route'],
  ];
  it.each(protectedRoutes)('requires authentication for %s %s', async (method, route) => {
    const secret = (db.prepare("SELECT value FROM settings WHERE key='authSecret'").get() as { value: string }).value;
    const payload = Buffer.from(JSON.stringify({ sub: 'user-admin', scope: 'session', exp: Date.now() - 1000 })).toString('base64url');
    const expired = `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
    for (const token of [undefined, 'invalid-token', expired, `${'a'}.${'é'.repeat(43)}`]) {
      expect((await call(method, route, token)).status).toBe(401);
    }
  });

  it('exposes only basic health and minimal active staff fields publicly', async () => {
    expect(await (await call('GET', '/api/health')).json()).toEqual({ status: 'ok' });
    const staff = await (await call('GET', '/api/auth/staff')).json();
    expect(staff.length).toBe(3);
    for (const user of staff) expect(Object.keys(user).sort()).toEqual(['avatar', 'id', 'name', 'username']);
    db.prepare('UPDATE users SET active=0 WHERE id=?').run('user-cashier');
    try {
      expect((await call('GET', '/api/data', cashierToken)).status).toBe(401);
      expect((await (await call('GET', '/api/auth/staff')).json()).some((u: any) => u.id === 'user-cashier')).toBe(false);
    } finally { db.prepare('UPDATE users SET active=1 WHERE id=?').run('user-cashier'); }
  });

  it('enforces cashier and manager permissions while allowing their working reads', async () => {
    for (const token of [cashierToken, managerToken, server.token]) {
      for (const route of ['/api/data', '/api/products', '/api/orders/pending-status', '/api/settings/printer']) {
        expect((await call('GET', route, token)).status).toBe(200);
      }
    }
    for (const [method, route] of protectedRoutes.filter(([, route]) =>
      ['/api/products', '/api/categories', '/api/inventory/adjust', '/api/settings/printer', '/api/users', '/api/reports/profit'].includes(route))) {
      if (method === 'GET' && ['/api/products', '/api/settings/printer'].includes(route)) continue;
      expect((await call(method, route, cashierToken)).status).toBe(403);
    }
    expect((await call('GET', '/api/users', managerToken)).status).toBe(403);
    expect((await call('PUT', '/api/settings/printer', managerToken)).status).toBe(403);
    expect((await call('GET', '/api/reports/profit', managerToken)).status).toBe(200);
    expect((await call('GET', '/api/users', server.token)).status).toBe(200);
    expect((await call('PUT', '/api/settings/printer', server.token, { storeName: 'Test store' })).status).toBe(200);
  });

  function expectNoCosts(value: unknown) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      expect(['costPricePaisa', 'costDeltaPaisa', 'rawCostPaisa', 'unitCostPaisa', 'totalCostPaisa',
        'profitPaisa', 'profitMarginPercent', 'marginBp', 'lineCosts']).not.toContain(key);
      expectNoCosts(child);
    }
  }

  it('removes every nested cost from cashier quotes, saved sales, bootstrap and recovery', async () => {
    const input = saleFixture('nested-confidential');
    input.items.push({ ...input.items[0], id: 'variation-item', productId: 'prod-fajita-pizza',
      selectedVariations: [{ groupId: 'var-faj-size', optionId: 'opt-med' } as any] });
    input.cashTenderedPaisa = 1000000;
    const quoteResponse = await call('POST', '/api/orders/quote', cashierToken, input);
    expect(quoteResponse.status).toBe(200);
    const quote = await quoteResponse.json();
    expect(quote.items[0].bundledProducts.length).toBeGreaterThan(0);
    expect(quote.items[1].selectedVariations.length).toBeGreaterThan(0);
    expectNoCosts(quote);
    const response = await call('POST', '/api/orders', cashierToken, { ...input, ...quote, cashierId: 'forged' });
    expect(response.status).toBe(201);
    const saved = (await response.json()).order;
    expect(saved.cashierId).toBe('user-cashier');
    expectNoCosts(saved);
    expectNoCosts(await (await call('GET', '/api/products', cashierToken)).json());
    const bootstrap = await (await call('GET', '/api/data', cashierToken)).json();
    expect(bootstrap.users).toEqual([]);
    expect(bootstrap.inventoryLogs).toEqual([]);
    expectNoCosts(bootstrap);
    const recovery = await (await call('GET', `/api/orders/pending-status?key=${input.idempotencyKey}`, cashierToken)).json();
    expect(recovery.savedOrders).toHaveLength(1);
    expectNoCosts(recovery);
    const adminData = await (await call('GET', '/api/data', server.token)).json();
    const original = adminData.orders.find((order: any) => order.id === input.id);
    expect(original.totalCostPaisa).toBeGreaterThan(0);
    expect(original.items[0].bundledProducts[0].rawCostPaisa).toBeGreaterThan(0);
    expect(original.items[1].selectedVariations[0].costDeltaPaisa).toBeDefined();
    const reviewed = await reviewSale(server.url, saleFixture('manager-sale'), managerToken);
    expect((await call('POST', '/api/orders', managerToken, reviewed)).status).toBe(201);
  });
});
