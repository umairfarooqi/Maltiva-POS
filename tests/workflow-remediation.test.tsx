import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VariationModal } from '../src/components/VariationModal';
import { ManageDishesView } from '../src/components/ManageDishesView';
import { CartDrawer } from '../src/components/CartDrawer';
import { ThermalReceiptModal } from '../src/components/ThermalReceiptModal';
import { Dialog } from '../src/components/ui/Dialog';
import { PosApi } from '../src/services/api';
import { PosStorage } from '../src/services/storage';
import { INITIAL_PRODUCTS, INITIAL_CATEGORIES, INITIAL_USERS, INITIAL_PRINTER_SETTINGS } from '../src/data/initialData';
import { saleFixture } from './helpers/sale-fixtures';
import { dateRange } from '../src/utils/dateRange';
import type { CartItem } from '../src/types/pos';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const product = { ...INITIAL_PRODUCTS[0], isDeal: false, variations: [{ id: 'size', name: 'Size', required: true, multiSelect: false, options: [{ id: 'large', name: 'Large', priceDeltaPaisa: 10000, costDeltaPaisa: 1000 }] }] };
const line: CartItem = { cartItemId: 'same-product-first', product, quantity: 2, notes: 'No onions', selectedVariations: [{ groupId: 'size', groupName: 'Size', optionId: 'large', optionName: 'Large', priceDeltaPaisa: 10000, costDeltaPaisa: 1000 }], unitPricePaisa: 109000, unitCostPaisa: 56000, totalPricePaisa: 218000, totalCostPaisa: 112000 };
const managementProps = { products: [product], categories: INITIAL_CATEGORIES, currentUser: INITIAL_USERS[0], onSaveProduct: vi.fn(), onDeleteProduct: vi.fn(), onSaveCategory: vi.fn(), onUpdateCategory: vi.fn(), onDeleteCategory: vi.fn(), onAdjustStock: vi.fn() };

describe('workflow remediation', () => {
  it('restores the page when multiple stacked dialogs unmount together', () => {
    const root = document.createElement('div'); root.id = 'root'; document.body.appendChild(root);
    const previousOverflow = document.body.style.overflow;
    const view = render(<><Dialog label="Parent" onClose={vi.fn()}><button>Parent action</button></Dialog><Dialog label="Child" onClose={vi.fn()}><button>Child action</button></Dialog></>, { container: root });
    expect(root.inert).toBe(true);
    view.rerender(<></>);
    expect(root.inert).toBe(false); expect(document.body.style.overflow).toBe(previousOverflow);
    view.unmount(); root.remove();
  });
  it('opens the browser print dialog once for a confirmed sale and never for a pending sale', () => {
    vi.useFakeTimers(); const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const order = { ...saleFixture('print-once'), persistenceState: 'pending' as const };
    const view = render(<ThermalReceiptModal autoPrint order={order} settings={INITIAL_PRINTER_SETTINGS} onClose={vi.fn()} />);
    act(() => vi.advanceTimersByTime(200)); expect(print).not.toHaveBeenCalled();
    view.rerender(<ThermalReceiptModal autoPrint order={{ ...order, persistenceState: 'saved' }} settings={INITIAL_PRINTER_SETTINGS} onClose={vi.fn()} />);
    act(() => vi.advanceTimersByTime(200)); expect(print).toHaveBeenCalledOnce();
    view.rerender(<ThermalReceiptModal autoPrint order={{ ...order, persistenceState: 'saved' }} settings={{ ...INITIAL_PRINTER_SETTINGS, storeName: 'Updated' }} onClose={vi.fn()} />);
    act(() => vi.advanceTimersByTime(200)); expect(print).toHaveBeenCalledOnce();
  });
  it('edits existing notes and options and returns the new quantity', async () => {
    const user = userEvent.setup(); const save = vi.fn();
    render(<VariationModal product={product} initialItem={line} onAddToCart={save} onClose={vi.fn()} />);
    expect(screen.getByLabelText('Special Instructions')).toHaveValue('No onions');
    expect(screen.getByRole('button', { name: /Large/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByLabelText('Increase item quantity'));
    await user.clear(screen.getByLabelText('Special Instructions')); await user.type(screen.getByLabelText('Special Instructions'), 'Extra hot');
    await user.click(screen.getByRole('button', { name: /Update item/ }));
    expect(save).toHaveBeenCalledWith(product, line.selectedVariations, 3, 'Extra hot');
  });
  it('keeps an invalid customization open and focuses the missing required group', async () => {
    const user = userEvent.setup(); const save = vi.fn();
    render(<VariationModal product={{ ...product, variations: [{ ...product.variations[0], multiSelect: true }] }} onAddToCart={save} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Add to Order/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an option for Size');
    expect(document.getElementById('option-group-size')).toHaveFocus(); expect(save).not.toHaveBeenCalled();
  });
  it('operates on the exact line and confirms before clearing all items', async () => {
    const user = userEvent.setup(); const update = vi.fn(), remove = vi.fn(), clear = vi.fn();
    render(<CartDrawer cart={[line]} orderNumber="#1" tokenNumber={1} onUpdateQuantity={update} onRemoveItem={remove} onClearCart={clear} taxBp={0} paymentMethod="cash" onSelectPaymentMethod={vi.fn()} onPlaceOrder={vi.fn()} onOpenPrintModal={vi.fn()} isProcessing={false} />);
    expect(screen.getByText('Note: No onions')).toBeVisible();
    await user.click(screen.getByRole('button', { name: `Decrease quantity of ${product.name}` })); expect(update).toHaveBeenCalledWith(line.cartItemId, -1);
    await user.click(screen.getByRole('button', { name: `Remove ${product.name}` })); expect(remove).toHaveBeenCalledWith(line.cartItemId);
    await user.click(screen.getByLabelText('Clear order')); expect(clear).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Clear all items' })); expect(clear).toHaveBeenCalledOnce();
  });
  it('preserves variation IDs and rules when changing a dish name', async () => {
    const user = userEvent.setup(); const save = vi.fn().mockResolvedValue(undefined);
    render(<ManageDishesView {...managementProps} onSaveProduct={save} />);
    await user.click(screen.getByText(product.name));
    await user.clear(screen.getByLabelText('Dish Name')); await user.type(screen.getByLabelText('Dish Name'), 'Renamed dish');
    await user.click(screen.getByRole('button', { name: 'Save Dish' }));
    expect(save.mock.calls[0][0]).toMatchObject({ name: 'Renamed dish', variations: product.variations });
  });
  it('retains the product and confirmation after a failed delete', async () => {
    const user = userEvent.setup(); const remove = vi.fn().mockRejectedValue(new Error('Server unreachable'));
    render(<ManageDishesView {...managementProps} onDeleteProduct={remove} />);
    await user.click(screen.getByLabelText(`Actions for ${product.name}`)); await user.click(screen.getByRole('menuitem', { name: 'Delete Product' }));
    await user.click(screen.getByRole('button', { name: 'Yes, Delete' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Server unreachable');
    expect(screen.getByRole('button', { name: 'Yes, Delete' })).toBeEnabled();
  });
  it('does not delete cached products when the server rejects deletion', async () => {
    PosStorage.setProducts([product]); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    await expect(PosApi.deleteProduct(product.id, false)).rejects.toThrow('could not be deleted');
    expect(PosStorage.getProducts()).toHaveLength(1);
  });
  it('traps focus and restores the initiating button after Escape', async () => {
    const user = userEvent.setup(); render(<ManageDishesView {...managementProps} />);
    const trigger = screen.getByText(product.name); await user.click(trigger);
    const dialog = screen.getByRole('dialog');
    const buttons = within(dialog).getAllByRole('button'); buttons.at(-1)!.focus(); await user.tab();
    expect(within(dialog).getByLabelText('Close dish editor')).toHaveFocus();
    await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  });
});

describe('local calendar reports', () => {
  it('uses exactly seven calendar days and excludes the next midnight', () => {
    const now = new Date(2026, 9, 5, 14); const range = dateRange('week', '', '', now);
    expect(range.start).toBe(new Date(2026, 8, 29).getTime()); expect(range.end).toBe(new Date(2026, 9, 6).getTime());
    const custom = dateRange('custom', '2026-10-04', '2026-10-05', now);
    expect(custom.start).toBe(new Date(2026, 9, 4).getTime()); expect(custom.end).toBe(new Date(2026, 9, 6).getTime());
  });
  it('rejects missing, impossible and reversed dates', () => {
    for (const [start, end] of [['', '2026-10-05'], ['2026-02-30', '2026-03-01'], ['2026-10-06', '2026-10-05']]) expect(dateRange('custom', start, end).error).not.toBe('');
  });
});
