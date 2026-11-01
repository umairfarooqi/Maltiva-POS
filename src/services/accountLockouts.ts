import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';

type Db = InstanceType<typeof Database>;
const WINDOW_MS = 5 * 60_000;
/** Server-owned counters survive restarts. All login aliases/credential types and
 * manager approvals for a known user share one account key. */
export class AccountLockouts {
  constructor(private db: Db) {
    db.exec(`CREATE TABLE IF NOT EXISTS auth_failures (
      key TEXT PRIMARY KEY, count INTEGER NOT NULL, until_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL
    )`);
  }
  key(userId: string | undefined, identifier: string) {
    return userId ? `account:${userId}` : `unknown:${createHash('sha256').update(identifier).digest('hex')}`;
  }
  isLocked(key: string, now = Date.now()) {
    const row = this.db.prepare('SELECT until_ms FROM auth_failures WHERE key=?').get(key) as { until_ms: number } | undefined;
    return !!row && row.until_ms > now;
  }
  fail(key: string, now = Date.now()) {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM auth_failures WHERE updated_ms < ? AND until_ms <= ?').run(now - WINDOW_MS, now);
      const old = this.db.prepare('SELECT count,until_ms,updated_ms FROM auth_failures WHERE key=?').get(key) as any;
      const count = old && (!old.until_ms || old.until_ms > now) && old.updated_ms > now - WINDOW_MS ? old.count + 1 : 1;
      this.db.prepare(`INSERT INTO auth_failures VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET
        count=excluded.count,until_ms=excluded.until_ms,updated_ms=excluded.updated_ms`)
        .run(key, count, count >= 5 ? now + WINDOW_MS : 0, now);
      // Unknown identifiers cannot grow a permanent table of supplied personal data.
      this.db.prepare(`DELETE FROM auth_failures WHERE key IN (SELECT key FROM auth_failures
        WHERE key LIKE 'unknown:%' ORDER BY updated_ms DESC,key LIMIT -1 OFFSET 1000)`).run();
    }).immediate();
  }
  clear(key: string) { this.db.prepare('DELETE FROM auth_failures WHERE key=?').run(key); }
}
