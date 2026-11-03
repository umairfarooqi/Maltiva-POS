// @vitest-environment node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedServer } from './helpers/isolated-server';
import { reviewSale, saleFixture } from './helpers/sale-fixtures';

describe('authentication, admin provisioning and role guards', () => {
  let server: Awaited<ReturnType<typeof isolatedServer>>;
  let db: InstanceType<typeof Database>;
  let adminToken = '';
  let managerToken = '';
  let cashierToken = '';
  let cashierUserId = '';

  beforeAll(async () => {
    server = await isolatedServer();
    db = new Database(server.dbPath);
    // Clear fixture users to prove out-of-band CLI provisioning works from zero users
    db.prepare('DELETE FROM users').run();
  }, 30000);

  afterAll(async () => {
    db?.close();
    await server?.cleanup();
  });

  it('disallows public self-registration and self-service password reset endpoints', async () => {
    for (const endpoint of ['/api/auth/register', '/api/auth/forgot-password', '/api/auth/reset-password']) {
      const res = await fetch(`${server.url}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'hacker', password: 'password123', pin: '1234' }),
      });
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(201);
    }
  });

  it('provisions the first admin via CLI script and logs in with hashed PIN and password', async () => {
    execFileSync(
      process.execPath,
      [
        path.join(process.cwd(), 'scripts', 'manage-admin.cjs'),
        '--username', 'admin',
        '--name', 'Ibrahim Kadri',
        '--pin', '4321',
        '--password', 'adminSecret123',
      ],
      { env: { ...process.env, MALTIVA_POS_DB_DIR: path.dirname(server.dbPath) } }
    );

    const row = db.prepare("SELECT * FROM users WHERE username = 'admin'").get() as any;
    expect(row).toBeTruthy();
    expect(row.password).toMatch(/^s1\$/);
    expect(row.pin).toMatch(/^s1\$/);

    // A PIN opens a till session only: cashier permissions, even for an administrator.
    const pinLogin = await fetch(`${server.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', pin: '4321' }),
    });
    expect(pinLogin.status).toBe(200);
    const till = await pinLogin.json();
    expect(till.user).toMatchObject({ username: 'admin', role: 'cashier', accountRole: 'admin', authMethod: 'pin', active: true });
    const tillHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${till.token}` };
    expect((await fetch(`${server.url}/api/users`, { headers: tillHeaders })).status).toBe(403);
    expect((await fetch(`${server.url}/api/maintenance/backups`, { headers: tillHeaders })).status).toBe(403);
    expect((await fetch(`${server.url}/api/reports/profit`, { headers: tillHeaders })).status).toBe(403);
    const tillSession = await (await fetch(`${server.url}/api/auth/session`, { headers: tillHeaders })).json();
    expect(tillSession.user).toMatchObject({ role: 'cashier', accountRole: 'admin', authMethod: 'pin' });

    const passwordLogin = await fetch(`${server.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'adminSecret123' }),
    });
    expect(passwordLogin.status).toBe(200);
    const body = await passwordLogin.json();
    expect(body.token).toBeTruthy();
    expect(body.user).toMatchObject({ username: 'admin', role: 'admin', accountRole: 'admin', authMethod: 'password', active: true });
    expect(body.user.password).toBeUndefined();
    expect(body.user.pin).toBeUndefined();
    adminToken = body.token;
    expect((await fetch(`${server.url}/api/users`, { headers: { Authorization: `Bearer ${adminToken}` } })).status).toBe(200);
  });

  it('allows admin to create manager and cashier accounts and blocks duplicate usernames', async () => {
    const createManager = await fetch(`${server.url}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Shift Manager', username: 'manager1', role: 'manager', pin: '2222', password: 'managerPass' }),
    });
    expect(createManager.status).toBe(201);

    const createCashier = await fetch(`${server.url}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Front Cashier', username: 'cashier1', role: 'cashier', pin: '1111', password: 'cashierPass' }),
    });
    expect(createCashier.status).toBe(201);
    const cashierUser = await createCashier.json();
    cashierUserId = cashierUser.id;

    const dup = await fetch(`${server.url}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Dup Cashier', username: 'cashier1', role: 'cashier', pin: '1111', password: 'cashierPass' }),
    });
    expect(dup.status).toBe(409);

    const mgrLogin = await fetch(`${server.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'manager1', password: 'managerPass' }),
    });
    managerToken = (await mgrLogin.json()).token;

    const cshLogin = await fetch(`${server.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'cashier1', pin: '1111' }),
    });
    cashierToken = (await cshLogin.json()).token;
  });

  it('returns 403 for a cashier token on every admin, menu, stock, settings and profit route', async () => {
    const cashierHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierToken}` };

    expect((await fetch(`${server.url}/api/users`, { headers: cashierHeaders })).status).toBe(403);
    expect((await fetch(`${server.url}/api/users`, { method: 'POST', headers: cashierHeaders, body: '{}' })).status).toBe(403);
    expect((await fetch(`${server.url}/api/users/${cashierUserId}/reset-pin`, { method: 'POST', headers: cashierHeaders, body: '{"pin":"9999"}' })).status).toBe(403);
    expect((await fetch(`${server.url}/api/products`, { method: 'POST', headers: cashierHeaders, body: '{}' })).status).toBe(403);
    expect((await fetch(`${server.url}/api/products/deal-maltiva-special`, { method: 'PUT', headers: cashierHeaders, body: '{}' })).status).toBe(403);
    expect((await fetch(`${server.url}/api/products/deal-maltiva-special`, { method: 'DELETE', headers: cashierHeaders })).status).toBe(403);
    expect((await fetch(`${server.url}/api/categories`, { method: 'POST', headers: cashierHeaders, body: '{}' })).status).toBe(403);
    expect((await fetch(`${server.url}/api/inventory/adjust`, { method: 'POST', headers: cashierHeaders, body: '{}' })).status).toBe(403);
    expect((await fetch(`${server.url}/api/settings/printer`, { method: 'PUT', headers: cashierHeaders, body: '{}' })).status).toBe(403);
    expect((await fetch(`${server.url}/api/reports/profit`, { headers: cashierHeaders })).status).toBe(403);

    // Manager can read profit report but cannot manage users
    const managerHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` };
    expect((await fetch(`${server.url}/api/reports/profit`, { headers: managerHeaders })).status).toBe(200);
    expect((await fetch(`${server.url}/api/users`, { headers: managerHeaders })).status).toBe(403);
  });

  it('strips cost and profit fields from cashier responses and derives cashier identity from the token', async () => {
    const cashierHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierToken}` };
    const adminHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` };

    const cashierProducts = await (await fetch(`${server.url}/api/products`, { headers: cashierHeaders })).json();
    expect(cashierProducts.length).toBeGreaterThan(0);
    for (const p of cashierProducts) {
      expect(p.costPricePaisa).toBeUndefined();
      for (const g of p.variations || []) {
        for (const o of g.options || []) expect(o.costDeltaPaisa).toBeUndefined();
      }
      for (const b of p.bundledProducts || []) expect(b.rawCostPaisa).toBeUndefined();
    }

    // Place an order with a forged cashierId/cashierName/cashierRole using the cashier token
    const reviewed = await reviewSale(server.url, saleFixture('auth-cashier-sale'), cashierToken);
    const forgedSale = {
      ...reviewed,
      cashierId: 'forged-admin-id',
      cashierName: 'Forged Admin',
      cashierRole: 'admin',
    };
    const saleRes = await fetch(`${server.url}/api/orders`, {
      method: 'POST',
      headers: { ...cashierHeaders, 'Idempotency-Key': forgedSale.idempotencyKey },
      body: JSON.stringify(forgedSale),
    });
    expect(saleRes.status).toBe(201);
    const cashierOrderBody = (await saleRes.json()).order;
    // Cashier response must not include cost or profit fields
    expect(cashierOrderBody.profitPaisa).toBeUndefined();
    expect(cashierOrderBody.totalCostPaisa).toBeUndefined();
    expect(cashierOrderBody.items[0].unitCostPaisa).toBeUndefined();
    // Identity is derived from the cashier token, not the forged body
    expect(cashierOrderBody).toMatchObject({
      cashierId: cashierUserId,
      cashierName: 'Front Cashier',
      cashierRole: 'cashier',
    });

    // Admin bootstrap still receives full cost & profit snapshots for the same order
    const adminBootstrap = await (await fetch(`${server.url}/api/data`, { headers: adminHeaders })).json();
    const savedForAdmin = adminBootstrap.orders.find((o: any) => o.id === forgedSale.id);
    expect(savedForAdmin.profitPaisa).toEqual(expect.any(Number));
    expect(savedForAdmin.totalCostPaisa).toEqual(expect.any(Number));
  });

  it('locks an account after 5 failed PIN attempts and unlocks it when admin resets the PIN', async () => {
    for (let i = 0; i < 5; i++) {
      const bad = await fetch(`${server.url}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'cashier1', pin: '0000' }),
      });
      expect(bad.status).toBe(401);
    }

    // 6th attempt even with old valid PIN is locked (429)
    const locked = await fetch(`${server.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'cashier1', pin: '1111' }),
    });
    expect(locked.status).toBe(429);

    // Admin resets cashier PIN and unlocks account
    const resetRes = await fetch(`${server.url}/api/users/${cashierUserId}/reset-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ pin: '5555' }),
    });
    expect(resetRes.status).toBe(200);

    // Cashier can immediately log in with the new PIN
    const unlocked = await fetch(`${server.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'cashier1', pin: '5555' }),
    });
    expect(unlocked.status).toBe(200);
    cashierToken = (await unlocked.json()).token;
  });

  it('offers no PIN approval endpoint that could test or lock staff PINs', async () => {
    const approve = await fetch(`${server.url}/api/auth/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierToken}` },
      body: JSON.stringify({ username: 'manager1', pin: '2222' }),
    });
    expect(approve.status).toBe(404);
    expect((await approve.json()).approvalToken).toBeUndefined();
  });

  it('never stores a PIN as the password when upgrading a legacy account', async () => {
    db.prepare(`INSERT INTO users (id, name, username, password, pin, role, active)
      VALUES ('legacy-manager', 'Legacy Manager', 'legacy.manager', NULL, '8642', 'manager', 1)`).run();
    const login = await fetch(`${server.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'legacy.manager', pin: '8642' }),
    });
    expect((await login.json()).user).toMatchObject({ role: 'cashier', authMethod: 'pin' });
    const row = db.prepare("SELECT password, pin FROM users WHERE id = 'legacy-manager'").get() as any;
    expect(row.password).toBeNull();
    expect(row.pin).toMatch(/^s1\$/);
    const again = await fetch(`${server.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'legacy.manager', password: '8642' }),
    });
    expect((await again.json()).user).toMatchObject({ role: 'cashier', authMethod: 'pin' });
  });
});

