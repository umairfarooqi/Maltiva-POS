import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptsApi } from '../src/services/receiptsApi';
import { PosStorage } from '../src/services/storage';
import { saleFixture } from './helpers/sale-fixtures';
beforeEach(() => { localStorage.clear(); PosStorage.setToken('receipt-token'); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('receipt read requests', () => {
  it('only sends authenticated GET requests with encoded filters and an abort signal', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ receipts: [], nextCursor: null }))); vi.stubGlobal('fetch', fetcher);
    await ReceiptsApi.search({ reference: '#F001 & second' }, null, new AbortController().signal);
    const [url, init] = fetcher.mock.calls[0];
    expect(new URL(url, 'http://localhost').searchParams.get('reference')).toBe('#F001 & second');
    expect(init.headers.Authorization).toBe('Bearer receipt-token'); expect(init.method).toBeUndefined(); expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it('rejects a delayed body if the cashier session changed while it was being read', async () => {
    let resolve!: (body: any) => void;
    const response = new Response('{}'); vi.spyOn(response, 'json').mockReturnValue(new Promise(done => { resolve = done; }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const promise = ReceiptsApi.get('old-sale', new AbortController().signal);
    await vi.waitFor(() => expect(response.json).toHaveBeenCalled());
    PosStorage.setToken('another-token'); resolve({ ...saleFixture('old'), id: 'old-sale', persistenceState: 'saved' });
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('rejects an unconfirmed detail or another receipt ID', async () => {
    for (const order of [{ ...saleFixture('other'), persistenceState: 'saved' }, { ...saleFixture('requested'), persistenceState: 'pending' }]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(order))));
      await expect(ReceiptsApi.get('sale-requested', new AbortController().signal)).rejects.toThrow('confirm this saved receipt');
    }
  });
});
