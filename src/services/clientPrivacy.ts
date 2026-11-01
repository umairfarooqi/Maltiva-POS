/** Browser checkout/recovery storage is shared by operators. Confidential report
 * fields belong to the authorized session in memory, never to durable checkout data.
 * Identity, prices, payment, options and recovery status are deliberately retained. */
const privateFields = new Set([
  'password', 'pin', 'securityAnswer', 'authSecret', 'authSessionId',
  'costPrice', 'costPricePaisa', 'cost_price_paisa', 'costDelta', 'costDeltaPaisa',
  'rawCost', 'rawCostPaisa', 'unitCost', 'unitCostPaisa', 'unit_cost_paisa',
  'totalCost', 'totalCostPaisa', 'total_cost_paisa', 'profit', 'profitPaisa',
  'profit_paisa', 'profitMarginPercent', 'marginBp', 'margin_bp', 'lineCosts',
]);
export function checkoutData<T>(value: T): T {
  if (Array.isArray(value)) return value.map(checkoutData) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !privateFields.has(key))
    .map(([key, child]) => [key, checkoutData(child)])) as T;
}
export function hasPrivateFields(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => privateFields.has(key) || hasPrivateFields(child));
}

/** Runtime previews still use the shared integer-money calculator. These zeros
 * are display placeholders, never financial report inputs or persisted costs. */
export function checkoutCart<T extends { cart: any[] }>(draft: T): T {
  const safe = checkoutData(draft);
  return { ...safe, cart: safe.cart.map(item => ({ ...item,
    unitCostPaisa: 0, totalCostPaisa: 0,
    product: { ...item.product, costPricePaisa: 0 },
    selectedVariations: (item.selectedVariations || []).map((option: any) => ({ ...option, costDeltaPaisa: 0 })),
  })) };
}
