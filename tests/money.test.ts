import { describe, expect, it } from 'vitest';
import { allocate, computeTotals, legacyPaisa, parseRupees, rupeeText } from '../src/shared/money';
describe('integer money', () => {
  it('converts legacy decimal half-paisa ties once, including signed values and exponents', () => {
    expect(legacyPaisa(1.005)).toBe(101); expect(legacyPaisa(-1.005)).toBe(-101);
    expect(legacyPaisa(1e-7)).toBe(0); expect(legacyPaisa(333.335)).toBe(33334);
  });
  it('excludes tax from profit and matches inclusive tax', () => {
    const exclusive = computeTotals([{ unitPricePaisa: 33300, unitCostPaisa: 20000, quantity: 1 }], { taxBp: 1000 });
    expect(exclusive).toMatchObject({ subtotalPaisa: 33300, taxPaisa: 3330, totalPaisa: 36630, netRevenuePaisa: 33300, profitPaisa: 13300 });
    expect(computeTotals([{ unitPricePaisa: 36630, unitCostPaisa: 20000, quantity: 1 }], { taxBp: 1000, taxInclusive: true })).toMatchObject({ taxPaisa: 3330, netRevenuePaisa: 33300, profitPaisa: 13300 });
  });
  it('rounds half a paisa up and allocates exact discounts and inclusive tax', () => {
    expect(computeTotals([{ unitPricePaisa: 5, unitCostPaisa: 0, quantity: 1 }], { taxBp: 1000 }).taxPaisa).toBe(1);
    expect(allocate(2, [1, 1, 1])).toEqual([1, 1, 0]);
    const t = computeTotals(Array(3).fill({ unitPricePaisa: 33300, unitCostPaisa: 0, quantity: 1 }), { taxBp: 1000, taxInclusive: true, discountPaisa: 1 });
    expect(t.lineNetRevenues.reduce((a, b) => a + b, 0)).toBe(t.netRevenuePaisa);
    expect(t.lineDiscounts.reduce((a, b) => a + b, 0)).toBe(1);
  });
  it('handles zero revenue and negative profit', () => {
    expect(computeTotals([{ unitPricePaisa: 1, unitCostPaisa: 2, quantity: 1 }], { taxBp: 0, discountBp: 10000 })).toMatchObject({ profitPaisa: -2, marginBp: 0 });
  });
  it('parses and formats decimal inputs without accepting extra precision or overflow', () => {
    expect(parseRupees('333.30')).toBe(33330); expect(rupeeText(-33330)).toBe('-333.30');
    for (const input of ['NaN', '1.001', '1e3', '-1', '9007199254740991']) expect(() => parseRupees(input)).toThrow();
    expect(() => computeTotals([{ unitPricePaisa: Number.MAX_SAFE_INTEGER, unitCostPaisa: 0, quantity: 2 }], { taxBp: 0 })).toThrow();
  });
});
