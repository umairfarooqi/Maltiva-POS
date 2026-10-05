import React from 'react';
import { Trash2, Printer, Power, X, Banknote, CreditCard, ScanLine } from 'lucide-react';
import { CartItem, PaymentMethod } from '../types/pos';
import { formatPKR } from '../utils/formatCurrency';
import { computeTotals, parseRupees, rupeeText } from '../shared/money';

interface CartDrawerProps {
  cart: CartItem[];
  orderNumber: string;
  tokenNumber: number;
  onUpdateQuantity: (cartItemId: string, delta: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onClearCart: () => void;
  taxBp: number;
  taxInclusive?: boolean;
  paymentMethod: PaymentMethod;
  onSelectPaymentMethod: (method: PaymentMethod) => void;
  onPlaceOrder: (cashTenderedPaisa: number, paymentMethod: PaymentMethod) => void;
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
  taxBp,
  taxInclusive = false,
  paymentMethod,
  onSelectPaymentMethod,
  onPlaceOrder,
  onOpenPrintModal,
  isProcessing,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const { subtotalPaisa, taxPaisa, totalPaisa: totalPayable } = computeTotals(cart, { taxBp, taxInclusive });
  const totalCount = cart.reduce((s, it) => s + it.quantity, 0);
  const [cashTenderedPaisa, setCashTendered] = React.useState(totalPayable);
  const [tenderText, setTenderText] = React.useState(rupeeText(totalPayable));
  const [invalidTender, setInvalidTender] = React.useState(false);

  React.useEffect(() => {
    setCashTendered(totalPayable);
    setTenderText(rupeeText(totalPayable)); setInvalidTender(false);
  }, [totalPayable]);

  const changeDuePaisa = Math.max(0, cashTenderedPaisa - totalPayable);
  const cashPaymentValid = paymentMethod !== 'cash' || (!invalidTender && cashTenderedPaisa >= totalPayable);
  const paymentMethods = [
    { value: 'cash', label: 'Cash', Icon: Banknote },
    { value: 'card', label: 'Card', Icon: CreditCard },
    { value: 'scan', label: 'Scan', Icon: ScanLine },
  ] as const;

  const drawerContent = (
    <div className="w-full xl:w-96 h-full bg-white flex flex-col justify-between select-none border-l border-slate-200 font-sans">
      <div className="flex-1 overflow-y-auto p-5 pb-4">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Order {orderNumber}
            </h2>
            <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">
              Current Transaction
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onClearCart}
              disabled={cart.length === 0}
              className="p-2 text-rose-500 hover:text-rose-700 disabled:opacity-30 transition rounded-md hover:bg-rose-50 cursor-pointer"
              title="Clear Order"
              aria-label="Clear order"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            {isMobileOpen && onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                className="p-2 text-slate-500 hover:text-slate-800 transition rounded-md hover:bg-slate-100 cursor-pointer"
                title="Close order drawer"
                aria-label="Close order drawer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <div className="border-b border-slate-100 mb-6" />

        {/* ORDERED ITEMS */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Ordered Items
            </h3>
            <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
              {totalCount} Items
            </span>
          </div>

          {cart.length === 0 ? (
            <div className="py-10 text-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
              <p className="text-xs font-medium text-slate-500">Cart is empty</p>
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
                    {formatPKR(item.totalPricePaisa)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PAYMENT SUMMARY */}
        <div className="mt-6 p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            Payment Summary
          </h3>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-semibold text-slate-700">{formatPKR(subtotalPaisa)}</span>
          </div>

          {taxBp > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Tax {taxInclusive ? 'included' : ''} ({taxBp / 100}%)</span>
              <span className="font-semibold text-slate-700">{formatPKR(taxPaisa)}</span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">Total Payable</span>
            <span className="text-xl font-black text-[#00A389]">{formatPKR(totalPayable)}</span>
          </div>

          {cart.length > 0 && paymentMethod === 'cash' && (
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50/60 p-3 space-y-3">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700" htmlFor="cash-tendered">
                Cash Tendered
              </label>
              <input
                id="cash-tendered"
                type="number"
                min="0"
                step="0.01"
                value={tenderText}
                onChange={event => {
                  setTenderText(event.target.value);
                  try { setCashTendered(parseRupees(event.target.value)); setInvalidTender(false); }
                  catch { setInvalidTender(true); }
                }}
                className="w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 focus-visible:border-[#008f77]"
              />
              <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                <span>Change Due</span>
                <span className="font-black text-[#00A389]">{formatPKR(changeDuePaisa)}</span>
              </div>
              {!cashPaymentValid && (
                <p className="text-xs font-semibold text-rose-600">Tender must cover the total amount.</p>
              )}
            </div>
          )}
        </div>

      </div>

      {/* BOTTOM ACTIONS */}
      <div className="shrink-0 p-4 bg-white border-t border-slate-200">
        <div className="mb-3 rounded-lg border border-slate-200 p-3 space-y-2">
          <h3 className="text-xs font-bold text-slate-700">Payment Method</h3>
          <div className="grid grid-cols-3 gap-2">
            {paymentMethods.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={paymentMethod === value}
                onClick={() => onSelectPaymentMethod(value)}
                className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-semibold transition cursor-pointer ${
                  paymentMethod === value
                    ? 'border-[#00A389] bg-[#E6F7F5] text-[#007462]'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenPrintModal}
            className="px-4 py-3 rounded-md border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={() => onPlaceOrder(cashTenderedPaisa, paymentMethod)}
            disabled={cart.length === 0 || isProcessing || !cashPaymentValid}
            className="flex-1 py-3 rounded-md bg-[#008f77] hover:bg-[#007462] text-white text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-40 cursor-pointer active:scale-[0.98]"
          >
            <Power className="w-3.5 h-3.5" />
            <span>{isProcessing ? 'Processing...' : `Complete Order (${paymentMethod === 'scan' ? 'Scan' : paymentMethod === 'card' ? 'Card' : 'Cash'})`}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden xl:block w-96 h-full shrink-0">
        {drawerContent}
      </aside>
      {isMobileOpen && (
        <div
          className="xl:hidden fixed inset-0 z-50 flex justify-end bg-black/50 animate-in fade-in duration-150"
          onClick={onCloseMobile}
        >
          <div
            className="w-full max-w-sm h-full bg-white border-l border-slate-200 animate-in slide-in-from-right duration-200"
            onClick={event => event.stopPropagation()}
          >
            {drawerContent}
          </div>
        </div>
      )}
    </>
  );
};
