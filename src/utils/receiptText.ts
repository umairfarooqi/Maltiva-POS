import type { Order, PrinterSettings } from '../types/pos';
import { formatPKR } from './formatCurrency';
import { assignedPickupToken } from './orderReference';

export function receiptText(order: Order, settings: PrinterSettings, paperWidth: '58mm' | '80mm', slip: 'both' | 'customer' | 'kitchen'): string {
  const columns = paperWidth === '58mm' ? 32 : 42;
  const length = (text: string) => Array.from(text).length;
  const wrap = (text: string, width: number): string[] => text.split(/\r?\n/).flatMap(paragraph => {
    const result: string[] = [];
    let line = '';
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      if (line && length(line) + length(word) + 1 > width) { result.push(line); line = ''; }
      const chars = Array.from(word);
      while (chars.length > width) { result.push(chars.splice(0, width).join('')); }
      const tail = chars.join('');
      line = line ? `${line} ${tail}` : tail;
    }
    result.push(line);
    return result;
  });
  const lines: string[] = [];
  const add = (text: string, indent = '') => lines.push(...wrap(text, columns - length(indent)).map(line => indent + line));
  const center = (text: string) => wrap(text, columns).forEach(line => lines.push(' '.repeat(Math.floor((columns - length(line)) / 2)) + line));
  const row = (label: string, value: string) => {
    if (length(value) >= columns) { add(label); add(value); return; }
    const parts = wrap(label, columns - length(value) - 1);
    lines.push(...parts.slice(0, -1));
    const last = parts.at(-1)!;
    lines.push(last + ' '.repeat(columns - length(last) - length(value)) + value);
  };
  const rule = (char = '-') => lines.push(char.repeat(columns));
  const date = new Date(order.createdAt);
  const dateText = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const assignedToken = assignedPickupToken(order);
  const token = assignedToken ?? 'Awaiting save';
  const referenceLabel = assignedToken === null ? 'REFERENCE' : 'ORDER';
  const status = order.persistenceState === 'pending' ? 'PENDING — awaiting server save'
    : order.persistenceState === 'draft' ? 'DRAFT — unpaid preview'
    : order.persistenceState === 'rejected' ? 'REJECTED — unpaid' : '';
  const details = (item: Order['items'][number], kitchen = false) => {
    item.bundledProducts?.forEach(bundle => add(`${kitchen ? '->' : '*'} ${bundle.quantity}x ${bundle.productName}`, '  '));
    item.selectedVariations?.forEach(variation => add(`+ ${variation.optionName}`, '  '));
    if (item.notes) add(`${kitchen ? 'SPECIAL' : 'Note'}: ${item.notes}`, '  ');
  };

  if (slip === 'both' || slip === 'customer') {
    rule('=');
    if (status) add(status);
    center(settings.storeName || 'Maltiva Crust');
    center('COUNTER TAKEAWAY');
    center('Fresh food. Clear pickup.');
    if (settings.address) center(settings.address);
    if (settings.whatsApp) center(`WhatsApp: ${settings.whatsApp}`);
    rule();
    add(`TOKEN #: ${token} [TAKEAWAY]`);
    add(`${referenceLabel}: ${order.orderNumber}`);
    add(`DATE: ${dateText} ${time}`);
    add(`CASHIER: ${order.cashierName}`);
    rule(); row('QTY ITEM', 'AMOUNT'); rule();
    order.items.forEach(item => { row(`${item.quantity}x ${item.productName}`, formatPKR(item.totalPricePaisa)); details(item); });
    rule(); row('SUBTOTAL:', formatPKR(order.subtotalPaisa));
    if (order.taxPaisa > 0) row('TAX:', formatPKR(order.taxPaisa));
    row('TOTAL PAYABLE:', formatPKR(order.totalPaisa));
    row('PAYMENT MODE:', order.paymentMethod.toUpperCase());
    rule(); center(`Thank you for ordering at ${settings.storeName || 'Maltiva Crust'}!`);
    center('Fresh food. Clear pickup.');
    if (settings.whatsApp) center(`Order / WhatsApp: ${settings.whatsApp}`);
    rule('=');
  }
  if (slip === 'both' || slip === 'kitchen') {
    if (slip === 'both') { lines.push(''); center('--- TEAR HERE ---'); lines.push(''); }
    rule('=');
    if (status) add(status);
    center('*** KITCHEN SLIP - TAKEAWAY ***');
    center(`TOKEN #: ${token}`);
    add(`${referenceLabel}: ${order.orderNumber} | TIME: ${time}`);
    add(`CASHIER: ${order.cashierName}`);
    rule(); add('QTY PREPARATION ITEM'); rule();
    order.items.forEach(item => { add(`[ ] ${item.quantity}x ${item.productName.toUpperCase()}`); details(item, true); });
    rule(); center('READY FOR COUNTER PICKUP'); rule('=');
  }
  return lines.join('\n');
}
