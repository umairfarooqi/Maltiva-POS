import React, { useEffect, useState } from 'react';
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
  const isOrderPlaced = Boolean(displayState.lastPlacedOrder);

  return (
    <div className="w-screen h-screen bg-slate-950 text-white font-sans flex flex-col justify-between overflow-hidden select-none">
      {/* Top Banner Header */}
      <header className="bg-slate-900/90 border-b border-white/10 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <MaltivaLogo size="md" showSubtitle={true} />
        </div>

        <div className="text-right">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-xs uppercase tracking-wider">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Counter Takeaway</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Phase 3 DHA Lahore • 03444757082
          </p>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden p-8 gap-8 items-stretch">
        {/* Left Side: Brand Promo / Order Placed Banner */}
        <div className="flex-1 bg-gradient-to-br from-slate-900 to-slate-900/60 rounded-3xl border border-white/10 p-8 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-[#00A389]/15 rounded-full blur-3xl pointer-events-none" />

          {isOrderPlaced ? (
            <div className="my-auto text-center space-y-6 animate-in zoom-in-95 duration-200">
              <div className="w-24 h-24 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-4xl shadow-xl">
                ✓
              </div>
              <div>
                <p className="text-emerald-400 font-bold text-sm tracking-widest uppercase">
                  Order Successfully Placed
                </p>
                <h1 className="text-5xl font-black text-white mt-2">
                  TOKEN #{displayState.lastPlacedOrder?.tokenNumber}
                </h1>
                <p className="text-lg text-slate-300 font-mono mt-2">
                  Order {displayState.lastPlacedOrder?.orderNumber} • {formatPKR(displayState.lastPlacedOrder?.total || 0)}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 max-w-sm mx-auto">
                <p className="text-sm font-medium text-slate-300">
                  Please collect your Customer Slip. Kitchen is freshly preparing your order!
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col justify-between h-full">
              <div>
                <span className="px-3 py-1 rounded-lg bg-[#00A389]/20 text-[#00A389] text-xs font-bold uppercase tracking-wider">
                  Maltiva Crust Special
                </span>
                <h2 className="text-3xl lg:text-4xl font-black text-white mt-3 leading-tight tracking-tight">
                  Fast Food That Hits Different🔥
                </h2>
                <p className="text-slate-400 text-sm mt-2 max-w-md">
                  Pizza • Sandwiches • Fries🍟 | Fresh • Cheesy • Loaded
                </p>
              </div>

              {/* Promo highlights */}
              <div className="grid grid-cols-2 gap-4 my-6">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-3">
                  <span className="text-3xl">🍕</span>
                  <div>
                    <h4 className="text-sm font-bold text-white">Stuffed Pizza Crust</h4>
                    <p className="text-xs text-slate-400">Fresh mozzarella cheese lava</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-3">
                  <span className="text-3xl">🍟</span>
                  <div>
                    <h4 className="text-sm font-bold text-white">Cheesy Loaded Fries</h4>
                    <p className="text-xs text-slate-400">Crispy chicken & special sauce</p>
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-500 flex items-center justify-between border-t border-white/10 pt-4">
                <span>Phase 3 DHA Lahore</span>
                <span className="font-mono text-emerald-400">WhatsApp: 03444757082</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Live Customer Bill */}
        <div className="w-96 lg:w-[420px] bg-slate-900 rounded-3xl border border-white/10 flex flex-col justify-between overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-white/10 bg-slate-900/80 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Current Order Details
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {displayState.orderNumber} • Token #{displayState.tokenNumber}
              </p>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#00A389]/20 text-[#00A389] flex items-center justify-center text-sm font-bold">
              {displayState.cart.reduce((sum, it) => sum + it.quantity, 0)}
            </div>
          </div>

          {/* Cart items list */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4 divide-y divide-white/5">
            {!hasItems ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <span className="text-4xl mb-3 opacity-50">🛍️</span>
                <p className="text-sm font-medium">Ready for your order</p>
                <p className="text-xs mt-1 text-slate-600">
                  Items selected by the cashier will appear here in real time.
                </p>
              </div>
            ) : (
              displayState.cart.map(item => (
                <div key={item.cartItemId} className="pt-3 first:pt-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-white/10 text-white font-mono text-xs flex items-center justify-center shrink-0">
                          {item.quantity}x
                        </span>
                        <h4 className="text-sm font-bold text-white truncate">
                          {item.product.name}
                        </h4>
                      </div>

                      {/* Cheezious deal contents or variations */}
                      {item.product.isDeal && item.product.bundledProducts && item.product.bundledProducts.length > 0 && (
                        <p className="text-[11px] text-amber-400/90 pl-7 mt-0.5 leading-snug">
                          Includes: {item.product.bundledProducts.map(b => `${b.quantity}x ${b.productName}`).join(' • ')}
                        </p>
                      )}

                      {item.selectedVariations && item.selectedVariations.length > 0 && (
                        <p className="text-[11px] text-slate-400 pl-7 mt-0.5">
                          {item.selectedVariations.map(v => v.optionName).join(', ')}
                        </p>
                      )}
                    </div>

                    <span className="text-sm font-bold text-emerald-400 font-mono shrink-0">
                      {formatPKR(item.totalPrice)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Bill Summary Footer */}
          <div className="p-6 bg-slate-950 border-t border-white/10 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Subtotal</span>
              <span className="font-mono text-slate-300">{formatPKR(displayState.subtotal)}</span>
            </div>

            {displayState.tax > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Tax</span>
                <span className="font-mono text-slate-300">{formatPKR(displayState.tax)}</span>
              </div>
            )}

            <div className="pt-2 border-t border-white/10 flex items-baseline justify-between">
              <div>
                <span className="text-xs uppercase font-bold text-slate-400 block tracking-wider">
                  Total Payable
                </span>
                <span className="text-[11px] text-emerald-400 font-medium">PKR Pakistani Rupees</span>
              </div>
              <span className="text-3xl font-black text-white font-mono tracking-tight text-emerald-400">
                {formatPKR(displayState.total)}
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Branding Bar */}
      <footer className="bg-slate-900 border-t border-white/5 px-8 py-3 flex items-center justify-between text-xs text-slate-500">
        <span>Maltiva Crust Takeaway Terminal • Fast Food That Hits Different🔥</span>
        <span>Phase 3 DHA Lahore • 📲 WhatsApp: 03444757082</span>
      </footer>
    </div>
  );
};
