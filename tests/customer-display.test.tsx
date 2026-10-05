import { render, screen, act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CustomerDisplayWindow } from '../src/components/CustomerDisplayWindow';
import { INITIAL_PRODUCTS } from '../src/data/initialData';

const state = { cart: [], orderNumber: '#F0031', tokenNumber: 31, subtotalPaisa: 99000, taxPaisa: 0, totalPaisa: 99000, lastPlacedOrder: null };
function store(value: unknown) { localStorage.setItem('pos_customer_display_state', JSON.stringify(value)); }
const cartItem = { cartItemId: 'display-1', product: { ...INITIAL_PRODUCTS[0], name: 'A very long product name that customers should be able to read in full' }, quantity: 2, totalPricePaisa: 99000, selectedVariations: [{ optionName: 'Extra cheese' }], notes: 'No onions' };

beforeEach(() => localStorage.clear());
describe('customer display', () => {
  it('updates store contact settings and ignores malformed state from another window', () => {
    render(<CustomerDisplayWindow />);
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'pos_customer_display_state', newValue: JSON.stringify({ ...state, settings: { storeName: 'Updated store', address: 'Updated address', whatsApp: '03000000000' } }) })));
    expect(screen.getByRole('heading', { name: 'Welcome to Updated store' })).toBeVisible();
    expect(screen.getByText('Updated address')).toBeVisible();
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'pos_customer_display_state', newValue: JSON.stringify({ cart: 'invalid', totalPaisa: 1 }) })));
    expect(screen.getByRole('heading', { name: 'Welcome to Updated store' })).toBeVisible();
  });
  it('welcomes customers without empty totals or premature tokens', () => {
    render(<CustomerDisplayWindow />);
    expect(screen.getByRole('heading', { name: /Welcome to/ })).toBeVisible();
    expect(screen.getByText('Your order will appear here as we take it.')).toBeVisible();
    expect(screen.queryByText('Rs. 0')).not.toBeInTheDocument();
    expect(screen.queryByText(/Token #/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Order total')).not.toBeInTheDocument();
  });
  it('shows complete item names, options, notes, quantities and totals while ordering', () => {
    store({ ...state, cart: [cartItem] });
    render(<CustomerDisplayWindow />);
    expect(screen.getByRole('heading', { name: 'Your order' })).toBeVisible();
    expect(screen.getByRole('heading', { name: cartItem.product.name })).toBeVisible();
    expect(screen.getByText('Extra cheese')).toBeVisible();
    expect(screen.getByText('Note: No onions')).toBeVisible();
    expect(screen.getByText('2 items')).toBeVisible();
    expect(screen.getByLabelText('Order total')).toHaveTextContent('Rs. 990');
    expect(screen.queryByText(/pickup token/i)).not.toBeInTheDocument();
  });
  it.each([
    ['saved', 'Thank you!'], ['pending', 'Confirming your order'],
    ['draft', 'Review your order'], ['rejected', 'Please speak to our cashier'],
  ])('uses honest feedback for a %s sale', (persistenceState, heading) => {
    store({ ...state, lastPlacedOrder: { ...state, persistenceState } });
    render(<CustomerDisplayWindow />);
    expect(screen.getByRole('heading', { name: heading })).toBeVisible();
    expect(screen.queryByLabelText('Order total')).not.toBeInTheDocument();
    if (persistenceState === 'saved') expect(screen.getByText('#31')).toBeVisible();
    else {
      expect(screen.queryByText('Thank you!')).not.toBeInTheDocument();
      expect(screen.queryByText('Your pickup token')).not.toBeInTheDocument();
      expect(screen.queryByText(/preparing your order/i)).not.toBeInTheDocument();
    }
  });
  it('updates from another window and replaces confirmation when the next order starts', () => {
    store({ ...state, lastPlacedOrder: { ...state, persistenceState: 'saved' } });
    render(<CustomerDisplayWindow />);
    expect(screen.getByText('Thank you!')).toBeVisible();
    act(() => window.dispatchEvent(new StorageEvent('storage', {
      key: 'pos_customer_display_state', newValue: JSON.stringify({ ...state, cart: [cartItem] }),
    })));
    expect(screen.getByRole('heading', { name: 'Your order' })).toBeVisible();
    expect(screen.queryByText('Thank you!')).not.toBeInTheDocument();
  });
  it('ignores malformed stored display data', () => {
    localStorage.setItem('pos_customer_display_state', 'not json');
    render(<CustomerDisplayWindow />);
    expect(screen.getByRole('heading', { name: /Welcome to/ })).toBeVisible();
  });
});
