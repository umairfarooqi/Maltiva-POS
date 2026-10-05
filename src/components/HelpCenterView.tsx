import React from 'react';
import { HelpCircle, Keyboard, Printer, Wifi, Shield } from 'lucide-react';

export const HelpCenterView: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-pos-canvas">
      <div className="bg-pos-surface p-4 sm:p-5 rounded-lg border border-pos-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-pos-selected text-pos-accent flex items-center justify-center">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-pos-text tracking-tight">
              Maltiva POS Help & Operations Manual
            </h1>
            <p className="text-xs text-pos-muted mt-0.5">
              Speed guides for cashier checkout, thermal printing, and offline resilience
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Section 1: Keyboard & Speed Counters */}
        <div className="bg-pos-surface p-5 rounded-lg border border-pos-border space-y-3">
          <div className="flex items-center gap-2 border-b border-pos-divider pb-2">
            <Keyboard className="w-4 h-4 text-pos-accent" />
            <h2 className="text-sm font-bold text-pos-text">
              Checkout Counter Speed Tips
            </h2>
          </div>
          <ul className="text-xs text-pos-secondary space-y-2">
            <li>
              • <strong>1-Tap Add</strong>: Click "+" directly on any food item to add 1 unit. Click again to increment.
            </li>
            <li>
              • <strong>Item Variations</strong>: If a dish has custom options (size, spice, syrup), clicking "+" opens the customization drawer with live price updates.
            </li>
            <li>
              • <strong>Fast Table Switching</strong>: Click the table title in the top right cart header to switch dine-in tables or toggle take-away mode.
            </li>
            <li>
              • <strong>Quick Payment</strong>: Select Cash, Card, or Scan with one tap; total is computed with taxes and charity donation instantly.
            </li>
          </ul>
        </div>

        {/* Section 2: Thermal Receipt Printing */}
        <div className="bg-pos-surface p-5 rounded-lg border border-pos-border space-y-3">
          <div className="flex items-center gap-2 border-b border-pos-divider pb-2">
            <Printer className="w-4 h-4 text-pos-accent" />
            <h2 className="text-sm font-bold text-pos-text">
              Thermal Printer & ESC/POS Hardware
            </h2>
          </div>
          <ul className="text-xs text-pos-secondary space-y-2">
            <li>
              • <strong>Paper Compatibility</strong>: Supports standard 80mm high-speed kitchen printers and 58mm compact mobile thermal printers.
            </li>
            <li>
              • <strong>Instant Print</strong>: Click "Print" at the bottom of the checkout drawer to preview and print formatted thermal receipts.
            </li>
            <li>
              • <strong>ESC/POS Raw Command Copy</strong>: Need to send raw serial bytes or Bluetooth commands? Click "Copy ESC/POS" inside the receipt modal.
            </li>
            <li>
              • <strong>Auto-Print</strong>: Enable "Auto-Print on Checkout" in Settings to automatically trigger printing when order is submitted.
            </li>
          </ul>
        </div>

        {/* Section 3: Offline Data Integrity */}
        <div className="bg-pos-surface p-5 rounded-lg border border-pos-border space-y-3">
          <div className="flex items-center gap-2 border-b border-pos-divider pb-2">
            <Wifi className="w-4 h-4 text-pos-accent" />
            <h2 className="text-sm font-bold text-pos-text">
              Offline Protection & Deduplication
            </h2>
          </div>
          <ul className="text-xs text-pos-secondary space-y-2">
            <li>
              • <strong>Uninterrupted Sales</strong>: If the internet drops during peak rush, the POS continues operating with zero interruptions.
            </li>
            <li>
              • <strong>Zero Duplicate Charges</strong>: Every transaction is stamped with a unique cryptographic queue UUID. When reconnected, the server deduplicates logs automatically.
            </li>
            <li>
              • <strong>Real-Time Stock Updates</strong>: Stock counts decrement locally on the spot so you never oversell an ingredient.
            </li>
          </ul>
        </div>

        {/* Section 4: Staff Roles */}
        <div className="bg-pos-surface p-5 rounded-lg border border-pos-border space-y-3">
          <div className="flex items-center gap-2 border-b border-pos-divider pb-2">
            <Shield className="w-4 h-4 text-pos-accent" />
            <h2 className="text-sm font-bold text-pos-text">
              Staff Security & Role Boundaries
            </h2>
          </div>
          <ul className="text-xs text-pos-secondary space-y-2">
            <li>
              • <strong>Cashier</strong>: Restricted strictly to the Order Line. Cannot view backend profit margins, cost of goods, or delete menu items.
            </li>
            <li>
              • <strong>Manager</strong>: Can add and edit menu items, adjust live stock, and see today and yesterday's gross sales.
            </li>
            <li>
              • <strong>Admin</strong>: Complete business oversight, staff management, and full Profit & Loss reporting.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
