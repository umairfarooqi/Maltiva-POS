import React from 'react';

const tones = {
  danger: 'bg-pos-danger-bg text-pos-danger-text border-pos-danger-border',
  warning: 'bg-pos-warning-bg text-pos-warning-text border-pos-warning-border',
  success: 'bg-pos-success-bg text-pos-success-text border-pos-success-border',
  info: 'bg-pos-info-bg text-pos-info-text border-pos-info-border',
} as const;

export type AlertTone = keyof typeof tones;

/** Tinted, bordered message box for errors, warnings and confirmations. */
export function alertClasses(tone: AlertTone, className = '') {
  return `rounded-pos-control border px-3 py-2.5 text-sm ${tones[tone]} ${className}`.trim();
}

export function Alert({ tone, className, role, ...props }: React.HTMLAttributes<HTMLDivElement> & { tone: AlertTone }) {
  return <div role={role ?? (tone === 'danger' ? 'alert' : 'status')} className={alertClasses(tone, className)} {...props} />;
}
