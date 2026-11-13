import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { INITIAL_CATEGORIES, INITIAL_PRINTER_SETTINGS, INITIAL_PRODUCTS, INITIAL_USERS } from '../src/data/initialData';
import { PendingOutbox } from '../src/services/pendingOutbox';
import { PosStorage } from '../src/services/storage';
import { saleFixture } from './helpers/sale-fixtures';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(async () => {
  localStorage.clear();
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase('maltiva-pos-pending-sales');
    req.onsuccess = () => resolve();
  });
  PosStorage.setSession(INITIAL_USERS[0]);
  PosStorage.setOrders([]);
  PosStorage.setProducts(structuredClone(INITIAL_PRODUCTS));
  PosStorage.setToken('discard-test-session');
  vi.stubGlobal('fetch', async (url: string) => {
    if (url === '/api/auth/session') return json({ user: INITIAL_USERS[0], expiresAt: Date.now() + 3600000 });
    if (url === '/api/auth/staff') return json(INITIAL_USERS.map(({ id, name, username, avatar }) => ({ id, name, username, avatar })));
    if (url === '/api/data') {
      return json({
        categories: INITIAL_CATEGORIES,
        products: INITIAL_PRODUCTS,
        orders: [],
        tables: [],
        users: INITIAL_USERS,
        printerSettings: INITIAL_PRINTER_SETTINGS,
        inventoryLogs: [],
      });
    }
    if (url === '/api/data?scope=catalog') {
      return json({
        categories: INITIAL_CATEGORIES,
        products: INITIAL_PRODUCTS,
        printerSettings: INITIAL_PRINTER_SETTINGS,
        historyIncluded: false,
      });
    }
    if (url.startsWith('/api/orders/pending-status')) return json({ savedOrders: [], pendingKeys: [] });
    throw new Error(`Unexpected URL ${url}`);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('discarding rejected orders', () => {
  it('discards individual rejected orders and clears all rejected orders from PendingOutbox', async () => {
    const user = userEvent.setup();
    const r1 = { ...saleFixture('40'), orderNumber: '#F0040' };
    const r2 = { ...saleFixture('41'), orderNumber: '#F0041' };
    const r3 = { ...saleFixture('42'), orderNumber: '#F0042' };
    await PendingOutbox.reject(r1, 'Product is unavailable');
    await PendingOutbox.reject(r2, 'Product is unavailable');
    await PendingOutbox.reject(r3, 'Prices need review');

    render(<App />);

    await screen.findByText(/Rejected #F0040: Product is unavailable/, {}, { timeout: 4000 });
    expect(screen.getByText('3 rejected orders')).toBeVisible();

    const discardButtons = screen.getAllByRole('button', { name: 'Discard' });
    expect(discardButtons).toHaveLength(3);
    await user.click(discardButtons[0]);

    await waitFor(() => expect(screen.queryByText(/Rejected #F0040/)).not.toBeInTheDocument());
    expect(screen.getByText('2 rejected orders')).toBeVisible();
    expect(await PendingOutbox.rejected()).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Clear all rejected' }));

    await waitFor(() => expect(screen.queryByText(/Rejected #F0041/)).not.toBeInTheDocument());
    expect(screen.queryByText(/Rejected #F0042/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear all rejected' })).not.toBeInTheDocument();
    expect(await PendingOutbox.rejected()).toHaveLength(0);
  });
});
