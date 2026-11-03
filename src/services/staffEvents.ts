import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { StaffAction, StaffEvent } from '../types/pos';
export type { StaffAction, StaffEvent };

type Db = InstanceType<typeof Database>;

/** Append-only record of staff account changes. Like lockout counters it is local
 * to this till: a database restore keeps it, so restoring an old backup can never
 * erase who created, promoted, suspended or reset an account. */
/** Who made a change. Out-of-band tools have no account, only a label. */
export type StaffActor = { id: string | null; username: string };
export const SETUP_ACTOR: StaffActor = { id: null, username: 'owner setup' };

export function ensureStaffEvents(db: Db) {
  db.exec(`CREATE TABLE IF NOT EXISTS staff_events (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    actor_id TEXT,
    actor_username TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_username TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_staff_events_created ON staff_events(created_at);`);
}

export function recordStaffEvent(db: Db, actor: StaffActor, target: { id: string; username: string },
  action: StaffAction, detail = '') {
  db.prepare(`INSERT INTO staff_events (id,created_at,actor_id,actor_username,target_id,target_username,action,detail)
    VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(), new Date().toISOString(), actor.id, actor.username,
    target.id, target.username, action, detail);
}

export function listStaffEvents(db: Db, limit = 100): StaffEvent[] {
  return db.prepare(`SELECT id, created_at AS createdAt, actor_id AS actorId, actor_username AS actorUsername,
    target_id AS targetId, target_username AS targetUsername, action, detail
    FROM staff_events ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(Math.min(Math.max(1, limit), 500)) as StaffEvent[];
}
