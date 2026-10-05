import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CustomerDisplayWindow } from '../src/components/CustomerDisplayWindow';

describe('customer display', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses a transaction-focused heading while the order is open', () => {
    render(<CustomerDisplayWindow />);

    expect(screen.getByRole('heading', { name: 'Your order' })).toBeVisible();
    expect(screen.getByText('Review items and total before payment.')).toBeVisible();
  });
});

describe('customer display sale persistence', () => {
  it('does not announce success for a pending sale', () => {
    localStorage.setItem('pos_customer_display_state', JSON.stringify({ cart: [], orderNumber: '#F0031', tokenNumber: 31, subtotalPaisa: 990, taxPaisa: 0, totalPaisa: 990,
      lastPlacedOrder: { orderNumber: '#F0031', tokenNumber: 31, totalPaisa: 990, persistenceState: 'pending' } }));
    render(<CustomerDisplayWindow />);
    expect(screen.getByText('PENDING — waiting for server confirmation')).toBeVisible();
    expect(screen.queryByText('Order Successfully Placed')).not.toBeInTheDocument();
  });
});
