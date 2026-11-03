import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './Button';
const dialogs: HTMLDivElement[] = [];
let originalRootInert = false;
let originalBodyOverflow = '';

const panelSizes = {
  sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '2xl': 'max-w-2xl', '3xl': 'max-w-3xl',
} as const;
export type DialogSize = keyof typeof panelSizes;

/** Shared modal behavior: focus containment, Escape, background isolation and focus return.
 * Pass `size` for the standard panel (surface, border, radius, viewport-capped height); omit it
 * for custom shells such as the navigation drawer, and style through `className`. */
export function Dialog({ children, label, onClose, busy = false, size, className = '', backdropClassName = '', role = 'dialog' }: {
  role?: 'dialog' | 'alertdialog';
  children: React.ReactNode; label: string; onClose: () => void; busy?: boolean;
  size?: DialogSize; className?: string; backdropClassName?: string;
}) {
  const panel = size
    ? `pos-panel flex w-full ${panelSizes[size]} max-h-[calc(100dvh-2rem)] flex-col overflow-hidden shadow-xl ${className}`.trim()
    : className;
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const locked = useRef(busy); locked.current = busy;
  useEffect(() => {
    const element = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    if (!dialogs.length) {
      originalRootInert = root?.inert || false;
      originalBodyOverflow = document.body.style.overflow;
    }
    const previousDialog = dialogs.at(-1);
    if (previousDialog) previousDialog.inert = true;
    if (ref.current) dialogs.push(ref.current);
    if (root) root.inert = true;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
    ) || []).filter(element => {
      if (element.hidden || element.closest('[hidden], [inert]')) return false;
      for (let parent: HTMLElement | null = element; parent && parent !== ref.current; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      }
      return true;
    });
    (focusable()[0] || ref.current)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (dialogs.at(-1) !== ref.current) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!locked.current) close.current(); }
      if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0]; const last = elements.at(-1);
        if (!first) { event.preventDefault(); ref.current?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    const containFocus = (event: FocusEvent) => {
      if (dialogs.at(-1) === ref.current && !ref.current?.contains(event.target as Node)) (focusable()[0] || ref.current)?.focus();
    };
    document.addEventListener('focusin', containFocus);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', containFocus);
      const index = dialogs.indexOf(element);
      if (index >= 0) dialogs.splice(index, 1);
      if (previousDialog) previousDialog.inert = false;
      if (root) root.inert = dialogs.length > 0 || originalRootInert;
      document.body.style.overflow = dialogs.length > 0 ? 'hidden' : originalBodyOverflow;
      if (trigger?.isConnected && !trigger.closest('[inert]')) trigger.focus();
    };
  }, []);
  return createPortal(
    <div className={`fixed inset-0 z-[70] bg-pos-overlay flex items-center justify-center p-4 ${backdropClassName}`}
      onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={ref} data-pos-dialog role={role} aria-modal="true" aria-label={label} aria-busy={busy} tabIndex={-1} className={panel}>
        {children}
      </div>
    </div>, document.body);
}

/** Title row with optional description, leading media and a close button. */
export function DialogHeader({ title, eyebrow, description, media, onClose, closeLabel, closeDisabled = false, className = '' }: {
  title: React.ReactNode; eyebrow?: React.ReactNode; description?: React.ReactNode; media?: React.ReactNode;
  onClose?: () => void; closeLabel?: string; closeDisabled?: boolean; className?: string;
}) {
  return (
    <div className={`flex shrink-0 items-start justify-between gap-3 ${className}`.trim()}>
      <div className="flex min-w-0 items-center gap-3">
        {media}
        <div className="min-w-0 break-words">
          {eyebrow && <p className="text-xs font-medium text-pos-accent">{eyebrow}</p>}
          <h3 className="text-base font-semibold leading-tight text-pos-text">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-pos-muted">{description}</p>}
        </div>
      </div>
      {onClose && (
        <Button variant="ghost" size="icon" className="-mr-2 -mt-1" disabled={closeDisabled} onClick={onClose} aria-label={closeLabel ?? 'Close'}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
