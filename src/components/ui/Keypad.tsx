import React from 'react';
import { Delete } from 'lucide-react';
import { Button } from './Button';

export type KeypadKey = { value: string; label?: React.ReactNode; ariaLabel?: string; secondary?: boolean };

const DIGITS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(value => ({ value }));
export const backspaceKey = (ariaLabel: string): KeypadKey => ({
  value: 'Backspace', ariaLabel, secondary: true, label: <Delete className="size-5" aria-hidden="true" />,
});

/** 3-column number pad shared by PIN login and cash tendered. `bottomRow` fills the last row (e.g. C / 0 / backspace). */
export function Keypad({ bottomRow, onPress, disabled = false, className = '' }: {
  bottomRow: [KeypadKey, KeypadKey, KeypadKey];
  onPress: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-3 gap-1.5 ${className}`.trim()}>
      {[...DIGITS, ...bottomRow].map(key => (
        <Button key={key.value} variant={key.secondary ? 'ghost' : 'secondary'} size="key" disabled={disabled}
          aria-label={key.ariaLabel} onClick={() => onPress(key.value)}
          className={key.secondary ? 'border border-pos-border bg-pos-inset' : ''}>
          {key.label ?? key.value}
        </Button>
      ))}
    </div>
  );
}
