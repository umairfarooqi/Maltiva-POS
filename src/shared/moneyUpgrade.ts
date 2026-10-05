import { allocate, integer, legacyPaisa, MONEY_VERSION, roundRatio, safe } from './money';

const fields: Record<string, string> = { price: 'pricePaisa', costPrice: 'costPricePaisa', priceDelta: 'priceDeltaPaisa', costDelta: 'costDeltaPaisa', unitPrice: 'unitPricePaisa', rawCost: 'rawCostPaisa', unitCost: 'unitCostPaisa', totalPrice: 'totalPricePaisa', totalCost: 'totalCostPaisa', subtotal: 'subtotalPaisa', tax: 'taxPaisa', discount: 'discountPaisa', total: 'totalPaisa', profit: 'profitPaisa', cashTendered: 'cashTenderedPaisa', changeDue: 'changeDuePaisa', totalSpent: 'totalSpentPaisa' };
export function upgradeMoney<T = any>(input: any): T {
  if (Array.isArray(input)) return input.map(x => upgradeMoney(x)) as T;
  if (!input || typeof input !== 'object') return input;
  if (input.moneySchemaVersion !== undefined && ![1, MONEY_VERSION].includes(input.moneySchemaVersion)) throw new Error('Unsupported money schema version');
  const out: any = {};
  for (const [key, value] of Object.entries(input)) {
    if (fields[key]) {
      if (input.moneySchemaVersion === MONEY_VERSION || input[fields[key]] !== undefined) throw new Error('Mixed rupee and paisa payload');
      out[fields[key]] = value === null ? null : legacyPaisa(value);
    } else out[key] = upgradeMoney(value);
  }
  for (const target of Object.values(fields)) if (out[target] !== undefined && out[target] !== null) integer(out[target], target, true);
  if (input.taxRatePercent !== undefined) { out.taxBp = legacyPaisa(input.taxRatePercent); delete out.taxRatePercent; }
  out.moneySchemaVersion = MONEY_VERSION;
  if (out.items && out.totalPaisa !== undefined) {
    if (!out.persistenceState && input.synced === true) out.persistenceState = 'saved';
    out.netRevenuePaisa = out.totalPaisa - (out.taxPaisa ?? 0);
    const knownCost = out.items.every((i: any) => i.totalCostPaisa !== null && i.totalCostPaisa !== undefined);
    out.profitIncomplete = Boolean(input.profitIncomplete) || !out.items.length || !knownCost || out.totalCostPaisa === null || out.totalCostPaisa === undefined ||
      out.items.reduce((sum: number, item: any) => sum + (item.totalCostPaisa ?? 0), 0) !== out.totalCostPaisa;
    out.profitPaisa = out.profitIncomplete ? null : out.netRevenuePaisa - out.totalCostPaisa;
    out.marginBp = !out.profitIncomplete && out.netRevenuePaisa > 0 ? safe(roundRatio(BigInt(out.profitPaisa) * 10000n, BigInt(out.netRevenuePaisa))) : 0;
    out.profitMarginPercent = out.marginBp / 100;
    if (out.items.some((i: any) => i.netRevenuePaisa === undefined)) {
      const revenues = allocate(out.netRevenuePaisa, out.items.map((i: any) => i.totalPricePaisa));
      out.items = out.items.map((i: any, n: number) => ({ ...i, netRevenuePaisa: revenues[n], legacyDerived: true }));
    }
  }
  return out;
}
