import React from 'react';

const sizes = { sm: 'size-8 text-xs', md: 'size-9 text-sm', lg: 'size-12 text-base' } as const;

/** Staff photo, or their initial when no photo is set. */
export function Avatar({ name, src, size = 'sm', className = '' }: { name: string; src?: string; size?: keyof typeof sizes; className?: string }) {
  const base = `${sizes[size]} shrink-0 rounded-full border ${className}`.trim();
  if (src) return <img src={src} alt={name} className={`${base} border-pos-border object-cover`} />;
  return (
    <span aria-hidden="true" className={`${base} inline-flex items-center justify-center border-pos-accent/40 bg-pos-selected font-semibold text-pos-accent`}>
      {(name || 'U').charAt(0).toUpperCase()}
    </span>
  );
}
