import React, { forwardRef } from 'react';

/**
 * Shared POS button. Colors, radius, type and heights come from pos-theme.css tokens,
 * so callers pass only layout classes (width, flex, margins) through `className`.
 */
export const buttonVariants = {
  primary: 'bg-pos-action text-pos-action-text hover:bg-pos-action-hover',
  secondary: 'bg-pos-raised text-pos-text border border-pos-border hover:bg-pos-strong hover:text-pos-strong-text',
  outline: 'border border-pos-border text-pos-secondary hover:bg-pos-raised hover:text-pos-text',
  ghost: 'text-pos-secondary hover:bg-pos-raised hover:text-pos-text',
  destructive: 'bg-pos-danger-action text-pos-danger-action-text hover:bg-pos-danger-hover',
  /** Softer destructive for reversible or pre-confirmation actions (clear cart, clear cache). */
  'soft-destructive': 'bg-pos-danger-bg text-pos-danger-text border border-pos-danger-border hover:bg-pos-danger-action hover:text-pos-danger-action-text',
  /** Icon-only destructive (remove line, delete row). */
  'ghost-destructive': 'text-pos-danger-text hover:bg-pos-danger-bg',
  link: 'text-pos-accent underline-offset-4 hover:underline',
} as const;

export const buttonSizes = {
  compact: 'h-pos-compact px-3 text-xs',
  default: 'min-h-pos-touch px-4 text-sm',
  checkout: 'min-h-pos-checkout px-5 text-sm',
  icon: 'size-pos-touch shrink-0',
  'icon-compact': 'size-pos-compact shrink-0',
  /** No box: for link-style buttons sitting inside text or section headers. */
  inline: 'px-1 py-0.5 text-xs',
} as const;

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

const base = 'inline-flex items-center justify-center gap-2 rounded-pos-control font-semibold leading-tight cursor-pointer select-none '
  + 'transition-colors duration-[var(--pos-transition-fast)] disabled:cursor-not-allowed disabled:opacity-50';

export function buttonClasses({ variant = 'primary', size = 'default', className = '' }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return `${base} ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`.trim();
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant, size, className, type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={buttonClasses({ variant, size, className })} {...props} />;
});
