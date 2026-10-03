import React from 'react';
import {
  Trash2,
  Printer,
  Power,
  Banknote,
  CreditCard,
  QrCode,
} from 'lucide-react';
import { CartItem, PaymentMethod } from '../types/pos';
import { formatPKR } from '../utils/formatCurrency';

interface CartDrawerProps {
  cart: CartItem[];
  orderNumber: string;
  tokenNumber: number;
  onUpdateQuantity: (cartItemId: string, delta: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onClearCart: () => void;
  taxRatePercent: number;
  paymentMethod: PaymentMethod | 'scan';
  onChangePaymentMethod: (method: any) => void;
  onPlaceOrder: (cashTendered: number) => void;
  onOpenPrintModal: () => void;
  isProcessing: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  cart,
  orderNumber,
  tokenNumber: _tokenNumber,
  onUpdateQuantity: _onUpdateQuantity,
  onRemoveItem: _onRemoveItem,
  onClearCart,
  taxRatePercent,
  paymentMethod,
  onChangePaymentMethod,
  onPlaceOrder,
  onOpenPrintModal,
  isProcessing,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const tax = Number(((subtotal * (taxRatePercent > 0 ? taxRatePercent : 0)) / 100).toFixed(0));
  const totalPayable = subtotal + tax;
  const totalCount = cart.reduce((s, it) => s + it.quantity, 0);
  const [cashTendered, setCashTendered] = React.useState(totalPayable);

  React.useEffect(() => {
    setCashTendered(current => Math.max(current, totalPayable));
  }, [totalPayable]);

  const changeDue = Math.max(0, cashTendered - totalPayable);
  const cashPaymentValid = paymentMethod !== 'cash' || cashTendered >= totalPayable;

  const drawerContent = (
    <div className="w-full xl:w-92 h-full bg-white flex flex-col justify-between select-none border-l border-slate-100 font-sans">
      <div className="flex-1 overflow-y-auto p-6 pb-4">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Order {orderNumber}
            </h2>
            <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
              Current Transaction
            </p>
          </div>

          <button
            onClick={onClearCart}
            disabled={cart.length === 0}
            className="p-2 text-rose-400 hover:text-rose-600 disabled:opacity-30 transition rounded-xl hover:bg-rose-50 cursor-pointer"
            title="Clear Order"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="border-b border-slate-100 mb-6" />

        {/* ORDERED ITEMS */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Ordered Items
            </h3>
            <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
              {totalCount} Items
            </span>
          </div>

          {cart.length === 0 ? (
            <div className="py-12 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
              <p className="text-xs font-medium text-slate-400">Cart is empty</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map(item => (
                <div
                  key={item.cartItemId}
                  className="flex items-center justify-between group"
                >
                  <div className="flex-1 pr-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold text-slate-400">{item.quantity}x</span>
                      <span className="text-sm font-semibold text-slate-700 truncate leading-tight">
                        {item.product.name}
                      </span>
                    </div>
                    {item.product.isDeal && (
                      <span className="text-[10px] text-amber-600 font-medium">Combo Deal</span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-slate-900 shrink-0">
                    {formatPKR(item.totalPrice)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PAYMENT SUMMARY */}
        <div className="mt-8 p-5 rounded-3xl bg-slate-50 border border-slate-100 space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
            Payment Summary
          </h3>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-semibold text-slate-700">{formatPKR(subtotal)}</span>
          </div>

          {taxRatePercent > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Tax ({taxRatePercent}%)</span>
              <span className="font-semibold text-slate-700">{formatPKR(tax)}</span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">Total Payable</span>
            <span className="text-xl font-black text-[#00A389]">{formatPKR(totalPayable)}</span>
          </div>

          {paymentMethod === 'cash' && cart.length > 0 && (
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3 space-y-3">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700" htmlFor="cash-tendered">
                Cash Tendered
              </label>
              <input
                id="cash-tendered"
                type="number"
                min="0"
                step="1"
                value={cashTendered}
                onChange={event => setCashTendered(Math.max(0, Number(event.target.value) || 0))}
                className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-[#00A389]"
              />
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                <span>Change Due</span>
                <span className="font-black text-[#00A389]">{formatPKR(changeDue)}</span>
              </div>
              {!cashPaymentValid && (
                <p className="text-xs font-semibold text-rose-600">Tender must cover the total amount.</p>
              )}
            </div>
          )}
        </div>

        {/* PAYMENT METHOD */}
        <div className="mt-6 space-y-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
            Payment Method
          </span>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'cash', icon: Banknote, label: 'Cash' },
              { id: 'card', icon: CreditCard, label: 'Card' },
              { id: 'scan', icon: QrCode, label: 'Scan' },
            ].map(method => {
              const isActive = paymentMethod === method.id;
              const Icon = method.icon;
              return (
                <button
                  key={method.id}
                  onClick={() => onChangePaymentMethod(method.id)}
                  className={`py-2.5 px-1 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    isActive
                      ? 'border-2 border-[#00A389] bg-white text-[#00A389] shadow-sm'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#00A389]' : 'text-slate-400'}`} />
                  <span className="text-[10px] font-bold">{method.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* BOTTOM ACTIONS */}
      <div className="p-6 bg-white border-t border-slate-100">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenPrintModal}
            className="px-4 py-3 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={() => onPlaceOrder(cashTendered)}
            disabled={cart.length === 0 || isProcessing || !cashPaymentValid}
            className="flex-1 py-3 rounded-2xl bg-[#00A389] hover:bg-[#008f77] text-white text-xs font-bold shadow-lg shadow-[#00A389]/20 flex items-center justify-center gap-2 transition disabled:opacity-40 cursor-pointer active:scale-95"
          >
            <Power className="w-3.5 h-3.5" />
            <span>{isProcessing ? 'Processing...' : 'Place Order'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden xl:block w-92 h-full shrink-0">
        {drawerContent}
      </aside>
      {isMobileOpen && (
        <div className="xl:hidden fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm h-full bg-white shadow-2xl animate-in slide-in-from-right duration-200">
            {drawerContent}
          </div>
        </div>
      )}
    </>
  );
};
