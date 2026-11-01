import React, { useEffect, useRef, useState } from 'react';
import { ReceiptsApi, ReceiptFilters, ReceiptSummary } from '../services/receiptsApi';
import { Order } from '../types/pos';
import { formatPKR } from '../utils/formatCurrency';

const control = 'min-h-11 rounded-md border border-pos-control bg-pos-inset px-3 py-2 text-sm disabled:opacity-50';
export function ReceiptsView({ onOpenReceipt, onBack }: { onOpenReceipt: (order: Order) => void; onBack: () => void }) {
  const [filters, setFilters] = useState<ReceiptFilters>({});
  const [rows, setRows] = useState<ReceiptSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [zone, setZone] = useState('Asia/Karachi');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const request = useRef(0), controller = useRef<AbortController | null>(null);
  const begin = () => { controller.current?.abort(); const abort = new AbortController(); controller.current = abort; return { id: ++request.current, abort }; };
  const load = async (chosen: ReceiptFilters, page: string | null = null) => {
    const { id, abort } = begin(); setBusy(true); setError('');
    if (!page) { setRows([]); setCursor(null); setSearched(false); }
    try {
      const result = await ReceiptsApi.search(chosen, page, abort.signal);
      if (id !== request.current || abort.signal.aborted) return;
      setRows(previous => page ? [...previous, ...result.receipts.filter(row => !previous.some(old => old.id === row.id))] : result.receipts);
      setFilters({ ...chosen, from: result.from, to: result.to }); setZone(result.timeZone); setCursor(result.nextCursor); setSearched(true);
    } catch (error) {
      if (id === request.current && !abort.signal.aborted) setError((error as Error).message || 'Receipt lookup needs the POS server. Keep your cart and retry.');
    } finally { if (id === request.current) setBusy(false); }
  };
  useEffect(() => { void load({}); return () => { request.current++; controller.current?.abort(); }; }, []);
  const change = (key: keyof ReceiptFilters, value: string) => {
    request.current++; controller.current?.abort(); setBusy(false); setRows([]); setCursor(null); setSearched(false); setError('');
    setFilters(previous => ({ ...previous, [key]: value }));
  };
  const open = async (id: string) => {
    const current = begin(); setBusy(true); setError('');
    try {
      const order = await ReceiptsApi.get(id, current.abort.signal);
      if (current.id === request.current && !current.abort.signal.aborted) onOpenReceipt(order);
    } catch (error) { if (current.id === request.current && !current.abort.signal.aborted) setError((error as Error).message || 'Could not open receipt. Retry when the POS server is available.'); }
    finally { if (current.id === request.current) setBusy(false); }
  };
  return <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-pos-canvas" aria-labelledby="receipts-title">
    <div className="shrink-0 border-b border-pos-divider p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 id="receipts-title" className="text-lg font-bold">Receipts</h1>
        <button type="button" className={control} onClick={onBack}>Back to order</button></div>
      <p className="mt-1 text-sm text-pos-secondary">Find and reprint saved receipts. Your active cart stays in place.</p>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 space-y-4" tabIndex={0} role="region" aria-label="Receipt search and results">
      <form onSubmit={event => { event.preventDefault(); void load(filters); }} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm" htmlFor="receipt-from">From business date<input id="receipt-from" type="date" className={control} value={filters.from || ''} onChange={event => change('from', event.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm" htmlFor="receipt-to">To business date<input id="receipt-to" type="date" className={control} value={filters.to || ''} onChange={event => change('to', event.target.value)} /></label>
        <label className="flex min-w-0 flex-col gap-1 text-sm" htmlFor="receipt-reference">Full order reference<input id="receipt-reference" type="text" maxLength={200} className={control} value={filters.reference || ''} onChange={event => change('reference', event.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm" htmlFor="receipt-token">Token<input id="receipt-token" type="text" inputMode="numeric" maxLength={16} className={`${control} w-28`} value={filters.token || ''} onChange={event => change('token', event.target.value)} /></label>
        <button type="submit" disabled={busy} className={`${control} bg-pos-action text-white font-semibold`}>Search receipts</button>
      </form>
      <p className="text-xs text-pos-secondary">Dates follow the store business day. Blank dates mean today; choose up to 31 days. A full order reference searches all dates. A token needs one business date.</p>
      {busy && <p role="status">Loading saved receipts…</p>}
      {error && <div role="alert" className="text-sm text-pos-danger-text">{error} <button type="button" disabled={busy} className={control} onClick={() => void load(filters)}>Retry lookup</button></div>}
      {!busy && searched && !rows.length && !error && <p role="status">No saved receipts found. Check the date, order reference or token.</p>}
      {rows.length > 0 && <ul className="divide-y divide-pos-divider border-y border-pos-divider">
        {rows.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0"><p className="break-all font-semibold">{row.orderNumber} <span className="text-pos-secondary">· {row.tokenNumber > 0 ? `Token #${row.tokenNumber}` : 'Legacy receipt'}</span></p>
            <p className="text-sm text-pos-secondary">{new Date(row.createdAt).toLocaleString(undefined, { timeZone: zone })} · {row.cashierName}</p>
            <p className="text-sm">{formatPKR(row.totalPaisa)} · {row.paymentMethod}</p></div>
          <button type="button" disabled={busy} className={control} aria-label={`Open receipt ${row.orderNumber}`} onClick={() => void open(row.id)}>Open receipt</button>
        </li>)}
      </ul>}
      {cursor && <button type="button" className={control} disabled={busy} onClick={() => void load(filters, cursor)}>Older results</button>}
    </div>
  </section>;
}
