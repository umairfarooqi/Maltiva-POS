import React from 'react';

/** Status tag for stock, deals, table and order states. Pair color with a text label. */
export const badgeTones = {
  neutral: 'bg-pos-raised text-pos-secondary border-pos-border',
  accent: 'bg-pos-selected text-pos-accent border-pos-accent/40',
  success: 'bg-pos-success-bg text-pos-success-text border-pos-success-border',
  warning: 'bg-pos-warning-bg text-pos-warning-text border-pos-warning-border',
  danger: 'bg-pos-danger-bg text-pos-danger-text border-pos-danger-border',
  info: 'bg-pos-info-bg text-pos-info-text border-pos-info-border',
  reserved: 'bg-pos-reserved-bg text-pos-reserved-text border-pos-reserved-border',
} as const;

export type BadgeTone = keyof typeof badgeTones;

export function badgeClasses(tone: BadgeTone = 'neutral', className = '') {
  return `inline-flex items-center gap-1 rounded-pos-control border px-2 py-0.5 text-xs font-medium leading-tight whitespace-nowrap tabular-nums ${badgeTones[tone]} ${className}`.trim();
}

export function Badge({ tone = 'neutral', className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={badgeClasses(tone, className)} {...props} />;
}
