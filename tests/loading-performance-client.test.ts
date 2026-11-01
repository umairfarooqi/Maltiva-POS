import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkoutData } from '../src/services/clientPrivacy';
import { PosApi, mergeRecoveryState } from '../src/services/api';
import { PosStorage } from '../src/services/storage';
import { PendingOutbox } from '../src/services/pendingOutbox';
import { INITIAL_CATEGORIES, INITIAL_PRODUCTS, INITIAL_PRINTER_SETTINGS, INITIAL_USERS } from '../src/data/initialData';
import { saleFixture } from './helpers/sale-fixtures';
const catalog = { historyIncluded: false, categories: INITIAL_CATEGORIES, products: INITIAL_PRODUCTS, printerSettings: INITIAL_PRINTER_SETTINGS, orders: [], users: [], inventoryLogs: [] };
beforeEach(async () => {
  localStorage.clear(); PosStorage.setToken('load-token');
  await new Promise<void>(resolve => { const request = indexedDB.deleteDatabase('maltiva-pos-pending-sales'); request.onsuccess = () => resolve(); });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('catalog refresh safety', () => {
  it('refreshes menu and stock without replacing sales, staff, logs or recovery copies with empty arrays', async () => {
    const saved = { ...saleFixture('keep'), persistenceState: 'saved' as const };
    PosStorage.setOrders([saved]); PosStorage.setUsers(INITIAL_USERS);
    const writes = vi.spyOn(PosStorage, 'setOrders');
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog))); vi.stubGlobal('fetch', fetcher);
    const result = await PosApi.fetchCatalog();
    expect(result.products).toHaveLength(INITIAL_PRODUCTS.length);
    expect(PosStorage.getOrders()).toMatchObject([{ id: saved.id }]); expect(PosStorage.getUsers()).toEqual(checkoutData(INITIAL_USERS));
    expect(writes).not.toHaveBeenCalled(); expect(fetcher.mock.calls[0][0]).toBe('/api/data?scope=catalog');
  });
  it('rejects unexpected scope responses rather than clearing the cache', async () => {
    PosStorage.setProducts(INITIAL_PRODUCTS);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...catalog, historyIncluded: true }))));
    await expect(PosApi.fetchCatalog()).rejects.toThrow('could not be refreshed');
    expect(PosStorage.getProducts()).toHaveLength(INITIAL_PRODUCTS.length);
  });
  it('does not cache a delayed catalog body from a previous session', async () => {
    let resolve!: (value: any) => void;
    const response = new Response('{}'); vi.spyOn(response, 'json').mockReturnValue(new Promise(done => { resolve = done; }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const write = vi.spyOn(PosStorage, 'setProducts'), pending = PosApi.fetchCatalog();
    await vi.waitFor(() => expect(response.json).toHaveBeenCalled());
    PosStorage.setToken('new-token'); resolve(catalog);
    await expect(pending).rejects.toThrow('session changed'); expect(write).not.toHaveBeenCalled();
  });
  it('reconciles durable acknowledgments without a history download when the optional cache is full', async () => {
    const order = saleFixture('durable-ack'); PosStorage.setOrders([{ ...order, persistenceState: 'pending' }]);
    await PendingOutbox.acknowledge({ ...order, orderNumber: '#SERVER-ACK', tokenNumber: 42, persistenceState: 'saved', synced: true });
    vi.spyOn(PosStorage, 'setOrders').mockImplementation(() => { throw new DOMException('Cache full', 'QuotaExceededError'); });
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    for (let retry = 0; retry < 2; retry++) expect(await PosApi.loadRecoveryOrders()).toMatchObject([{ orderNumber: '#SERVER-ACK', tokenNumber: 42, persistenceState: 'saved' }]);
    const serverOnly = { ...saleFixture('server-only'), persistenceState: 'saved' as const };
    const combined = mergeRecoveryState([serverOnly], await PosApi.loadRecoveryOrders());
    expect(combined.map(order => order.id)).toEqual(expect.arrayContaining([serverOnly.id, order.id]));
    expect(mergeRecoveryState([serverOnly], [{ ...serverOnly, totalPaisa: 1 }])[0].totalPaisa).toBe(serverOnly.totalPaisa);
    expect(fetcher).not.toHaveBeenCalled(); expect(await PendingOutbox.acknowledged()).toHaveLength(1);
    expect(PosStorage.setOrders).not.toHaveBeenCalled();
  });
  it('does not treat a catalog-only response as complete report history', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog))));
    expect((await PosApi.fetchInitialData()).isOnline).toBe(false);
  });
});


describe('request ownership regressions', () => {
  const full = { ...catalog, historyIncluded: true, users: INITIAL_USERS, orders: [saleFixture('old-admin')] };
  for (const offline of [false, true]) {
    for (const stage of ['list', 'rejected', 'acknowledged'] as const) {
      it(`abandons ${offline ? 'offline fallback' : 'online bootstrap'} when the session changes during ${stage}`, async () => {
        vi.spyOn(PendingOutbox, 'list').mockResolvedValue([]);
        vi.spyOn(PendingOutbox, 'rejected').mockResolvedValue([]);
        vi.spyOn(PendingOutbox, 'acknowledged').mockResolvedValue([]);
        let resume!: (value: any[]) => void;
        const paused = vi.spyOn(PendingOutbox, stage).mockReturnValue(new Promise(resolve => { resume = resolve; }));
        vi.stubGlobal('fetch', offline ? vi.fn().mockRejectedValue(new TypeError('offline')) : vi.fn().mockResolvedValue(new Response(JSON.stringify(full))));
        const request = PosApi.fetchInitialData();
        const rejected = expect(request).rejects.toMatchObject({ name: 'SessionChangedError' });
        await vi.waitFor(() => expect(paused).toHaveBeenCalled());
        localStorage.clear(); PosStorage.setToken('new-cashier');
        PosStorage.setProducts([{ ...INITIAL_PRODUCTS[0], stockQuantity: 7 }]);
        PosStorage.setUsers([]); PosStorage.setOrders([]);
        const snapshot = { ...localStorage };
        resume([]); await rejected;
        expect({ ...localStorage }).toEqual(snapshot);
      });
    }
  }
  it('does not enter fallback when recovery throws after account switching', async () => {
    let fail!: (error: Error) => void;
    const list = vi.spyOn(PendingOutbox, 'list').mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(full))));
    const request = PosApi.fetchInitialData();
    const rejected = expect(request).rejects.toMatchObject({ name: 'SessionChangedError' });
    await vi.waitFor(() => expect(list).toHaveBeenCalled());
    localStorage.clear(); PosStorage.setToken('new-cashier');
    const snapshot = { ...localStorage };
    fail(new Error('recovery unavailable')); await rejected;
    expect(list).toHaveBeenCalledTimes(1); expect({ ...localStorage }).toEqual(snapshot);
  });
  it('keeps the new session untouched when the old network request fails', async () => {
    let fail!: (error: Error) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((_, reject) => { fail = reject; })));
    const list = vi.spyOn(PendingOutbox, 'list');
    const request = PosApi.fetchInitialData();
    const rejected = expect(request).rejects.toMatchObject({ name: 'SessionChangedError' });
    localStorage.clear(); PosStorage.setToken('new-cashier');
    const snapshot = { ...localStorage };
    fail(new TypeError('offline')); await rejected;
    expect(list).not.toHaveBeenCalled(); expect({ ...localStorage }).toEqual(snapshot);
  });
  it('keeps newest catalog stock when responses finish out of order', async () => {
    const responses: Array<(value: Response) => void> = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(resolve => responses.push(resolve))));
    const body = (stockQuantity: number) => new Response(JSON.stringify({ ...catalog, products: [{ ...INITIAL_PRODUCTS[0], stockQuantity }] }));
    const older = PosApi.fetchCatalog();
    const superseded = expect(older).rejects.toMatchObject({ name: 'SupersededRequestError' });
    const newer = PosApi.fetchCatalog();
    responses[1](body(7)); expect((await newer).products[0].stockQuantity).toBe(7);
    responses[0](body(8)); await superseded;
    expect(PosStorage.getProducts()[0].stockQuantity).toBe(7);
  });
  it('checks caller ownership before catalog cache or UI can commit', async () => {
    let current = true, resume!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(resolve => { resume = resolve; })));
    const request = PosApi.fetchCatalog(() => current);
    const rejected = expect(request).rejects.toMatchObject({ name: 'SupersededRequestError' });
    const write = vi.spyOn(PosStorage, 'setProducts');
    current = false; resume(new Response(JSON.stringify(catalog))); await rejected;
    expect(write).not.toHaveBeenCalled();
  });
});

for (const offline of [false, true]) it(`keeps newest catalog through old full bootstrap ${offline ? 'fallback' : 'success'} after newer catalog commits`, async () => {
  let resume!: (rows: any[]) => void;
  const list = vi.spyOn(PendingOutbox, 'list').mockReturnValueOnce(new Promise(done => { resume = done; }));
  vi.spyOn(PendingOutbox, 'rejected').mockResolvedValue([]);
  vi.spyOn(PendingOutbox, 'acknowledged').mockResolvedValue([]);
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('scope=catalog')) return Promise.resolve(new Response(JSON.stringify({ ...catalog, products: [{ ...INITIAL_PRODUCTS[0], stockQuantity: 7 }] })));
    if (offline) return Promise.reject(new TypeError('offline'));
    return Promise.resolve(new Response(JSON.stringify({ ...catalog, historyIncluded: true, products: [{ ...INITIAL_PRODUCTS[0], stockQuantity: 8 }] })));
  }));
  const old = PosApi.fetchInitialData();
  await vi.waitFor(() => expect(list).toHaveBeenCalled());
  await PosApi.fetchCatalog(); resume([]); expect((await old).products[0].stockQuantity).toBe(7);
  expect(PosStorage.getProducts()[0].stockQuantity).toBe(7);
});
it('keeps a zero-price product in catalog, bootstrap and durable cache', async () => {
  const products = [{ ...INITIAL_PRODUCTS[0], pricePaisa: 0 }];
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify({ ...catalog, products, historyIncluded: url.includes('scope=catalog') ? false : true })))));
  expect((await PosApi.fetchCatalog()).products[0].pricePaisa).toBe(0);
  expect((await PosApi.fetchInitialData()).products[0].pricePaisa).toBe(0);
  expect(PosStorage.getProducts()[0].pricePaisa).toBe(0);
  expect(JSON.parse(localStorage.getItem('tasty_pos_products')!)[0].pricePaisa).toBe(0);
});
it('a successful stock adjustment invalidates an already-running catalog response', async () => {
  let resume!: (res: Response) => void;
  const product = { ...INITIAL_PRODUCTS[0], stockQuantity: 7 };
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => url.includes('scope=catalog') ? new Promise(done => { resume = done; }) : Promise.resolve(new Response(JSON.stringify({ product, log: { id: 'log-new' } })))));
  PosStorage.setProducts(INITIAL_PRODUCTS);
  const old = PosApi.fetchCatalog(); const rejected = expect(old).rejects.toMatchObject({ name: 'SupersededRequestError' });
  await PosApi.adjustStock(product.id, 1, 'Restock', 'restock', INITIAL_USERS[0], true);
  resume(new Response(JSON.stringify({ ...catalog, products: [{ ...product, stockQuantity: 6 }] }))); await rejected;
  expect(PosStorage.getProducts()[0].stockQuantity).toBe(7);
});
