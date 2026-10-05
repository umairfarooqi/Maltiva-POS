export const MONEY_VERSION = 2 as const;
export function integer(value: number, name = 'Money', signed = false): number {
  if (!Number.isSafeInteger(value) || (!signed && value < 0)) throw new Error(`${name} must be safe integer paisa`);
  return value;
}
export function safe(value: bigint): number { return integer(Number(value), 'Calculated amount', true); }
export function roundRatio(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new Error('Invalid divisor');
  return n < 0n ? -roundRatio(-n, d) : (n + d / 2n) / d;
}
export function parseRupees(input: string | number, signed = false): number {
  const text = String(input).trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match || (!signed && match[1])) throw new Error('Enter a valid amount with at most two decimal places');
  const value = BigInt(match[2]) * 100n + BigInt((match[3] || '').padEnd(2, '0'));
  return safe(match[1] ? -value : value);
}
// Only migration permits sub-paisa values, rounded once, with original rows archived.
export function legacyPaisa(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid legacy money value');
  const [mantissa, exponent = '0'] = Math.abs(value).toString().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const digits = BigInt(whole + fraction);
  const shift = 2 + Number(exponent) - fraction.length;
  const paisa = shift >= 0 ? digits * 10n ** BigInt(shift) : roundRatio(digits, 10n ** BigInt(-shift));
  return safe(value < 0 ? -paisa : paisa);
}
export function rupeeText(paisa: number): string {
  integer(paisa, 'Amount', true);
  const abs = Math.abs(paisa);
  return `${paisa < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
export function allocate(amount: number, weights: number[]): number[] {
  integer(amount); weights.forEach(w => integer(w));
  const sum = weights.reduce((s, w) => s + BigInt(w), 0n);
  if (!sum) { if (amount) throw new Error('Cannot allocate to zero weights'); return weights.map(() => 0); }
  const rows = weights.map((w, i) => ({ i, base: BigInt(amount) * BigInt(w) / sum, rem: BigInt(amount) * BigInt(w) % sum }));
  let left = BigInt(amount) - rows.reduce((s, r) => s + r.base, 0n);
  const ranked = [...rows].sort((a, b) => a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1);
  for (let i = 0; left > 0n; i++, left--) ranked[i].base++;
  return rows.map(r => safe(r.base));
}
export interface MoneyLine { unitPricePaisa: number; unitCostPaisa: number; quantity: number }
export function computeTotals(lines: MoneyLine[], opts: { taxBp: number; taxInclusive?: boolean; discountPaisa?: number; discountBp?: number }) {
  integer(opts.taxBp, 'Tax basis points');
  const linePrices = lines.map(l => {
    integer(l.unitPricePaisa); integer(l.unitCostPaisa);
    if (!Number.isSafeInteger(l.quantity) || l.quantity <= 0) throw new Error('Quantity must be a positive safe integer');
    return safe(BigInt(l.unitPricePaisa) * BigInt(l.quantity));
  });
  const subtotalPaisa = safe(linePrices.reduce((s, x) => s + BigInt(x), 0n));
  integer(opts.discountPaisa ?? 0); integer(opts.discountBp ?? 0);
  const discountPaisa = Math.min(subtotalPaisa, opts.discountBp !== undefined
    ? safe(roundRatio(BigInt(subtotalPaisa) * BigInt(opts.discountBp), 10000n)) : opts.discountPaisa ?? 0);
  const lineDiscounts = allocate(discountPaisa, linePrices);
  const taxable = subtotalPaisa - discountPaisa;
  const taxPaisa = safe(roundRatio(BigInt(taxable) * BigInt(opts.taxBp), opts.taxInclusive ? 10000n + BigInt(opts.taxBp) : 10000n));
  const totalPaisa = opts.taxInclusive ? taxable : safe(BigInt(taxable) + BigInt(taxPaisa));
  const netRevenuePaisa = opts.taxInclusive ? taxable - taxPaisa : taxable;
  const postDiscount = linePrices.map((p, i) => p - lineDiscounts[i]);
  const lineTaxes = allocate(taxPaisa, postDiscount);
  const lineNetRevenues = postDiscount.map((p, i) => opts.taxInclusive ? p - lineTaxes[i] : p);
  const lineCosts = lines.map(l => safe(BigInt(l.unitCostPaisa) * BigInt(l.quantity)));
  const totalCostPaisa = safe(lineCosts.reduce((s, c) => s + BigInt(c), 0n));
  const profitPaisa = netRevenuePaisa - totalCostPaisa;
  const marginBp = netRevenuePaisa ? safe(roundRatio(BigInt(profitPaisa) * 10000n, BigInt(netRevenuePaisa))) : 0;
  return { subtotalPaisa, discountPaisa, taxPaisa, totalPaisa, netRevenuePaisa, totalCostPaisa, profitPaisa, marginBp, lineDiscounts, lineTaxes, lineNetRevenues, lineCosts, linePrices };
}
