import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptsView } from '../src/components/ReceiptsView';
import { ReceiptsApi } from '../src/services/receiptsApi';
import { saleFixture } from './helpers/sale-fixtures';
vi.mock('../src/services/receiptsApi', () => ({ ReceiptsApi: { search: vi.fn(), get: vi.fn() } }));
const summary = { id: 'old-sale', orderNumber: '#OLD-RECEIPT', tokenNumber: 7, businessDate: '2026-10-02', createdAt: '2026-10-02T10:00:00Z', totalPaisa: 99000, paymentMethod: 'cash', cashierName: 'Other cashier' };
const page = { from: '2026-10-02', to: '2026-10-02', today: '2026-10-02', timeZone: 'Asia/Karachi', databaseGeneration: 'db', receipts: [summary], nextCursor: null };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(ReceiptsApi.search).mockResolvedValue(page); vi.mocked(ReceiptsApi.get).mockResolvedValue({ ...saleFixture('old'), id: summary.id, persistenceState: 'saved' }); });
describe('cashier receipt search', () => {
  it('opens a canonical saved receipt from another cashier and supports returning to the order', async () => {
    const user = userEvent.setup(), open = vi.fn(), back = vi.fn(); render(<ReceiptsView onOpenReceipt={open} onBack={back} />);
    expect(await screen.findByText(/Other cashier/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open receipt #OLD-RECEIPT' }));
    expect(ReceiptsApi.get).toHaveBeenCalledWith('old-sale', expect.any(AbortSignal));
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: 'old-sale', persistenceState: 'saved' }));
    await user.click(screen.getByRole('button', { name: 'Back to order' })); expect(back).toHaveBeenCalledOnce();
  });
  it('pages using the server cursor and the same business-date filters', async () => {
    vi.mocked(ReceiptsApi.search).mockResolvedValueOnce({ ...page, nextCursor: 'cursor-A' }).mockResolvedValueOnce({ ...page, receipts: [{ ...summary, id: 'older', orderNumber: '#OLDER' }] });
    const user = userEvent.setup(); render(<ReceiptsView onOpenReceipt={vi.fn()} onBack={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Older results' }));
    expect(await screen.findByText('#OLDER')).toBeVisible(); expect(screen.getByText('#OLD-RECEIPT')).toBeVisible();
    expect(ReceiptsApi.search).toHaveBeenLastCalledWith({ from: '2026-10-02', to: '2026-10-02' }, 'cursor-A', expect.any(AbortSignal));
  });
  it('ignores delayed results when filters change and aborts the obsolete request', async () => {
    let resolve!: (value: typeof page) => void; vi.mocked(ReceiptsApi.search).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const user = userEvent.setup(); render(<ReceiptsView onOpenReceipt={vi.fn()} onBack={vi.fn()} />);
    const signal = vi.mocked(ReceiptsApi.search).mock.calls[0][2];
    await user.type(screen.getByLabelText('Full order reference'), '#OTHER'); expect(signal.aborted).toBe(true);
    await act(async () => resolve(page)); expect(screen.queryByText('#OLD-RECEIPT')).not.toBeInTheDocument();
  });
  it('shows a retryable server error without presenting cached history as complete', async () => {
    vi.mocked(ReceiptsApi.search).mockRejectedValueOnce(new Error('POS server unavailable. Retry lookup.'));
    const user = userEvent.setup(); render(<ReceiptsView onOpenReceipt={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('POS server unavailable');
    await user.click(screen.getByRole('button', { name: 'Retry lookup' })); expect(await screen.findByText('#OLD-RECEIPT')).toBeVisible();
  });
  it('does not open a delayed receipt after leaving the screen', async () => {
    let resolve!: (value: any) => void; vi.mocked(ReceiptsApi.get).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const user = userEvent.setup(), open = vi.fn(); const view = render(<ReceiptsView onOpenReceipt={open} onBack={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Open receipt #OLD-RECEIPT' }));
    const signal = vi.mocked(ReceiptsApi.get).mock.calls[0][1]; view.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => resolve({ ...saleFixture('old'), id: 'old-sale', persistenceState: 'saved' })); expect(open).not.toHaveBeenCalled();
  });
});
