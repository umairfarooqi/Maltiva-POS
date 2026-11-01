import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { databaseGeneration } from './databaseGeneration';

type Db = InstanceType<typeof Database>;
const MAX_BYTES = 64 * 1024 * 1024;
const TTL = 15 * 60 * 1000;
const filePattern = /^(backup|before-restore)-\d{8}T\d{6}Z-[a-f0-9-]{36}\.db$/;
const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
function schema(db: Db) {
  return JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all());
}
function tables(db: Db): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(row => row.name);
}
function counts(db: Db) {
  return Object.fromEntries(['orders', 'order_items', 'payments', 'stock_movements', 'products', 'users', 'checkout_intents']
    .map(table => [table, (db.prepare(`SELECT count(*) n FROM ${identifier(table)}`).get() as { n: number }).n]));
}
function revision(db: Db) {
  return `${databaseGeneration(db)}:${db.pragma('data_version', { simple: true })}:${(db.prepare('SELECT total_changes() n').get() as { n: number }).n}`;
}
function verify(file: string, live: Db) {
  const source = new Database(file, { readonly: true, fileMustExist: true });
  try {
    source.pragma('trusted_schema=OFF');
    if (source.pragma('integrity_check', { simple: true }) !== 'ok') fail('Backup integrity check failed.');
    if (schema(source) !== schema(live)) fail('This backup uses a different database version. Use a backup from this POS version.');
    if (source.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('trigger','view') OR sql LIKE 'CREATE VIRTUAL%' LIMIT 1").get()) fail('Unsupported database objects in backup.');
    if (source.pragma('foreign_key_check').length) fail('Backup contains broken data relationships.');
    const administrators = source.prepare("SELECT username,name FROM users WHERE role='admin' AND active=1 AND length(password)>0").all();
    if (!administrators.length) fail('Backup must contain an active administrator with a password.');
    return { counts: counts(source), administrators, generation: databaseGeneration(source) };
  } finally { source.close(); }
}
function durableWrite(file: string, bytes: Buffer) {
  const descriptor = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
}
type Preview = { file: string; digest: string; session: string; revision: string; expiresAt: number; summary: ReturnType<typeof verify> };

/** Never imports db.ts: tests and callers must explicitly select the database. */
export class DatabaseBackups {
  private busy = false;
  private previews = new Map<string, Preview>();
  readonly directory: string;
  private staging: string;
  constructor(private db: Db, directory = path.join(path.dirname(db.name), 'backups')) {
    this.directory = path.resolve(directory);
    this.staging = path.join(this.directory, 'staging');
    fs.mkdirSync(this.staging, { recursive: true, mode: 0o700 });
    db.exec(`CREATE TABLE IF NOT EXISTS maintenance_events (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL, filename TEXT NOT NULL, source_sha256 TEXT
    )`);
  }
  private filename(kind: 'backup' | 'before-restore') {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return `${kind}-${timestamp}-${randomUUID()}.db`;
  }
  private audit(kind: string, actor: string, filename: string, sha: string | null = null) {
    this.db.prepare('INSERT INTO maintenance_events VALUES (?,?,?,?,?,?)').run(randomUUID(), kind, actor, new Date().toISOString(), filename, sha);
  }
  private cleanPreviews() {
    for (const [token, preview] of this.previews) if (preview.expiresAt <= Date.now()) {
      this.removeStaged(preview.file); this.previews.delete(token);
    }
  }
  private removeStaged(file: string) {
    for (const target of [file, `${file}-wal`, `${file}-shm`]) {
      try { fs.rmSync(target, { force: true }); } catch { console.warn('Restore staging cleanup could not finish; the private file was retained.'); }
    }
  }
  discard(token: string, session: string) {
    const preview = this.previews.get(token);
    if (!preview) return;
    if (preview.session !== session) fail('This restore preview belongs to another session.', 403);
    this.removeStaged(preview.file); this.previews.delete(token);
  }
  list() {
    return fs.readdirSync(this.directory).filter(name => filePattern.test(name)).map(name => {
      const stat = fs.statSync(path.join(this.directory, name));
      return { filename: name, bytes: stat.size, createdAt: stat.mtime.toISOString(), safetyCopy: name.startsWith('before-restore-') };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  download(filename: string) {
    if (!filePattern.test(filename)) fail('Backup not found.', 404);
    const file = path.join(this.directory, filename);
    if (!fs.existsSync(file)) fail('Backup not found.', 404);
    return file;
  }
  async create(actor: string) {
    if (this.busy) fail('Database maintenance is already running. Retry shortly.', 409);
    this.busy = true;
    const filename = this.filename('backup'), partial = path.join(this.staging, `${randomUUID()}.partial`);
    try {
      await this.db.backup(partial);
      if (fs.statSync(partial).size > MAX_BYTES) fail('This database exceeds the supported 64 MB backup and restore limit. No backup was published.');
      const summary = verify(partial, this.db);
      fs.chmodSync(partial, 0o600);
      const fd = fs.openSync(partial, 'r+'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(partial, path.join(this.directory, filename));
      this.audit('backup', actor, filename);
      return { filename, ...summary };
    } finally { this.removeStaged(partial); this.busy = false; }
  }
  preview(bytes: Buffer, session: string) {
    this.cleanPreviews();
    if (this.busy) fail('Database maintenance is already running.', 409);
    if (!Buffer.isBuffer(bytes) || bytes.length < 100 || bytes.length > MAX_BYTES || bytes.subarray(0, 16).toString() !== 'SQLite format 3\0') fail('Choose a valid SQLite POS backup, up to 64 MB. Browser JSON exports cannot be restored here.');
    if (this.previews.size >= 8) fail('Too many restore previews. Wait 15 minutes and retry.', 429);
    const file = path.join(this.staging, `${randomUUID()}.upload`);
    try {
      durableWrite(file, bytes);
      const summary = verify(file, this.db), token = randomUUID(), sha256 = digest(bytes);
      this.previews.set(token, { file, digest: sha256, session, revision: revision(this.db), expiresAt: Date.now() + TTL, summary });
      return { token, sha256, expiresAt: Date.now() + TTL, backup: summary, current: { counts: counts(this.db) } };
    } catch (error) { this.removeStaged(file); throw error; }
  }
  restore(token: string, session: string, actor: string) {
    this.cleanPreviews();
    const preview = this.previews.get(token);
    if (!preview || preview.session !== session) fail('Restore preview expired or belongs to another session. Select the file again.', 409);
    if (this.busy) fail('Database maintenance is already running.', 409);
    this.busy = true;
    const safetyFilename = this.filename('before-restore'), partial = path.join(this.staging, `${randomUUID()}.partial`);
    const foreignKeys = this.db.pragma('foreign_keys', { simple: true });
    const synchronous = this.db.pragma('synchronous', { simple: true });
    let attached = false;
    try {
      if (digest(fs.readFileSync(preview.file)) !== preview.digest) fail('The previewed file changed. Select the backup again.', 409);
      verify(preview.file, this.db);
      this.db.prepare('ATTACH DATABASE ? AS restore_source').run(preview.file); attached = true;
      this.db.pragma('foreign_keys=OFF');
      this.db.pragma('synchronous=FULL');
      const generation = this.db.transaction(() => {
        if (revision(this.db) !== preview.revision) fail('The database changed after preview. Select the backup again to review current totals.', 409);
        // Synchronous snapshot and fsync under the write lock: includes committed WAL
        // and every sale up to the exact moment before replacement, across processes.
        durableWrite(partial, this.db.serialize());
        verify(partial, this.db);
        fs.renameSync(partial, path.join(this.directory, safetyFilename));
        const issuedCounters = this.db.prepare('SELECT * FROM order_counters').all() as { business_date: string; name: string; value: number }[];
        const names = tables(this.db);
        for (const name of names) this.db.exec(`DELETE FROM main.${identifier(name)}`);
        for (const name of names) {
          const columns = (this.db.prepare(`PRAGMA main.table_info(${identifier(name)})`).all() as { name: string }[]).map(column => identifier(column.name)).join(',');
          this.db.exec(`INSERT INTO main.${identifier(name)} (${columns}) SELECT ${columns} FROM restore_source.${identifier(name)}`);
        }
        if (this.db.pragma('main.foreign_key_check').length) fail('Restored data relationships failed validation. Nothing was replaced.');
        // Printed numbers issued after an older backup must not be issued again.
        const preserveCounter = this.db.prepare(`INSERT INTO order_counters (business_date,name,value) VALUES (?,?,?)
          ON CONFLICT(business_date,name) DO UPDATE SET value=MAX(value,excluded.value)`);
        for (const counter of issuedCounters) preserveCounter.run(counter.business_date, counter.name, counter.value);
        this.db.exec('DELETE FROM auth_sessions');
        const generation = randomUUID();
        const set = this.db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)');
        set.run('databaseGeneration', generation); set.run('databaseRestoredAt', new Date().toISOString());
        set.run('authSecret', randomBytes(32).toString('hex'));
        this.audit('restore', actor, safetyFilename, preview.digest);
        return generation;
      }).immediate();
      this.db.exec('DETACH DATABASE restore_source'); attached = false;
      this.previews.delete(token);
      // Cleanup cannot turn a committed restore into an apparent failure.
      this.removeStaged(preview.file);
      return { success: true, safetyFilename, databaseGeneration: generation };
    } finally {
      if (attached) this.db.exec('DETACH DATABASE restore_source');
      this.db.pragma(`foreign_keys=${foreignKeys ? 'ON' : 'OFF'}`);
      this.db.pragma(`synchronous=${synchronous}`);
      this.removeStaged(partial); this.busy = false;
    }
  }
}
