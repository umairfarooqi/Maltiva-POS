import 'fake-indexeddb/auto';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { PosStorage } from '../src/services/storage';
import { PendingOutbox } from '../src/services/pendingOutbox';
import { PosApi } from '../src/services/api';
import { INITIAL_PRODUCTS, INITIAL_USERS, INITIAL_PRINTER_SETTINGS, INITIAL_CATEGORIES } from '../src/data/initialData';
import { ThermalReceiptModal } from '../src/components/ThermalReceiptModal';
import { SettingsView } from '../src/components/SettingsView';
import { saleFixture } from './helpers/sale-fixtures';
import { computeTotals } from '../src/shared/money';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let outcome: 'saved' | 'pending' | 'rejected';
let requests: any[];
let committed: any[];
beforeEach(async () => {
  localStorage.clear();
  await new Promise<void>(resolve => { const request = indexedDB.deleteDatabase('maltiva-pos-pending-sales'); request.onsuccess = () => resolve(); });
  outcome = 'saved'; requests = []; committed = [];
  PosStorage.setSession(INITIAL_USERS[0]); PosStorage.setOrders([]); PosStorage.setProducts(structuredClone(INITIAL_PRODUCTS));
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === '/api/orders/quote') {
      if (outcome === 'pending') throw new TypeError('Server stopped');
      const order = JSON.parse(init!.body as string);
      return json({ ...order, moneySchemaVersion: 2, pricingFingerprint: 'reviewed-quote' });
    }
    if (url === '/api/data') return json({ categories: INITIAL_CATEGORIES, products: INITIAL_PRODUCTS, orders: committed, tables: [], users: INITIAL_USERS, printerSettings: INITIAL_PRINTER_SETTINGS, inventoryLogs: [] });
    if (url.startsWith('/api/orders/pending-status')) {
      if (outcome === 'pending') throw new TypeError('Server stopped');
      return json({ savedOrders: [], pendingKeys: [] });
    }
    if (url === '/api/orders') {
      const order = JSON.parse(init!.body as string); requests.push(order);
      if (outcome === 'pending') throw new TypeError('Server stopped');
      if (outcome === 'rejected') return json({ error: 'Please review this sale' }, 500);
      const saved = { ...order, synced: true }; committed.push(saved);
      return json({ order: saved }, 201);
    }
    throw new Error(`Unexpected URL ${url}`);
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function checkout() {
  const user = userEvent.setup(); render(<App />);
  await screen.findByText(INITIAL_PRODUCTS[0].name);
  await user.click(screen.getByText(INITIAL_PRODUCTS[0].name));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Complete Order (Cash)' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Complete Order (Cash)' }));
  return user;
}

describe('phase 1 cashier decisions', () => {
  it('keeps noted copies separate, preserves the edited line ID and sends kitchen notes', async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByText(INITIAL_PRODUCTS[0].name);
    await user.click(screen.getByRole('button', { name: INITIAL_PRODUCTS[0].name }));
    const firstId = PosStorage.getDraft()!.cart[0].cartItemId;
    await user.click(screen.getByRole('button', { name: `Edit ${INITIAL_PRODUCTS[0].name}` }));
    await user.type(screen.getByLabelText('Special Instructions'), 'No onions');
    await user.click(screen.getByRole('button', { name: /Update item/ }));
    await user.click(screen.getByRole('button', { name: INITIAL_PRODUCTS[0].name }));
    expect(PosStorage.getDraft()!.cart).toHaveLength(2);
    expect(PosStorage.getDraft()!.cart[0]).toMatchObject({ cartItemId: firstId, notes: 'No onions', quantity: 1 });
    await user.click(screen.getAllByRole('button', { name: `Remove ${INITIAL_PRODUCTS[0].name}` })[1]);
    await user.click(screen.getByRole('button', { name: 'Complete Order (Cash)' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].items[0].notes).toBe('No onions');
  });

  it('keeps live confirmation after closing a receipt and opening an independent test slip', async () => {
    const user = await checkout();
    await screen.findByRole('button', { name: 'Close receipt preview' }, { timeout: 4000 });
    await waitFor(() => expect(JSON.parse(localStorage.getItem('pos_customer_display_state')!).lastPlacedOrder?.persistenceState).toBe('saved'));
    const confirmation = JSON.parse(localStorage.getItem('pos_customer_display_state')!).lastPlacedOrder;
    await user.click(screen.getByRole('button', { name: 'Close receipt preview' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Print Test Slip' }));
    expect(screen.getByRole('dialog', { name: 'Receipt preview' })).toHaveTextContent('TEST SLIP - NOT A SALE');
    expect(screen.getByRole('dialog', { name: 'Receipt preview' })).toHaveTextContent('Sample item - TEST ONLY');
    expect(JSON.parse(localStorage.getItem('pos_customer_display_state')!).lastPlacedOrder).toEqual(confirmation);
    expect(requests).toHaveLength(1); expect(PosStorage.getDraft()!.cart).toHaveLength(0);
  }, 15000);
  it('a pending sale rejected during replay exposes review and retains its recovery key', async () => {
    outcome = 'pending'; const user = await checkout();
    await waitFor(() => expect(screen.getByRole('status', { name: 'Sale result' })).toHaveTextContent('Pending'));
    const key = requests[0].idempotencyKey;
    outcome = 'rejected';
    await user.click(screen.getByRole('button', { name: 'Retry sync' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Please review this sale'));
    expect(screen.queryByRole('button', { name: 'Close receipt preview' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review rejected sale' }));
    outcome = 'saved';
    await user.click(screen.getByRole('button', { name: 'Complete Order (Cash)' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Sale result' })).toHaveTextContent('Saved'));
    expect(requests.at(-1).idempotencyKey).toBe(key);
  }, 15000);
  it('requires explicit review of a changed quote before submitting any sale', async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url !== '/api/orders/quote') return originalFetch(url, init);
      const order = JSON.parse(init!.body as string);
      const items = order.items.map((item: any) => ({ ...item, unitPricePaisa: 100000, totalPricePaisa: 100000 }));
      return json({ ...order, ...computeTotals(items, { taxBp: 0 }), items, moneySchemaVersion: 2, pricingFingerprint: 'changed-quote' });
    });
    const user = await checkout();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Current total: Rs. 1,000'));
    expect(requests).toHaveLength(0);
    const key = (await PendingOutbox.rejected())[0].idempotencyKey;
    await user.click(screen.getByRole('button', { name: 'Complete Order (Cash)' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Sale result' })).toHaveTextContent('Saved'));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ idempotencyKey: key, totalPaisa: 100000, cashTenderedPaisa: 100000 });
  });
  it('shows saved and clears the cart after the server acknowledges the sale', async () => {
    await checkout();
    await waitFor(() => expect(screen.getByRole('status', { name: 'Sale result' })).toHaveTextContent('Saved'), { timeout: 5000 });
    expect(screen.getByText('Cart is empty')).toBeVisible();
    expect(PosStorage.getOrders()[0]).toMatchObject({ persistenceState: 'saved' });
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Pending sales' })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Retry sync' })).not.toBeInTheDocument();
  });
  it('a full order cache does not strand an acknowledged checkout or its recovered draft', async () => {
    vi.spyOn(PosStorage, 'setOrders').mockImplementation(() => { throw new DOMException('Cache full', 'QuotaExceededError'); });
    await checkout();
    await waitFor(() => expect(screen.getByRole('status', { name: 'Sale result' })).toHaveTextContent('Saved'));
    expect(screen.getByText('Cart is empty')).toBeVisible();
    expect(await PendingOutbox.list()).toEqual([]);
    expect(await PendingOutbox.acknowledged()).toHaveLength(1);
    // Simulate a crash before the submitted draft was cleared.
    const product = INITIAL_PRODUCTS[0];
    PosStorage.setDraft({ paymentMethod: 'cash', attempt: requests[0], cart: [{
      cartItemId: 'crash-quota', product, quantity: 1, selectedVariations: [],
      unitPricePaisa: product.pricePaisa, unitCostPaisa: product.costPricePaisa || 0, totalPricePaisa: product.pricePaisa, totalCostPaisa: product.costPricePaisa || 0,
    }] });
    outcome = 'pending';
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url === '/api/data') throw new TypeError('Server stopped');
      return originalFetch(url, init);
    });
    cleanup(); render(<App />);
    await waitFor(() => expect(screen.getByRole('status', { name: 'Sale result' })).toHaveTextContent('Saved'));
    expect(screen.getByText('Cart is empty')).toBeVisible();
    expect(requests).toHaveLength(1);
  });
  it('locks an uncertain checkout until its recovery key is reconciled after a storage exception', async () => {
    const deletion = vi.spyOn(PendingOutbox, 'remove').mockRejectedValue(new Error('Recovery storage interrupted'));
    const user = await checkout();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Checkout could not finish'));
    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled();
    expect(await PendingOutbox.list()).toHaveLength(1);
    deletion.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Retry sync' }));
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeVisible());
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Pending sales' })).not.toBeInTheDocument());
    expect(new Set(requests.map(order => order.idempotencyKey)).size).toBe(1);
  });
  it('HTTP rejection keeps the cart and the same key for an explicit retry, with no receipt', async () => {
    outcome = 'rejected'; const user = await checkout();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Rejected'));
    expect(screen.getByRole('alert')).toHaveTextContent('Please review this sale');
    expect(screen.queryByText('Cart is empty')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close receipt preview' })).not.toBeInTheDocument();
    const firstKey = requests[0].idempotencyKey;
    outcome = 'saved';
    await user.click(screen.getByRole('button', { name: 'Retry sale' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Sale result' })).toHaveTextContent('Saved'));
    expect(requests).toHaveLength(2);
    expect(requests[1].idempotencyKey).toBe(firstKey);
  });
  it('a rejected cart and its retry key survive reload', async () => {
    outcome = 'rejected'; await checkout();
    await screen.findByRole('alert'); const key = requests[0].idempotencyKey;
    cleanup(); render(<App />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Please review this sale'));
    await waitFor(() => expect(screen.queryByText('Cart is empty')).not.toBeInTheDocument());
    outcome = 'saved';
    await userEvent.click(await screen.findByRole('button', { name: 'Complete Order (Cash)' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].idempotencyKey).toBe(key);
    await waitFor(() => expect(screen.getByRole('status', { name: 'Sale result' })).toHaveTextContent('Saved'));
  });
  it('a cashier can choose another payment method after rejection without resending the old method', async () => {
    outcome = 'rejected'; const user = await checkout();
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Card' }));
    outcome = 'saved';
    await user.click(screen.getByRole('button', { name: 'Complete Order (Card)' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].paymentMethod).toBe('card');
    expect(requests[1].cashTenderedPaisa).toBeUndefined();
    await waitFor(() => expect(screen.getByRole('status', { name: 'Sale result' })).toHaveTextContent('Saved'));
  });
  it.each(['pending', 'saved'])('reconciles a %s crash draft before another checkout can include its sold items', async state => {
    const order = saleFixture('crash');
    const product = INITIAL_PRODUCTS[0];
    PosStorage.setDraft({ paymentMethod: 'cash', attempt: order, cart: [{
      cartItemId: 'crash-cart', product, quantity: 1, selectedVariations: [],
      unitPricePaisa: product.pricePaisa, unitCostPaisa: product.costPricePaisa || 0, totalPricePaisa: product.pricePaisa, totalCostPaisa: product.costPricePaisa || 0,
    }] });
    if (state === 'pending') await PendingOutbox.put(order);
    else await PosApi.placeOrder(order, true);
    const user = userEvent.setup(); render(<App />);
    await waitFor(() => expect(PosStorage.getOrders()[0]).toMatchObject({ persistenceState: 'saved' }));
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeVisible());
    await user.click(screen.getByText(product.name));
    await user.click(screen.getByRole('button', { name: 'Complete Order (Cash)' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0].idempotencyKey).toBe(order.idempotencyKey);
    expect(requests[1].idempotencyKey).not.toBe(order.idempotencyKey);
    expect(requests[1].items[0].quantity).toBe(1);
    await waitFor(() => expect(screen.getByRole('status', { name: 'Sale result' })).toHaveTextContent('Saved'));
  });

  it('network failure shows pending on the receipt and a persistent count after logout and reload', async () => {
    outcome = 'pending'; const user = await checkout();
    await waitFor(() => expect(screen.getByRole('status', { name: 'Sale result' })).toHaveTextContent('Pending'));
    expect(document.querySelector('#thermal-receipt-print-area')).toHaveTextContent('PENDING');
    await waitFor(() => expect(screen.getByRole('status', { name: 'Pending sales' })).toHaveTextContent('1 order waiting to sync'));
    await user.click(screen.getByRole('button', { name: 'Close receipt preview' }));
    await user.click(screen.getByRole('button', { name: 'Logout' }));
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    cleanup(); render(<App />);
    await waitFor(() => expect(screen.getByRole('status', { name: 'Pending sales' })).toHaveTextContent('1 order waiting to sync'));
  });
  it('automatically replays a pending sale when the local server returns, without an internet event', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    outcome = 'pending'; await checkout();
    await waitFor(() => expect(screen.getByRole('status', { name: 'Sale result' })).toHaveTextContent('Pending'));
    const key = requests[0].idempotencyKey;
    outcome = 'saved';
    await vi.advanceTimersByTimeAsync(5000);
    await waitFor(() => expect(screen.getByRole('status', { name: 'Sale result' })).toHaveTextContent('Saved'));
    expect(requests).toHaveLength(2);
    expect(requests[1].idempotencyKey).toBe(key);
    expect(await PendingOutbox.list()).toEqual([]);
  });
  it('the confirmed wipe action preserves both IndexedDB and legacy pending recovery copies', async () => {
    const order = saleFixture('wipe');
    await PendingOutbox.put(order);
    PosStorage.addToOfflineQueue(saleFixture('legacy-wipe'));
    PosStorage.setOrders([order]);
    const legacyClear = vi.spyOn(PosStorage, 'clearOfflineQueue');
    render(<SettingsView settings={INITIAL_PRINTER_SETTINGS} currentUser={INITIAL_USERS[0]}
      onSaveSettings={() => {}} onOpenTestPrint={() => {}} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Clear cached sales' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear cached sales' }));
    expect(PosStorage.getOrders()).toEqual([]);
    expect(legacyClear).not.toHaveBeenCalled();
    expect(PosStorage.getOfflineQueue()).toHaveLength(1);
    expect((await PendingOutbox.list()).map(sale => sale.id).sort()).toEqual(['sale-legacy-wipe', 'sale-wipe']);
  });
  it('both printed slips and copied receipt text identify pending sales', async () => {
    const user = userEvent.setup();
    const clipboard = { writeText: vi.fn(async (_text: string) => {}) }; Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
    const order = { ...saleFixture('print'), persistenceState: 'pending' as const };
    render(<ThermalReceiptModal order={order} settings={INITIAL_PRINTER_SETTINGS} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Both Slips (2)' }));
    const area = document.querySelector('#thermal-receipt-print-area')!;
    expect(within(area as HTMLElement).getAllByText(/PENDING/)).toHaveLength(2);
    const copy = screen.getByRole('button', { name: /Copy/ }); await user.click(copy);
    expect(clipboard.writeText.mock.calls[0][0].match(/PENDING/g)).toHaveLength(2);
    expect(area).not.toHaveTextContent('TOTAL PAID');
  });
});
