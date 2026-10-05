import { INITIAL_PRODUCTS, INITIAL_USERS } from '../../src/data/initialData';
import type { Order } from '../../src/types/pos';

export function saleFixture(suffix = '1'): Order & { idempotencyKey: string; cashTenderedPaisa: number; changeDuePaisa: number } {
  const product = INITIAL_PRODUCTS[0];
  const cashier = INITIAL_USERS[1];
  return {
    moneySchemaVersion: 2,
    id: `sale-${suffix}`, idempotencyKey: `key-${suffix}`, orderNumber: `#TEST-${suffix}`, tokenNumber: 1,
    customerName: 'Counter Customer', status: 'in_kitchen', orderType: 'take_away',
    items: [{ id: `item-${suffix}`, productId: product.id, productName: product.name,
      categoryName: product.categoryName, unitPricePaisa: 99000, unitCostPaisa: 55000, quantity: 1,
      totalPricePaisa: 99000, totalCostPaisa: 55000, selectedVariations: [], notes: 'No onion', bundledProducts: product.bundledProducts }],
    subtotalPaisa: 99000, taxPaisa: 0, discountPaisa: 0, totalPaisa: 99000, totalCostPaisa: 55000, profitPaisa: 44000,
    profitMarginPercent: 440 / 990 * 100, paymentMethod: 'cash', cashTenderedPaisa: 100000, changeDuePaisa: 1000,
    cashierId: cashier.id, cashierName: cashier.name, cashierRole: cashier.role,
    createdAt: '2026-10-04T10:00:00.000Z', synced: false,
  };
}
export async function reviewSale(url: string, order: ReturnType<typeof saleFixture>) {
  const response = await fetch(`${url}/api/orders/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) });
  if (!response.ok) throw new Error(`Quote failed: ${await response.text()}`);
  return { ...order, ...await response.json() } as ReturnType<typeof saleFixture>;
}
