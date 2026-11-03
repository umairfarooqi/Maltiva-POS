import React, { forwardRef } from 'react';

/**
 * Shared text field styling for input, select and textarea. Callers pass layout only
 * (width, icon padding such as pl-9, alignment); colors and sizing come from pos-theme.css.
 */
export const fieldSizes = {
  compact: 'h-pos-compact px-3 text-sm',
  default: 'h-pos-touch px-3 text-sm',
} as const;

export type FieldSize = keyof typeof fieldSizes;

const base = 'min-w-0 rounded-pos-control border border-pos-control bg-pos-inset text-pos-text placeholder:text-pos-muted '
  + 'transition-colors duration-[var(--pos-transition-fast)] hover:border-pos-muted focus-visible:border-pos-accent '
  + 'disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-pos-surface aria-[invalid=true]:border-pos-danger-border';

export function fieldClasses({ size = 'default', className = '' }: { size?: FieldSize; className?: string } = {}) {
  return `${base} ${fieldSizes[size]} ${className}`.trim();
}

type Sized = { size?: FieldSize };

export const Input = forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & Sized>(
  function Input({ size, className, ...props }, ref) {
    return <input ref={ref} className={fieldClasses({ size, className })} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & Sized>(
  function Select({ size, className, ...props }, ref) {
    return <select ref={ref} className={fieldClasses({ size, className: `cursor-pointer ${className ?? ''}` })} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={`${base} px-3 py-2 text-sm leading-relaxed ${className ?? ''}`.trim()} {...props} />;
  },
);
