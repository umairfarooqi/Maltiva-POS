import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CartDrawer } from '../src/components/CartDrawer';
import { ThermalReceiptModal } from '../src/components/ThermalReceiptModal';
import { ProfitLossView } from '../src/components/ProfitLossView';
import { DashboardView } from '../src/components/DashboardView';
import { saleFixture } from './helpers/sale-fixtures';
import { INITIAL_PRODUCTS, INITIAL_PRINTER_SETTINGS, INITIAL_USERS } from '../src/data/initialData';
import { computeTotals } from '../src/shared/money';
describe('paisa display and financial history', () => {
  it('dashboard totals and daily comparison exclude provisional sales', () => {
    const saved = { ...saleFixture('dashboard'), totalPaisa: 36630, createdAt: new Date().toISOString(), persistenceState: 'saved' as const };
    const yesterday = { ...saved, id: 'yesterday', totalPaisa: 10000, createdAt: new Date(Date.now() - 86400000).toISOString() };
    render(<DashboardView orders={[saved, yesterday, { ...saved, id: 'pending', persistenceState: 'pending' },
      { ...yesterday, id: 'rejected', persistenceState: 'rejected' }]} products={INITIAL_PRODUCTS}
      currentUser={INITIAL_USERS[0]} onNavigateToTab={() => {}} />);
    expect(screen.getByText('Today: Rs. 366.30 vs Yest: Rs. 100')).toBeVisible();
    expect(screen.getByText('1 cash orders processed')).toBeVisible();
  });
  it('cart and receipt preserve Rs.366.30, exact tender/change and reject extra input precision', async () => {
    const line = { ...saleFixture('decimal').items[0], unitPricePaisa: 33300, unitCostPaisa: 20000, totalPricePaisa: 33300, totalCostPaisa: 20000 };
    const cart = [{ ...line, product: INITIAL_PRODUCTS[0], cartItemId: 'decimal' }];
    const place = vi.fn(); const totals = computeTotals(cart, { taxBp: 1000 });
    const view = render(<CartDrawer cart={cart} orderNumber="#D" tokenNumber={1} taxBp={1000} paymentMethod="cash"
      onSelectPaymentMethod={() => {}} onPlaceOrder={place} onUpdateQuantity={() => {}} onRemoveItem={() => {}}
      onClearCart={() => {}} onOpenPrintModal={() => {}} isProcessing={false} />);
    expect(screen.getByText('Rs. 366.30')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Cash Tendered'), { target: { value: '400.10' } });
    expect(screen.getByText('Rs. 33.80')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Complete Order (Cash)' }));
    expect(place).toHaveBeenCalledWith(40010, 'cash');
    fireEvent.change(screen.getByLabelText('Cash Tendered'), { target: { value: '400.001' } });
    expect(screen.getByRole('button', { name: 'Complete Order (Cash)' })).toBeDisabled();
    view.unmount();
    render(<ThermalReceiptModal order={{ ...saleFixture('decimal'), ...totals, items: [line], persistenceState: 'saved' }}
      settings={INITIAL_PRINTER_SETTINGS} onClose={() => {}} />);
    expect(document.querySelector('#thermal-receipt-print-area')).toHaveTextContent('Rs. 366.30');
    const clipboard = { writeText: vi.fn(async (_text: string) => {}) };
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
    await userEvent.click(screen.getByRole('button', { name: /Copy/ }));
    expect(clipboard.writeText.mock.calls[0][0]).toContain('Rs. 366.30');
  });
  it('zero snapshot cost stays zero after catalog edits and provisional sales are excluded', () => {
    const saved = saleFixture('history'); saved.persistenceState = 'saved';
    saved.items[0] = { ...saved.items[0], unitCostPaisa: 0, totalCostPaisa: 0, netRevenuePaisa: 33300 };
    const pending = { ...saved, id: 'pending', persistenceState: 'pending' as const };
    render(<ProfitLossView orders={[saved, pending]} products={[{ ...INITIAL_PRODUCTS[0], costPricePaisa: 99999 }]}
      categories={[]} userRole="admin" />);
    const area = document.querySelector('#profit-loss-print-area') as HTMLElement;
    expect(area).toHaveTextContent('Rs. 333');
    expect(area).toHaveTextContent('across 1 orders');
    const row = within(area).getByText(INITIAL_PRODUCTS[0].name).closest('tr')!;
    expect(row).toHaveTextContent('Rs. 0');
    expect(row).not.toHaveTextContent('Rs. 999.99');
  });
});
