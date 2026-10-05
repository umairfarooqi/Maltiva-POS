import React from 'react';
import { Trash2, Printer, Power, X, Banknote, CreditCard, ScanLine } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { CartItem, PaymentMethod } from '../types/pos';
import { formatPKR } from '../utils/formatCurrency';
import { computeTotals, parseRupees, rupeeText } from '../shared/money';

interface CartDrawerProps {
  error?: string;
  cart: CartItem[];
  orderNumber: string;
  tokenNumber: number;
  onUpdateQuantity: (cartItemId: string, delta: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onEditItem?: (item: CartItem) => void;
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
  error,
  orderNumber,
  tokenNumber: _tokenNumber,
  onUpdateQuantity,
  onRemoveItem,
  onEditItem,
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
  const [confirmClear, setConfirmClear] = React.useState(false);
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
    <div className="w-full xl:w-96 h-full bg-pos-surface flex flex-col justify-between select-none border-l border-pos-border font-sans">
      <div className="flex-1 overflow-y-auto p-5 pb-4">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-pos-text tracking-tight">
              Order {orderNumber}
            </h2>
            <p className="text-[11px] text-pos-muted font-medium uppercase tracking-wider">
              Current Transaction
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setConfirmClear(true)}
              disabled={cart.length === 0 || isProcessing}
              className="p-2 text-pos-danger-text hover:text-pos-danger-text disabled:opacity-30 transition rounded-md hover:bg-pos-danger-bg cursor-pointer"
              title="Clear Order"
              aria-label="Clear order"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            {isMobileOpen && onCloseMobile && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={onCloseMobile}
                className="p-2 text-pos-muted hover:text-pos-text transition rounded-md hover:bg-pos-raised cursor-pointer"
                title="Close order drawer"
                aria-label="Close order drawer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <div className="border-b border-pos-divider mb-6" />

        {error && isMobileOpen && <p role="alert" className="text-sm text-pos-danger-text mb-4">{error}</p>}
        {/* ORDERED ITEMS */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-pos-muted uppercase tracking-wider">
              Ordered Items
            </h3>
            <span className="text-[10px] font-black bg-pos-raised text-pos-secondary px-2 py-0.5 rounded">
              {totalCount} Items
            </span>
          </div>

          {cart.length === 0 ? (
            <div className="py-10 text-center bg-pos-inset rounded-lg border border-dashed border-pos-control">
              <p className="text-xs font-medium text-pos-muted">Cart is empty</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map(item => (
                <div
                  key={item.cartItemId}
                  className="flex items-start justify-between gap-3 group"
                >
                  <div className="flex-1 pr-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold text-pos-muted">{item.quantity}x</span>
                      <span className="text-sm font-semibold text-pos-secondary break-words leading-tight">
                        {item.product.name}
                      </span>
                    </div>
                    {item.product.isDeal && (
                      <span className="text-[10px] text-pos-warning-text font-medium">Combo Deal</span>
                    )}
                    {item.selectedVariations.length > 0 && <p className="text-xs text-pos-muted mt-1">{item.selectedVariations.map(v => v.optionName).join(', ')}</p>}
                    {item.notes && <p className="text-xs text-pos-secondary mt-1 break-words">Note: {item.notes}</p>}
                    <div className="flex flex-wrap items-center gap-1 mt-2">
                      <button type="button" disabled={isProcessing} aria-label={`Decrease quantity of ${item.product.name}`} onClick={() => onUpdateQuantity(item.cartItemId, -1)} className="w-9 h-9 rounded-md border border-pos-control disabled:opacity-40">-</button>
                      <span className="px-2 text-sm" aria-label="Quantity">{item.quantity}</span>
                      <button type="button" disabled={isProcessing} aria-label={`Increase quantity of ${item.product.name}`} onClick={() => onUpdateQuantity(item.cartItemId, 1)} className="w-9 h-9 rounded-md border border-pos-control disabled:opacity-40">+</button>
                      {onEditItem && <button type="button" disabled={isProcessing} aria-label={`Edit ${item.product.name}`} onClick={() => onEditItem(item)} className="p-2 text-xs text-pos-accent disabled:opacity-40">Edit</button>}
                      <button type="button" disabled={isProcessing} aria-label={`Remove ${item.product.name}`} onClick={() => onRemoveItem(item.cartItemId)} className="p-2 text-xs text-pos-danger-text disabled:opacity-40">Remove</button>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-pos-text shrink-0">
                    {formatPKR(item.totalPricePaisa)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {isProcessing && <p role="status" className="text-sm text-pos-warning-text mt-4">Checkout is locked while the sale is being confirmed. Wait for the result before changing this order.</p>}

        {/* PAYMENT SUMMARY */}
        <div className="mt-6 p-4 rounded-lg bg-pos-inset border border-pos-border space-y-3">
          <h3 className="text-xs font-bold text-pos-muted uppercase tracking-wider mb-3">
            Payment Summary
          </h3>

          <div className="flex items-center justify-between text-xs">
            <span className="text-pos-muted">Subtotal</span>
            <span className="font-semibold text-pos-secondary">{formatPKR(subtotalPaisa)}</span>
          </div>

          {taxBp > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-pos-muted">Tax {taxInclusive ? 'included' : ''} ({taxBp / 100}%)</span>
              <span className="font-semibold text-pos-secondary">{formatPKR(taxPaisa)}</span>
            </div>
          )}

          <div className="pt-3 border-t border-pos-border flex items-center justify-between">
            <span className="text-sm font-bold text-pos-text">Total Payable</span>
            <span className="text-xl font-black text-pos-accent">{formatPKR(totalPayable)}</span>
          </div>

          {cart.length > 0 && paymentMethod === 'cash' && (
            <div className="mt-4 rounded-md border border-pos-success-border bg-pos-success-bg/60 p-3 space-y-3">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-pos-success-text" htmlFor="cash-tendered">
                Cash Tendered
              </label>
              <input
                disabled={isProcessing}
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
                className="w-full rounded-md border border-pos-success-border bg-pos-surface px-3 py-2 text-sm font-bold text-pos-text focus-visible:border-pos-accent"
              />
              <div className="flex items-center justify-between rounded-md border border-pos-success-border bg-pos-surface px-3 py-2 text-xs font-medium text-pos-secondary">
                <span>Change Due</span>
                <span className="font-black text-pos-accent">{formatPKR(changeDuePaisa)}</span>
              </div>
              {!cashPaymentValid && (
                <p className="text-xs font-semibold text-pos-danger-text">Tender must cover the total amount.</p>
              )}
            </div>
          )}
        </div>

      </div>

      {/* BOTTOM ACTIONS */}
      <div className="shrink-0 p-4 bg-pos-surface border-t border-pos-border">
        <div className="mb-3 rounded-lg border border-pos-border p-3 space-y-2">
          <h3 className="text-xs font-bold text-pos-secondary">Payment Method</h3>
          <div className="grid grid-cols-3 gap-2">
            {paymentMethods.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                disabled={isProcessing}
                aria-pressed={paymentMethod === value}
                onClick={() => onSelectPaymentMethod(value)}
                className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-semibold transition cursor-pointer ${
                  paymentMethod === value
                    ? 'border-pos-accent bg-pos-selected text-pos-accent'
                    : 'border-pos-border text-pos-muted hover:bg-pos-inset'
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
            disabled={isProcessing || cart.length === 0}
            onClick={onOpenPrintModal}
            className="px-4 py-3 rounded-md border border-pos-control hover:bg-pos-inset text-pos-secondary text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={() => onPlaceOrder(cashTenderedPaisa, paymentMethod)}
            disabled={cart.length === 0 || isProcessing || !cashPaymentValid}
            className="flex-1 py-3 rounded-md bg-pos-action hover:bg-pos-action-hover text-white text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-40 cursor-pointer active:scale-[0.98]"
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
      {!isMobileOpen && <aside className="hidden xl:block w-96 h-full shrink-0">
        {drawerContent}
      </aside>}
      {isMobileOpen && (
        <Dialog label="Current order" onClose={() => onCloseMobile?.()} busy={isProcessing}
          backdropClassName="!p-0 !justify-end" className="w-full max-w-sm h-full bg-pos-surface">
          {drawerContent}
        </Dialog>
      )}
      {confirmClear && <Dialog label="Clear current order?" onClose={() => setConfirmClear(false)} className="w-full max-w-sm rounded-lg border border-pos-border bg-pos-surface p-5">
        <h2 className="font-bold text-pos-text">Clear current order?</h2>
        <p className="text-sm text-pos-muted mt-2">This removes every item and its instructions from this order.</p>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setConfirmClear(false)} className="p-2 text-pos-secondary">Keep order</button>
          <button disabled={isProcessing} onClick={() => { onClearCart(); setConfirmClear(false); }} className="p-2 rounded-md bg-pos-danger-bg text-pos-danger-text">Clear all items</button>
        </div>
      </Dialog>}
    </>
  );
};
