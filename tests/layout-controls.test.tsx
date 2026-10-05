import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from '../src/components/Sidebar';
import { OrderLineView } from '../src/components/OrderLineView';
import { Product } from '../src/types/pos';
import { SettingsView } from '../src/components/SettingsView';
import { PosStorage } from '../src/services/storage';
import { CartDrawer } from '../src/components/CartDrawer';

const product: Product = {
  id: 'product-1',
  name: 'Test Dish',
  categoryId: 'cat-all',
  categoryName: 'All Menu',
  pricePaisa: 500,
  costPricePaisa: 200,
  stockQuantity: 10,
  minStockThreshold: 1,
  image: '',
  description: 'Test dish',
  isAvailable: true,
  isDeal: false,
  variations: [],
  bundledProducts: [],
  createdAt: '2026-10-03T10:00:00.000Z',
  updatedAt: '2026-10-03T10:00:00.000Z',
};

describe('layout controls', () => {
  it('defaults payment to cash and submits the selected method', async () => {
    const user = userEvent.setup();
    const onPlaceOrder = vi.fn();
    const onSelectPaymentMethod = vi.fn();
    const drawerProps = {
      cart: [{
        cartItemId: 'cart-1',
        product,
        quantity: 1,
        selectedVariations: [],
        unitPricePaisa: 500,
        unitCostPaisa: 200,
        totalPricePaisa: 500,
        totalCostPaisa: 200,
      }],
      orderNumber: '#F0031',
      tokenNumber: 31,
      onUpdateQuantity: vi.fn(),
      onRemoveItem: vi.fn(),
      onClearCart: vi.fn(),
      taxBp: 0,
      onSelectPaymentMethod,
      onOpenPrintModal: vi.fn(),
      isProcessing: false,
    };

    const { rerender } = render(
      <CartDrawer {...drawerProps} paymentMethod="cash" onPlaceOrder={onPlaceOrder} />
    );

    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Cash Tendered')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Payment Method' }).closest('div.shrink-0')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Card' }));
    expect(onSelectPaymentMethod).toHaveBeenCalledWith('card');
    rerender(<CartDrawer {...drawerProps} paymentMethod="card" onPlaceOrder={onPlaceOrder} />);

    expect(screen.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText('Cash Tendered')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Complete Order (Card)' }));
    expect(onPlaceOrder).toHaveBeenCalledWith(500, 'card');
  });

  it('shows a compact mobile checkout button for the current cart', async () => {
    const user = userEvent.setup();
    const onOpenMobileCart = vi.fn();

    render(
      <OrderLineView
        products={[]}
        categories={[]}
        cart={[{
          cartItemId: 'cart-1',
          product,
          quantity: 2,
          selectedVariations: [],
          unitPricePaisa: 500,
          unitCostPaisa: 200,
          totalPricePaisa: 1000,
          totalCostPaisa: 400,
        }]}
        onQuickAddToCart={vi.fn()}
        onQuickDecrementFromCart={vi.fn()}
        onOpenVariationModal={vi.fn()}
        onOpenMobileCart={onOpenMobileCart}
      />
    );

    const checkoutButton = screen.getByRole('button', { name: /Proceed to checkout, 2 items/ });
    expect(checkoutButton).not.toHaveClass('w-full');
    await user.click(checkoutButton);
    expect(onOpenMobileCart).toHaveBeenCalledOnce();
  });

  it('uses an in-app confirmation before wiping sales', async () => {
    const user = userEvent.setup();
    const setOrders = vi.spyOn(PosStorage, 'setOrders');
    const clearOfflineQueue = vi.spyOn(PosStorage, 'clearOfflineQueue');

    render(
      <SettingsView
        settings={{
          storeName: 'Maltiva',
          tagline: '',
          address: '',
          whatsApp: '',
          taxBp: 0,
          paperWidth: '80mm',
          autoPrintDualSlips: false,
          customerDisplayGreeting: '',
        }}
        onSaveSettings={vi.fn()}
        currentUser={{
          id: 'admin',
          name: 'Admin',
          username: 'admin',
          email: '',
          role: 'admin',
          avatar: '',
          active: true,
          branch: '',
        }}
        onOpenTestPrint={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Clear cached sales' }));

    expect(screen.getByRole('alertdialog', { name: 'Clear cached sales?' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(setOrders).not.toHaveBeenCalled();
    expect(clearOfflineQueue).not.toHaveBeenCalled();

    setOrders.mockRestore();
    clearOfflineQueue.mockRestore();
  });

  it('collapses and expands the desktop sidebar with an explicit control', async () => {
    const user = userEvent.setup();

    render(
      <Sidebar
        activeTab="order_line"
        onSelectTab={vi.fn()}
        userRole="admin"
        userName="Admin"
        onLogout={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
    expect(screen.queryByText('Order Line')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));

    expect(screen.getByText('Order Line')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
    expect(screen.queryByText('Order Line')).not.toBeInTheDocument();
  });

  it('uses an auto-fill grid for the all-menu product cards', () => {
    render(
      <OrderLineView
        products={[product]}
        categories={[]}
        cart={[]}
        onQuickAddToCart={vi.fn()}
        onQuickDecrementFromCart={vi.fn()}
        onOpenVariationModal={vi.fn()}
      />
    );

    const productGrid = screen.getByRole('heading', { name: 'Test Dish' }).closest('div.grid');

    expect(productGrid).toHaveClass('grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]');
  });

  it('removes decorative emoji from category labels', () => {
    render(
      <OrderLineView
        products={[]}
        categories={[{ id: 'cat-fries', name: 'Fries & Loaded🍟', icon: '', itemCount: 0, order: 0 }]}
        cart={[]}
        onQuickAddToCart={vi.fn()}
        onQuickDecrementFromCart={vi.fn()}
        onOpenVariationModal={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Fries & Loaded 0 items/i })).toBeVisible();
    expect(screen.queryByText('Fries & Loaded🍟')).not.toBeInTheDocument();
  });
});
