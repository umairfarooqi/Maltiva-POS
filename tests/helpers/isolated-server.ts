import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';

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
    for (let attempt = 0; attempt < 150; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
      try { if ((await hostFetch(`${url}/api/health`)).ok) return; } catch { /* starting */ }
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
  return { url, dbPath: path.join(dir, 'maltiva_pos.db'), start, stop,
    async cleanup() { await stop(); await rm(dir, { recursive: true, force: true }); } };
}
