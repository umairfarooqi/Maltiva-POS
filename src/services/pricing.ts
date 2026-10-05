import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { computeTotals, integer, MONEY_VERSION, safe } from '../shared/money';
import { fromMoneyRow } from './moneyMigration';
import type { OrderItem, Product } from '../types/pos';

export function problem(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
export function loadProduct(db: InstanceType<typeof Database>, id: string): Product | undefined {
  const row = fromMoneyRow('products', db.prepare('SELECT * FROM products WHERE id=?').get(id));
  if (!row) return;
  return { ...row, isAvailable: Boolean(row.isAvailable), isDeal: Boolean(row.isDeal), variations: JSON.parse(row.variations || '[]'), bundledProducts: JSON.parse(row.bundledProducts || '[]') };
}
export function taxSettings(db: InstanceType<typeof Database>) {
  const rate = db.prepare("SELECT value FROM settings WHERE key='taxBp'").get() as any;
  const mode = db.prepare("SELECT value FROM settings WHERE key='taxInclusive'").get() as any;
  return { taxBp: integer(Number(rate?.value || 0), 'Tax basis points'), taxInclusive: mode?.value === 'true' };
}
export function quoteSale(db: InstanceType<typeof Database>, input: any) {
  if (!input || !Array.isArray(input.items) || !input.items.length || input.items.length > 500) problem('Select valid items');
  if ((input.discountPaisa ?? input.discount ?? 0) !== 0 || (input.discountBp ?? 0) !== 0) problem('Discount approval is not available yet');
  const ids = new Set<string>();
  const items: OrderItem[] = input.items.map((line: any, n: number) => {
    if (!line || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) problem('Quantity must be a positive integer');
    const product = loadProduct(db, line.productId);
    if (!product || !product.isAvailable) problem('Product is unavailable');
    integer(product.pricePaisa, 'Catalog price'); integer(product.costPricePaisa, 'Catalog cost');
    const selected = line.selectedVariations ?? [];
    if (!Array.isArray(selected)) problem('Invalid variation selections');
    const used = new Set<string>();
    const selections = selected.map((v: any) => {
      const group = product.variations.find(g => g.id === v?.groupId);
      const option = group?.options.find(o => o.id === v?.optionId);
      if (!group || !option || used.has(`${group.id}:${option.id}`)) problem('Unknown or duplicate variation');
      integer(option.priceDeltaPaisa, 'Variation price', true); integer(option.costDeltaPaisa, 'Variation cost', true);
      used.add(`${group.id}:${option.id}`);
      return { groupId: group.id, groupName: group.name, optionId: option.id, optionName: option.name, priceDeltaPaisa: option.priceDeltaPaisa, costDeltaPaisa: option.costDeltaPaisa };
    });
    for (const group of product.variations) {
      const count = selections.filter(s => s.groupId === group.id).length;
      if ((group.required && !count) || (!group.multiSelect && count > 1)) problem(`Review ${group.name}`);
    }
    const unitPricePaisa = safe(BigInt(product.pricePaisa) + selections.reduce((s, v) => s + BigInt(v.priceDeltaPaisa), 0n));
    const unitCostPaisa = safe(BigInt(product.costPricePaisa) + selections.reduce((s, v) => s + BigInt(v.costDeltaPaisa), 0n));
    integer(unitPricePaisa); integer(unitCostPaisa);
    const id = line.id || `quote-item-${n}`;
    if (typeof id !== 'string' || ids.has(id)) problem('Duplicate item ID'); ids.add(id);
    return { id, productId: product.id, productName: product.name, categoryId: product.categoryId, categoryName: product.categoryName,
      unitPricePaisa, unitCostPaisa, quantity: line.quantity, totalPricePaisa: safe(BigInt(unitPricePaisa) * BigInt(line.quantity)),
      totalCostPaisa: safe(BigInt(unitCostPaisa) * BigInt(line.quantity)), selectedVariations: selections,
      notes: typeof line.notes === 'string' ? line.notes : undefined, bundledProducts: product.bundledProducts };
  });
  // Aggregate customized lines before checking stock. This also runs inside the
  // sale transaction, so concurrent commits cannot oversell a reviewed quote.
  const requested = new Map<string, number>();
  for (const item of items) requested.set(item.productId, (requested.get(item.productId) || 0) + item.quantity);
  for (const [productId, quantity] of requested) {
    const product = loadProduct(db, productId)!;
    if (quantity > product.stockQuantity) problem(`Insufficient stock for ${product.name}. Available: ${product.stockQuantity}. Review this order.`, 409);
  }
  const settings = taxSettings(db);
  const totals = computeTotals(items, settings);
  const pricingFingerprint = createHash('sha256').update(JSON.stringify({ settings, items: items.map(i => ({
    productId: i.productId, quantity: i.quantity, unitPricePaisa: i.unitPricePaisa,
    selected: i.selectedVariations.map(v => [v.groupId, v.optionId, v.priceDeltaPaisa]),
  })) })).digest('hex');
  return { moneySchemaVersion: MONEY_VERSION, ...settings, ...totals, profitMarginPercent: totals.marginBp / 100, pricingFingerprint,
    items: items.map((i, n) => ({ ...i, netRevenuePaisa: totals.lineNetRevenues[n], lineDiscountPaisa: totals.lineDiscounts[n] })) };
}
