import React, { useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  Receipt,
  Calendar,
  Filter,
  CreditCard,
  Banknote,
  Printer,
  ShoppingBag,
  ArrowUpRight,
} from 'lucide-react';
import { Order, Product, User } from '../types/pos';
import { dateRange } from '../utils/dateRange';
import { formatPKR } from '../utils/formatCurrency';

interface DashboardViewProps {
  orders: Order[];
  products: Product[];
  currentUser: User;
  onNavigateToTab: (tab: any) => void;
  onSelectOrderPreview?: (order: Order) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  orders,
  products: _products,
  currentUser: _currentUser,
  onNavigateToTab,
  onSelectOrderPreview,
}) => {
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'card' | 'scan' | 'other'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const now = new Date();
  const range = dateRange(dateFilter, customStartDate, customEndDate, now);
  const todayRange = dateRange('today', '', '', now);
  const yesterdayRange = dateRange('yesterday', '', '', now);
  const startOfToday = todayRange.start;
  const startOfYesterday = yesterdayRange.start;

  // Filter Orders
  const filteredOrders = orders.filter(order => {
    if (order.status === 'cancelled' || order.persistenceState !== 'saved') return false;

    // Payment Filter
    if (paymentFilter === 'other' ? ['cash', 'card', 'scan'].includes(order.paymentMethod) : paymentFilter !== 'all' && order.paymentMethod !== paymentFilter) {
      return false;
    }

    const orderTime = new Date(order.createdAt).getTime();

    return !range.error && orderTime >= range.start && orderTime < range.end;
  });

  // Calculate Metrics
  const totalSales = filteredOrders.reduce((sum, o) => sum + o.totalPaisa, 0);
  const totalRawCost = filteredOrders.reduce((sum, o) => sum + (o.totalCostPaisa || 0), 0);
  const totalOrdersCount = filteredOrders.length;
  const averageOrderValue = totalOrdersCount > 0 ? Math.round(totalSales / totalOrdersCount) : 0;

  const cashOrders = filteredOrders.filter(o => o.paymentMethod === 'cash');
  const scanOrders = filteredOrders.filter(o => o.paymentMethod === 'scan');
  const scanTotal = scanOrders.reduce((sum, o) => sum + o.totalPaisa, 0);
  const cardOrders = filteredOrders.filter(o => o.paymentMethod === 'card');

  const cashTotal = cashOrders.reduce((sum, o) => sum + o.totalPaisa, 0);
  const cardTotal = cardOrders.reduce((sum, o) => sum + o.totalPaisa, 0);

  // Today vs Yesterday sales for quick growth comparison
  const todayOnlySales = orders
    .filter(o => new Date(o.createdAt).getTime() >= startOfToday && new Date(o.createdAt).getTime() < todayRange.end && o.status !== 'cancelled' && o.persistenceState === 'saved')
    .reduce((sum, o) => sum + o.totalPaisa, 0);

  const yesterdayOnlySales = orders
    .filter(o => {
      const t = new Date(o.createdAt).getTime();
      return t >= startOfYesterday && t < startOfToday && o.status !== 'cancelled' && o.persistenceState === 'saved';
    })
    .reduce((sum, o) => sum + o.totalPaisa, 0);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 select-none bg-pos-canvas">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-pos-surface p-4 sm:p-5 rounded-lg border border-pos-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-pos-selected text-pos-accent">
              Admin Executive Sales
            </span>
            <span className="text-xs text-pos-muted">Maltiva Crust • Phase 3 DHA Lahore</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-pos-text tracking-tight">
            Daily Sales & Counter Reports
          </h1>
          <p className="text-xs text-pos-muted mt-0.5">
            Takeaway order performance, real-time revenue, and filter breakdowns
          </p>
        </div>

        <button
          onClick={() => onNavigateToTab('order_line')}
          className="flex items-center gap-2 px-4 py-2.5 bg-pos-action hover:bg-pos-action-hover text-white rounded-md text-xs font-bold transition cursor-pointer self-start md:self-auto"
        >
          <Receipt className="w-4 h-4" />
          <span>Go to Order Line</span>
        </button>
      </div>

      {/* Date & Payment Filter Bar */}
      <div className="bg-pos-surface p-3 rounded-lg border border-pos-border flex flex-wrap items-center justify-between gap-3">
        {/* Date Filter Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-pos-muted mr-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            <span>Date Basis:</span>
          </span>

          {[
            { id: 'today', label: "Today's Sales" },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'week', label: 'Last 7 Days' },
            { id: 'month', label: 'This Month' },
            { id: 'custom', label: 'Custom Dates' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setDateFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                dateFilter === tab.id
                  ? 'bg-pos-action text-white'
                  : 'bg-pos-surface text-pos-secondary hover:bg-pos-inset border border-pos-control'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Payment Filter Tabs */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-pos-muted mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Payment:</span>
          </span>

          {[
            { id: 'all', label: 'All Modes' },
            { id: 'cash', label: 'Cash Only' },
            { id: 'card', label: 'Card Only' },
            { id: 'scan', label: 'Scan Only' },
            { id: 'other', label: 'Other / Legacy' },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => setPaymentFilter(p.id as any)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                paymentFilter === p.id
                  ? 'bg-pos-strong text-white'
                  : 'bg-pos-surface text-pos-secondary hover:bg-pos-inset border border-pos-control'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Date Pickers (if Custom Dates is selected) */}
      {dateFilter === 'custom' && (
        <div className="bg-pos-surface p-3 rounded-lg border border-pos-border flex flex-wrap items-center gap-3 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-pos-secondary">From Date:</label>
            <input
              type="date"
              value={customStartDate}
              onChange={e => setCustomStartDate(e.target.value)}
              className="px-3 py-1.5 border border-pos-control rounded-md text-xs text-pos-secondary focus-visible:border-pos-accent"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-pos-secondary">To Date:</label>
            <input
              type="date"
              value={customEndDate}
              onChange={e => setCustomEndDate(e.target.value)}
              className="px-3 py-1.5 border border-pos-control rounded-md text-xs text-pos-secondary focus-visible:border-pos-accent"
            />
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Sales */}
        <div className="bg-pos-surface p-4 rounded-lg border border-pos-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-pos-secondary uppercase tracking-normal">
              Total Takeaway Sales
            </span>
            <div className="w-8 h-8 rounded-md bg-pos-selected text-pos-accent flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-pos-text font-mono tracking-tight">
            {formatPKR(totalSales)}
          </p>
          <p className="text-[11px] text-pos-muted">
            {dateFilter === 'today'
              ? `Today: ${formatPKR(todayOnlySales)} vs Yest: ${formatPKR(yesterdayOnlySales)}`
              : `Calculated from ${totalOrdersCount} completed orders`}
          </p>
        </div>

        {/* Card 2: Total Orders */}
        <div className="bg-pos-surface p-4 rounded-lg border border-pos-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-pos-secondary uppercase tracking-normal">
              Orders Served
            </span>
            <div className="w-8 h-8 rounded-md bg-pos-selected text-pos-accent flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-pos-text font-mono tracking-tight">
            {totalOrdersCount}
          </p>
          <p className="text-[11px] text-pos-muted">
            Average ticket size: <span className="font-bold text-pos-secondary">{formatPKR(averageOrderValue)}</span>
          </p>
        </div>

        {/* Card 3: Cash Received */}
        <div className="bg-pos-surface p-4 rounded-lg border border-pos-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-pos-secondary uppercase tracking-normal">
              Cash Drawer
            </span>
            <div className="w-8 h-8 rounded-md bg-pos-selected text-pos-accent flex items-center justify-center">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-pos-text font-mono tracking-tight">
            {formatPKR(cashTotal)}
          </p>
          <p className="text-[11px] text-pos-muted">
            {cashOrders.length} cash orders processed
          </p>
        </div>

        {/* Card 4: Card / POS Terminal */}
        <div className="bg-pos-surface p-4 rounded-lg border border-pos-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-pos-secondary uppercase tracking-normal">
              Card Terminal
            </span>
            <div className="w-8 h-8 rounded-md bg-pos-selected text-pos-accent flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-pos-text font-mono tracking-tight">
            {formatPKR(cardTotal)}
          </p>
          <p className="text-[11px] text-pos-muted">
            {cardOrders.length} digital card orders
          </p>
        </div>
      </div>

      {range.error && <p role="alert" className="text-sm text-pos-danger-text">{range.error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pos-border pb-3 text-sm text-pos-secondary">
        <span>Scan payments ({scanOrders.length} orders)</span><strong className="text-pos-text">{formatPKR(scanTotal)}</strong>
      </div>
      {filteredOrders.some(order => !['cash', 'card', 'scan'].includes(order.paymentMethod)) && <p className="text-sm text-pos-secondary">Other / legacy payments: <strong>{formatPKR(filteredOrders.filter(order => !['cash', 'card', 'scan'].includes(order.paymentMethod)).reduce((sum, order) => sum + order.totalPaisa, 0))}</strong></p>}
      {/* Filtered Orders Breakdown Table */}
      <div className="bg-pos-surface rounded-lg border border-pos-border overflow-hidden">
        <div className="p-4 border-b border-pos-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-pos-text">
              Filtered Orders Register ({filteredOrders.length})
            </h2>
            <p className="text-xs text-pos-muted mt-0.5">
              Itemized takeaway receipts with reprint dual slips capability
            </p>
          </div>

          <span className="text-xs font-mono font-bold text-pos-accent bg-pos-selected px-2 py-1 rounded">
            Total: {formatPKR(totalSales)}
          </span>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="py-12 text-center text-pos-muted text-xs">
            No takeaway orders found for the selected date and payment filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-pos-inset border-b border-pos-divider text-pos-muted font-semibold uppercase text-[10px]">
                <tr>
                  <th className="p-4">Token #</th>
                  <th className="p-4">Order #</th>
                  <th className="p-4">Time</th>
                  <th className="p-4">Cashier</th>
                  <th className="p-4">Items Summary</th>
                  <th className="p-4">Payment</th>
                  <th className="p-4 text-right">Total (PKR)</th>
                  <th className="p-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pos-divider">
                {filteredOrders.map(order => (
                  <tr key={order.id} className="hover:bg-pos-inset/70 transition">
                    <td className="p-4 font-black text-pos-text font-mono">
                      <span className="px-2.5 py-1 rounded-lg bg-pos-success-bg text-pos-success-text border border-pos-success-border">
                        #{order.tokenNumber || order.orderNumber.replace('#F', '')}
                      </span>
                    </td>
                    <td className="p-4 font-mono font-bold text-pos-secondary">
                      {order.orderNumber}
                    </td>
                    <td className="p-4 text-pos-muted font-mono">
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-4 text-pos-secondary font-medium">
                      {order.cashierName}
                    </td>
                    <td className="p-4 text-pos-secondary max-w-xs truncate">
                      {order.items.map(it => `${it.quantity}x ${it.productName}`).join(', ')}
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          order.paymentMethod === 'cash'
                            ? 'bg-pos-info-bg text-pos-info-text border border-pos-info-border'
                            : 'bg-pos-warning-bg text-pos-warning-text border border-pos-warning-border'
                        }`}
                      >
                        {order.paymentMethod}
                      </span>
                    </td>
                    <td className="p-4 text-right font-black font-mono text-pos-text text-sm">
                      {formatPKR(order.totalPaisa)}
                    </td>
                    <td className="p-4 text-center">
                      {onSelectOrderPreview && (
                        <button
                          onClick={() => onSelectOrderPreview(order)}
                          className="px-2.5 py-1 rounded-lg border border-pos-border hover:bg-pos-selected hover:border-pos-accent hover:text-pos-accent text-pos-secondary text-xs font-semibold inline-flex items-center gap-1 transition"
                        >
                          <Printer className="w-3 h-3" />
                          <span>Reprint Slips</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
