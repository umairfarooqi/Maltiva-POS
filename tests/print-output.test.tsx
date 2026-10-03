import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThermalReceiptModal } from '../src/components/ThermalReceiptModal';
import { ProfitLossView } from '../src/components/ProfitLossView';
import { Order, PrinterSettings, Product } from '../src/types/pos';

const printerSettings: PrinterSettings = {
  storeName: 'Maltiva Crust',
  tagline: 'Fast Food That Hits Different',
  address: 'Phase 3 DHA Lahore',
  whatsApp: '03444757082',
  taxRatePercent: 0,
  paperWidth: '58mm',
  autoPrintDualSlips: true,
  customerDisplayGreeting: 'Welcome',
};

const product: Product = {
  id: 'product-pizza',
  name: 'Chicken Fajita Pizza',
  categoryId: 'cat-pizza',
  categoryName: 'Pizza',
  price: 1000,
  costPrice: 500,
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
  id: 'order-1',
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
      unitPrice: 1000,
      unitCost: 500,
      quantity: 1,
      totalPrice: 1000,
      totalCost: 500,
      selectedVariations: [],
    },
  ],
  subtotal: 1000,
  tax: 0,
  discount: 0,
  total: 1000,
  totalCost: 500,
  profit: 500,
  profitMarginPercent: 50,
  paymentMethod: 'cash',
  cashierId: 'cashier-1',
  cashierName: 'Counter Cashier',
  cashierRole: 'cashier',
  createdAt: '2026-10-03T10:00:00.000Z',
  synced: true,
};

describe('print output', () => {
  it('renders the receipt in thermal-receipt-print-area', () => {
    render(<ThermalReceiptModal order={order} settings={printerSettings} onClose={() => undefined} />);

    const printArea = document.querySelector('#thermal-receipt-print-area');

    expect(printArea).toBeInTheDocument();
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
