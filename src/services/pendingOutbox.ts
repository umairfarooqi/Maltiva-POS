import type { Order } from '../types/pos';
import { PosStorage } from './storage';
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
async function snapshots(): Promise<Order[]> {
  const rows = await transaction('readonly', store => store.getAll()) as Order[];
  const converted: Order[] = [];
  for (const row of rows) {
    const order = upgradeMoney<Order>(row);
    // Keep the old row until the versioned replacement commits.
    if (row.moneySchemaVersion !== 2) await transaction('readwrite', store => store.put(order));
    converted.push(order);
  }
  return converted;
}

export const PendingOutbox = {
  async put(order: Order): Promise<Order> {
    const pending: Order = { ...upgradeMoney<Order>(order), idempotencyKey: order.idempotencyKey || order.id, synced: false, persistenceState: 'pending' };
    await transaction('readwrite', store => store.put(pending));
    notify();
    return pending;
  },
  async list(): Promise<Order[]> {
    // Preserve the old recovery copy until every migrated order has committed to IndexedDB.
    const legacy = PosStorage.getOfflineQueue();
    for (const order of legacy) await transaction('readwrite', store => store.put({ ...order, idempotencyKey: order.idempotencyKey || order.id, synced: false, persistenceState: 'pending' }));
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
    await transaction('readwrite', store => store.put(order));
    notify();
  },
  async rejected(): Promise<Order[]> {
    const orders = await snapshots();
    return orders.filter(order => order.persistenceState === 'rejected');
  },
  async reject(order: Order, reason: string): Promise<Order> {
    const rejected: Order = { ...order, persistenceState: 'rejected', rejectionReason: reason, synced: false };
    // Keep the submitted basket durable even if the optional browser cache is full.
    await transaction('readwrite', store => store.put(rejected));
    notify();
    return rejected;
  },
  async remove(key: string): Promise<void> {
    await transaction('readwrite', store => store.delete(key));
    notify();
  },
};
