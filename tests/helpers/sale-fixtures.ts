import { INITIAL_PRODUCTS, INITIAL_USERS } from '../../src/data/initialData';
import type { Order } from '../../src/types/pos';

export function saleFixture(suffix = '1'): Order & { idempotencyKey: string; cashTendered: number; changeDue: number } {
  const product = INITIAL_PRODUCTS[0];
  const cashier = INITIAL_USERS[1];
  return {
    id: `sale-${suffix}`, idempotencyKey: `key-${suffix}`, orderNumber: `#TEST-${suffix}`, tokenNumber: 1,
    customerName: 'Counter Customer', status: 'in_kitchen', orderType: 'take_away',
    items: [{ id: `item-${suffix}`, productId: product.id, productName: product.name,
      categoryName: product.categoryName, unitPrice: 990, unitCost: 550, quantity: 1,
      totalPrice: 990, totalCost: 550, selectedVariations: [], notes: 'No onion', bundledProducts: product.bundledProducts }],
    subtotal: 990, tax: 0, discount: 0, total: 990, totalCost: 550, profit: 440,
    profitMarginPercent: 440 / 990 * 100, paymentMethod: 'cash', cashTendered: 1000, changeDue: 10,
    cashierId: cashier.id, cashierName: cashier.name, cashierRole: cashier.role,
    createdAt: '2026-10-04T10:00:00.000Z', synced: false,
  };
}
