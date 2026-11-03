import React from 'react';

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
};

const sizes = {
  compact: 'min-h-[calc(var(--pos-size-compact)-0.25rem)] px-3 text-xs',
  default: 'min-h-[calc(var(--pos-size-touch)-0.25rem)] px-3 text-sm',
} as const;

/**
 * One-of-many picker (payment method, date range, paper width). Each option is a
 * pressed/unpressed button inside a labelled group so screen readers announce state.
 */
export function SegmentedControl<T extends string>({
  label, value, options, onChange, disabled = false, size = 'compact', fill = false, wrap = false, className = '',
}: {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: keyof typeof sizes;
  /** Stretch options to share the full row width. */
  fill?: boolean;
  /** Let options wrap onto more lines on narrow screens. */
  wrap?: boolean;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label}
      className={`${fill ? 'flex' : 'inline-flex'} ${wrap ? 'flex-wrap' : ''} max-w-full gap-0.5 rounded-pos-panel border border-pos-border bg-pos-inset p-0.5 ${className}`.trim()}>
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => {
        const selected = optionValue === value;
        return (
          <button key={optionValue} type="button" disabled={disabled} aria-pressed={selected} onClick={() => onChange(optionValue)}
            className={`${sizes[size]} ${fill ? 'flex-1' : ''} inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-pos-control border font-semibold `
              + 'cursor-pointer transition-colors duration-[var(--pos-transition-fast)] disabled:cursor-not-allowed disabled:opacity-50 '
              + (selected
                ? 'border-pos-accent/50 bg-pos-selected text-pos-text'
                : 'border-transparent text-pos-muted hover:bg-pos-raised hover:text-pos-text')}>
            {Icon && <Icon className={`size-3.5 ${selected ? 'text-pos-accent' : ''}`} aria-hidden="true" />}
            {optionLabel}
          </button>
        );
      })}
    </div>
  );
}
