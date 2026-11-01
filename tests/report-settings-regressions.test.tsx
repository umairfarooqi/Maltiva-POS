import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProfitLossView } from '../src/components/ProfitLossView';
import { SettingsView } from '../src/components/SettingsView';
import { INITIAL_PRINTER_SETTINGS, INITIAL_USERS } from '../src/data/initialData';
import { saleFixture } from './helpers/sale-fixtures';
import type { Order } from '../src/types/pos';
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const orders: Order[] = [
  { ...saleFixture('mixed'), persistenceState: 'saved', createdAt: new Date().toISOString(), totalPaisa: 33000, items: [
    { ...saleFixture().items[0], productId: 'a', productName: 'Deal #1, "Special"', categoryId: 'a', categoryName: 'A "quoted"', totalPricePaisa: 11000, netRevenuePaisa: 10000, totalCostPaisa: 4000 },
    { ...saleFixture().items[0], productId: 'b', productName: 'Other', categoryId: 'b', totalPricePaisa: 22000, netRevenuePaisa: 20000, totalCostPaisa: 8000 },
  ] },
  { ...saleFixture('unrelated'), paymentMethod: 'card', persistenceState: 'saved', createdAt: new Date().toISOString(), items: [{ ...saleFixture().items[0], categoryId: 'b' }] },
  { ...saleFixture('cancelled'), status: 'cancelled', persistenceState: 'saved', createdAt: new Date().toISOString() },
];
const report = () => render(<ProfitLossView orders={orders} products={[]} categories={[{ id: 'a', name: 'A', icon: '', itemCount: 1, order: 1 }]} userRole="admin" />);
it('category filter scopes order count and payment revenue to the selected line snapshots', () => {
  report(); fireEvent.change(screen.getByLabelText('Profit category filter'), { target: { value: 'a' } });
  expect(screen.getByText('Revenue excluding tax across 1 orders')).toBeInTheDocument();
  const payments = screen.getByLabelText('Revenue by payment method');
  expect(within(payments).getByText('cash').parentElement).toHaveTextContent('100');
  expect(within(payments).getByText('card').parentElement).toHaveTextContent('0');
  fireEvent.change(screen.getByLabelText('Profit payment filter'), { target: { value: 'card' } });
  expect(screen.getByText('Revenue excluding tax across 0 orders')).toBeInTheDocument();
});
it('exports complete CSV through a Blob, preserving hash, comma, quotes and category names', async () => {
  let blob!: Blob;
  vi.stubGlobal('URL', { createObjectURL: vi.fn((data: Blob) => { blob = data; return 'blob:report'; }), revokeObjectURL: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  report(); fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
  const text = await new Promise<string>(done => { const reader = new FileReader(); reader.onload = () => done(String(reader.result)); reader.readAsText(blob); });
  expect(click).toHaveBeenCalledOnce(); expect(blob.type).toBe('text/csv;charset=utf-8');
  expect(text).toContain('"Deal #1, ""Special"""'); expect(text).toContain('"A ""quoted"""');
  expect(text).toContain('"Other"'); expect(text.split('\r\n')).toHaveLength(4);
});
it('manager settings are read-only while local appearance remains usable', () => {
  const save = vi.fn();
  render(<SettingsView settings={INITIAL_PRINTER_SETTINGS} currentUser={{ ...INITIAL_USERS[0], role: 'manager' }} onSaveSettings={save} onOpenTestPrint={vi.fn()} />);
  expect(screen.getByText(/Store, tax and printer settings are read-only/)).toBeInTheDocument();
  expect(screen.getByLabelText('Store Name')).toBeDisabled();
  expect(screen.getByLabelText('Sales Tax %')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Apply All Changes' })).toBeDisabled();
  expect(screen.getByRole('switch', { name: 'Dark mode' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Apply All Changes' })); expect(save).not.toHaveBeenCalled();
});

it('CSV escapes formula-like names while preserving negative financial values', async () => {
  let blob!: Blob;
  vi.stubGlobal('URL', { createObjectURL: vi.fn((data: Blob) => { blob = data; return 'blob:loss'; }), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const free = { ...orders[0], items: [{ ...orders[0].items[0], productName: '=SUM(1,2)', categoryName: '@category', netRevenuePaisa: 0, totalPricePaisa: 0, totalCostPaisa: 500 }] };
  render(<ProfitLossView orders={[free]} products={[]} categories={[]} userRole="admin" />);
  fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
  const text = await new Promise<string>(done => { const reader = new FileReader(); reader.onload = () => done(String(reader.result)); reader.readAsText(blob); });
  expect(text).toContain("'=SUM(1,2)"); expect(text).toContain("'@category");
  expect(text).toContain('"-5.00"'); expect(text).not.toContain("'-5.00");
});
