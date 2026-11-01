// @vitest-environment node
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isolatedServer } from './helpers/isolated-server';
import { DatabaseBackups } from '../src/services/databaseBackups';

describe('restore failure safety', () => {
  let server: Awaited<ReturnType<typeof isolatedServer>>, root: string, db: InstanceType<typeof Database>, backups: DatabaseBackups;
  let sequence = 0;
  beforeAll(async () => {
    server = await isolatedServer();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'maltiva-restore-failures-'));
    const source = new Database(server.dbPath, { readonly: true });
    try { await source.backup(path.join(root, 'template.db')); } finally { source.close(); }
    await server.stop();
  }, 30000);
  beforeEach(() => {
    const file = path.join(root, `live-${++sequence}.db`); fs.copyFileSync(path.join(root, 'template.db'), file);
    db = new Database(file); db.pragma('journal_mode=WAL');
    backups = new DatabaseBackups(db, path.join(root, `backups-${sequence}`));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); db?.close(); });
  afterAll(async () => { await server?.cleanup(); if (root) fs.rmSync(root, { recursive: true, force: true }); });
  const snapshot = () => ({ products: db.prepare('SELECT * FROM products').all(), users: db.prepare('SELECT * FROM users').all(), settings: db.prepare('SELECT * FROM settings').all(), sessions: db.prepare('SELECT * FROM auth_sessions').all() });
  async function setupPreview() {
    const backup = await backups.create('admin');
    db.prepare('UPDATE products SET stockQuantity=stockQuantity+7').run();
    return backups.preview(fs.readFileSync(backups.download(backup.filename)), 'session-A');
  }
  it('rolls back every table on a mid-restore write failure and retains the pre-restore safety snapshot', async () => {
    const preview = await setupPreview(), before = snapshot();
    const exec = db.exec.bind(db);
    vi.spyOn(db, 'exec').mockImplementation(sql => {
      if (String(sql).startsWith('INSERT INTO main."payments"')) throw new Error('simulated write failure');
      return exec(String(sql));
    });
    expect(() => backups.restore(preview.token, 'session-A', 'admin')).toThrow('simulated write failure');
    expect(snapshot()).toEqual(before); expect(db.inTransaction).toBe(false);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    const safety = backups.list().find(file => file.safetyCopy)!;
    expect(safety).toBeTruthy();
    const copy = new Database(backups.download(safety.filename), { readonly: true });
    try { expect(copy.prepare('SELECT * FROM products').all()).toEqual(before.products); }
    finally { copy.close(); }
  });
  it('never starts replacement when the safety copy cannot be flushed to disk', async () => {
    const preview = await setupPreview(), before = snapshot();
    vi.spyOn(fs, 'fsyncSync').mockImplementation(() => { throw new Error('disk unavailable'); });
    expect(() => backups.restore(preview.token, 'session-A', 'admin')).toThrow('disk unavailable');
    expect(snapshot()).toEqual(before); expect(backups.list().some(file => file.safetyCopy)).toBe(false);
    expect(db.inTransaction).toBe(false);
  });
  it('rejects a changed staged file and an expired review without modifying the target', async () => {
    const preview = await setupPreview(), before = snapshot();
    const upload = fs.readdirSync(path.join(backups.directory, 'staging')).find(file => file.endsWith('.upload'))!;
    fs.appendFileSync(path.join(backups.directory, 'staging', upload), 'tampered');
    expect(() => backups.restore(preview.token, 'session-A', 'admin')).toThrow('file changed');
    expect(snapshot()).toEqual(before);
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    expect(() => backups.restore(preview.token, 'session-A', 'admin')).toThrow('preview expired');
    expect(snapshot()).toEqual(before);
  });
  it('detects writes from another database connection after the preview', async () => {
    const preview = await setupPreview(), other = new Database(db.name);
    try { other.prepare("UPDATE products SET name='Changed in another process' WHERE id=?").run((db.prepare('SELECT id FROM products LIMIT 1').get() as any).id); }
    finally { other.close(); }
    const before = snapshot();
    expect(() => backups.restore(preview.token, 'session-A', 'admin')).toThrow('changed after preview');
    expect(snapshot()).toEqual(before);
  });
  it('does not publish a backup when snapshot creation fails and rejects concurrent maintenance', async () => {
    vi.spyOn(db, 'backup').mockRejectedValueOnce(new Error('disk full'));
    await expect(backups.create('admin')).rejects.toThrow('disk full');
    expect(backups.list()).toEqual([]);
    vi.restoreAllMocks();
    const first = backups.create('admin');
    await expect(backups.create('admin')).rejects.toThrow('already running');
    await first;
    expect(backups.list()).toHaveLength(1);
  });
  it('does not publish a backup larger than the supported restore size', async () => {
    const backup = db.backup.bind(db);
    vi.spyOn(db, 'backup').mockImplementation(async file => {
      const result = await backup(file);
      fs.truncateSync(String(file), 64 * 1024 * 1024 + 1);
      return result;
    });
    await expect(backups.create('admin')).rejects.toThrow('64 MB');
    expect(backups.list()).toEqual([]);
    expect(fs.readdirSync(path.join(backups.directory, 'staging'))).toEqual([]);
  });
  it('releases cancelled preview files and slots without allowing another session to discard them', async () => {
    const preview = await setupPreview();
    expect(() => backups.discard(preview.token, 'session-B')).toThrow('another session');
    expect(fs.readdirSync(path.join(backups.directory, 'staging')).filter(file => file.endsWith('.upload'))).toHaveLength(1);
    backups.discard(preview.token, 'session-A');
    expect(fs.readdirSync(path.join(backups.directory, 'staging'))).toEqual([]);
    expect(() => backups.restore(preview.token, 'session-A', 'admin')).toThrow('preview expired');
    backups.discard(preview.token, 'session-A');
  });
});
