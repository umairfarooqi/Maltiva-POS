import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PosStorage } from '../src/services/storage';
import { PendingOutbox } from '../src/services/pendingOutbox';
import { upgradeMoney } from '../src/shared/moneyUpgrade';
import { PosApi } from '../src/services/api';
const legacy = { id: 'legacy', idempotencyKey: 'original-key', orderNumber: '#OLD', createdAt: '2026-10-04T10:00:00Z',
  subtotal: 333, tax: 33.3, total: 366.3, discount: 0, totalCost: 200, profit: 166.3, cashTendered: 400,
  persistenceState: 'pending', items: [{ id: 'i', productId: 'p', unitPrice: 333, unitCost: 200, quantity: 1,
    totalPrice: 333, totalCost: 200, selectedVariations: [{ groupId: 'g', optionId: 'o', priceDelta: 0.25, costDelta: 0 }] }] };
async function rawStore(write?: any): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('maltiva-pos-pending-sales', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('orders', { keyPath: 'idempotencyKey' });
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction('orders', write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('orders'); if (write) store.put(write);
      const rows = store.getAll();
      tx.oncomplete = () => { db.close(); resolve(rows.result); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}
beforeEach(async () => {
  localStorage.clear();
  await new Promise<void>(resolve => { const request = indexedDB.deleteDatabase('maltiva-pos-pending-sales'); request.onsuccess = () => resolve(); });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('browser money migration', () => {
  it('only replaces menu prices after the server confirms persistence', async () => {
    const product = PosStorage.getProducts()[0]; const changed = { ...product, pricePaisa: 33330 };
    PosStorage.setProducts([product]);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ error: 'Save failed' }), { status: 500 })));
    await expect(PosApi.updateProduct(changed, true)).rejects.toThrow('Save failed');
    expect(PosStorage.getProducts()[0].pricePaisa).toBe(product.pricePaisa);
    await expect(PosApi.createProduct({ ...changed, id: 'new-menu' }, true)).rejects.toThrow('Save failed');
    expect(PosStorage.getProducts()).toHaveLength(1);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...changed, moneySchemaVersion: 2 }), { status: 200 })));
    expect((await PosApi.updateProduct(changed, false)).pricePaisa).toBe(33330);
    expect(PosStorage.getProducts()[0].pricePaisa).toBe(33330);
  });
  it('preserves keys and converts outbox rows once before replay', async () => {
    await rawStore(legacy);
    expect((await PendingOutbox.list())[0]).toMatchObject({ idempotencyKey: 'original-key', totalPaisa: 36630, profitPaisa: 13300, moneySchemaVersion: 2 });
    expect((await PendingOutbox.list())[0].totalPaisa).toBe(36630);
    expect((await rawStore())[0].items[0].selectedVariations[0].priceDeltaPaisa).toBe(25);
  });
  it('a failed replacement leaves the original recovery row intact', async () => {
    await rawStore(legacy);
    const write = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new Error('Storage failed'); });
    await expect(PendingOutbox.list()).rejects.toThrow('Storage failed'); write.mockRestore();
    expect((await rawStore())[0].total).toBe(366.3);
    expect((await PendingOutbox.list())[0].totalPaisa).toBe(36630);
  });
  it('converts legacy history, settings and catalog reads without discarding old copies', () => {
    localStorage.setItem('tasty_pos_orders', JSON.stringify([legacy]));
    localStorage.setItem('tasty_pos_printer', JSON.stringify({ taxRatePercent: 10 }));
    localStorage.setItem('tasty_pos_products', JSON.stringify([{ id: 'p', name: 'Dish', price: 333, costPrice: 0 }]));
    expect(PosStorage.getOrders()[0].totalPaisa).toBe(36630);
    expect(PosStorage.getPrinterSettings().taxBp).toBe(1000);
    expect(PosStorage.getProducts()[0]).toMatchObject({ pricePaisa: 33300, costPricePaisa: 0 });
    expect(JSON.parse(localStorage.getItem('tasty_pos_orders')!)[0].total).toBe(366.3);
    expect(upgradeMoney(upgradeMoney(legacy))).toEqual(upgradeMoney(legacy));
  });
});
