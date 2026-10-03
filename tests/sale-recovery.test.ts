import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PosApi } from '../src/services/api';
import { PosStorage } from '../src/services/storage';
import { PendingOutbox } from '../src/services/pendingOutbox';
import { INITIAL_PRODUCTS, INITIAL_PRINTER_SETTINGS } from '../src/data/initialData';
import { saleFixture } from './helpers/sale-fixtures';

async function resetOutbox() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('maltiva-pos-pending-sales');
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
}
const bootstrap = (orders: unknown[] = []) => ({ categories: [], products: INITIAL_PRODUCTS, orders, tables: [], users: [], printerSettings: INITIAL_PRINTER_SETTINGS, inventoryLogs: [] });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
async function pending(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('maltiva-pos-pending-sales', 1);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('orders')) { db.close(); resolve([]); return; }
      const tx = db.transaction('orders', 'readonly');
      const rows = tx.objectStore('orders').getAll();
      tx.oncomplete = () => { db.close(); resolve(rows.result.filter((order: any) => order.persistenceState !== 'rejected')); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
  });
}

describe('phase 1 durable sale recovery', () => {
  beforeEach(async () => { localStorage.clear(); await resetOutbox(); PosStorage.setOrders([]); PosStorage.setProducts(structuredClone(INITIAL_PRODUCTS)); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('shows saved only after 201 and records the same recovery key sent to the server', async () => {
    const order = saleFixture('saved');
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      expect(init.headers).toMatchObject({ 'Idempotency-Key': 'key-saved' });
      expect((await pending())[0].idempotencyKey).toBe('key-saved');
      return json({ order: { ...order, synced: true, persistenceState: 'saved' } }, 201);
    });
    const result = await PosApi.placeOrder(order, true);
    expect(result).toMatchObject({ state: 'saved', success: true });
    expect(await pending()).toEqual([]);
    expect(PosStorage.getOrders()[0]).toMatchObject({ id: order.id, persistenceState: 'saved', synced: true });
  });
  it('automatic replay shares an in-flight checkout response instead of sending the sale twice', async () => {
    let release!: () => void;
    const responseGate = new Promise<void>(resolve => { release = resolve; });
    let started!: () => void;
    const transportStarted = new Promise<void>(resolve => { started = resolve; });
    let replayReady!: () => void;
    const replaySnapshot = new Promise<void>(resolve => { replayReady = resolve; });
    const originalList = PendingOutbox.list;
    let reads = 0;
    vi.spyOn(PendingOutbox, 'list').mockImplementation(async () => {
      const rows = await originalList();
      if (++reads === 2) replayReady();
      return rows;
    });
    let posts = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.startsWith('/api/orders/pending-status')) return json({});
      posts++; started(); await responseGate;
      return json({ error: 'Review this sale' }, 500);
    });
    const checkout = PosApi.placeOrder(saleFixture('in-flight'), true);
    await transportStarted;
    const syncing = PosApi.syncOfflineQueue();
    await replaySnapshot;
    await Promise.resolve();
    release();
    expect((await checkout).state).toBe('rejected');
    await syncing;
    expect(posts).toBe(1);
    expect(await pending()).toEqual([]);
  });

  it.each([400, 409, 500])('HTTP %s is rejected without deducting stock or leaving a pending sale', async status => {
    vi.stubGlobal('fetch', async () => json({ error: 'Review the sale' }, status));
    expect(await PosApi.placeOrder(saleFixture(`rejected-${status}`), true)).toMatchObject({ state: 'rejected', success: false, error: 'Review the sale' });
    expect(await pending()).toEqual([]);
    expect(PosStorage.getOrders()).toEqual([]);
    expect(PosStorage.getProducts()[0].stockQuantity).toBe(999);
  });

  it('an unexpected 200 does not mark an order saved', async () => {
    vi.stubGlobal('fetch', async () => json({ success: true }));
    expect(await PosApi.placeOrder(saleFixture('wrong-response'), true)).toMatchObject({ state: 'rejected', success: false });
  });

  it('network failure survives cache clearing, logout and bootstrap and replays with the original key', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('Network unreachable'); });
    const order = saleFixture('offline');
    expect(await PosApi.placeOrder(order, true)).toMatchObject({ state: 'pending', success: false });
    PosStorage.setOrders([]); PosStorage.clearSession(); PosStorage.clearOfflineQueue();
    expect((await pending())[0]).toMatchObject({ idempotencyKey: 'key-offline', persistenceState: 'pending' });
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url === '/api/data') return json(bootstrap());
      if (url.startsWith('/api/orders/pending-status')) return json({ savedOrders: [], pendingKeys: ['key-offline'] });
      const payload = JSON.parse(init!.body as string);
      expect(payload.idempotencyKey).toBe('key-offline');
      return json({ order: { ...payload, synced: true } }, 201);
    });
    expect((await PosApi.fetchInitialData()).orders).toMatchObject([{ id: order.id, persistenceState: 'pending' }]);
    expect(await PosApi.syncOfflineQueue()).toMatchObject({ syncedCount: 1, pendingCount: 0 });
    expect(await pending()).toEqual([]);
    expect(PosStorage.getOrders()).toMatchObject([{ id: order.id, persistenceState: 'saved' }]);
  });

  it('lost acknowledgment is reconciled with saved server history rather than duplicated', async () => {
    const order = saleFixture('lost-ack');
    vi.stubGlobal('fetch', async () => { throw new TypeError('Response lost'); });
    await PosApi.placeOrder(order, true);
    vi.stubGlobal('fetch', async (url: string) => url === '/api/data'
      ? json(bootstrap([{ ...order, synced: true }]))
      : url.startsWith('/api/orders/pending-status')
      ? json({ savedOrders: [{ ...order, synced: true }], pendingKeys: [] })
      : json({ order: { ...order, synced: true } }, 201));
    const data = await PosApi.fetchInitialData();
    expect(data.orders).toHaveLength(1);
    expect(data.orders[0]).toMatchObject({ persistenceState: 'pending' });
    expect(await pending()).toHaveLength(1);
    await PosApi.syncOfflineQueue();
    expect(PosStorage.getOrders()[0]).toMatchObject({ persistenceState: 'saved' });
    expect(await pending()).toEqual([]);
  });

  it('timeout preserves the staged order for replay', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let started!: () => void;
    const transportStarted = new Promise<void>(resolve => { started = resolve; });
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      started();
      init.signal!.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')));
    }));
    const resultPromise = PosApi.placeOrder(saleFixture('timeout'), true);
    // IndexedDB uses scheduled tasks; advance until transport reaches its abort deadline.
    await transportStarted;
    await vi.advanceTimersByTimeAsync(10000);
    const result = await resultPromise;
    expect(result).toMatchObject({ state: 'pending' });
    expect((await pending())[0].id).toBe('sale-timeout');
    vi.useRealTimers();
  });

  it('a timeout while reading a 201 body retains the same recovery copy', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let started!: () => void;
    const reading = new Promise<void>(resolve => { started = resolve; });
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => ({
      status: 201,
      json: () => new Promise((_resolve, reject) => {
        started();
        init.signal!.addEventListener('abort', () => reject(new DOMException('Body timed out', 'AbortError')));
      }),
    }));
    const result = PosApi.placeOrder(saleFixture('body-timeout'), true);
    await reading;
    await vi.advanceTimersByTimeAsync(10000);
    expect(await result).toMatchObject({ state: 'pending' });
    expect((await pending())[0].idempotencyKey).toBe('key-body-timeout');
  });
  it('bootstrap body timeout falls back to the durable pending sale instead of blocking recovery', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('Offline'); });
    await PosApi.placeOrder(saleFixture('bootstrap-timeout'), true);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let reading!: () => void;
    const bodyStarted = new Promise<void>(resolve => { reading = resolve; });
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => ({ ok: true,
      json: () => new Promise((_resolve, reject) => {
        reading(); init.signal!.addEventListener('abort', () => reject(new DOMException('Timeout', 'AbortError')));
      }),
    }));
    const controllerAbort = vi.spyOn(AbortController.prototype, 'abort');
    const loading = PosApi.fetchInitialData();
    await bodyStarted;
    await vi.advanceTimersByTimeAsync(3000);
    expect(controllerAbort).toHaveBeenCalled();
    expect((await loading).orders).toMatchObject([{ id: 'sale-bootstrap-timeout', persistenceState: 'pending' }]);
  });

  it('a 201 acknowledgment for another key cannot complete this sale', async () => {
    vi.stubGlobal('fetch', async () => json({ order: saleFixture('other-sale') }, 201));
    expect(await PosApi.placeOrder(saleFixture('expected-sale'), true)).toMatchObject({ state: 'rejected' });
    expect(PosStorage.getOrders()).toEqual([]);
  });

  it('checks the local server even when browser internet connectivity says offline', async () => {
    const order = saleFixture('local-server');
    vi.stubGlobal('fetch', async () => json({ order }, 201));
    expect(await PosApi.placeOrder(order, false)).toMatchObject({ state: 'saved' });
  });

  it('refuses transport when a durable recovery copy cannot be written', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const transport = vi.fn(); vi.stubGlobal('fetch', transport);
    expect(await PosApi.placeOrder(saleFixture('storage-failure'), true)).toMatchObject({ state: 'rejected' });
    expect(transport).not.toHaveBeenCalled();
    expect(PosStorage.getOrders()).toEqual([]);
  });

  it('migrates legacy queued sales before removing their old recovery copy', async () => {
    const order = saleFixture('legacy');
    const { idempotencyKey: _key, ...legacyOrder } = order;
    PosStorage.addToOfflineQueue(legacyOrder);
    vi.stubGlobal('fetch', async () => json(bootstrap()));
    const data = await PosApi.fetchInitialData();
    expect(data.orders).toMatchObject([{ id: order.id, idempotencyKey: order.id, persistenceState: 'pending' }]);
    expect(PosStorage.getOfflineQueue()).toEqual([]);
    expect((await pending())[0].id).toBe(order.id);
  });

  it('a bootstrap response started before a sale cannot erase its later 201 acknowledgment', async () => {
    const order = saleFixture('bootstrap-race');
    let deliver!: (response: Response) => void;
    vi.stubGlobal('fetch', async (url: string) => url === '/api/data'
      ? new Promise<Response>(resolve => { deliver = resolve; })
      : json({ order: { ...order, synced: true } }, 201));
    const loading = PosApi.fetchInitialData();
    expect((await PosApi.placeOrder(order, true)).state).toBe('saved');
    deliver(json(bootstrap()));
    expect((await loading).orders).toMatchObject([{ id: order.id, persistenceState: 'saved' }]);
    expect(PosStorage.getOrders()).toHaveLength(1);
  });
  it('a pending bootstrap snapshot cannot overwrite a 201 received while the snapshot is loading', async () => {
    const order = saleFixture('snapshot-race');
    vi.stubGlobal('fetch', async () => { throw new TypeError('Offline'); });
    await PosApi.placeOrder(order, true);
    let snapshotRead!: () => void;
    const snapshot = new Promise<void>(resolve => { snapshotRead = resolve; });
    let release!: () => void;
    const continueBootstrap = new Promise<void>(resolve => { release = resolve; });
    const rejected = vi.spyOn(PendingOutbox, 'rejected').mockImplementationOnce(async () => {
      snapshotRead(); await continueBootstrap; return [];
    });
    vi.stubGlobal('fetch', async (url: string) => url === '/api/data' ? json(bootstrap()) : json({ order }, 201));
    const loading = PosApi.fetchInitialData();
    await snapshot;
    expect((await PosApi.placeOrder(order, true)).state).toBe('saved');
    release();
    expect((await loading).orders).toMatchObject([{ id: order.id, persistenceState: 'saved' }]);
    rejected.mockRestore();
    vi.stubGlobal('fetch', async () => { throw new TypeError('Offline'); });
    expect((await PosApi.fetchInitialData()).orders).toMatchObject([{ id: order.id, persistenceState: 'saved' }]);
  });

  it('a replay rejection survives a full browser cache and remains reviewable after cache clearing', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('Offline'); });
    await PosApi.placeOrder(saleFixture('quota-rejection'), true);
    vi.stubGlobal('fetch', async (url: string) => url.startsWith('/api/orders/pending-status')
      ? json({ savedOrders: [], pendingKeys: ['key-quota-rejection'] })
      : json({ error: 'Review number conflict' }, 409));
    const quota = vi.spyOn(PosStorage, 'setOrders').mockImplementation(() => { throw new DOMException('Cache full', 'QuotaExceededError'); });
    expect(await PosApi.syncOfflineQueue()).toMatchObject({ pendingCount: 0 });
    quota.mockRestore();
    PosStorage.setOrders([]);
    vi.stubGlobal('fetch', async () => json(bootstrap()));
    expect((await PosApi.fetchInitialData()).orders).toMatchObject([{ id: 'sale-quota-rejection', persistenceState: 'rejected', rejectionReason: 'Review number conflict' }]);
    expect(await pending()).toEqual([]);
  });

  it('a replay rejection remains visible for review and leaves other pending orders recoverable', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('Offline'); });
    await PosApi.placeOrder(saleFixture('declined'), true);
    await PosApi.placeOrder(saleFixture('still-pending'), true);
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/orders/pending-status')) return json({ savedOrders: [], pendingKeys: ['key-declined', 'key-still-pending'] });
      if (JSON.parse(init!.body as string).id === 'sale-declined') return json({ error: 'Number conflict' }, 409);
      throw new TypeError('Server stopped again');
    });
    expect(await PosApi.syncOfflineQueue()).toMatchObject({ pendingCount: 1 });
    expect(PosStorage.getOrders().find(order => order.id === 'sale-declined')).toMatchObject({ persistenceState: 'rejected', rejectionReason: 'Number conflict' });
    expect((await pending()).map(order => order.id)).toEqual(['sale-still-pending']);
  });
});
