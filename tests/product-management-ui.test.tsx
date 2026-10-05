import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManageDishesView } from '../src/components/ManageDishesView';
import { ProductStockBadge } from '../src/components/ProductStockBadge';
import { INITIAL_PRODUCTS, INITIAL_USERS, INITIAL_CATEGORIES } from '../src/data/initialData';

afterEach(cleanup);
const product = { ...INITIAL_PRODUCTS[0], name: 'Test product', stockQuantity: 2, minStockThreshold: 5 };
function renderManagement() {
  return render(<ManageDishesView products={[product]} categories={INITIAL_CATEGORIES} currentUser={INITIAL_USERS[0]}
    onSaveProduct={vi.fn()} onDeleteProduct={vi.fn()} onSaveCategory={vi.fn()}
    onUpdateCategory={vi.fn()} onDeleteCategory={vi.fn()} onAdjustStock={vi.fn()} />);
}

describe('product management feedback and keyboard navigation', () => {
  it.each(['grid', 'list'])('supports keyboard actions and restores focus in %s view', async view => {
    const user = userEvent.setup();
    renderManagement();
    if (view === 'list') await user.click(screen.getByTitle('List view'));
    const trigger = screen.getByRole('button', { name: 'Actions for Test product' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: 'Edit Product' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Adjust Stock' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Delete Product' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Edit Product' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Delete Product' })).toHaveFocus();
    await user.keyboard('{Home}{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('opens stock adjustment through the focused menu action', async () => {
    const user = userEvent.setup();
    renderManagement();
    await user.click(screen.getByRole('button', { name: 'Actions for Test product' }));
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('heading', { name: 'Adjust Stock' })).toBeVisible();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it.each([
    [0, true, 'Sold out'], [2, true, 'Low stock · 2 left'],
    [5, true, 'Low stock · 5 left'], [10, false, 'Unavailable'],
  ])('describes stock %s and availability %s', (stockQuantity, isAvailable, label) => {
    render(<ProductStockBadge product={{ ...product, stockQuantity, isAvailable }} />);
    expect(screen.getByText(label)).toBeVisible();
  });

  it('keeps normal stock quiet', () => {
    const { container } = render(<ProductStockBadge product={{ ...product, stockQuantity: 6, isAvailable: true }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
