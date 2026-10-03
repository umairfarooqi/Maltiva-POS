import React, { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, ShoppingBag } from 'lucide-react';
import { MaltivaLogo } from './MaltivaLogo';
import { formatPKR } from '../utils/formatCurrency';
import { CartItem, PrinterSettings } from '../types/pos';
import { INITIAL_PRINTER_SETTINGS } from '../data/initialData';
import { PosStorage } from '../services/storage';

export interface CustomerDisplayState {
  cart: CartItem[];
  orderNumber: string;
  tokenNumber: number;
  subtotal: number;
  tax: number;
  total: number;
  lastPlacedOrder?: {
    orderNumber: string;
    tokenNumber: number;
    total: number;
    persistenceState?: 'saved' | 'pending' | 'rejected' | 'draft';
  } | null;
}

export const CustomerDisplayWindow: React.FC = () => {
  const [displayState, setDisplayState] = useState<CustomerDisplayState>({
    cart: [],
    orderNumber: '#F0001',
    tokenNumber: 1,
    subtotal: 0,
    tax: 0,
    total: 0,
    lastPlacedOrder: null,
  });

  const [settings] = useState<PrinterSettings>(() => {
    return PosStorage.getPrinterSettings() || INITIAL_PRINTER_SETTINGS;
  });

  useEffect(() => {
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pos_customer_display') : null;

    const handleMessage = (event: MessageEvent) => {
      if (event.data) {
        setDisplayState(event.data);
      }
    };

    if (channel) {
      channel.onmessage = handleMessage;
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'pos_customer_display_state' && e.newValue) {
        try {
          setDisplayState(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      }
    };

    if (!channel) {
      window.addEventListener('storage', handleStorage);
    }

    const saved = localStorage.getItem('pos_customer_display_state');
    if (saved) {
      try {
        setDisplayState(JSON.parse(saved));
      } catch {
        // ignore
      }
    }

    return () => {
      if (channel) channel.close();
      if (!channel) window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const hasItems = displayState.cart && displayState.cart.length > 0;
  const isOrderPlaced = Boolean(displayState.lastPlacedOrder) && !hasItems;

  return (
    <div className="w-screen h-screen min-h-[600px] bg-slate-50 text-slate-800 font-sans flex flex-col overflow-hidden select-none">
      <header className="bg-white border-b border-slate-200 px-6 lg:px-8 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <MaltivaLogo size="md" showSubtitle={true} />
        </div>

        <div className="text-right">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs uppercase tracking-wider">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Counter Takeaway</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Phase 3 DHA Lahore • 03444757082
          </p>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden p-5 lg:p-7 gap-5 lg:gap-6 items-stretch bg-slate-50">
        <section className="flex-1 min-w-0 bg-white rounded-lg border border-slate-200 p-6 lg:p-7 flex flex-col justify-between relative overflow-hidden">
          {isOrderPlaced ? (
            <div className="my-auto text-center space-y-6 animate-in zoom-in-95 duration-200">
              <div className="w-20 h-20 mx-auto rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10" aria-hidden="true" />
              </div>
              <div>
                <p className="text-emerald-700 font-bold text-sm tracking-widest uppercase">
                  {displayState.lastPlacedOrder?.persistenceState === 'pending' ? 'PENDING — waiting for server confirmation'
                    : displayState.lastPlacedOrder?.persistenceState === 'draft' ? 'DRAFT — unpaid preview' : 'Order Successfully Placed'}
                </p>
                <h1 className="text-5xl font-black text-slate-900 mt-2">
                  TOKEN #{displayState.lastPlacedOrder?.tokenNumber}
                </h1>
                <p className="text-lg text-slate-600 font-mono mt-2">
                  Order {displayState.lastPlacedOrder?.orderNumber} • {formatPKR(displayState.lastPlacedOrder?.total || 0)}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 max-w-sm mx-auto">
                <p className="text-sm font-medium text-slate-600">
                  Please collect your Customer Slip. Kitchen is freshly preparing your order!
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col justify-between h-full">
              <div className="pb-5 border-b border-slate-100">
                <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
                  Counter takeaway
                </span>
                <h2 className="text-3xl lg:text-4xl font-black text-slate-900 mt-3 leading-tight tracking-tight">
                  Your order
                </h2>
                <p className="text-slate-500 text-sm mt-2 max-w-md">
                  Review items and total before payment.
                </p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 my-6">
                <div className="p-4 rounded-md bg-slate-50 border border-slate-200 flex items-center gap-4">
                  <span className="w-12 h-12 rounded-md bg-[#E6F7F5] text-[#007462] flex items-center justify-center shrink-0">
                    <ClipboardList className="w-6 h-6" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Live order</p>
                    <h4 className="text-sm font-bold text-slate-800 mt-1">Cashier updates items here</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Each line appears before checkout.</p>
                  </div>
                </div>

                <div className="p-4 rounded-md bg-slate-50 border border-slate-200 flex items-center gap-4">
                  <span className="w-12 h-12 rounded-md bg-[#E6F7F5] text-[#007462] flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-6 h-6" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Pickup</p>
                    <h4 className="text-sm font-bold text-slate-800 mt-1">Keep your token ready</h4>
                    <p className="text-xs text-slate-500 mt-0.5">We will call it when the order is ready.</p>
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-500 flex items-center justify-between border-t border-slate-200 pt-4">
                <span>Phase 3 DHA Lahore</span>
                <span className="font-mono text-emerald-700">WhatsApp: 03444757082</span>
              </div>
            </div>
          )}
        </section>

        <section className="w-full lg:w-[380px] xl:w-[420px] shrink-0 bg-white rounded-lg border border-slate-200 flex flex-col justify-between overflow-hidden">
          <div className="p-5 lg:p-6 border-b border-slate-200 bg-white flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Current Order Details
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                {displayState.orderNumber} • Token #{displayState.tokenNumber}
              </p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm font-bold">
              {displayState.cart.reduce((sum, it) => sum + it.quantity, 0)}
            </div>
          </div>

          <div className="flex-1 min-h-0 p-5 lg:p-6 overflow-y-auto space-y-4 divide-y divide-slate-100">
            {!hasItems ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <span className="w-14 h-14 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center mb-3">
                  <ShoppingBag className="w-7 h-7" aria-hidden="true" />
                </span>
                <p className="text-sm font-medium">Ready for your order</p>
                <p className="text-xs mt-1 text-slate-400">
                  Items selected by the cashier will appear here in real time.
                </p>
              </div>
            ) : (
              displayState.cart.map(item => (
                <div key={item.cartItemId} className="pt-3 first:pt-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-700 font-mono text-xs flex items-center justify-center shrink-0">
                          {item.quantity}x
                        </span>
                        <h4 className="text-sm font-bold text-slate-800 truncate">
                          {item.product.name}
                        </h4>
                      </div>

                      {/* Cheezious deal contents or variations */}
                      {item.product.isDeal && item.product.bundledProducts && item.product.bundledProducts.length > 0 && (
                        <p className="text-[11px] text-amber-700 pl-8 mt-1 leading-snug">
                          Includes: {item.product.bundledProducts.map(b => `${b.quantity}x ${b.productName}`).join(' • ')}
                        </p>
                      )}

                      {item.selectedVariations && item.selectedVariations.length > 0 && (
                        <p className="text-[11px] text-slate-500 pl-8 mt-1">
                          {item.selectedVariations.map(v => v.optionName).join(', ')}
                        </p>
                      )}
                    </div>

                    <span className="text-sm font-bold text-emerald-700 font-mono shrink-0">
                      {formatPKR(item.totalPrice)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-5 lg:p-6 bg-slate-50 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Subtotal</span>
              <span className="font-mono text-slate-700">{formatPKR(displayState.subtotal)}</span>
            </div>

            {displayState.tax > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Tax</span>
                <span className="font-mono text-slate-700">{formatPKR(displayState.tax)}</span>
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex items-baseline justify-between gap-3">
              <div>
                <span className="text-xs uppercase font-bold text-slate-600 block tracking-wider">
                  Total Payable
                </span>
                <span className="text-[11px] text-emerald-700 font-medium">PKR Pakistani Rupees</span>
              </div>
              <span className="text-2xl lg:text-3xl font-black text-slate-900 font-mono tracking-tight text-emerald-700">
                {formatPKR(displayState.total)}
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-slate-200 px-6 lg:px-8 py-3 flex items-center justify-between gap-4 text-xs text-slate-500 shrink-0">
        <span className="truncate">Maltiva Crust Takeaway Terminal</span>
        <span className="shrink-0">Phase 3 DHA Lahore • WhatsApp: 03444757082</span>
      </footer>
    </div>
  );
};
