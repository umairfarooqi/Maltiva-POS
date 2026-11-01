// @vitest-environment node
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedServer } from './helpers/isolated-server';
import { saleFixture, reviewSale } from './helpers/sale-fixtures';
import { findReceipts } from '../src/services/receiptLookup';

describe('cashier saved receipt lookup', () => {
  let server: Awaited<ReturnType<typeof isolatedServer>>, db: InstanceType<typeof Database>, cashier: string, manager: string;
  const call = (route: string, auth = cashier) => fetch(`${server.url}${route}`, { headers: { Authorization: `Bearer ${auth}` } });
  beforeAll(async () => {
    server = await isolatedServer(); db = new Database(server.dbPath);
    const login = async (username: string) => (await (await fetch(`${server.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'fixture-only-secret' }) })).json()).token;
    cashier = await login('cashier');
    db.prepare("INSERT INTO users(id,name,username,password,role,active) VALUES ('lookup-manager','Lookup manager','lookup-manager','fixture-only-secret','manager',1)").run();
    manager = await login('lookup-manager');
    const reviewed = await reviewSale(server.url, saleFixture('lookup-template'), server.token);
    const response = await fetch(`${server.url}/api/orders`, { method: 'POST', headers: { Authorization: `Bearer ${server.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(reviewed) });
    expect(response.status).toBe(201);
    const saved = (await response.json()).order;
    db.prepare("UPDATE orders SET businessDate='2026-10-01',createdAt='2026-10-01T10:00:00.000Z',tokenNumber=7 WHERE id=?").run(saved.id);
    const columns = (db.prepare('PRAGMA table_info(orders)').all() as any[]).map(row => row.name);
    const template = db.prepare('SELECT * FROM orders WHERE id=?').get(saved.id) as any;
    const insert = db.prepare(`INSERT INTO orders (${columns.map(c => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
    db.transaction(() => {
      for (let n = 0; n < 10000; n++) {
        const row = { ...template, id: `history-${String(n).padStart(5, '0')}`, orderNumber: `#HISTORY-${n}`, idempotency_key: `history-key-${n}`,
          businessDate: '2026-09-01', createdAt: '2026-09-01T10:00:00.000Z', tokenNumber: n + 1 };
        insert.run(...columns.map(c => row[c]));
      }
      for (let n = 0; n < 60; n++) {
        const row = { ...template, id: `page-${String(n).padStart(3, '0')}`, orderNumber: `#PAGE-${n}`, idempotency_key: `page-key-${n}`,
          businessDate: '2026-10-02', createdAt: '2026-10-02T10:00:00.000Z', tokenNumber: n + 1 };
        insert.run(...columns.map(c => row[c]));
      }
      const legacy = { ...template, id: 'legacy-midnight', orderNumber: '#F001', idempotency_key: 'legacy-midnight-key', businessDate: null, createdAt: '2026-10-01 20:00:00', tokenNumber: 7 };
      insert.run(...columns.map(c => legacy[c]));
    }).immediate();
  }, 30000);
  afterAll(async () => { db?.close(); await server?.cleanup(); });
  const json = async (query: string) => { const response = await call(`/api/receipts?${query}`); expect(response.status).toBe(200); return response.json(); };
  it('allows cashier, manager and admin receipt reads and denies unauthenticated reads', async () => {
    for (const auth of [cashier, manager, server.token]) {
      expect((await call('/api/receipts?from=2026-10-01', auth)).status).toBe(200);
      expect((await call('/api/receipts/sale-lookup-template', auth)).status).toBe(200);
    }
    for (const route of ['/api/receipts', '/api/receipts/sale-lookup-template']) expect((await call(route, '')).status).toBe(401);
  });
  it('returns bounded safe summaries and original saved detail for another cashier’s sale', async () => {
    const page = await json('reference=' + encodeURIComponent('#TEST-lookup-template'));
    // Use the server-assigned reference, which replaces the test fixture reference.
    const reference = (db.prepare("SELECT orderNumber FROM orders WHERE id='sale-lookup-template'").get() as any).orderNumber;
    expect((await json('reference=' + encodeURIComponent(reference))).receipts).toHaveLength(1);
    expect(page.receipts).toHaveLength(0);
    const detail = await (await call('/api/receipts/sale-lookup-template')).json();
    expect(detail).toMatchObject({ cashierId: 'user-admin', persistenceState: 'saved', totalPaisa: 99000, cashTenderedPaisa: 100000, changeDuePaisa: 1000 });
    const forbidden = ['cost', 'profit', 'password', 'pin', 'securityAnswer'];
    const walk = (value: any) => { if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) { expect(forbidden.some(word => key.toLowerCase().includes(word.toLowerCase()))).toBe(false); walk(child); } };
    // profitIncomplete is a harmless legacy completeness flag; cost/profit amounts stay hidden.
    delete detail.profitIncomplete; walk(detail);
    const summaries = await json('from=2026-10-02'); expect(summaries.receipts).toHaveLength(25);
    expect(summaries.receipts[0]).not.toHaveProperty('items'); walk(summaries.receipts);
    db.prepare("UPDATE products SET price_paisa=123456,cost_price_paisa=99999 WHERE id=?").run(detail.items[0].productId);
    expect((await (await call('/api/receipts/sale-lookup-template')).json()).items[0].unitPricePaisa).toBe(99000);
  });
  it('matches repeated tokens to their business date, including legacy UTC timestamps at Karachi midnight', async () => {
    const first = await json('from=2026-10-01&token=7'); expect(first.receipts.map((r: any) => r.id)).toEqual(['sale-lookup-template']);
    const second = await json('from=2026-10-02&token=7'); expect(second.receipts.map((r: any) => r.id)).toEqual(['page-006', 'legacy-midnight']);
    expect(second.receipts[1].createdAt).toBe('2026-10-01T20:00:00Z');
    expect((await json('reference=%23F001')).receipts[0].id).toBe('legacy-midnight');
  });
  it('paginates equal timestamps without repeats while a new sale is inserted ahead of the cursor', async () => {
    const first = await json('from=2026-10-02');
    const template = db.prepare("SELECT * FROM orders WHERE id='page-059'").get() as any;
    template.id = 'newest-page'; template.orderNumber = '#NEWEST-PAGE'; template.idempotency_key = 'newest-page-key'; template.tokenNumber = 100; template.createdAt = '2026-10-02T11:00:00.000Z';
    const keys = Object.keys(template); db.prepare(`INSERT INTO orders (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(k => template[k]));
    const ids = first.receipts.map((r: any) => r.id); let cursor = first.nextCursor;
    while (cursor) { const page = await json('from=2026-10-02&cursor=' + encodeURIComponent(cursor)); ids.push(...page.receipts.map((r: any) => r.id)); cursor = page.nextCursor; }
    expect(ids).toHaveLength(61); expect(new Set(ids).size).toBe(61); expect(ids).not.toContain('newest-page');
  });
  it('rejects invalid filters, ambiguous tokens and stale or malformed cursors', async () => {
    for (const query of ['from=2026-02-30', 'from=2026-10-01&to=2026-12-01', 'limit=500', 'limit=-1', 'token=1.5', 'token=7&from=2026-10-01&to=2026-10-02', 'from[]=2026-10-01', 'cursor=not-json', 'reference=x&token=1']) expect((await call('/api/receipts?' + query)).status).toBe(400);
    const page = await json('from=2026-10-02');
    expect((await call('/api/receipts?from=2026-10-01&cursor=' + encodeURIComponent(page.nextCursor))).status).toBe(400);
    const decoded = JSON.parse(Buffer.from(page.nextCursor, 'base64url').toString()); decoded.generation = 'old-db';
    expect((await call('/api/receipts?from=2026-10-02&cursor=' + Buffer.from(JSON.stringify(decoded)).toString('base64url'))).status).toBe(409);
    expect((await json('reference=' + encodeURIComponent("' OR 1=1 --"))).receipts).toEqual([]);
    expect((await call('/api/receipts/missing')).status).toBe(404);
  });
  it('uses date indexes on a large history and leaves ledgers and counters unchanged', () => {
    const before = db.serialize();
    const started = performance.now(); const page = findReceipts(db, { from: '2026-09-01' });
    expect(page.receipts).toHaveLength(25); expect(performance.now() - started).toBeLessThan(2000);
    const plan = db.prepare('EXPLAIN QUERY PLAN SELECT id FROM orders WHERE businessDate>=? AND businessDate<=? ORDER BY julianday(createdAt) DESC,id DESC LIMIT 26').all('2026-09-01','2026-09-01') as any[];
    expect(plan.some(row => row.detail.includes('idx_receipts_business_date'))).toBe(true);
    expect(db.serialize().equals(before)).toBe(true);
  });
  it('uses the configured cutoff and daylight-saving boundaries for legacy receipts', () => {
    const set = db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)');
    const update = db.prepare("UPDATE orders SET createdAt=? WHERE id='legacy-midnight'");
    try {
      set.run('day_cutoff_hour', '4');
      expect(findReceipts(db, { from: '2026-10-02', token: '7' }).receipts.map(row => row.id)).toEqual(['page-006']);
      expect(findReceipts(db, { from: '2026-10-01', token: '7' }).receipts.map(row => row.id)).toContain('legacy-midnight');
      set.run('day_cutoff_hour', '0'); set.run('timezone', 'America/New_York');
      update.run('2026-11-01T03:59:59.000Z'); expect(findReceipts(db, { from: '2026-11-01' }).receipts).toEqual([]);
      update.run('2026-11-01T04:00:00.000Z'); expect(findReceipts(db, { from: '2026-11-01' }).receipts.map(row => row.id)).toEqual(['legacy-midnight']);
      update.run('2026-11-02T04:59:59.000Z'); expect(findReceipts(db, { from: '2026-11-01' }).receipts).toHaveLength(1);
      update.run('2026-11-02T05:00:00.000Z'); expect(findReceipts(db, { from: '2026-11-01' }).receipts).toEqual([]);
    } finally { update.run('2026-10-01 20:00:00'); db.prepare("DELETE FROM settings WHERE key IN ('timezone','day_cutoff_hour')").run(); }
  });
});
