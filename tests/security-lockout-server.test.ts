// @vitest-environment node
import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isolatedServer } from './helpers/isolated-server';
import { AccountLockouts } from '../src/services/accountLockouts';

describe('persistent canonical account lockout', () => {
  let server: Awaited<ReturnType<typeof isolatedServer>>, db: InstanceType<typeof Database>;
  const login = (username: string, secret: string, field = 'password') => fetch(server.url + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, [field]: secret }),
  });
  beforeAll(async () => { server = await isolatedServer(); db = new Database(server.dbPath); }, 30000);
  beforeEach(() => db.prepare('DELETE FROM auth_failures').run());
  afterAll(async () => { db?.close(); await server?.cleanup(); });
  it('shares one account limit across email, username, case, whitespace, PIN and password', async () => {
    const aliases = ['cashier', 'cashier@maltivacrust.com', ' CASHIER ', 'CASHIER@MALTIVACRUST.COM', 'cashier'];
    for (const [i, username] of aliases.entries()) expect((await login(username, 'wrong-fixture', i % 2 ? 'pin' : 'password')).status).toBe(401);
    for (const username of ['cashier', 'cashier@maltivacrust.com']) expect((await login(username, 'fixture-only-secret')).status).toBe(429);
    expect(db.prepare("SELECT count(*) n FROM auth_failures WHERE key LIKE 'account:%'").get()).toMatchObject({ n: 1 });
  });
  it('preserves a lock through an actual disposable-server restart', async () => {
    for (let i = 0; i < 5; i++) await login('cashier', 'wrong-fixture');
    await server.stop(); await server.start();
    expect((await login('cashier@maltivacrust.com', 'fixture-only-secret')).status).toBe(429);
  }, 30000);
  it('administrator PIN reset unlocks the canonical account and both aliases', async () => {
    for (let i = 0; i < 5; i++) await login('cashier@maltivacrust.com', 'wrong-fixture');
    const user: any = db.prepare("SELECT id FROM users WHERE username='cashier'").get();
    const reset = await server.request('/api/users/' + user.id + '/reset-pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '7351' }) });
    expect(reset.status).toBe(200);
    expect((await login('cashier', '7351', 'pin')).status).toBe(200);
    expect((await login('cashier@maltivacrust.com', '7351', 'pin')).status).toBe(200);
  });
  it('manager approvals and login aliases share failures without invalidating the requesting admin session', async () => {
    const created = await server.request('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Guard Manager', username: 'guard-manager', email: 'guard-manager@fixture.test', role: 'manager', password: 'fixture-manager-secret', pin: '6194' }) });
    expect(created.status).toBe(201);
    for (let i = 0; i < 3; i++) expect((await login('guard-manager@fixture.test', 'wrong-fixture')).status).toBe(401);
    const approve = (pin: string) => server.request('/api/auth/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'guard-manager', pin }) });
    for (let i = 0; i < 2; i++) expect((await approve('wrong-fixture')).status).toBe(401);
    expect((await approve('6194')).status).toBe(429);
    expect((await login('guard-manager', 'fixture-manager-secret')).status).toBe(429);
    expect((await server.request('/api/auth/session')).status).toBe(200);
  });
  it('allows a compatible older backup without the additive lockout table and retains the live table after restore', async () => {
    const oldPath = join(dirname(server.dbPath), 'pre-security-backup.db');
    await db.backup(oldPath);
    const older = new Database(oldPath); older.exec('DROP TABLE auth_failures'); older.pragma('wal_checkpoint(TRUNCATE)'); older.close();
    const preview = await server.request('/api/maintenance/restore/preview', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: readFileSync(oldPath) });
    expect(preview.status).toBe(200); const review = await preview.json();
    const restore = await server.request('/api/maintenance/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: review.token, password: 'fixture-only-secret', confirmation: 'RESTORE' }) });
    expect(restore.status).toBe(200);
    expect(db.prepare("SELECT count(*) n FROM auth_failures").get()).toMatchObject({ n: 0 });
    expect((await login('admin', 'fixture-only-secret')).status).toBe(200);
  });
});

it('expires locks and prior failure windows at their actual deadline and bounds unknown identifiers', () => {
  const db = new Database(':memory:');
  try {
    const locks = new AccountLockouts(db), key = locks.key('one-user', 'alias'), now = 1000000;
    for (let i = 0; i < 5; i++) locks.fail(key, now);
    expect(locks.isLocked(key, now + 299999)).toBe(true);
    expect(locks.isLocked(key, now + 300000)).toBe(false);
    locks.fail(key, now + 300001); expect(locks.isLocked(key, now + 300002)).toBe(false);
    expect(locks.key('one-user', 'other-alias')).toBe(key);
    for (let i = 0; i < 1005; i++) locks.fail(locks.key(undefined, 'unrecognized-' + i), now);
    expect(db.prepare("SELECT count(*) n FROM auth_failures WHERE key LIKE 'unknown:%'").get()).toMatchObject({ n: 1000 });
    expect(db.prepare("SELECT key FROM auth_failures WHERE key LIKE '%unrecognized%'").get()).toBeUndefined();
  } finally { db.close(); }
});
