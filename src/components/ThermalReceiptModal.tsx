import React, { useState, useEffect, useRef } from 'react';
import { X, Printer, Copy, Check, Scissors } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { Order, PrinterSettings } from '../types/pos';
import { formatPKR } from '../utils/formatCurrency';
import { assignedPickupToken } from '../utils/orderReference';
import { receiptText } from '../utils/receiptText';
import { prepareReceiptPrint, printReceipt } from '../utils/printReceipt';

interface ThermalReceiptModalProps {
  order: Order | null;
  settings: PrinterSettings;
  onClose: () => void;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  order,
  settings,
  onClose,
}) => {
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>(settings.paperWidth || '58mm');
  const [activeTab, setActiveTab] = useState<'both' | 'customer' | 'kitchen'>(settings.kitchenPrinterEnabled ? 'both' : 'customer');
  const [copied, setCopied] = useState(false);

  const printArea = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printError, setPrintError] = useState('');
  useEffect(() => {
    setPaperWidth(settings.paperWidth || '58mm');
  }, [settings.paperWidth]);

  useEffect(() => {
    let restore: (() => void) | undefined;
    const beforePrint = () => {
      restore?.();
      if (printArea.current) restore = prepareReceiptPrint(printArea.current, paperWidth);
    };
    const afterPrint = () => { restore?.(); restore = undefined; };
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
      afterPrint();
    };
  }, [paperWidth, order?.id]);

  if (!order) return null;
  const assignedToken = assignedPickupToken(order);
  const tokenLabel = assignedToken === null ? 'Awaiting save' : `#${assignedToken}`;
  const referenceLabel = assignedToken === null ? 'Reference' : 'Order';

  const isPending = order.persistenceState === 'pending';
  const isDraft = order.persistenceState === 'draft';
  const isRejected = order.persistenceState === 'rejected';
  const persistenceLabel = isPending ? 'PENDING — awaiting server save' : isDraft ? 'DRAFT — unpaid preview' : isRejected ? 'REJECTED — unpaid' : '';

  const formattedDate = new Date(order.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const formattedTime = new Date(order.createdAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrint = async () => {
    if (!printArea.current || isPrinting) return;
    setIsPrinting(true);
    setPrintError('');
    try { await printReceipt(printArea.current, paperWidth); }
    catch (error) { setPrintError((error as Error).message || 'Could not open printing. Please retry.'); }
    finally { setIsPrinting(false); }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(receiptText(order, settings, paperWidth, activeTab));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog label="Receipt preview" onClose={onClose} className="bg-pos-surface rounded-lg max-w-2xl w-full overflow-hidden border border-pos-border flex flex-col max-h-[calc(100dvh-2rem)]">
        {/* Modal Top Bar */}
        <div className="shrink-0 p-3 border-b border-pos-divider bg-pos-inset/80">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-pos-accent" />
              <div>
                <h3 className="text-sm font-bold text-pos-text">
                  Takeaway Thermal Printer
                </h3>
                <p className="text-[11px] text-pos-muted">
                  {referenceLabel} <span className="break-all">{order.orderNumber}</span> • Token {tokenLabel}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close receipt preview"
              className="w-11 h-11 shrink-0 rounded-md bg-pos-raised/80 text-pos-muted hover:bg-pos-control flex items-center justify-center transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {/* Slip Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1 bg-pos-raised/60 p-1 rounded-md text-xs font-semibold">
              <button
                aria-pressed={activeTab === 'both'} onClick={() => setActiveTab('both')}
                className={`px-3 py-1 rounded-lg transition ${
                  activeTab === 'both' ? 'bg-pos-surface text-pos-text' : 'text-pos-muted hover:text-pos-text'
                }`}
              >
                Both Slips (2)
              </button>
              <button
                aria-pressed={activeTab === 'customer'} onClick={() => setActiveTab('customer')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  activeTab === 'customer' ? 'bg-pos-surface text-pos-text' : 'text-pos-muted hover:text-pos-text'
                }`}
              >
                Customer Slip
              </button>
              <button
                aria-pressed={activeTab === 'kitchen'} onClick={() => setActiveTab('kitchen')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  activeTab === 'kitchen' ? 'bg-pos-surface text-pos-text' : 'text-pos-muted hover:text-pos-text'
                }`}
              >
                Kitchen Slip (KOT)
              </button>
            </div>

            {/* Paper Width */}
            <div className="flex items-center gap-1 bg-pos-surface border border-pos-border rounded-lg p-0.5 text-xs">
              <button
                aria-pressed={paperWidth === '80mm'} onClick={() => setPaperWidth('80mm')}
                className={`px-2 py-1 rounded font-mono font-semibold transition ${
                  paperWidth === '80mm' ? 'bg-pos-action text-white' : 'text-pos-muted'
                }`}
              >
                80mm
              </button>
              <button
                aria-pressed={paperWidth === '58mm'} onClick={() => setPaperWidth('58mm')}
                className={`px-2 py-1 rounded font-mono font-semibold transition ${
                  paperWidth === '58mm' ? 'bg-pos-action text-white' : 'text-pos-muted'
                }`}
              >
                58mm
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Receipt Body */}
        <div
          ref={printArea}
          tabIndex={0} role="region" aria-label="Receipt contents"
          id="thermal-receipt-print-area"
          data-paper-width={paperWidth}
          className="theme-paper receipt-content p-4 sm:p-6 min-h-0 overflow-y-auto flex-1 bg-pos-raised flex flex-col items-center gap-6"
        >
          {/* SLIP 1: CUSTOMER RECEIPT */}
          {(activeTab === 'both' || activeTab === 'customer') && (
            <div
              className={`bg-pos-surface p-6 font-mono text-pos-text text-xs border border-pos-border rounded-md print:border-none print:shadow-none ${
                paperWidth === '80mm' ? 'w-full max-w-[340px]' : 'w-full max-w-[260px]'
              }`}
            >
              {persistenceLabel && <p className="border-b border-dashed border-pos-control pb-2 mb-2 text-center font-black">{persistenceLabel}</p>}
              <div className="text-center pb-3 border-b border-dashed border-pos-control">
                <span className="text-[10px] uppercase font-bold tracking-widest text-pos-accent block mb-0.5">
                  Customer Receipt
                </span>
                <h2 className="text-base font-black tracking-tight text-pos-text">
                  {settings.storeName || 'Maltiva Crust'}
                </h2>
                <p className="text-[11px] font-bold text-pos-secondary">
                  Counter Takeaway
                </p>
                <p className="text-[10px] text-pos-muted">
                  Fresh food. Clear pickup.
                </p>
                <p className="text-[10px] text-pos-muted">
                  {settings.address}
                </p>
                <p className="text-[10px] text-pos-secondary font-bold mt-0.5">
                  {settings.whatsApp && `WhatsApp: ${settings.whatsApp}`}
                </p>
              </div>

              {/* Token & Order Bar */}
              <div className="py-2.5 my-1 text-center bg-pos-inset rounded border border-pos-border">
                <span className="text-[10px] text-pos-muted uppercase tracking-wider block">
                  Takeaway Pickup Token
                </span>
                <span className="text-2xl font-black text-pos-text tracking-tight">
                  {tokenLabel}
                </span>
                <p className="text-[10px] text-pos-muted font-mono mt-0.5">
                  {referenceLabel} <span className="break-all">{order.orderNumber}</span> • {formattedDate} {formattedTime}
                </p>
                <p className="text-[10px] text-pos-muted">
                  Cashier: {order.cashierName}
                </p>
              </div>

              {/* Items List */}
              <div className="py-2 border-b border-dashed border-pos-control space-y-2">
                <div className="flex justify-between text-[10px] font-bold text-pos-muted uppercase">
                  <span>Item</span>
                  <span>Amount</span>
                </div>

                {order.items.map(it => (
                  <div key={it.id} className="text-xs">
                    <div className="flex justify-between items-start gap-1">
                      <span className="font-bold min-w-0 flex-1">
                        {it.quantity}x {it.productName}
                      </span>
                      <span className="font-bold shrink-0">{formatPKR(it.totalPricePaisa)}</span>
                    </div>

                    {/* Deal inclusions */}
                    {it.bundledProducts && it.bundledProducts.length > 0 && (
                      <div className="pl-3 text-[10px] text-pos-muted space-y-0.5 mt-0.5">
                        {it.bundledProducts.map((b, idx) => (
                          <div key={idx}>• {b.quantity}x {b.productName}</div>
                        ))}
                      </div>
                    )}

                    {it.selectedVariations && it.selectedVariations.length > 0 && (
                      <div className="pl-3 text-[10px] text-pos-muted">
                        + {it.selectedVariations.map(v => v.optionName).join(', ')}
                      </div>
                    )}
                    {it.notes && (
                      <p className="mt-1 text-[10px] text-pos-secondary">Note: {it.notes}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="py-2.5 border-b border-dashed border-pos-control space-y-1 text-xs">
                <div className="flex justify-between text-pos-secondary">
                  <span>Subtotal</span>
                  <span>{formatPKR(order.subtotalPaisa)}</span>
                </div>
                {order.taxPaisa > 0 && (
                  <div className="flex justify-between text-pos-secondary">
                    <span>Tax</span>
                    <span>{formatPKR(order.taxPaisa)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black text-pos-text pt-1 border-t border-pos-border">
                  <span>{isPending ? 'TOTAL' : isDraft ? 'TOTAL (UNPAID)' : 'TOTAL PAID'}</span>
                  <span>{formatPKR(order.totalPaisa)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-pos-muted pt-0.5">
                  <span>Payment Mode</span>
                  <span className="uppercase font-bold">{order.paymentMethod}</span>
                </div>
                {order.persistenceState === 'saved' && order.paymentMethod === 'cash' && order.cashTenderedPaisa != null && <>
                  <div className="flex justify-between"><span>Cash received</span><span>{formatPKR(order.cashTenderedPaisa)}</span></div>
                  {order.changeDuePaisa != null && <div className="flex justify-between"><span>Change</span><span>{formatPKR(order.changeDuePaisa)}</span></div>}
                </>}
              </div>

              {/* Customer Footer */}
              <div className="pt-3 text-center text-[10px] text-pos-muted space-y-0.5">
                <p className="font-bold text-pos-secondary">Thank you for ordering at {settings.storeName || 'Maltiva Crust'}!</p>
                <p>Fresh food. Clear pickup.</p>
                {settings.whatsApp && <p>Order / WhatsApp: {settings.whatsApp}</p>}
              </div>
            </div>
          )}

          {/* TEAR DIVIDER */}
          {activeTab === 'both' && (
            <div className="flex items-center gap-2 text-xs font-mono text-pos-muted w-full max-w-[340px]">
              <div className="flex-1 border-b-2 border-dashed border-pos-control" />
              <div className="flex items-center gap-1 text-[11px] bg-pos-surface px-2 py-0.5 rounded border border-pos-border">
                <Scissors className="w-3 h-3 text-pos-muted" />
                <span>TEAR / SLIP 2</span>
              </div>
              <div className="flex-1 border-b-2 border-dashed border-pos-control" />
            </div>
          )}

          {/* SLIP 2: KITCHEN ORDER TICKET (KOT) */}
          {(activeTab === 'both' || activeTab === 'kitchen') && (
            <div
              className={`bg-pos-surface p-6 font-mono text-pos-text text-xs border border-pos-border rounded-md print:border-none print:shadow-none ${
                paperWidth === '80mm' ? 'w-full max-w-[340px]' : 'w-full max-w-[260px]'
              }`}
            >
              {persistenceLabel && <p className="border-b border-dashed border-pos-control pb-2 mb-2 text-center font-black">{persistenceLabel}</p>}
              <div className="text-center pb-2 border-b-2 border-pos-control">
                <span className="text-[11px] font-black uppercase tracking-wider block bg-pos-strong text-white py-0.5 rounded">
                  *** KITCHEN ORDER SLIP ***
                </span>
                <p className="text-[10px] font-bold text-pos-secondary mt-1 uppercase">
                  TAKEAWAY COUNTER
                </p>
                <div className="my-2 py-2 bg-pos-raised rounded-md border border-pos-control">
                  <span className="text-3xl font-black text-pos-text tracking-tight block">
                    TOKEN {tokenLabel}
                  </span>
                  <p className="text-[11px] font-bold text-pos-secondary font-mono mt-0.5">
                    {referenceLabel} <span className="break-all">{order.orderNumber}</span> • {formattedTime}
                  </p>
                  <p className="text-[10px] text-pos-muted">
                    Cashier: {order.cashierName}
                  </p>
                </div>
              </div>

              {/* Kitchen Food Preparation Checklist */}
              <div className="py-3 border-b-2 border-pos-control space-y-3">
                <div className="text-[10px] font-bold text-pos-muted uppercase tracking-wider">
                  PREPARATION CHECKLIST:
                </div>

                {order.items.map(it => (
                  <div key={it.id} className="border-b border-dashed border-pos-border pb-2 last:border-none">
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded bg-pos-strong text-white flex items-center justify-center font-bold text-xs shrink-0">
                        {it.quantity}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-black text-pos-text leading-tight block">
                          {it.productName.toUpperCase()}
                        </span>

                        {/* Deal items inside */}
                        {it.bundledProducts && it.bundledProducts.length > 0 && (
                          <div className="mt-1 pl-1 bg-pos-warning-bg p-1.5 rounded border border-pos-warning-border text-[11px] text-pos-warning-text space-y-0.5 font-bold">
                            <span className="text-[10px] text-pos-warning-text block uppercase">Includes:</span>
                            {it.bundledProducts.map((b, idx) => (
                              <div key={idx}>&bull; {b.quantity}x {b.productName}</div>
                            ))}
                          </div>
                        )}

                        {it.selectedVariations && it.selectedVariations.length > 0 && (
                          <div className="mt-0.5 text-[11px] text-pos-secondary font-bold">
                            + {it.selectedVariations.map(v => v.optionName).join(' + ')}
                          </div>
                        )}

                        {it.notes && (
                          <div className="mt-1 bg-pos-danger-bg text-pos-danger-text p-1 rounded font-bold text-[10px]">
                            ** NOTE: {it.notes} **
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 text-center text-[10px] font-bold text-pos-muted">
                PREPARE FRESH & HAND TO COUNTER
              </div>
            </div>
          )}
        </div>

        {printError && <p role="alert" className="px-6 py-2 text-pos-danger-text text-sm">{printError}</p>}

        {/* Modal Footer Controls */}
        <div className="shrink-0 p-3 border-t border-pos-divider bg-pos-surface flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-4 py-2 border border-pos-control hover:bg-pos-inset rounded-md text-xs font-semibold text-pos-secondary transition"
          >
            {copied ? <Check className="w-4 h-4 text-pos-success-text" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied to Clipboard' : 'Copy Text (ESC/POS)'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-pos-control text-pos-secondary hover:bg-pos-inset rounded-md text-xs font-semibold"
            >
              Done
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="flex items-center gap-1.5 px-6 py-2.5 bg-pos-action hover:bg-pos-action-hover text-white rounded-md text-xs font-bold transition"
            >
              <Printer className="w-4 h-4" />
              <span>Print {activeTab === 'both' ? 'Both Slips (2)' : activeTab === 'customer' ? 'Customer Slip' : 'Kitchen Slip'}</span>
            </button>
          </div>
        </div>
    </Dialog>
  );
};
