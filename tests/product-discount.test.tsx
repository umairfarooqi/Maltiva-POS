import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManageDishesView } from '../src/components/ManageDishesView';
import { OrderLineView } from '../src/components/OrderLineView';
import { INITIAL_CATEGORIES, INITIAL_PRODUCTS, INITIAL_USERS } from '../src/data/initialData';
import { fromMoneyRow, toMoneyRow } from '../src/services/moneyMigration';

afterEach(cleanup);

describe('item and deal discounts (originalPricePaisa)', () => {
  it('saves originalPricePaisa on dishes and rejects original price below selling price', async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    render(
      <ManageDishesView
        products={[]}
        categories={INITIAL_CATEGORIES}
        currentUser={INITIAL_USERS[0]}
        onSaveProduct={save}
        onDeleteProduct={vi.fn()}
        onSaveCategory={vi.fn()}
        onUpdateCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
        onAdjustStock={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Add New Dish' }));
    await user.type(screen.getByLabelText('Dish Name'), 'Zinger Burger');
    const price = screen.getByLabelText('Selling Price (PKR)');
    const orig = screen.getByLabelText('Original Price (PKR)');
    await user.clear(price);
    await user.type(price, '170');
    await user.type(orig, '150');
    await user.click(screen.getByRole('button', { name: 'Save Dish' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Original price cannot be less than selling price');
    expect(save).not.toHaveBeenCalled();

    await user.clear(orig);
    await user.type(orig, '200');
    await user.click(screen.getByRole('button', { name: 'Save Dish' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Zinger Burger',
        pricePaisa: 17000,
        originalPricePaisa: 20000,
        isDeal: false,
      })
    );
  });

  it('saves originalPricePaisa on deals', async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    render(
      <ManageDishesView
        products={[]}
        categories={INITIAL_CATEGORIES}
        currentUser={INITIAL_USERS[0]}
        onSaveProduct={save}
        onDeleteProduct={vi.fn()}
        onSaveCategory={vi.fn()}
        onUpdateCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
        onAdjustStock={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Create Deal' }));
    await user.type(screen.getByLabelText('Deal Title'), 'Lunch Deal');
    const price = screen.getByLabelText('Deal Price (PKR)');
    const orig = screen.getByLabelText('Original Price (PKR)');
    await user.clear(price);
    await user.type(price, '170');
    await user.type(orig, '200');
    await user.click(screen.getByRole('button', { name: 'Save Deal' }));

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Lunch Deal',
        pricePaisa: 17000,
        originalPricePaisa: 20000,
        isDeal: true,
      })
    );
  });

  it('renders strikethrough original price and percentage badge in OrderLineView', () => {
    const discounted = {
      ...INITIAL_PRODUCTS[0],
      id: 'prod-disc-1',
      name: 'Discounted Pizza',
      pricePaisa: 17000,
      originalPricePaisa: 20000,
      stockQuantity: 10,
      isAvailable: true,
    };
    render(
      <OrderLineView
        products={[discounted]}
        categories={INITIAL_CATEGORIES}
        cart={[]}
        onQuickAddToCart={vi.fn()}
        onQuickDecrementFromCart={vi.fn()}
        onOpenVariationModal={vi.fn()}
        onOpenMobileCart={vi.fn()}
      />
    );

    expect(screen.getByText('-15%')).toBeVisible();
    expect(screen.getByText('Rs. 170')).toBeVisible();
    const origEl = screen.getByText('Rs. 200');
    expect(origEl).toBeVisible();
    expect(origEl).toHaveClass('line-through');
  });

  it('maps originalPricePaisa <-> original_price_paisa in moneyMigration', () => {
    const dbRow = toMoneyRow('products', { id: 'p1', pricePaisa: 17000, originalPricePaisa: 20000 });
    expect(dbRow.price_paisa).toBe(17000);
    expect(dbRow.original_price_paisa).toBe(20000);

    const apiObj = fromMoneyRow('products', dbRow);
    expect(apiObj.pricePaisa).toBe(17000);
    expect(apiObj.originalPricePaisa).toBe(20000);
  });
});
