import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThermalReceiptModal } from '../src/components/ThermalReceiptModal';
import { ProfitLossView } from '../src/components/ProfitLossView';
import { Order, PrinterSettings, Product } from '../src/types/pos';
import { receiptText } from '../src/utils/receiptText';

const printerSettings: PrinterSettings = {
  storeName: 'Maltiva Crust',
  tagline: 'Fast Food That Hits Different',
  address: 'Phase 3 DHA Lahore',
  whatsApp: '03444757082',
  taxBp: 0,
  paperWidth: '58mm',
  autoPrintDualSlips: true,
  customerDisplayGreeting: 'Welcome',
};

const product: Product = {
  id: 'product-pizza',
  name: 'Chicken Fajita Pizza',
  categoryId: 'cat-pizza',
  categoryName: 'Pizza',
  pricePaisa: 100000,
  costPricePaisa: 50000,
  stockQuantity: 10,
  minStockThreshold: 1,
  image: '',
  description: 'Pizza',
  isAvailable: true,
  isDeal: false,
  variations: [],
  bundledProducts: [],
  createdAt: '2026-10-03T10:00:00.000Z',
  updatedAt: '2026-10-03T10:00:00.000Z',
};

const order: Order = {
  id: 'order-1', persistenceState: 'saved', moneySchemaVersion: 2,
  orderNumber: '#F001',
  tokenNumber: 1,
  status: 'served',
  orderType: 'take_away',
  items: [
    {
      id: 'order-item-1',
      productId: product.id,
      productName: product.name,
      categoryName: product.categoryName,
      unitPricePaisa: 100000,
      unitCostPaisa: 50000,
      quantity: 1,
      totalPricePaisa: 100000,
      totalCostPaisa: 50000,
      selectedVariations: [],
    },
  ],
  subtotalPaisa: 100000,
  taxPaisa: 0,
  discountPaisa: 0,
  totalPaisa: 100000,
  totalCostPaisa: 50000,
  profitPaisa: 50000,
  profitMarginPercent: 50,
  paymentMethod: 'cash',
  cashierId: 'cashier-1',
  cashierName: 'Counter Cashier',
  cashierRole: 'cashier',
  createdAt: '2026-10-03T10:00:00.000Z',
  synced: true,
};

describe('print output', () => {
  it.each(['pending', 'draft', 'rejected'] as const)('does not print a guessed pickup token from a %s recovery snapshot', persistenceState => {
    const provisional = { ...order, persistenceState, tokenNumber: 31, synced: false };
    render(<ThermalReceiptModal order={provisional} settings={printerSettings} onClose={() => undefined} />);
    const printArea = document.querySelector('#thermal-receipt-print-area');
    expect(printArea).toHaveTextContent('Awaiting save');
    expect(printArea).not.toHaveTextContent('#31');
    const text = receiptText(provisional, printerSettings, '58mm', 'both');
    expect(text).toContain('TOKEN #: Awaiting save');
    expect(text).toContain(`REFERENCE: ${order.orderNumber}`);
    expect(text).not.toContain('TOKEN #: 31');
  });

  it('includes customer preparation notes and restores the page after native printing', () => {
    const withNotes = { ...order, items: order.items.map(item => ({ ...item, notes: 'No onion' })) };
    const view = render(<ThermalReceiptModal order={withNotes} settings={printerSettings} onClose={() => undefined} />);
    expect(document.querySelector('#thermal-receipt-print-area')).toHaveTextContent('Note: No onion');
    const originalStyles = document.head.querySelectorAll('style').length;
    act(() => window.dispatchEvent(new Event('beforeprint')));
    expect(document.head.querySelectorAll('style')).toHaveLength(originalStyles + 1);
    expect(document.head.lastElementChild?.textContent).toContain('size: 58mm');
    act(() => window.dispatchEvent(new Event('afterprint')));
    expect(document.head.querySelectorAll('style')).toHaveLength(originalStyles);
    act(() => window.dispatchEvent(new Event('beforeprint')));
    view.unmount();
    expect(document.head.querySelectorAll('style')).toHaveLength(originalStyles);
  });

  it('renders the receipt in thermal-receipt-print-area', () => {
    render(<ThermalReceiptModal order={order} settings={printerSettings} onClose={() => undefined} />);

    const printArea = document.querySelector('#thermal-receipt-print-area');

    expect(printArea).toBeInTheDocument();
    expect(printArea).toHaveClass('theme-paper');
    expect(printArea).toHaveAttribute('data-paper-width', '58mm');
    expect(printArea).toHaveTextContent('#1');
    expect(printArea).toHaveTextContent('Chicken Fajita Pizza');
    expect(screen.getByText('Customer Receipt')).toBeVisible();
    expect(screen.queryByText('KITCHEN SLIP - TAKEAWAY')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close receipt preview' })).toBeVisible();
  });

  it('renders the P&L summary in profit-loss-print-area', () => {
    render(
      <ProfitLossView
        orders={[order]}
        products={[product]}
        categories={[]}
        userRole="admin"
      />
    );

    const printArea = document.querySelector('#profit-loss-print-area');

    expect(printArea).toBeInTheDocument();
    expect(printArea).toHaveTextContent('Customer Selling Revenue');
    expect(printArea).toHaveTextContent('Rs. 1,000');
  });
});
