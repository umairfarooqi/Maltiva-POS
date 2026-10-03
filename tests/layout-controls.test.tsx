import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from '../src/components/Sidebar';
import { OrderLineView } from '../src/components/OrderLineView';
import { Product } from '../src/types/pos';

const product: Product = {
  id: 'product-1',
  name: 'Test Dish',
  categoryId: 'cat-all',
  categoryName: 'All Menu',
  price: 500,
  costPrice: 200,
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

    expect(screen.getByText('Order Line')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
    expect(screen.queryByText('Order Line')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));

    expect(screen.getByText('Order Line')).toBeVisible();
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
