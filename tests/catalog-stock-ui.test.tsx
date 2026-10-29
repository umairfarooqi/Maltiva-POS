import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManageDishesView } from '../src/components/ManageDishesView';
import { PosApi } from '../src/services/api';
import { PosStorage } from '../src/services/storage';
import { INITIAL_PRODUCTS, INITIAL_USERS, INITIAL_CATEGORIES } from '../src/data/initialData';

const product = { ...INITIAL_PRODUCTS[0], id: 'stock-edit-product', name: 'Stock editor product', stockQuantity: 20 };
const management = (isDeal: boolean, save = vi.fn().mockResolvedValue(undefined)) => render(<ManageDishesView
  products={[{ ...product, isDeal }]} categories={INITIAL_CATEGORIES} currentUser={INITIAL_USERS[0]}
  onSaveProduct={save} onDeleteProduct={vi.fn()} onSaveCategory={vi.fn()} onUpdateCategory={vi.fn()}
  onDeleteCategory={vi.fn()} onAdjustStock={vi.fn()} />);
beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('separate menu edits from stock commands', () => {
  it.each([false, true])('keeps existing stock read-only and out of the edit payload (deal=%s)', async isDeal => {
    const user = userEvent.setup(), save = vi.fn().mockResolvedValue(undefined);
    management(isDeal, save);
    await user.click(screen.getByRole('button', { name: product.name }));
    const stock = screen.getByLabelText('Stock when opened');
    expect(stock).toHaveAttribute('readonly'); expect(stock).toHaveValue(20);
    await user.type(stock, '999'); expect(stock).toHaveValue(20);
    expect(screen.getByText(/Use Adjust Stock from the product menu/)).toBeVisible();
    const name = screen.getByLabelText(isDeal ? 'Deal Title' : 'Dish Name');
    await user.clear(name); await user.type(name, 'Updated menu name');
    await user.click(screen.getByRole('button', { name: isDeal ? 'Save Deal' : 'Save Dish' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0]).toMatchObject({ id: product.id, name: 'Updated menu name' });
    expect(save.mock.calls[0][0]).not.toHaveProperty('stockQuantity');
  });

  it('retains opening-stock entry for a new dish', async () => {
    const user = userEvent.setup(), save = vi.fn().mockResolvedValue(undefined);
    management(false, save);
    await user.click(screen.getByRole('button', { name: 'Add New Dish' }));
    const stock = screen.getByLabelText('Opening stock');
    expect(stock).not.toHaveAttribute('readonly');
    await user.type(screen.getByLabelText('Dish Name'), 'New stocked dish');
    await user.clear(screen.getByLabelText('Selling Price (PKR)'));
    await user.type(screen.getByLabelText('Selling Price (PKR)'), '850');
    await user.clear(screen.getByLabelText('Cost Price (PKR)'));
    await user.type(screen.getByLabelText('Cost Price (PKR)'), '200');
    await user.clear(stock); await user.type(stock, '7');
    await user.click(screen.getByRole('button', { name: 'Save Dish' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0]).toMatchObject({ name: 'New stocked dish', stockQuantity: 7 });
  });

  it('omits stale stock in transport and refreshes the cache with the acknowledged quantity', async () => {
    PosStorage.setToken('catalog-session'); PosStorage.setProducts([product]);
    const transport = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(init!.body as string)).not.toHaveProperty('stockQuantity');
      return new Response(JSON.stringify({ ...product, moneySchemaVersion: 2, stockQuantity: 19 }), { status: 200 });
    });
    vi.stubGlobal('fetch', transport);
    const saved = await PosApi.updateProduct(product, true);
    expect(saved.stockQuantity).toBe(19);
    expect(PosStorage.getProducts().find(item => item.id === product.id)?.stockQuantity).toBe(19);
    expect(transport).toHaveBeenCalledOnce();
  });
});
