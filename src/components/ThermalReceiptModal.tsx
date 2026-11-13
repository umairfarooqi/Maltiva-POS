import React, { useState, useEffect, useRef } from 'react';
import { Printer, Copy, Check, Scissors } from 'lucide-react';
import { Dialog, DialogHeader } from './ui/Dialog';
import { Order, PrinterSettings } from '../types/pos';
import { formatPKR } from '../utils/formatCurrency';
import { assignedPickupToken } from '../utils/orderReference';
import { receiptText } from '../utils/receiptText';
import { prepareReceiptPrint, printReceipt } from '../utils/printReceipt';
import { Button } from './ui/Button';
import { SegmentedControl } from './ui/SegmentedControl';

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
    <Dialog size="2xl" label="Receipt preview" onClose={onClose}>
        {/* Modal Top Bar */}
        <div className="shrink-0 p-3 border-b border-pos-divider bg-pos-inset/80">
          <DialogHeader
            media={<Printer className="size-5 shrink-0 text-pos-accent" aria-hidden="true" />}
            title="Takeaway Thermal Printer"
            description={<>{referenceLabel} <span className="break-all">{order.orderNumber}</span> • Token {tokenLabel}</>}
            onClose={onClose}
            closeLabel="Close receipt preview"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {/* Slip Filter Tabs */}
            <SegmentedControl
              label="Slips"
              wrap
              value={activeTab}
              onChange={setActiveTab}
              options={[
                { value: 'both', label: 'Both Slips (2)' },
                { value: 'customer', label: 'Customer Slip' },
                { value: 'kitchen', label: 'Kitchen Slip (KOT)' },
              ] as const}
            />

            {/* Paper Width */}
            <SegmentedControl
              label="Paper width"
              value={paperWidth}
              onChange={setPaperWidth}
              options={[{ value: '80mm', label: '80mm' }, { value: '58mm', label: '58mm' }] as const}
              className="tabular-nums"
            />
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
              {persistenceLabel && <p className="border-b border-dashed border-pos-control pb-2 mb-2 text-center font-bold">{persistenceLabel}</p>}
              <div className="text-center pb-3 border-b-2 border-dashed border-pos-control">
                <span className="text-xs uppercase font-bold tracking-widest text-pos-accent block mb-1">
                  Customer Receipt
                </span>
                <h2 className="text-lg font-black tracking-tight text-pos-text">
                  {settings.storeName || 'Maltiva Crust'}
                </h2>
                <p className="text-xs font-bold text-pos-secondary mt-0.5">
                  Counter Takeaway
                </p>
                <p className="text-xs font-semibold text-pos-muted mt-0.5">
                  {settings.tagline || 'Fresh food. Clear pickup.'}
                </p>
                {settings.address && (
                  <p className="text-xs font-semibold text-pos-muted">
                    {settings.address}
                  </p>
                )}
                {settings.whatsApp && (
                  <p className="text-xs font-bold text-pos-secondary mt-1">
                    WhatsApp: {settings.whatsApp}
                  </p>
                )}
              </div>

              {/* Token & Order Bar */}
              <div className="py-3 my-2 text-center bg-pos-inset rounded-lg border-2 border-pos-border">
                <span className="text-xs font-bold text-pos-muted uppercase tracking-wider block">
                  Takeaway Pickup Token
                </span>
                <span className="text-3xl font-black text-pos-text tracking-tight my-0.5 block">
                  {tokenLabel}
                </span>
                <p className="text-xs font-semibold text-pos-muted font-mono mt-0.5">
                  {referenceLabel} <span className="break-all">{order.orderNumber}</span> • {formattedDate} {formattedTime}
                </p>
                <p className="text-xs font-semibold text-pos-muted mt-0.5">
                  Cashier: {order.cashierName}
                </p>
              </div>

              {/* Items List */}
              <div className="py-2.5 border-b-2 border-dashed border-pos-control space-y-2">
                <div className="flex justify-between text-xs font-black text-pos-muted uppercase pb-1 border-b border-pos-border">
                  <span>Item</span>
                  <span>Amount</span>
                </div>

                {order.items.map(it => (
                  <div key={it.id} className="text-xs sm:text-sm">
                    <div className="flex justify-between items-start gap-1">
                      <span className="font-extrabold min-w-0 flex-1">
                        {it.quantity}x {it.productName}
                      </span>
                      <span className="font-extrabold shrink-0">{formatPKR(it.totalPricePaisa)}</span>
                    </div>

                    {/* Deal inclusions */}
                    {it.bundledProducts && it.bundledProducts.length > 0 && (
                      <div className="pl-3 text-xs font-semibold text-pos-muted space-y-0.5 mt-0.5">
                        {it.bundledProducts.map((b, idx) => (
                          <div key={idx}>• {b.quantity}x {b.productName}</div>
                        ))}
                      </div>
                    )}

                    {it.selectedVariations && it.selectedVariations.length > 0 && (
                      <div className="pl-3 text-xs font-semibold text-pos-muted">
                        + {it.selectedVariations.map(v => v.optionName).join(', ')}
                      </div>
                    )}
                    {it.notes && (
                      <p className="mt-1 text-xs font-bold text-pos-secondary">Note: {it.notes}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="py-2.5 border-b-2 border-dashed border-pos-control space-y-1.5 text-xs sm:text-sm font-semibold">
                <div className="flex justify-between text-pos-secondary">
                  <span>Subtotal</span>
                  <span className="font-bold">{formatPKR(order.subtotalPaisa)}</span>
                </div>
                {order.taxPaisa > 0 && (
                  <div className="flex justify-between text-pos-secondary">
                    <span>Tax</span>
                    <span className="font-bold">{formatPKR(order.taxPaisa)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base sm:text-lg font-black text-pos-text pt-1.5 border-t-2 border-pos-border">
                  <span>{isPending ? 'TOTAL' : isDraft ? 'TOTAL (UNPAID)' : 'TOTAL PAID'}</span>
                  <span>{formatPKR(order.totalPaisa)}</span>
                </div>
                <div className="flex justify-between text-xs text-pos-muted pt-0.5">
                  <span className="font-bold">Payment Mode</span>
                  <span className="uppercase font-black">{order.paymentMethod}</span>
                </div>
                {order.persistenceState === 'saved' && order.paymentMethod === 'cash' && order.cashTenderedPaisa != null && <>
                  <div className="flex justify-between text-xs font-bold"><span>Cash received</span><span>{formatPKR(order.cashTenderedPaisa)}</span></div>
                  {order.changeDuePaisa != null && <div className="flex justify-between text-xs font-bold"><span>Change</span><span>{formatPKR(order.changeDuePaisa)}</span></div>}
                </>}
              </div>

              {/* Customer Footer */}
              <div className="pt-3 text-center text-xs font-semibold text-pos-muted space-y-1">
                <p className="font-bold text-pos-secondary">Thank you for ordering at {settings.storeName || 'Maltiva Crust'}!</p>
                <p>{settings.tagline || 'Fresh food. Clear pickup.'}</p>
                {settings.whatsApp && <p className="font-bold">Order / WhatsApp: {settings.whatsApp}</p>}
              </div>
            </div>
          )}

          {/* TEAR DIVIDER */}
          {activeTab === 'both' && (
            <div className="flex items-center gap-2 text-xs font-mono text-pos-muted w-full max-w-[340px]">
              <div className="flex-1 border-b-2 border-dashed border-pos-control" />
              <div className="pos-panel flex items-center gap-1 text-[11px] px-2 py-0.5">
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
              {persistenceLabel && <p className="border-b border-dashed border-pos-control pb-2 mb-2 text-center font-bold">{persistenceLabel}</p>}
              <div className="text-center pb-2 border-b-2 border-pos-control">
                <span className="text-xs font-black uppercase tracking-wider block bg-pos-strong text-pos-strong-text py-1 rounded">
                  *** KITCHEN ORDER SLIP ***
                </span>
                <p className="text-xs font-bold text-pos-secondary mt-1 uppercase">
                  TAKEAWAY COUNTER
                </p>
                <div className="my-2 py-2.5 bg-pos-raised rounded-md border-2 border-pos-control">
                  <span className="text-4xl font-black text-pos-text tracking-tight block">
                    TOKEN {tokenLabel}
                  </span>
                  <p className="text-xs font-bold text-pos-secondary font-mono mt-0.5">
                    {referenceLabel} <span className="break-all">{order.orderNumber}</span> • {formattedTime}
                  </p>
                  <p className="text-xs font-semibold text-pos-muted mt-0.5">
                    Cashier: {order.cashierName}
                  </p>
                </div>
              </div>

              {/* Kitchen Food Preparation Checklist */}
              <div className="py-3 border-b-2 border-pos-control space-y-3">
                <div className="text-xs font-black text-pos-muted uppercase tracking-wider">
                  PREPARATION CHECKLIST:
                </div>

                {order.items.map(it => (
                  <div key={it.id} className="border-b border-dashed border-pos-border pb-2.5 last:border-none">
                    <div className="flex items-start gap-2.5">
                      <span className="w-6 h-6 rounded bg-pos-strong text-pos-strong-text flex items-center justify-center font-black text-sm shrink-0">
                        {it.quantity}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm sm:text-base font-black text-pos-text leading-tight block">
                          {it.productName.toUpperCase()}
                        </span>

                        {/* Deal items inside */}
                        {it.bundledProducts && it.bundledProducts.length > 0 && (
                          <div className="mt-1 pl-1.5 bg-pos-warning-bg p-1.5 rounded border border-pos-warning-border text-xs text-pos-warning-text space-y-0.5 font-bold">
                            <span className="text-xs font-black text-pos-warning-text block uppercase">Includes:</span>
                            {it.bundledProducts.map((b, idx) => (
                              <div key={idx}>&bull; {b.quantity}x {b.productName}</div>
                            ))}
                          </div>
                        )}

                        {it.selectedVariations && it.selectedVariations.length > 0 && (
                          <div className="mt-0.5 text-xs text-pos-secondary font-bold">
                            + {it.selectedVariations.map(v => v.optionName).join(' + ')}
                          </div>
                        )}

                        {it.notes && (
                          <div className="mt-1 bg-pos-danger-bg text-pos-danger-text p-1.5 rounded font-black text-xs">
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
          <Button variant="outline"
            onClick={handleCopy}
          >
            {copied ? <Check className="w-4 h-4 text-pos-success-text" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied to Clipboard' : 'Copy Text (ESC/POS)'}</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="outline"
              onClick={onClose}
            >
              Done
            </Button>
            <Button variant="primary"
              onClick={handlePrint}
              disabled={isPrinting}
            >
              <Printer className="w-4 h-4" />
              <span>Print {activeTab === 'both' ? 'Both Slips (2)' : activeTab === 'customer' ? 'Customer Slip' : 'Kitchen Slip'}</span>
            </Button>
          </div>
        </div>
    </Dialog>
  );
};
