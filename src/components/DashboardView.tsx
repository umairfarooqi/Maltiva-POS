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
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'card'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Calculate Date bounds
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  // Filter Orders
  const filteredOrders = orders.filter(order => {
    if (order.status === 'cancelled') return false;

    // Payment Filter
    if (paymentFilter !== 'all' && order.paymentMethod !== paymentFilter) {
      return false;
    }

    const orderTime = new Date(order.createdAt).getTime();

    if (dateFilter === 'today') {
      return orderTime >= startOfToday;
    }
    if (dateFilter === 'yesterday') {
      return orderTime >= startOfYesterday && orderTime < startOfToday;
    }
    if (dateFilter === 'week') {
      return orderTime >= startOfWeek;
    }
    if (dateFilter === 'month') {
      return orderTime >= startOfMonth;
    }
    if (dateFilter === 'custom') {
      if (customStartDate && orderTime < new Date(customStartDate).getTime()) return false;
      if (customEndDate && orderTime > new Date(customEndDate).getTime() + 24 * 60 * 60 * 1000) return false;
      return true;
    }

    return true;
  });

  // Calculate Metrics
  const totalSales = filteredOrders.reduce((sum, o) => sum + o.total, 0);
  const totalRawCost = filteredOrders.reduce((sum, o) => sum + (o.totalCost || 0), 0);
  const totalOrdersCount = filteredOrders.length;
  const averageOrderValue = totalOrdersCount > 0 ? Math.round(totalSales / totalOrdersCount) : 0;

  const cashOrders = filteredOrders.filter(o => o.paymentMethod === 'cash');
  const cardOrders = filteredOrders.filter(o => o.paymentMethod === 'card');

  const cashTotal = cashOrders.reduce((sum, o) => sum + o.total, 0);
  const cardTotal = cardOrders.reduce((sum, o) => sum + o.total, 0);

  // Today vs Yesterday sales for quick growth comparison
  const todayOnlySales = orders
    .filter(o => new Date(o.createdAt).getTime() >= startOfToday && o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total, 0);

  const yesterdayOnlySales = orders
    .filter(o => {
      const t = new Date(o.createdAt).getTime();
      return t >= startOfYesterday && t < startOfToday && o.status !== 'cancelled';
    })
    .reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 select-none bg-[#F8FAFA]">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
              Admin Executive Sales
            </span>
            <span className="text-xs text-slate-400">Maltiva Crust • Phase 3 DHA Lahore</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
            Daily Sales & Counter Reports
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Takeaway order performance, real-time revenue, and filter breakdowns
          </p>
        </div>

        <button
          onClick={() => onNavigateToTab('order_line')}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#00A389] hover:bg-[#008f77] text-white rounded-xl text-xs font-bold shadow-md shadow-[#00A389]/20 transition cursor-pointer self-start md:self-auto"
        >
          <Receipt className="w-4 h-4" />
          <span>Go to Order Line</span>
        </button>
      </div>

      {/* Date & Payment Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        {/* Date Filter Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
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
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                dateFilter === tab.id
                  ? 'bg-[#00A389] text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Payment Filter Tabs */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Payment:</span>
          </span>

          {[
            { id: 'all', label: 'All Modes' },
            { id: 'cash', label: 'Cash Only' },
            { id: 'card', label: 'Card Only' },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => setPaymentFilter(p.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                paymentFilter === p.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Date Pickers (if Custom Dates is selected) */}
      {dateFilter === 'custom' && (
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-2xs flex flex-wrap items-center gap-3 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600">From Date:</label>
            <input
              type="date"
              value={customStartDate}
              onChange={e => setCustomStartDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-[#00A389]"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600">To Date:</label>
            <input
              type="date"
              value={customEndDate}
              onChange={e => setCustomEndDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-[#00A389]"
            />
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Sales */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Total Takeaway Sales
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#00A389] flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 font-mono tracking-tight">
            {formatPKR(totalSales)}
          </p>
          <p className="text-[11px] text-slate-400">
            {dateFilter === 'today'
              ? `Today: ${formatPKR(todayOnlySales)} vs Yest: ${formatPKR(yesterdayOnlySales)}`
              : `Calculated from ${totalOrdersCount} completed orders`}
          </p>
        </div>

        {/* Card 2: Total Orders */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Orders Served
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 font-mono tracking-tight">
            {totalOrdersCount}
          </p>
          <p className="text-[11px] text-slate-400">
            Average ticket size: <span className="font-bold text-slate-700">{formatPKR(averageOrderValue)}</span>
          </p>
        </div>

        {/* Card 3: Cash Received */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Cash Drawer
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-blue-600 font-mono tracking-tight">
            {formatPKR(cashTotal)}
          </p>
          <p className="text-[11px] text-slate-400">
            {cashOrders.length} cash orders processed
          </p>
        </div>

        {/* Card 4: Card / POS Terminal */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Card Terminal
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 font-mono tracking-tight">
            {formatPKR(cardTotal)}
          </p>
          <p className="text-[11px] text-slate-400">
            {cardOrders.length} digital card orders
          </p>
        </div>
      </div>

      {/* Filtered Orders Breakdown Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              Filtered Orders Register ({filteredOrders.length})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Itemized takeaway receipts with reprint dual slips capability
            </p>
          </div>

          <span className="text-xs font-mono font-bold text-[#00A389] bg-[#E6F7F5] px-3 py-1 rounded-xl">
            Total: {formatPKR(totalSales)}
          </span>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No takeaway orders found for the selected date and payment filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[10px]">
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
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50/70 transition">
                    <td className="p-4 font-black text-slate-900 font-mono">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                        #{order.tokenNumber || order.orderNumber.replace('#F', '')}
                      </span>
                    </td>
                    <td className="p-4 font-mono font-bold text-slate-700">
                      {order.orderNumber}
                    </td>
                    <td className="p-4 text-slate-500 font-mono">
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-4 text-slate-700 font-medium">
                      {order.cashierName}
                    </td>
                    <td className="p-4 text-slate-600 max-w-xs truncate">
                      {order.items.map(it => `${it.quantity}x ${it.productName}`).join(', ')}
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          order.paymentMethod === 'cash'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {order.paymentMethod}
                      </span>
                    </td>
                    <td className="p-4 text-right font-black font-mono text-slate-900 text-sm">
                      {formatPKR(order.total)}
                    </td>
                    <td className="p-4 text-center">
                      {onSelectOrderPreview && (
                        <button
                          onClick={() => onSelectOrderPreview(order)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-[#E6F7F5] hover:border-[#00A389] hover:text-[#00A389] text-slate-600 text-xs font-semibold inline-flex items-center gap-1 transition"
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
