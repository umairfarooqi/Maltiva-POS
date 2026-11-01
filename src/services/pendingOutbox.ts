import type { Order } from '../types/pos';
import { PosStorage } from './storage';
import { checkoutData, hasPrivateFields } from './clientPrivacy';
import { upgradeMoney } from '../shared/moneyUpgrade';

const DB_NAME = 'maltiva-pos-pending-sales';
const STORE = 'orders';

async function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw new Error('Durable sale storage is unavailable');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'idempotencyKey' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other POS windows to update recovery storage'));
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let request: IDBRequest<T>;
    try { request = action(tx.objectStore(STORE)); }
    catch (error) { tx.abort(); db.close(); reject(error); return; }
    // Wait for commit, not merely the individual request's success.
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onabort = () => { db.close(); reject(tx.error || request.error || new Error('Recovery write failed')); };
    tx.onerror = () => { /* onabort owns the rejection and connection cleanup */ };
  });
}

function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('pos-outbox-changed'));
  try { localStorage.setItem('pos-outbox-update', `${Date.now()}-${Math.random()}`); } catch { /* IndexedDB remains authoritative */ }
}
/** Sanitize the current row atomically; never overwrite a newer ack/rejection
 * with the snapshot read before this transaction. Legacy copies only fill gaps. */
async function migrateSnapshot(key: string, legacy?: Order): Promise<Order | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
    const read = store.get(key);
    let result: Order | undefined;
    read.onsuccess = () => {
      try {
        const current = read.result || legacy;
        if (current) {
          result = checkoutData(upgradeMoney<Order>(current));
          if (!read.result || current.moneySchemaVersion !== 2 || hasPrivateFields(current)) store.put(result);
        }
      } catch (error) { tx.abort(); reject(error); }
    };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Recovery privacy migration failed')); };
    tx.onerror = () => {};
  });
}
async function snapshots(): Promise<Order[]> {
  const rows = await transaction('readonly', store => store.getAll()) as Order[];
  const converted: Order[] = [];
  for (const row of rows) {
    // Keep the old copy if migration cannot commit. No caller receives private fields.
    const order = row.moneySchemaVersion !== 2 || hasPrivateFields(row)
      ? await migrateSnapshot(row.idempotencyKey || row.id)
      : checkoutData(upgradeMoney<Order>(row));
    if (order) converted.push(order);
  }
  return converted;
}

export const PendingOutbox = {
  async put(order: Order): Promise<Order> {
    const pending: Order = { ...checkoutData(upgradeMoney<Order>(order)), idempotencyKey: order.idempotencyKey || order.id, synced: false, persistenceState: 'pending' };
    await transaction('readwrite', store => store.put(pending));
    notify();
    return pending;
  },
  async list(): Promise<Order[]> {
    // Preserve the old recovery copy until every migrated order has committed to IndexedDB.
    const legacy = PosStorage.getOfflineQueue();
    for (const order of legacy) await migrateSnapshot(order.idempotencyKey || order.id, { ...order, idempotencyKey: order.idempotencyKey || order.id, synced: false, persistenceState: 'pending' });
    if (legacy.length) {
      const migrated = new Set(legacy.map(order => order.id));
      PosStorage.setOfflineQueue(PosStorage.getOfflineQueue().filter(order => !migrated.has(order.id)));
      notify();
    }
    const orders = await snapshots();
    return orders.filter(order => order.persistenceState !== 'rejected' && order.persistenceState !== 'saved');
  },
  async acknowledged(): Promise<Order[]> {
    const orders = await snapshots();
    return orders.filter(order => order.persistenceState === 'saved');
  },
  async acknowledge(order: Order): Promise<void> {
    // A full optional cache must not turn a confirmed sale back into a pending sale.
    await transaction('readwrite', store => store.put(checkoutData(order)));
    notify();
  },
  async rejected(): Promise<Order[]> {
    const orders = await snapshots();
    return orders.filter(order => order.persistenceState === 'rejected');
  },
  async reject(order: Order, reason: string): Promise<Order> {
    const rejected: Order = { ...checkoutData(order), persistenceState: 'rejected', rejectionReason: reason, synced: false };
    // Keep the submitted basket durable even if the optional browser cache is full.
    await transaction('readwrite', store => store.put(rejected));
    notify();
    return rejected;
  },
  async block(order: Order, reason: string): Promise<Order> {
    const blocked: Order = { ...checkoutData(order), persistenceState: 'pending', synced: false, recoveryBlockedReason: reason };
    await transaction('readwrite', store => store.put(blocked));
    notify();
    return blocked;
  },
  async remove(key: string): Promise<void> {
    await transaction('readwrite', store => store.delete(key));
    notify();
  },
};
