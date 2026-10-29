import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { PosApi } from '../src/services/api';
import { PosStorage } from '../src/services/storage';
import { PendingOutbox } from '../src/services/pendingOutbox';
import { endSession } from '../src/services/session';
import { INITIAL_USERS, INITIAL_PRODUCTS, INITIAL_CATEGORIES, INITIAL_PRINTER_SETTINGS } from '../src/data/initialData';

const admin = INITIAL_USERS[0], cashier = INITIAL_USERS[1];
const bootstrap = { categories: INITIAL_CATEGORIES, products: INITIAL_PRODUCTS, orders: [], tables: [], users: [],
  printerSettings: INITIAL_PRINTER_SETTINGS, inventoryLogs: [], isOnline: true };
beforeEach(() => {
  localStorage.clear(); PosStorage.setToken('ui-session'); PosStorage.setSession(admin);
  vi.spyOn(PosApi, 'fetchLoginStaff').mockResolvedValue([]);
  vi.spyOn(PosApi, 'fetchInitialData').mockResolvedValue(bootstrap);
  vi.spyOn(PosApi, 'getSession').mockResolvedValue({ user: admin, expiresAt: Date.now() + 3600000 });
  vi.spyOn(PosApi, 'syncOfflineQueue').mockResolvedValue({ syncedCount: 0, rejectedCount: 0, pendingCount: 0, reachable: true });
  vi.spyOn(PendingOutbox, 'list').mockResolvedValue([]);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function draft() {
  const product = INITIAL_PRODUCTS[0];
  const value = { cart: [{ cartItemId: 'retained-line', product, quantity: 1, selectedVariations: [], notes: 'No onion',
    unitPricePaisa: product.pricePaisa, unitCostPaisa: product.costPricePaisa,
    totalPricePaisa: product.pricePaisa, totalCostPaisa: product.costPricePaisa }], paymentMethod: 'cash' as const };
  PosStorage.setDraft(value); return value;
}

describe('verified session gateway', () => {
  it('waits for the server and uses its role instead of cached administrator details', async () => {
    let finish!: (session: { user: typeof cashier; expiresAt: number }) => void;
    vi.mocked(PosApi.getSession).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking session');
    expect(PosApi.fetchInitialData).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Daily Sales' })).not.toBeInTheDocument();
    await act(async () => finish({ user: cashier, expiresAt: Date.now() + 3600000 }));
    await waitFor(() => expect(PosApi.fetchInitialData).toHaveBeenCalledOnce());
    expect(screen.queryByRole('button', { name: 'Daily Sales' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Terminal Login' })).not.toBeInTheDocument();
  });

  it('blocks cached access when the server is unavailable and supports retry', async () => {
    vi.mocked(PosApi.getSession).mockRejectedValue(new TypeError('Server stopped'));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Terminal Login' })).toBeVisible();
    expect(screen.getByText(/Cannot check your session/)).toBeVisible();
    expect(PosApi.fetchInitialData).not.toHaveBeenCalled();
    vi.mocked(PosApi.getSession).mockResolvedValue({ user: admin, expiresAt: Date.now() + 3600000 });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry session check' }));
    expect(await screen.findByRole('button', { name: 'Daily Sales' })).toBeVisible();
  });

  it('returns to login on a real session-check 401 without mounting private pages or losing the draft', async () => {
    draft(); const retained = PosStorage.getDraft();
    vi.mocked(PosApi.getSession).mockRestore();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'SESSION_INVALID' }), { status: 401 })));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Terminal Login' })).toBeVisible();
    expect(PosStorage.getToken()).toBeNull();
    expect(PosApi.fetchInitialData).not.toHaveBeenCalled();
    expect(PosStorage.getDraft()).toEqual(retained);
  });

  it('locks immediately on local session expiry without deleting the basket', async () => {
    draft();
    render(<App />);
    await screen.findByRole('button', { name: 'Daily Sales' });
    const retained = PosStorage.getDraft();
    act(() => endSession('ui-session', 'Session expired. Please sign in again.'));
    expect(await screen.findByRole('heading', { name: 'Terminal Login' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Daily Sales' })).not.toBeInTheDocument();
    expect(PosStorage.getDraft()).toEqual(retained);
    expect(JSON.parse(localStorage.getItem('pos_customer_display_state')!).cart).toEqual([]);
  });

  it('locks other windows on logout and verifies a replacement token before reopening', async () => {
    draft(); render(<App />); await screen.findByRole('button', { name: 'Daily Sales' });
    const retained = PosStorage.getDraft();
    localStorage.removeItem('tasty_pos_auth_token');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'tasty_pos_auth_token', oldValue: 'ui-session', newValue: null })));
    expect(await screen.findByRole('heading', { name: 'Terminal Login' })).toBeVisible();
    expect(PosStorage.getDraft()).toEqual(retained);
    vi.mocked(PosApi.getSession).mockResolvedValue({ user: cashier, expiresAt: Date.now() + 3600000 });
    PosStorage.setToken('replacement-token');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'tasty_pos_auth_token', newValue: 'replacement-token' })));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Terminal Login' })).not.toBeInTheDocument());
    await waitFor(() => expect(PosApi.fetchInitialData).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: 'Daily Sales' })).not.toBeInTheDocument();
  });

  it('does not reopen the terminal when a delayed startup check finishes after logout', async () => {
    let finish!: (session: { user: typeof admin; expiresAt: number }) => void;
    vi.mocked(PosApi.getSession).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<App />);
    act(() => endSession('ui-session'));
    await act(async () => finish({ user: admin, expiresAt: Date.now() + 3600000 }));
    expect(await screen.findByRole('heading', { name: 'Terminal Login' })).toBeVisible();
    expect(PosApi.fetchInitialData).not.toHaveBeenCalled();
  });

  it('locks at the validated expiration time even without another API request', async () => {
    vi.useFakeTimers();
    vi.mocked(PosApi.getSession).mockResolvedValue({ user: admin, expiresAt: Date.now() + 1000 });
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('heading', { name: 'Terminal Login' })).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1001); });
    expect(screen.getByRole('heading', { name: 'Terminal Login' })).toBeVisible();
    expect(screen.getByText(/Your session expired/)).toBeVisible();
    expect(PosStorage.getToken()).toBeNull();
  });
});
