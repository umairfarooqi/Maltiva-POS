import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CashKeypad } from '../src/components/CashKeypad';
import { CartDrawer } from '../src/components/CartDrawer';
import { INITIAL_PRODUCTS } from '../src/data/initialData';

describe('touch cash entry', () => {
  it('replaces the initial tender and preserves decimal change without completing a sale', async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    render(<CashKeypad totalPaisa={36630} initialValue="366.30" busy={false} onClose={vi.fn()} onConfirm={confirm} />);
    for (const key of ['4', '0', '0', '.', '1', '0', '9']) await user.click(screen.getByRole('button', { name: key }));
    expect(screen.getByLabelText('Entered cash amount')).toHaveTextContent('400.10');
    expect(screen.getByText('Change Rs. 33.80')).toBeVisible();
    expect(confirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Use amount' }));
    expect(confirm).toHaveBeenCalledWith('400.10');
  });

  it('prevents underpayment and allows canceling an unfinished amount', async () => {
    const user = userEvent.setup(); const close = vi.fn(); const confirm = vi.fn();
    render(<CashKeypad totalPaisa={36630} initialValue="366.30" busy={false} onClose={close} onConfirm={confirm} />);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.click(screen.getByRole('button', { name: '1' }));
    expect(screen.getByRole('button', { name: 'Use amount' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalledOnce(); expect(confirm).not.toHaveBeenCalled();
  });

  it('quick tender sets an absolute amount, Exact restores the total, and processing locks entry', async () => {
    const user = userEvent.setup(); const place = vi.fn();
    const props = {
      cart: [{ cartItemId: 'touch', product: INITIAL_PRODUCTS[0], quantity: 1, selectedVariations: [], unitPricePaisa: 36630, unitCostPaisa: 0, totalPricePaisa: 36630, totalCostPaisa: 0 }],
      orderNumber: '#1', tokenNumber: 1, taxBp: 0, paymentMethod: 'cash' as const,
      onSelectPaymentMethod: vi.fn(), onPlaceOrder: place, onUpdateQuantity: vi.fn(), onRemoveItem: vi.fn(), onClearCart: vi.fn(), onOpenPrintModal: vi.fn(),
    };
    const view = render(<CartDrawer {...props} isProcessing={false} />);
    await user.click(screen.getByRole('button', { name: '1000' }));
    expect(screen.getByLabelText('Cash Tendered')).toHaveValue('1000.00');
    expect(screen.getByText('Rs. 633.70')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Exact' }));
    expect(screen.getByLabelText('Cash Tendered')).toHaveValue('366.30');
    expect(place).not.toHaveBeenCalled();
    view.rerender(<CartDrawer {...props} isProcessing />);
    expect(screen.getByRole('button', { name: '1000' })).toBeDisabled();
    expect(screen.getByLabelText('Cash Tendered')).toBeDisabled();
  });
});
