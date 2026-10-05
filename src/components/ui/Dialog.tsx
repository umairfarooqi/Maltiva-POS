import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
const dialogs: HTMLDivElement[] = [];
let originalRootInert = false;
let originalBodyOverflow = '';

/** Shared modal behavior: focus containment, Escape, background isolation and focus return. */
export function Dialog({ children, label, onClose, busy = false, className = '', backdropClassName = '', role = 'dialog' }: {
  role?: 'dialog' | 'alertdialog';
  children: React.ReactNode; label: string; onClose: () => void; busy?: boolean;
  className?: string; backdropClassName?: string;
}) {
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
    ) || []).filter(element => !element.hidden && !element.closest('[hidden]'));
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
    <div className={`fixed inset-0 z-[70] bg-black/65 flex items-center justify-center p-4 ${backdropClassName}`}
      onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={ref} data-pos-dialog role={role} aria-modal="true" aria-label={label} aria-busy={busy} tabIndex={-1} className={className}>
        {children}
      </div>
    </div>, document.body);
}
