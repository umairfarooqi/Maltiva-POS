import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
import Database from 'better-sqlite3';
import { INITIAL_USERS } from '../../src/data/initialData';

const hostFetch = globalThis.fetch;

export async function isolatedServer() {
  const dir = await mkdtemp(path.join(tmpdir(), 'maltiva-lifecycle-'));
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = (reservation.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const url = `http://127.0.0.1:${port}`;
  let child: ChildProcess | undefined;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
      cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), MALTIVA_POS_DB_DIR: dir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', chunk => { output += chunk; });
    child.stderr?.on('data', chunk => { output += chunk; });
    // Cold TypeScript startup on Windows can exceed 4.5 seconds. Keep a real,
    // bounded deadline inside the caller's 15-second lifecycle hook timeout.
    const startupDeadline = Date.now() + 12000;
    while (Date.now() < startupDeadline) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
      try {
        if ((await hostFetch(`${url}/api/health`)).ok) {
          // The server never seeds user accounts; sales need a cashier row for the fixture.
          const db = new Database(path.join(dir, 'maltiva_pos.db'));
          try {
            for (const u of INITIAL_USERS) {
              db.prepare(`INSERT OR IGNORE INTO users (id, name, username, email, password, pin, role, avatar, active, branch)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`).run(u.id, u.name, u.username, u.email, 'fixture-only-secret', u.pin, u.role, u.avatar, u.branch);
            }
          } finally { db.close(); }
          return;
        }
      } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error(`Server startup timed out: ${output}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    child = undefined;
  }
  try { await start(); } catch (error) { await stop(); await rm(dir, { recursive: true, force: true }); throw error; }
  // Lifecycle tests authenticate explicitly; security tests continue using raw
  // fetch so missing/invalid credentials can never be supplied implicitly.
  const login = await hostFetch(`${url}/api/auth/login`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'fixture-only-secret' }) });
  const { token } = await login.json() as { token: string };
  if (!login.ok || !token) { await stop(); await rm(dir, { recursive: true, force: true }); throw new Error('Fixture login failed'); }
  const headers = { Authorization: `Bearer ${token}` };
  const request = (route: string, init: RequestInit = {}) => hostFetch(`${url}${route}`, {
    ...init, headers: { ...headers, ...Object.fromEntries(new Headers(init.headers)) },
  });
  return { url, token, headers, request, dbPath: path.join(dir, 'maltiva_pos.db'), start, stop,
    async cleanup() { await stop(); await rm(dir, { recursive: true, force: true }); } };
}
