import React from 'react';
import { Dialog } from './ui/Dialog';
import { parseRupees } from '../shared/money';
import { formatPKR } from '../utils/formatCurrency';

export function CashKeypad({ totalPaisa, initialValue, busy, onClose, onConfirm }: {
  totalPaisa: number; initialValue: string; busy: boolean;
  onClose: () => void; onConfirm: (value: string) => void;
}) {
  const [value, setValue] = React.useState(initialValue);
  const [replace, setReplace] = React.useState(true);
  let paisa: number | null = null;
  try { paisa = parseRupees(value); } catch { /* An unfinished decimal remains editable. */ }
  const valid = paisa !== null && paisa >= totalPaisa;
  const press = (key: string) => {
    if (key === 'Clear') { setValue(''); setReplace(true); return; }
    if (key === 'Backspace') { setValue(previous => previous.slice(0, -1)); setReplace(false); return; }
    const next = (replace ? '' : value) + key;
    if (/^\d{0,12}(\.\d{0,2})?$/.test(next)) { setValue(next === '.' ? '0.' : next); setReplace(false); }
  };
  React.useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (busy || event.ctrlKey || event.metaKey || event.altKey) return;
      if (/^[0-9.]$/.test(event.key) || event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        press(event.key === 'Delete' ? 'Clear' : event.key);
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [value, replace, busy]);
  return (
    <Dialog label="Enter cash tendered" busy={busy} onClose={onClose}
      className="w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl bg-pos-surface border border-pos-border p-4 text-pos-text">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Cash tendered</h2>
        <button type="button" disabled={busy} onClick={onClose} className="min-h-11 px-3 rounded-lg hover:bg-pos-raised">Cancel</button>
      </div>
      <p className="text-sm text-pos-secondary">Total {formatPKR(totalPaisa)}</p>
      <output aria-label="Entered cash amount" aria-live="polite" className="block rounded-lg bg-pos-inset p-3 my-2 text-2xl font-mono font-bold">{value || '0'}</output>
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'Backspace'].map(key => (
          <button key={key} type="button" disabled={busy} onClick={() => press(key)}
            className="h-12 rounded-lg bg-pos-inset hover:bg-pos-raised border border-pos-control font-bold">{key}</button>
        ))}
      </div>
      <p role="status" className="min-h-6 mt-2 text-sm text-pos-secondary">
        {valid ? `Change ${formatPKR(paisa! - totalPaisa)}` : 'Enter an amount that covers the total.'}
      </p>
      <div className="flex gap-2 mt-2">
        <button type="button" disabled={busy} onClick={() => press('Clear')} className="min-h-11 px-4 rounded-lg border border-pos-control">Clear</button>
        <button type="button" disabled={busy || !valid} onClick={() => onConfirm(value)}
          className="min-h-11 flex-1 rounded-lg bg-pos-action text-white font-bold disabled:opacity-40">Use amount</button>
      </div>
    </Dialog>
  );
}
