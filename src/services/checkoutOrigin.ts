import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';

type Db = InstanceType<typeof Database>;
type Actor = { id: string; name: string; role: string };
type Origin = { order_id: string; cashier_id: string; cashier_name: string; cashier_role: string; basket_hash: string };

export function initCheckoutOrigins(db: Db) {
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS checkout_intents (
      idempotency_key TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE,
      cashier_id TEXT NOT NULL REFERENCES users(id),
      cashier_name TEXT NOT NULL,
      cashier_role TEXT NOT NULL,
      basket_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`);
    const columns = new Set((db.prepare('PRAGMA table_info(orders)').all() as { name: string }[]).map(column => column.name));
    for (const name of ['recordedById', 'recordedByName', 'recordedByRole', 'pricingFingerprint']) {
      if (!columns.has(name)) db.exec(`ALTER TABLE orders ADD COLUMN ${name} TEXT`);
    }
  }).immediate();
}

function basketHash(input: any, items: any[]): string {
  const lines = items.map(item => JSON.stringify({ productId: item.productId, quantity: item.quantity,
    notes: item.notes || '', options: (item.selectedVariations || []).map((option: any) =>
      JSON.stringify([option.groupId, option.optionId])).sort() })).sort();
  return createHash('sha256').update(JSON.stringify({ lines, paymentMethod: input.paymentMethod, orderType: input.orderType || 'take_away' })).digest('hex');
}

function blocked(message: string): never {
  throw Object.assign(new Error(message), { status: 409, recoveryCode: 'RECOVERY_OWNER_REQUIRED' });
}

function requireOriginalCashier(db: Db, input: any, caller: Actor) {
  if (input.cashierId && input.cashierId !== caller.id) {
    const owner = typeof input.cashierId === 'string' ? db.prepare('SELECT name FROM users WHERE id=?').get(input.cashierId) as { name: string } | undefined : undefined;
    blocked(owner ? `Sign in as ${owner.name} to review this pending sale.` : 'The original cashier must review this pending sale. Ask an administrator if the account is unavailable.');
  }
  if (!input.cashierId && ['pending', 'rejected'].includes(input.persistenceState)) blocked('The original cashier must review this pending sale.');
}

/** Keep unreviewed foreign recovery pending even if today's stock/prices changed. */
export function assertUnreviewedOwner(db: Db, input: any, key: unknown, caller: Actor) {
  if (!input || typeof key !== 'string' || !['pending', 'rejected'].includes(input.persistenceState)) return;
  if (!db.prepare('SELECT idempotency_key FROM checkout_intents WHERE idempotency_key=?').get(key)) requireOriginalCashier(db, input, caller);
}

/** Caller must hold an immediate write transaction, for quote or sale creation. */
export function checkoutOrigin(db: Db, input: any, items: any[], key: string, caller: Actor, reviewing: boolean): Actor {
  if (!db.inTransaction) throw new Error('Checkout ownership requires a transaction');
  if (typeof key !== 'string' || !key.trim() || key.length > 200 || typeof input.id !== 'string' || !input.id.trim() || input.id.length > 200) {
    throw Object.assign(new Error('A valid sale identity and recovery key are required.'), { status: 400 });
  }
  const hash = basketHash(input, items);
  const existing = db.prepare('SELECT * FROM checkout_intents WHERE idempotency_key=?').get(key) as Origin | undefined;
  if (existing) {
    if (existing.order_id !== input.id) blocked('This recovery key belongs to a different sale. Keep the original recovery copy.');
    if (!db.prepare('SELECT id FROM users WHERE id=?').get(existing.cashier_id)) blocked('The original cashier account needs administrator attention before this sale can be recovered.');
    if (existing.basket_hash !== hash) {
      if (!reviewing || existing.cashier_id !== caller.id) blocked(`Sign in as ${existing.cashier_name} to review changes to this pending basket.`);
      db.prepare('UPDATE checkout_intents SET basket_hash=? WHERE idempotency_key=?').run(hash, key);
    }
    return { id: existing.cashier_id, name: existing.cashier_name, role: existing.cashier_role };
  }
  // An unsigned owner hint can require authentication, but can never establish
  // somebody else's identity or be bypassed by changing a browser status flag.
  requireOriginalCashier(db, input, caller);
  if (db.prepare('SELECT order_id FROM checkout_intents WHERE order_id=?').get(input.id)) blocked('This sale already has a recovery key. Keep the original recovery copy.');
  db.prepare('INSERT INTO checkout_intents VALUES (?,?,?,?,?,?,?)')
    .run(key, input.id, caller.id, caller.name, caller.role, hash, new Date().toISOString());
  return caller;
}
