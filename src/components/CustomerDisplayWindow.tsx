import React, { useEffect, useState, useRef } from 'react';
import { CheckCircle2, Clock3, AlertCircle } from 'lucide-react';
import welcomeImage from '../assets/images/dish_pasta_roast_beef_1790857005118.jpg';
import { MaltivaLogo } from './MaltivaLogo';
import { formatPKR } from '../utils/formatCurrency';
import { CartItem, PrinterSettings } from '../types/pos';
import { INITIAL_PRINTER_SETTINGS } from '../data/initialData';
import { PosStorage } from '../services/storage';
import { upgradeMoney } from '../shared/moneyUpgrade';

export interface CustomerDisplayState {
  settings?: PrinterSettings;
  cart: CartItem[];
  orderNumber: string;
  tokenNumber: number;
  subtotalPaisa: number;
  taxPaisa: number;
  totalPaisa: number;
  lastPlacedOrder?: {
    orderNumber: string;
    tokenNumber: number;
    totalPaisa: number;
    persistenceState?: 'saved' | 'pending' | 'rejected' | 'draft';
  } | null;
}

function validDisplayState(value: CustomerDisplayState): boolean {
  if (!value || !Array.isArray(value.cart) || typeof value.orderNumber !== 'string' || !Number.isSafeInteger(value.tokenNumber)) return false;
  if (![value.totalPaisa, value.subtotalPaisa, value.taxPaisa].every(amount => Number.isSafeInteger(amount) && amount >= 0)) return false;
  if (!value.cart.every(item => item?.product && typeof item.product.name === 'string' && typeof item.cartItemId === 'string' &&
    Number.isSafeInteger(item.quantity) && item.quantity > 0 && Number.isSafeInteger(item.totalPricePaisa) &&
    (!item.notes || typeof item.notes === 'string') && Array.isArray(item.selectedVariations) &&
    item.selectedVariations.every(option => option && typeof option.optionName === 'string') &&
    (!item.product.bundledProducts || Array.isArray(item.product.bundledProducts) && item.product.bundledProducts.every(bundle => bundle && typeof bundle.productName === 'string')))) return false;
  const confirmation = value.lastPlacedOrder;
  return !confirmation || typeof confirmation.orderNumber === 'string' && Number.isSafeInteger(confirmation.tokenNumber) && Number.isSafeInteger(confirmation.totalPaisa);
}

export const CustomerDisplayWindow: React.FC = () => {
  const [displayState, setDisplayState] = useState<CustomerDisplayState>({
    cart: [],
    orderNumber: '#F0001',
    tokenNumber: 1,
    subtotalPaisa: 0,
    taxPaisa: 0,
    totalPaisa: 0,
    lastPlacedOrder: null,
  });

  const [settings, setSettings] = useState<PrinterSettings>(() => {
    try { return PosStorage.getPrinterSettings() || INITIAL_PRINTER_SETTINGS; } catch { return INITIAL_PRINTER_SETTINGS; }
  });

  useEffect(() => {
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pos_customer_display') : null;

    const acceptState = (value: unknown) => {
      try {
        const next = upgradeMoney(value) as CustomerDisplayState;
        if (!validDisplayState(next)) return;
        setDisplayState(next);
        const liveSettings = next.settings;
        if (liveSettings && (['storeName', 'address', 'whatsApp', 'tagline'] as const).every(key => liveSettings[key] == null || typeof liveSettings[key] === 'string')) setSettings({ ...INITIAL_PRINTER_SETTINGS, ...liveSettings });
      } catch { /* Keep the last valid display state. */ }
    };
    const handleMessage = (event: MessageEvent) => acceptState(event.data);

    if (channel) {
      channel.onmessage = handleMessage;
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'pos_customer_display_state' && e.newValue) {
        try {
          acceptState(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('storage', handleStorage);

    let saved: string | null = null;
    try { saved = localStorage.getItem('pos_customer_display_state'); } catch { /* Live updates remain available. */ }
    if (saved) {
      try {
        acceptState(JSON.parse(saved));
      } catch {
        // ignore
      }
    }

    return () => {
      if (channel) channel.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const listRef = useRef<HTMLUListElement>(null);
  const previousCart = useRef<CartItem[]>([]);
  useEffect(() => {
    const changed = [...displayState.cart].reverse().find(item => JSON.stringify(previousCart.current.find(old => old.cartItemId === item.cartItemId)) !== JSON.stringify(item));
    if (changed) Array.from(listRef.current?.children || []).find(element => (element as HTMLElement).dataset.lineId === changed.cartItemId)?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
    previousCart.current = displayState.cart;
  }, [displayState.cart]);

  const hasItems = displayState.cart.length > 0;
  const lastOrder = !hasItems ? displayState.lastPlacedOrder : null;
  const confirmed = lastOrder?.persistenceState === 'saved';
  const draft = lastOrder?.persistenceState === 'draft';
  const rejected = lastOrder?.persistenceState === 'rejected';
  const itemCount = displayState.cart.reduce((sum, item) => sum + item.quantity, 0);
  const StatusIcon = confirmed ? CheckCircle2 : rejected ? AlertCircle : Clock3;

  return (
    <div className="min-h-dvh lg:h-dvh lg:overflow-hidden bg-pos-canvas text-pos-text font-sans flex flex-col select-none">
      <header className="bg-pos-chrome border-b border-pos-border px-5 sm:px-8 py-4 flex items-center justify-between gap-4">
        <MaltivaLogo size="md" showSubtitle />
        <span className="text-sm sm:text-base text-pos-secondary">Made for your cravings.</span>
      </header>

      <main className="flex-1 min-h-0 lg:overflow-hidden w-full max-w-[1600px] mx-auto p-5 sm:p-8 lg:p-10">
        {!hasItems && !lastOrder ? (
          <section aria-label="Welcome" className="grid items-center gap-8 lg:gap-12 lg:grid-cols-2 min-h-[calc(100dvh-12rem)]">
            <div className="max-w-xl">
              <p className="text-lg text-pos-accent font-semibold mb-4">Good food. Good to see you.</p>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-balance">Welcome to {settings.storeName || 'Maltiva'}</h1>
              <p className="mt-6 text-lg sm:text-xl leading-relaxed text-pos-secondary">Your order will appear here as we take it.</p>
              <p className="mt-3 text-base text-pos-muted">Take a moment. Find your favourite.</p>
            </div>
            <img src={welcomeImage} alt="Freshly prepared food at Maltiva" className="w-full aspect-[4/3] max-h-[520px] rounded-xl object-cover" />
          </section>
        ) : hasItems ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] items-start">
            <section aria-labelledby="customer-order-title" className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-6">
                <h1 id="customer-order-title" className="text-3xl sm:text-4xl font-bold tracking-tight">Your order</h1>
                <span className="text-base text-pos-secondary">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
              </div>
              <p className="text-base text-pos-secondary mb-5">Everything looking right? Let us know if you need a change.</p>
              {displayState.cart.length > 4 && <p className="text-sm text-pos-muted mb-3">Latest changes stay in view. Scroll to review all {displayState.cart.length} order lines.</p>}
              <ul aria-label="Order items" ref={listRef} tabIndex={0} className="divide-y divide-pos-border lg:max-h-[calc(100dvh-22rem)] overflow-y-auto pr-2">
                {displayState.cart.map(item => (
                  <li key={item.cartItemId} data-line-id={item.cartItemId} className="py-5 first:pt-0 flex items-start gap-3 sm:gap-5">
                    <div className="relative shrink-0 w-14 h-14 sm:w-20 sm:h-20">
                      <img
                        src={item.product.image || '/placeholder-dish.svg'}
                        alt={item.product.name}
                        onError={event => {
                          if (!event.currentTarget.src.endsWith('/placeholder-dish.svg')) {
                            event.currentTarget.src = '/placeholder-dish.svg';
                          }
                        }}
                        className="w-full h-full rounded-lg object-cover bg-pos-raised"
                      />
                      <span className="absolute -bottom-1 -right-1 min-w-6 h-6 sm:min-w-8 sm:h-8 px-1 rounded-md border border-pos-control bg-pos-surface text-pos-text flex items-center justify-center text-sm sm:text-base font-semibold" aria-label={`Quantity ${item.quantity}`}>{item.quantity}×</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg sm:text-2xl font-semibold leading-snug [overflow-wrap:anywhere]">{item.product.name}</h2>
                      {item.product.isDeal && Boolean(item.product.bundledProducts?.length) && (
                        <p className="mt-2 text-sm sm:text-base leading-relaxed text-pos-secondary">Includes {item.product.bundledProducts!.map(bundle => `${bundle.quantity}× ${bundle.productName}`).join(', ')}</p>
                      )}
                      {Boolean(item.selectedVariations?.length) && <p className="mt-2 text-base text-pos-secondary">{item.selectedVariations.map(variation => variation.optionName).join(', ')}</p>}
                      {item.notes && <p className="mt-2 text-sm text-pos-secondary">Note: {item.notes}</p>}
                    </div>
                    <span className="shrink-0 text-base sm:text-xl font-semibold tabular-nums pt-1">{formatPKR(item.totalPricePaisa)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <aside aria-label="Order total" className="bg-pos-surface border border-pos-border rounded-lg p-6 sm:p-8 lg:sticky lg:top-8">
              <p className="text-base text-pos-secondary">Total to pay</p>
              <p className="mt-3 text-4xl xl:text-5xl font-bold tracking-tight tabular-nums [overflow-wrap:anywhere]">{formatPKR(displayState.totalPaisa)}</p>
              <dl className="mt-6 border-t border-pos-border pt-5 space-y-3 text-base">
                <div className="flex justify-between gap-4"><dt className="text-pos-secondary">Subtotal</dt><dd className="tabular-nums">{formatPKR(displayState.subtotalPaisa)}</dd></div>
                {displayState.taxPaisa > 0 && <div className="flex justify-between gap-4"><dt className="text-pos-secondary">Tax</dt><dd className="tabular-nums">{formatPKR(displayState.taxPaisa)}</dd></div>}
              </dl>
              <p className="mt-6 text-base leading-relaxed text-pos-secondary">Please pay at the counter.</p>
            </aside>
          </div>
        ) : lastOrder ? (
          <section role="status" aria-live="polite" className="min-h-[calc(100dvh-12rem)] flex flex-col items-center justify-center text-center max-w-3xl mx-auto py-10">
            <StatusIcon className={`w-12 h-12 mb-6 ${confirmed ? 'text-pos-success-text' : rejected ? 'text-pos-danger-text' : 'text-pos-warning-text'}`} aria-hidden="true" />
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">{confirmed ? 'Thank you!' : draft ? 'Review your order' : rejected ? 'Please speak to our cashier' : 'Confirming your order'}</h1>
            {confirmed ? (
              <>
                <p className="mt-6 text-lg text-pos-secondary">Your pickup token</p>
                <p className="mt-2 text-7xl sm:text-8xl font-bold tracking-tight text-pos-accent">#{lastOrder.tokenNumber}</p>
                <p className="mt-6 text-lg sm:text-xl text-pos-secondary">Keep your receipt handy. Please collect your order when your token is called.</p>
              </>
            ) : (
              <p className="mt-6 text-lg sm:text-xl text-pos-secondary">{draft ? 'This is a preview. Your order has not been placed yet.' : rejected ? 'Your order could not be confirmed. We’ll help you at the counter.' : 'Please wait while we confirm your order. Our cashier will help you.'}</p>
            )}
            <p className="mt-8 text-base text-pos-muted">{lastOrder.orderNumber} · {formatPKR(lastOrder.totalPaisa)}</p>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-pos-border px-5 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-2 text-sm text-pos-muted">
        <span>{settings.address}</span>
        {settings.whatsApp && <span>WhatsApp: {settings.whatsApp}</span>}
      </footer>
    </div>
  );
};
