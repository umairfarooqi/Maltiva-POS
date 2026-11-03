import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from './Button';

/** Minus / count / plus control for cart lines, item options, menu cards and deal bundles. */
export function QuantityStepper({
  value, onDecrement, onIncrement, decrementLabel, incrementLabel,
  size = 'default', disabled = false, decrementDisabled = false, incrementDisabled = false,
  primaryIncrement = false, decrementTitle, className = '',
}: {
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementLabel: string;
  incrementLabel: string;
  size?: 'default' | 'compact';
  disabled?: boolean;
  decrementDisabled?: boolean;
  incrementDisabled?: boolean;
  /** Make plus the amber primary action (menu cards, where adding is the main intent). */
  primaryIncrement?: boolean;
  decrementTitle?: string;
  className?: string;
}) {
  const buttonSize = size === 'compact' ? 'icon-compact' : 'icon';
  const icon = size === 'compact' ? 'size-3.5' : 'size-4';
  return (
    <div className={`inline-flex shrink-0 items-center gap-1 rounded-pos-panel border border-pos-border bg-pos-inset p-0.5 ${className}`.trim()}>
      <Button variant="secondary" size={buttonSize} disabled={disabled || decrementDisabled} title={decrementTitle}
        aria-label={decrementLabel} onClick={event => { event.stopPropagation(); onDecrement(); }}>
        <Minus className={icon} aria-hidden="true" />
      </Button>
      <span className={`min-w-6 text-center font-semibold tabular-nums text-pos-text ${size === 'compact' ? 'text-xs' : 'text-sm'}`} aria-live="polite">
        {value}
      </span>
      <Button variant={primaryIncrement ? 'primary' : 'secondary'} size={buttonSize} disabled={disabled || incrementDisabled}
        aria-label={incrementLabel} onClick={event => { event.stopPropagation(); onIncrement(); }}>
        <Plus className={icon} aria-hidden="true" />
      </Button>
    </div>
  );
}
