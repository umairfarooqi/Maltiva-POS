import 'fake-indexeddb/auto';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isolatedServer } from './helpers/isolated-server';
import { saleFixture } from './helpers/sale-fixtures';
import { PosStorage } from '../src/services/storage';
import { PendingOutbox } from '../src/services/pendingOutbox';
import { PosApi } from '../src/services/api';

const realFetch = globalThis.fetch;
let server: Awaited<ReturnType<typeof isolatedServer>>;
beforeEach(async () => {
  localStorage.clear(); PosStorage.setOrders([]);
  await new Promise<void>(resolve => { const request = indexedDB.deleteDatabase('maltiva-pos-pending-sales'); request.onsuccess = () => resolve(); });
  server = await isolatedServer();
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => realFetch(`${server.url}${url}`, init));
}, 15000);
afterEach(async () => { vi.unstubAllGlobals(); await server?.cleanup(); });

describe('phase 1 actual server restart', () => {
  it('a stopped server leaves a durable sale that syncs exactly once after restart and client reload', async () => {
    await server.stop();
    const result = await PosApi.placeOrder(saleFixture('restart'), true);
    expect(result.state).toBe('pending');
    PosStorage.setOrders([]); PosStorage.clearSession();
    vi.resetModules();
    const recoveredApi = (await import('../src/services/api')).PosApi;
    expect((await recoveredApi.fetchInitialData()).orders).toMatchObject([{ id: 'sale-restart', persistenceState: 'pending' }]);
    await server.start();
    await Promise.all([recoveredApi.syncOfflineQueue(), recoveredApi.syncOfflineQueue()]);
    await recoveredApi.syncOfflineQueue();
    expect(await PendingOutbox.list()).toEqual([]);
    const db = new Database(server.dbPath, { readonly: true });
    try {
      for (const table of ['orders', 'order_items', 'payments', 'stock_movements', 'inventory_logs']) {
        expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n).toBe(1);
      }
      expect(db.prepare('SELECT stockQuantity FROM products WHERE id = ?').get('deal-maltiva-special').stockQuantity).toBe(998);
    } finally { db.close(); }
    expect(PosStorage.getOrders()).toMatchObject([{ id: 'sale-restart', persistenceState: 'saved' }]);
  }, 15000);
  it('losing a committed response and restarting does not duplicate the sale or stock deduction', async () => {
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const response = await realFetch(`${server.url}${url}`, init);
      if (url === '/api/orders') throw new TypeError('Acknowledgment lost');
      return response;
    });
    expect((await PosApi.placeOrder(saleFixture('lost-response'), true)).state).toBe('pending');
    await server.stop(); await server.start();
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => realFetch(`${server.url}${url}`, init));
    expect(await PosApi.syncOfflineQueue()).toMatchObject({ syncedCount: 1, pendingCount: 0 });
    const db = new Database(server.dbPath, { readonly: true });
    try {
      expect(db.prepare('SELECT count(*) AS n FROM orders').get().n).toBe(1);
      expect(db.prepare('SELECT count(*) AS n FROM stock_movements').get().n).toBe(1);
    } finally { db.close(); }
  }, 15000);
});
