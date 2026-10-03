import React, { useState } from 'react';
import { X, Printer, Copy, Check, Scissors } from 'lucide-react';
import { Order, PrinterSettings } from '../types/pos';
import { formatPKR } from '../utils/formatCurrency';

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
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>(settings.paperWidth || '80mm');
  const [activeTab, setActiveTab] = useState<'both' | 'customer' | 'kitchen'>('both');
  const [copied, setCopied] = useState(false);

  if (!order) return null;

  const formattedDate = new Date(order.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const formattedTime = new Date(order.createdAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrint = () => {
    window.print();
  };

  const generateEscPosText = () => {
    const divider = '-'.repeat(paperWidth === '80mm' ? 42 : 32);
    let lines: string[] = [];

    // --- SLIP 1: CUSTOMER RECEIPT ---
    if (activeTab === 'both' || activeTab === 'customer') {
      lines.push('==========================================');
      lines.push('             MALTIVA CRUST                ');
      lines.push('      Fast Food That Hits Different🔥      ');
      lines.push('   Pizza • Sandwiches • Fries🍟           ');
      lines.push('      Fresh • Cheesy • Loaded             ');
      lines.push('        Phase 3 DHA Lahore                ');
      lines.push('       WhatsApp: 03444757082              ');
      lines.push(divider);
      lines.push(`TOKEN #: ${order.tokenNumber || order.orderNumber.replace('#F', '')}    [TAKEAWAY]`);
      lines.push(`ORDER:   ${order.orderNumber}`);
      lines.push(`DATE:    ${formattedDate} ${formattedTime}`);
      lines.push(`CASHIER: ${order.cashierName}`);
      lines.push(divider);
      lines.push('QTY  ITEM                         AMOUNT');
      lines.push(divider);

      order.items.forEach(it => {
        const name = it.productName.substring(0, 22).padEnd(22, ' ');
        const price = `Rs. ${Math.round(it.totalPrice)}`.padStart(8, ' ');
        lines.push(`${it.quantity}x  ${name} ${price}`);

        if (it.bundledProducts && it.bundledProducts.length > 0) {
          it.bundledProducts.forEach(b => {
            lines.push(`   * ${b.quantity}x ${b.productName}`);
          });
        }

        if (it.selectedVariations && it.selectedVariations.length > 0) {
          it.selectedVariations.forEach(v => {
            lines.push(`   + ${v.optionName}`);
          });
        }

        if (it.notes) {
          lines.push(`   Note: ${it.notes}`);
        }
      });

      lines.push(divider);
      lines.push(`SUBTOTAL:                 Rs. ${Math.round(order.subtotal)}`);
      if (order.tax > 0) {
        lines.push(`TAX:                      Rs. ${Math.round(order.tax)}`);
      }
      lines.push(`TOTAL PAYABLE:            Rs. ${Math.round(order.total)}`);
      lines.push(`PAYMENT MODE:             ${order.paymentMethod.toUpperCase()}`);
      lines.push(divider);
      lines.push('       THANK YOU FOR YOUR ORDER!          ');
      lines.push('     Follow us @MaltivaCrust              ');
      lines.push('     Delivery / Care: 03444757082         ');
      lines.push('==========================================');
    }

    // --- SLIP 2: KITCHEN ORDER TICKET (KOT) ---
    if (activeTab === 'both' || activeTab === 'kitchen') {
      if (activeTab === 'both') {
        lines.push('');
        lines.push('---------------- TEAR HERE ---------------');
        lines.push('');
      }
      lines.push('==========================================');
      lines.push('     *** KITCHEN SLIP - TAKEAWAY ***      ');
      lines.push(`           TOKEN #: ${order.tokenNumber || order.orderNumber.replace('#F', '')}           `);
      lines.push(`ORDER: ${order.orderNumber}  | TIME: ${formattedTime}`);
      lines.push(`CASHIER: ${order.cashierName}`);
      lines.push(divider);
      lines.push('QTY  PREPARATION ITEM');
      lines.push(divider);

      order.items.forEach(it => {
        lines.push(`[ ] ${it.quantity}x  ${it.productName.toUpperCase()}`);
        if (it.bundledProducts && it.bundledProducts.length > 0) {
          it.bundledProducts.forEach(b => {
            lines.push(`      -> ${b.quantity}x ${b.productName}`);
          });
        }
        if (it.selectedVariations && it.selectedVariations.length > 0) {
          it.selectedVariations.forEach(v => {
            lines.push(`      ++ ${v.optionName}`);
          });
        }
        if (it.notes) {
          lines.push(`      ** SPECIAL: ${it.notes} **`);
        }
      });

      lines.push(divider);
      lines.push('          READY FOR COUNTER PICKUP        ');
      lines.push('==========================================');
    }

    return lines.join('\n');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateEscPosText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[96vh]">
        {/* Modal Top Bar */}
        <div className="p-4 px-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-[#00A389]" />
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                Takeaway Thermal Printer
              </h3>
              <p className="text-[11px] text-slate-400">
                Order {order.orderNumber} • Token #{order.tokenNumber}
              </p>
            </div>
          </div>

          {/* Slip Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setActiveTab('both')}
              className={`px-3 py-1 rounded-lg transition ${
                activeTab === 'both' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Both Slips (2)
            </button>
            <button
              onClick={() => setActiveTab('customer')}
              className={`px-2.5 py-1 rounded-lg transition ${
                activeTab === 'customer' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Customer Slip
            </button>
            <button
              onClick={() => setActiveTab('kitchen')}
              className={`px-2.5 py-1 rounded-lg transition ${
                activeTab === 'kitchen' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Kitchen Slip (KOT)
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Paper Width */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setPaperWidth('80mm')}
                className={`px-2 py-1 rounded font-mono font-semibold transition ${
                  paperWidth === '80mm' ? 'bg-[#00A389] text-white' : 'text-slate-500'
                }`}
              >
                80mm
              </button>
              <button
                onClick={() => setPaperWidth('58mm')}
                className={`px-2 py-1 rounded font-mono font-semibold transition ${
                  paperWidth === '58mm' ? 'bg-[#00A389] text-white' : 'text-slate-500'
                }`}
              >
                58mm
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-200/80 text-slate-500 hover:bg-slate-300 flex items-center justify-center transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Receipt Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-100 flex flex-col items-center gap-6">
          {/* SLIP 1: CUSTOMER RECEIPT */}
          {(activeTab === 'both' || activeTab === 'customer') && (
            <div
              className={`bg-white shadow-md p-6 font-mono text-slate-800 text-xs border border-slate-200 rounded-lg print:border-none print:shadow-none ${
                paperWidth === '80mm' ? 'w-full max-w-[340px]' : 'w-full max-w-[260px]'
              }`}
            >
              <div className="text-center pb-3 border-b border-dashed border-slate-300">
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#00A389] block mb-0.5">
                  Customer Receipt
                </span>
                <h2 className="text-base font-black tracking-tight text-slate-900">
                  MALTIVA CRUST
                </h2>
                <p className="text-[11px] font-bold text-slate-700">
                  Fast Food That Hits Different🔥
                </p>
                <p className="text-[10px] text-slate-500">
                  Pizza • Sandwiches • Fries🍟
                </p>
                <p className="text-[10px] text-slate-500">
                  Phase 3 DHA Lahore
                </p>
                <p className="text-[10px] text-slate-600 font-bold mt-0.5">
                  📲 WhatsApp: 03444757082
                </p>
              </div>

              {/* Token & Order Bar */}
              <div className="py-2.5 my-1 text-center bg-slate-50 rounded border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                  Takeaway Pickup Token
                </span>
                <span className="text-2xl font-black text-slate-900 tracking-tight">
                  #{order.tokenNumber || order.orderNumber.replace('#F', '')}
                </span>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Order {order.orderNumber} • {formattedDate} {formattedTime}
                </p>
                <p className="text-[10px] text-slate-400">
                  Cashier: {order.cashierName}
                </p>
              </div>

              {/* Items List */}
              <div className="py-2 border-b border-dashed border-slate-300 space-y-2">
                <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
                  <span>Item</span>
                  <span>Amount</span>
                </div>

                {order.items.map(it => (
                  <div key={it.id} className="text-xs">
                    <div className="flex justify-between items-start gap-1">
                      <span className="font-bold flex-1">
                        {it.quantity}x {it.productName}
                      </span>
                      <span className="font-bold shrink-0">{formatPKR(it.totalPrice)}</span>
                    </div>

                    {/* Deal inclusions */}
                    {it.bundledProducts && it.bundledProducts.length > 0 && (
                      <div className="pl-3 text-[10px] text-slate-500 space-y-0.5 mt-0.5">
                        {it.bundledProducts.map((b, idx) => (
                          <div key={idx}>• {b.quantity}x {b.productName}</div>
                        ))}
                      </div>
                    )}

                    {it.selectedVariations && it.selectedVariations.length > 0 && (
                      <div className="pl-3 text-[10px] text-slate-500">
                        + {it.selectedVariations.map(v => v.optionName).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatPKR(order.subtotal)}</span>
                </div>
                {order.tax > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Tax</span>
                    <span>{formatPKR(order.tax)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black text-slate-900 pt-1 border-t border-slate-200">
                  <span>TOTAL PAID</span>
                  <span>{formatPKR(order.total)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 pt-0.5">
                  <span>Payment Mode</span>
                  <span className="uppercase font-bold">{order.paymentMethod}</span>
                </div>
              </div>

              {/* Customer Footer */}
              <div className="pt-3 text-center text-[10px] text-slate-500 space-y-0.5">
                <p className="font-bold text-slate-700">Thank you for ordering at Maltiva Crust!</p>
                <p>Fresh • Cheesy • Loaded</p>
                <p>Order / WhatsApp: 03444757082</p>
              </div>
            </div>
          )}

          {/* TEAR DIVIDER */}
          {activeTab === 'both' && (
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 w-full max-w-[340px]">
              <div className="flex-1 border-b-2 border-dashed border-slate-300" />
              <div className="flex items-center gap-1 text-[11px] bg-white px-2 py-0.5 rounded border border-slate-200">
                <Scissors className="w-3 h-3 text-slate-500" />
                <span>TEAR / SLIP 2</span>
              </div>
              <div className="flex-1 border-b-2 border-dashed border-slate-300" />
            </div>
          )}

          {/* SLIP 2: KITCHEN ORDER TICKET (KOT) */}
          {(activeTab === 'both' || activeTab === 'kitchen') && (
            <div
              className={`bg-white shadow-md p-6 font-mono text-slate-900 text-xs border border-slate-200 rounded-lg print:border-none print:shadow-none ${
                paperWidth === '80mm' ? 'w-full max-w-[340px]' : 'w-full max-w-[260px]'
              }`}
            >
              <div className="text-center pb-2 border-b-2 border-slate-900">
                <span className="text-[11px] font-black uppercase tracking-wider block bg-slate-900 text-white py-0.5 rounded">
                  *** KITCHEN ORDER SLIP ***
                </span>
                <p className="text-[10px] font-bold text-slate-600 mt-1 uppercase">
                  TAKEAWAY COUNTER
                </p>
                <div className="my-2 py-2 bg-slate-100 rounded-lg border border-slate-300">
                  <span className="text-3xl font-black text-slate-900 tracking-tight block">
                    TOKEN #{order.tokenNumber || order.orderNumber.replace('#F', '')}
                  </span>
                  <p className="text-[11px] font-bold text-slate-700 font-mono mt-0.5">
                    Order {order.orderNumber} • {formattedTime}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Cashier: {order.cashierName}
                  </p>
                </div>
              </div>

              {/* Kitchen Food Preparation Checklist */}
              <div className="py-3 border-b-2 border-slate-900 space-y-3">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  PREPARATION CHECKLIST:
                </div>

                {order.items.map(it => (
                  <div key={it.id} className="border-b border-dashed border-slate-200 pb-2 last:border-none">
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                        {it.quantity}
                      </span>
                      <div className="flex-1">
                        <span className="text-sm font-black text-slate-900 leading-tight block">
                          {it.productName.toUpperCase()}
                        </span>

                        {/* Deal items inside */}
                        {it.bundledProducts && it.bundledProducts.length > 0 && (
                          <div className="mt-1 pl-1 bg-amber-50 p-1.5 rounded border border-amber-200 text-[11px] text-amber-900 space-y-0.5 font-bold">
                            <span className="text-[10px] text-amber-700 block uppercase">Includes:</span>
                            {it.bundledProducts.map((b, idx) => (
                              <div key={idx}>&bull; {b.quantity}x {b.productName}</div>
                            ))}
                          </div>
                        )}

                        {it.selectedVariations && it.selectedVariations.length > 0 && (
                          <div className="mt-0.5 text-[11px] text-slate-700 font-bold">
                            + {it.selectedVariations.map(v => v.optionName).join(' + ')}
                          </div>
                        )}

                        {it.notes && (
                          <div className="mt-1 bg-rose-50 text-rose-700 p-1 rounded font-bold text-[10px]">
                            ** NOTE: {it.notes} **
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 text-center text-[10px] font-bold text-slate-500">
                PREPARE FRESH & HAND TO COUNTER
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 px-6 border-t border-slate-100 bg-white flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 transition"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied to Clipboard' : 'Copy Text (ESC/POS)'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-semibold"
            >
              Done
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-6 py-2.5 bg-[#00A389] hover:bg-[#008f77] text-white rounded-xl text-xs font-bold shadow-md shadow-[#00A389]/20 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Print {activeTab === 'both' ? 'Both Slips (2)' : activeTab === 'customer' ? 'Customer Slip' : 'Kitchen Slip'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
