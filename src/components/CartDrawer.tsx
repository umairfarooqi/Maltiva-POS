import React from 'react';
import { Trash2, Printer, Power, X, Banknote, CreditCard, ScanLine, ShoppingBag, Pencil } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { CashKeypad } from './CashKeypad';
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
  const [keypadOpen, setKeypadOpen] = React.useState(false);
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
    <div className="w-full min-h-0 h-full bg-pos-surface flex flex-col justify-between select-none border-l border-pos-border font-sans">
      {/* STICKY HEADER */}
      <div className="shrink-0 px-3 py-2 bg-pos-chrome border-b border-pos-divider flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-pos-text tracking-tight">
                Order {orderNumber}
              </h2>
              <span className="text-[10px] font-black font-mono bg-pos-selected text-pos-accent border border-pos-accent/30 px-2 py-0.5 rounded-full">
                {totalCount} {totalCount === 1 ? 'Item' : 'Items'}
              </span>
            </div>
            <p className="text-[11px] text-pos-muted font-medium">
              Takeaway Ticket
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setConfirmClear(true)}
            disabled={cart.length === 0 || isProcessing}
            className="min-w-11 min-h-11 p-2 text-pos-danger-text hover:text-pos-danger-text disabled:opacity-30 transition rounded-lg hover:bg-pos-danger-bg cursor-pointer active:scale-95"
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
              className="min-w-11 min-h-11 p-2 text-pos-muted hover:text-pos-text transition rounded-lg hover:bg-pos-raised cursor-pointer"
              title="Close order drawer"
              aria-label="Close order drawer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* SCROLLABLE RECEIPT ITEMS */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-1">
        {error && isMobileOpen && <p role="alert" className="text-sm text-pos-danger-text mb-3">{error}</p>}

        {cart.length === 0 ? (
          <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center px-4 py-8">
            <div className="w-11 h-11 rounded-full bg-pos-inset border border-pos-border flex items-center justify-center text-pos-muted mb-2.5">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-pos-secondary">Cart is empty</p>
            <p className="text-[11px] text-pos-muted mt-0.5">Tap any dish on the menu to add it here</p>
          </div>
        ) : (
          <div className="divide-y divide-pos-divider">
            {cart.map(item => (
              <div
                key={item.cartItemId}
                className="py-2"
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    {onEditItem ? (
                      <button type="button" disabled={isProcessing} onClick={() => onEditItem(item)}
                        aria-label={`Edit ${item.product.name}`}
                        className="min-h-11 w-full text-left text-sm font-bold text-pos-text break-words leading-snug disabled:opacity-40">
                        {item.product.name} <Pencil aria-hidden="true" className="inline w-3 h-3 text-pos-muted" />
                        <span className="block text-xs font-mono text-pos-secondary">{formatPKR(item.totalPricePaisa)}</span>
                      </button>
                    ) : (
                      <div className="text-sm font-bold text-pos-text break-words">
                        {item.product.name}
                        <span className="block text-xs font-mono text-pos-secondary">{formatPKR(item.totalPricePaisa)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" disabled={isProcessing} aria-label={`Decrease quantity of ${item.product.name}`}
                      onClick={() => onUpdateQuantity(item.cartItemId, -1)}
                      className="w-11 h-11 rounded-lg bg-pos-inset text-pos-text font-bold disabled:opacity-40">-</button>
                    <span className="min-w-5 text-center text-sm font-bold font-mono text-pos-text" aria-label="Quantity">{item.quantity}</span>
                    <button type="button" disabled={isProcessing} aria-label={`Increase quantity of ${item.product.name}`}
                      onClick={() => onUpdateQuantity(item.cartItemId, 1)}
                      className="w-11 h-11 rounded-lg bg-pos-inset text-pos-accent font-bold disabled:opacity-40">+</button>
                    <button type="button" disabled={isProcessing} aria-label={`Remove ${item.product.name}`}
                      onClick={() => onRemoveItem(item.cartItemId)}
                      className="w-11 h-11 flex items-center justify-center rounded-lg text-pos-danger-text hover:bg-pos-danger-bg disabled:opacity-40">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {item.product.isDeal && <p className="text-xs text-pos-warning-text">Combo Deal</p>}
                {item.selectedVariations.length > 0 && <p className="text-xs text-pos-secondary break-words mt-1">{item.selectedVariations.map(v => v.optionName).join(', ')}</p>}
                {item.notes && <p className="text-xs text-pos-secondary break-words mt-1">Note: {item.notes}</p>}
              </div>
            ))}
          </div>
        )}

        {isProcessing && (
          <p role="status" className="text-xs font-medium text-pos-warning-text mt-3 p-2.5 rounded-lg bg-pos-warning-bg border border-pos-warning-border">
            Checkout is locked while the sale is being confirmed. Wait for the result before changing this order.
          </p>
        )}
      </div>

      {/* UNIFIED BOTTOM CHECKOUT DOCK */}
      <div className="shrink-0 p-2 bg-pos-chrome border-t border-pos-border space-y-1.5">
        {/* Payment Summary */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-pos-muted">Subtotal</span>
            <span className="font-semibold font-mono text-pos-secondary">{formatPKR(subtotalPaisa)}</span>
          </div>

          {taxBp > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-pos-muted">Tax {taxInclusive ? 'included' : ''} ({taxBp / 100}%)</span>
              <span className="font-semibold font-mono text-pos-secondary">{formatPKR(taxPaisa)}</span>
            </div>
          )}

          <div className="pt-1 border-t border-pos-divider flex items-baseline justify-between">
            <span className="text-sm font-bold text-pos-text">Total Payable</span>
            <span className="text-lg font-black font-mono text-pos-accent tracking-tight">{formatPKR(totalPayable)}</span>
          </div>
        </div>

        {/* Cash Tendered & Change Due (compact 2-column row when cart has items) */}
        {cart.length > 0 && paymentMethod === 'cash' && (
          <div className="space-y-1">
            <div className="grid grid-cols-2 gap-2.5 items-center">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-pos-muted mb-1" htmlFor="cash-tendered">
                  Cash Tendered
                </label>
                <input
                  disabled={isProcessing}
                  id="cash-tendered"
                  type="text"
                  inputMode="none"
                  aria-haspopup="dialog"
                  onClick={() => setKeypadOpen(true)}
                  value={tenderText}
                  onChange={event => {
                    setTenderText(event.target.value);
                    try { setCashTendered(parseRupees(event.target.value)); setInvalidTender(false); }
                    catch { setInvalidTender(true); }
                  }}
                  className="w-full h-11 rounded-md border border-pos-control bg-pos-inset px-2.5 text-sm font-bold font-mono text-pos-text focus-visible:border-pos-accent"
                />
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-pos-muted mb-1">
                  Change Due
                </span>
                <div className="h-11 flex items-center justify-between rounded-md border border-pos-border bg-pos-inset px-2.5 text-sm font-black font-mono text-pos-accent">
                  <span>{formatPKR(changeDuePaisa)}</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-1" aria-label="Quick cash amounts">
              {[null, 500, 1000, 2000, 5000].map(amount => (
                <button key={amount ?? 'exact'} type="button" disabled={isProcessing || (amount !== null && amount * 100 < totalPayable)}
                  onClick={() => { const paisa = amount === null ? totalPayable : amount * 100; setCashTendered(paisa); setTenderText(rupeeText(paisa)); setInvalidTender(false); }}
                  className="min-h-11 rounded-md border border-pos-control bg-pos-inset text-xs font-bold text-pos-text disabled:opacity-40">
                  {amount === null ? 'Exact' : amount}
                </button>
              ))}
            </div>
            {!cashPaymentValid && (
              <p className="text-xs font-semibold text-pos-danger-text">Tender must cover the total amount.</p>
            )}
          </div>
        )}

        {/* Payment Method Selector */}
        <div className="space-y-1.5">
          <h3 className="sr-only">Payment Method</h3>
          <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-pos-inset border border-pos-border">
            {paymentMethods.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                disabled={isProcessing}
                aria-pressed={paymentMethod === value}
                onClick={() => onSelectPaymentMethod(value)}
                className={`h-11 flex items-center justify-center gap-1.5 rounded-md text-xs font-bold transition cursor-pointer active:scale-95 ${
                  paymentMethod === value
                    ? 'bg-pos-selected text-pos-accent border border-pos-accent/60'
                    : ' border border-transparent text-pos-secondary hover:text-pos-text hover:bg-pos-surface/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            disabled={isProcessing || cart.length === 0}
            onClick={onOpenPrintModal}
            className="h-11 px-3.5 rounded-lg border border-pos-border bg-pos-surface hover:bg-pos-raised text-pos-secondary hover:text-pos-text text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-40 active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={() => onPlaceOrder(cashTenderedPaisa, paymentMethod)}
            disabled={cart.length === 0 || isProcessing || !cashPaymentValid}
            className="h-11 flex-1 rounded-lg bg-pos-action hover:bg-pos-action-hover text-white text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-40 cursor-pointer active:scale-[0.98]"
          >
            <Power className="w-4 h-4" />
            <span>{isProcessing ? 'Processing...' : `Complete Order (${paymentMethod === 'scan' ? 'Scan' : paymentMethod === 'card' ? 'Card' : 'Cash'})`}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {!isMobileOpen && <aside className="hidden lg:block w-[336px] h-full min-h-0 shrink-0">
        {drawerContent}
      </aside>}
      {isMobileOpen && (
        <Dialog label="Current order" onClose={() => onCloseMobile?.()} busy={isProcessing}
          backdropClassName="!p-0 !justify-end" className="w-full max-w-sm h-full bg-pos-surface">
          {drawerContent}
        </Dialog>
      )}
      {keypadOpen && <CashKeypad totalPaisa={totalPayable} initialValue={tenderText} busy={isProcessing}
        onClose={() => setKeypadOpen(false)} onConfirm={value => {
          setCashTendered(parseRupees(value)); setTenderText(rupeeText(parseRupees(value))); setInvalidTender(false); setKeypadOpen(false);
        }} />}
      {confirmClear && <Dialog label="Clear current order?" onClose={() => setConfirmClear(false)} className="w-full max-w-sm rounded-xl border border-pos-border bg-pos-surface p-5">
        <h2 className="font-bold text-pos-text">Clear current order?</h2>
        <p className="text-sm text-pos-muted mt-2">This removes every item and its instructions from this order.</p>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setConfirmClear(false)} className="px-3 py-2 rounded-lg text-xs font-semibold text-pos-secondary hover:bg-pos-raised">Keep order</button>
          <button disabled={isProcessing} onClick={() => { onClearCart(); setConfirmClear(false); }} className="px-3.5 py-2 rounded-lg text-xs font-bold bg-pos-danger-bg text-pos-danger-text border border-pos-danger-border">Clear all items</button>
        </div>
      </Dialog>}
    </>
  );
};
