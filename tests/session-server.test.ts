// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedServer } from './helpers/isolated-server';

describe('persisted session lifecycle', () => {
  let server: Awaited<ReturnType<typeof isolatedServer>>;
  let db: InstanceType<typeof Database>;
  const request = (route: string, token: string, method = 'GET', body?: unknown) => fetch(`${server.url}${route}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  async function login(username = 'admin', password = 'fixture-only-secret') {
    const response = await fetch(`${server.url}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    expect(response.status).toBe(200);
    return (await response.json()).token as string;
  }
  async function createUser(username: string, role = 'cashier') {
    const response = await request('/api/users', server.token, 'POST',
      { name: username, username, role, password: 'staff-secret', pin: '2468' });
    expect(response.status).toBe(201);
    return (await response.json()).id as string;
  }
  beforeAll(async () => { server = await isolatedServer(); db = new Database(server.dbPath); }, 30000);
  afterAll(async () => { db?.close(); await server?.cleanup(); });

  it('validates a session from server state and keeps it valid through a restart', async () => {
    const token = await login();
    const response = await request('/api/auth/session', token);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const session = await response.json();
    expect(session.user).toMatchObject({ id: 'user-admin', role: 'admin', active: true });
    for (const field of ['password', 'pin', 'securityAnswer', 'authSessionId', 'authExpiresAt']) expect(session.user[field]).toBeUndefined();
    expect(session.expiresAt).toBeGreaterThan(Date.now());
    await server.stop(); await server.start();
    expect((await request('/api/auth/session', token)).status).toBe(200);
  });

  it('revokes only the logged-out session and remembers the revocation after restart', async () => {
    const first = await login(), second = await login();
    expect((await request('/api/auth/logout', first, 'POST')).status).toBe(200);
    expect((await request('/api/users', first)).status).toBe(401);
    expect((await request('/api/auth/session', second)).status).toBe(200);
    await server.stop(); await server.start();
    expect((await request('/api/auth/session', first)).status).toBe(401);
    expect((await request('/api/auth/session', second)).status).toBe(200);
  });

  it.each([
    ['PIN', { pin: '1357' }], ['password', { password: 'updated-secret' }],
    ['role', { role: 'manager' }], ['deactivation', { active: false }],
  ])('revokes every existing session after a %s change', async (label, changes) => {
    const username = `staff-${label.toLowerCase()}`;
    const id = await createUser(username);
    const first = await login(username, 'staff-secret'), second = await login(username, 'staff-secret');
    expect((await request(`/api/users/${id}`, server.token, 'PUT', changes)).status).toBe(200);
    for (const token of [first, second]) expect((await request('/api/auth/session', token)).status).toBe(401);
    expect(db.prepare('SELECT count(*) AS n FROM auth_sessions WHERE user_id=?').get(id)).toEqual({ n: 0 });
  });

  it('resets all sessions and manager approval tokens atomically with a PIN reset', async () => {
    const id = await createUser('reset-manager', 'manager');
    const token = await login('reset-manager', 'staff-secret');
    const approved = await request('/api/auth/approve', server.token, 'POST', { username: 'reset-manager', pin: '2468' });
    expect(approved.status).toBe(200);
    const override = (await approved.json()).approvalToken;
    expect((await request('/api/auth/session', override)).status).toBe(401);
    expect(db.prepare('SELECT count(*) AS n FROM auth_sessions WHERE user_id=?').get(id)).toEqual({ n: 2 });
    expect((await request(`/api/users/${id}/reset-pin`, server.token, 'POST', { pin: '9999' })).status).toBe(200);
    expect((await request('/api/auth/session', token)).status).toBe(401);
    expect(db.prepare('SELECT count(*) AS n FROM auth_sessions WHERE user_id=?').get(id)).toEqual({ n: 0 });
    const renewed = await login('reset-manager', '9999');
    expect((await request('/api/auth/session', renewed)).status).toBe(200);
  });

  it('retains sessions for name-only edits and rejected credential changes', async () => {
    const id = await createUser('unchanged-staff');
    const token = await login('unchanged-staff', 'staff-secret');
    expect((await request(`/api/users/${id}`, server.token, 'PUT', { name: 'Updated Name' })).status).toBe(200);
    expect((await request(`/api/users/${id}/reset-pin`, server.token, 'POST', { pin: 'bad' })).status).toBe(400);
    expect((await request('/api/auth/session', token)).status).toBe(200);
  });

  it('rolls back credentials when revocation fails', async () => {
    const id = await createUser('atomic-reset');
    const token = await login('atomic-reset', 'staff-secret');
    db.exec("CREATE TRIGGER fail_revoke BEFORE DELETE ON auth_sessions BEGIN SELECT RAISE(ABORT, 'forced revoke failure'); END");
    try {
      expect((await request(`/api/users/${id}/reset-pin`, server.token, 'POST', { pin: '9999' })).status).toBe(400);
    } finally { db.exec('DROP TRIGGER fail_revoke'); }
    expect((await request('/api/auth/session', token)).status).toBe(200);
    expect(await login('atomic-reset', '2468')).toBeTruthy();
  });

  it('rejects a session removed or expired in server storage', async () => {
    const token = await login();
    const claims = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    // Keep the fixture clearly expired across the client/server process clock boundary.
    claims.exp = Date.now() - 60_000;
    expect(db.prepare('UPDATE auth_sessions SET expires_at=? WHERE id=?').run(claims.exp, claims.sid).changes).toBe(1);
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const secret = (db.prepare("SELECT value FROM settings WHERE key='authSecret'").get() as { value: string }).value;
    const expired = `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
    expect((await request('/api/auth/session', expired)).status).toBe(401);
    expect((await request('/api/auth/session', token)).status).toBe(401);
  });

  it('CLI administrator credential reset also revokes existing sessions', async () => {
    const token = await login();
    execFileSync(process.execPath, ['scripts/manage-admin.cjs', '--username', 'admin', '--pin', '9753', '--password', 'cli-updated-secret'],
      { env: { ...process.env, MALTIVA_POS_DB_DIR: path.dirname(server.dbPath) } });
    expect((await request('/api/auth/session', token)).status).toBe(401);
    expect((await request('/api/auth/session', await login('admin', 'cli-updated-secret'))).status).toBe(200);
  });
});
