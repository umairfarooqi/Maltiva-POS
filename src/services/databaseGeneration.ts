import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

type Db = InstanceType<typeof Database>;
export function databaseGeneration(db: Db): string {
  return (db.prepare("SELECT value FROM settings WHERE key='databaseGeneration'").get() as { value: string }).value;
}
export function initDatabaseGeneration(db: Db) {
  db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('databaseGeneration',?)").run(randomUUID());
}
export function wasDatabaseRestored(db: Db): boolean {
  return Boolean(db.prepare("SELECT value FROM settings WHERE key='databaseRestoredAt'").get());
}
export function assertSaleGeneration(db: Db, input: any) {
  if ((input?.databaseGeneration && input.databaseGeneration !== databaseGeneration(db)) ||
      (wasDatabaseRestored(db) && input?.databaseGeneration !== databaseGeneration(db))) {
    throw Object.assign(new Error('The database was restored or changed. This recovery copy is retained; ask an administrator to reconcile it before creating another sale.'),
      { status: 409, recoveryCode: 'DATABASE_CHANGED' });
  }
}
