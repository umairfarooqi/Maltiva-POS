import React from 'react';
import { Dialog } from './ui/Dialog';
import { parseRupees } from '../shared/money';
import { formatPKR } from '../utils/formatCurrency';
import { Button } from './ui/Button';
import { Keypad, backspaceKey } from './ui/Keypad';

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
    <Dialog size="sm" label="Enter cash tendered" busy={busy} onClose={onClose}
      className="overflow-y-auto! p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Cash tendered</h2>
        <Button variant="ghost" type="button" disabled={busy} onClick={onClose}>Cancel</Button>
      </div>
      <p className="text-sm text-pos-secondary">Total {formatPKR(totalPaisa)}</p>
      <output aria-label="Entered cash amount" aria-live="polite" className="block rounded-lg bg-pos-inset p-3 my-2 text-2xl font-semibold tabular-nums">{value || '0'}</output>
      <Keypad disabled={busy} onPress={press} bottomRow={[{ value: '.' }, { value: '0' }, backspaceKey('Backspace')]} />
      <p role="status" className="min-h-6 mt-2 text-sm text-pos-secondary">
        {valid ? `Change ${formatPKR(paisa! - totalPaisa)}` : 'Enter an amount that covers the total.'}
      </p>
      <div className="flex gap-2 mt-2">
        <Button variant="outline" type="button" disabled={busy} onClick={() => press('Clear')}>Clear</Button>
        <Button variant="primary" type="button" disabled={busy || !valid} onClick={() => onConfirm(value)}
          className="flex-1">Use amount</Button>
      </div>
    </Dialog>
  );
}
