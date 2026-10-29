import { describe, expect, it } from 'vitest';
import { receiptText } from '../src/utils/receiptText';
import { INITIAL_PRINTER_SETTINGS } from '../src/data/initialData';
import { saleFixture } from './helpers/sale-fixtures';

describe('receipt text width', () => {
  it.each(['58mm', '80mm'] as const)('keeps both slips within %s without losing item details', paperWidth => {
    const order = saleFixture('long-text');
    const name = 'SupercalifragilisticChickenBurgerWithExtraCheese';
    order.items[0] = { ...order.items[0], productName: name, notes: 'No onion\nExtra cheese please',
      selectedVariations: [{ groupId: 'size', groupName: 'Size', optionId: 'large', optionName: 'ExtraLargeWithAdditionalCheeseAndSpecialSauce', priceDeltaPaisa: 0, costDeltaPaisa: 0 }],
      bundledProducts: [{ productId: 'side', productName: 'VeryLongUnbrokenSideDishNameThatMustNotBeTruncated', quantity: 2 }] };
    const text = receiptText(order, { ...INITIAL_PRINTER_SETTINGS, storeName: 'A very long restaurant name that needs several lines', address: 'a'.repeat(100) }, paperWidth, 'both');
    const columns = paperWidth === '58mm' ? 32 : 42;
    expect(text.split('\n').every(line => Array.from(line).length <= columns)).toBe(true);
    expect(text.replace(/\s/g, '')).toContain(name);
    expect(text.replace(/\s/g, '')).toContain(name.toUpperCase());
    expect(text).toContain('Note: No onion');
    expect(text).toContain('SPECIAL: No onion');
    expect(text).toContain('Extra cheese please');
    expect(text).toContain('Rs. 990');
    expect(text.split('\n').some(line => line.endsWith('Rs. 990') && line.length === columns)).toBe(true);
  });

  it('includes only the requested slip', () => {
    const order = saleFixture('single-slip');
    expect(receiptText(order, INITIAL_PRINTER_SETTINGS, '58mm', 'customer')).not.toContain('KITCHEN SLIP');
    expect(receiptText(order, INITIAL_PRINTER_SETTINGS, '58mm', 'kitchen')).not.toContain('TOTAL PAYABLE');
  });
});
