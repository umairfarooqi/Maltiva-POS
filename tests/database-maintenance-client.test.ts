import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PosStorage } from '../src/services/storage';
import { PendingOutbox } from '../src/services/pendingOutbox';
import { sessionFetch } from '../src/services/session';
import { PosApi } from '../src/services/api';
import { MaintenanceApi, requireClearRecovery } from '../src/services/maintenanceApi';
import { saleFixture } from './helpers/sale-fixtures';

beforeEach(async () => {
  localStorage.clear();
  await new Promise<void>(resolve => { const request = indexedDB.deleteDatabase('maltiva-pos-pending-sales'); request.onsuccess = () => resolve(); });
  PosStorage.setToken('active-token');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const response = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: {
  'X-POS-Database-Generation': 'restored-generation', 'X-POS-Database-Restored': 'true',
} });
describe('browser recovery after database restore', () => {
  it('clears disposable cache and locks the session while retaining pending sales, draft and durable acknowledgments', async () => {
    PosStorage.observeDatabaseGeneration('old-generation', false);
    const order = { ...saleFixture('old'), databaseGeneration: 'old-generation' };
    await PendingOutbox.put(order);
    await PendingOutbox.acknowledge({ ...saleFixture('ack'), persistenceState: 'saved', databaseGeneration: 'old-generation' });
    PosStorage.setOrders([{ ...order, persistenceState: 'saved' }]);
    PosStorage.setDraft({ cart: [], paymentMethod: 'cash', attempt: order });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({})));
    await expect(sessionFetch('/api/data', { headers: { Authorization: 'Bearer active-token' } })).rejects.toThrow('Database changed');
    expect(PosStorage.getOrders()).toEqual([]); expect(PosStorage.getToken()).toBeNull();
    expect(PosStorage.getDraft()?.attempt?.id).toBe(order.id);
    expect(await PendingOutbox.list()).toHaveLength(1); expect(await PendingOutbox.acknowledged()).toHaveLength(1);
    PosStorage.setToken('new-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ orders: [], products: [], users: [], categories: [], printerSettings: {} })));
    const data = await PosApi.fetchInitialData();
    expect(data.orders.map(order => order.id)).toEqual([order.id]); // old acknowledged sale must not reappear as saved
  });
  it('keeps old-generation replay blocked and durable rather than rejecting or deleting it', async () => {
    PosStorage.observeDatabaseGeneration('restored-generation', true);
    const order = await PendingOutbox.put({ ...saleFixture('retained'), databaseGeneration: 'old-generation' });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith('/api/orders/pending-status')
      ? response({ savedOrders: [] }) : response({ code: 'DATABASE_CHANGED', error: 'Database restored. Ask an administrator to reconcile this sale.' }, 409)));
    await PosApi.syncOfflineQueue();
    expect(await PendingOutbox.list()).toMatchObject([{ idempotencyKey: order.idempotencyKey, persistenceState: 'pending', recoveryBlockedReason: expect.stringContaining('administrator') }]);
    expect(await PendingOutbox.rejected()).toEqual([]);
  });
  it('blocks restore with pending, rejected or draft recovery without sending a request', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const order = saleFixture('local'); await PendingOutbox.put(order);
    await expect(requireClearRecovery()).rejects.toThrow('pending, rejected and draft');
    await PendingOutbox.reject(order, 'Needs review');
    await expect(requireClearRecovery()).rejects.toThrow('pending, rejected and draft');
    await PendingOutbox.remove(order.idempotencyKey);
    PosStorage.setDraft({ cart: [], paymentMethod: 'cash', attempt: order });
    await expect(requireClearRecovery()).rejects.toThrow('pending, rejected and draft');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('handles successful restore without treating session revocation as a failed restore', async () => {
    PosStorage.observeDatabaseGeneration('old-generation', false); PosStorage.setOrders([saleFixture('cache')]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ success: true, databaseGeneration: 'restored-generation', safetyFilename: 'safety.db' })));
    const result = await MaintenanceApi.restore({ token: 'preview' } as any, 'password', 'RESTORE');
    expect(result.success).toBe(true); expect(PosStorage.getToken()).toBeNull(); expect(PosStorage.getOrders()).toEqual([]);
  });
});
