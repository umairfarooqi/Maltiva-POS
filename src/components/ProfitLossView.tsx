import { rupeeText } from '../shared/money';
import React, { useState } from 'react';
import {
  TrendingUp,
  Download,
  Printer,
  DollarSign,
  Package,
  Calendar,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { Order, Product, Category, UserRole } from '../types/pos';
import { dateRange } from '../utils/dateRange';
import { formatPKR } from '../utils/formatCurrency';

interface ProfitLossViewProps {
  orders: Order[];
  products: Product[];
  categories: Category[];
  userRole: UserRole;
}

export const ProfitLossView: React.FC<ProfitLossViewProps> = ({
  orders,
  products,
  categories,
  userRole,
}) => {
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom'>('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');

  if (userRole !== 'admin') {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-pos-canvas">
        <div className="max-w-md w-full bg-pos-surface p-6 rounded-lg border border-pos-border text-center">
          <div className="w-12 h-12 rounded-md bg-pos-danger-bg text-pos-danger-text flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-pos-text mb-1">
            Admin Access Required
          </h2>
          <p className="text-xs text-pos-muted">
            The Profit & Loss statement contains confidential raw material costs and business net margins, restricted exclusively to Admin.
          </p>
        </div>
      </div>
    );
  }

  const range = dateRange(dateFilter, customStartDate, customEndDate);

  const filteredOrders = orders.filter(order => {
    if (order.status === 'cancelled' || order.persistenceState !== 'saved' || order.profitIncomplete) return false;
    const time = new Date(order.createdAt).getTime();

    return !range.error && time >= range.start && time < range.end && (paymentFilter === 'all' || (paymentFilter === 'other' ? !['cash', 'card', 'scan'].includes(order.paymentMethod) : order.paymentMethod === paymentFilter));
  });

  // Aggregate items sold from filtered orders
  interface ItemAgg {
    productId: string;
    productName: string;
    categoryName: string;
    quantity: number;
    totalRevenue: number;
    totalCostPaisa: number;
    avgSellingPrice: number;
    avgCostPrice: number;
    grossProfit: number;
    profitMarginPercent: number;
  }

  const itemMap: { [id: string]: ItemAgg } = {};

  filteredOrders.forEach(order => {
    order.items.forEach(it => {
      const prod = products.find(p => p.id === it.productId);
      const categoryId = it.categoryId;

      if (selectedCategoryId !== 'all' && categoryId !== selectedCategoryId) {
        return;
      }

      const rawUnitCost = it.unitCostPaisa ?? 0;

      if (!itemMap[it.productId]) {
        itemMap[it.productId] = {
          productId: it.productId,
          productName: it.productName,
          categoryName: it.categoryName || 'General',
          quantity: 0,
          totalRevenue: 0,
          totalCostPaisa: 0,
          avgSellingPrice: it.unitPricePaisa,
          avgCostPrice: rawUnitCost,
          grossProfit: 0,
          profitMarginPercent: 0,
        };
      }

      itemMap[it.productId].quantity += it.quantity;
      itemMap[it.productId].totalRevenue += it.netRevenuePaisa ?? it.totalPricePaisa;
      itemMap[it.productId].totalCostPaisa += it.totalCostPaisa ?? 0;
    });
  });

  const itemsList: ItemAgg[] = Object.values(itemMap).map(item => {
    const grossProfit = item.totalRevenue - item.totalCostPaisa;
    const profitMarginPercent = item.totalRevenue > 0 ? (grossProfit / item.totalRevenue) * 100 : 0;
    return {
      ...item,
      avgSellingPrice: Math.round(item.totalRevenue / item.quantity),
      avgCostPrice: Math.round(item.totalCostPaisa / item.quantity),
      grossProfit,
      profitMarginPercent,
    };
  });

  // Total summary calculations
  const totalRevenue = itemsList.reduce((sum, item) => sum + item.totalRevenue, 0);
  const totalRawCost = itemsList.reduce((sum, item) => sum + item.totalCostPaisa, 0);
  const totalGrossProfit = totalRevenue - totalRawCost;
  const overallMarginPercent = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;

  const handleExportCSV = () => {
    const headers = [
      'Product Name',
      'Category',
      'Units Sold',
      'Customer Selling Price (PKR)',
      'Raw Material Cost (PKR)',
      'Profit Per Unit (PKR)',
      'Total Revenue (PKR)',
      'Total Raw Cost (PKR)',
      'Net Profit (PKR)',
      'Margin %',
    ];

    const rows = itemsList.map(item => [
      `"${item.productName.replace(/"/g, '""')}"`,
      `"${item.categoryName}"`,
      item.quantity,
      rupeeText(Math.round(item.avgSellingPrice)),
      rupeeText(Math.round(item.avgCostPrice)),
      rupeeText(Math.round(item.avgSellingPrice - item.avgCostPrice)),
      rupeeText(Math.round(item.totalRevenue)),
      rupeeText(Math.round(item.totalCostPaisa)),
      rupeeText(Math.round(item.grossProfit)),
      `${item.profitMarginPercent.toFixed(1)}%`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `maltiva_profit_loss_${dateFilter}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 select-none bg-pos-canvas">
      {orders.some(order => order.persistenceState === 'saved' && order.profitIncomplete) &&
        <p role="status" className="text-sm text-pos-warning-text">Some historical sales have missing cost snapshots and are excluded from profit calculations.</p>}
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-pos-surface p-4 sm:p-5 rounded-lg border border-pos-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-pos-selected text-pos-accent">
              Admin Confidential
            </span>
            <span className="text-xs text-pos-muted">Maltiva Crust • Phase 3 DHA Lahore</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-pos-text tracking-tight">
            Profit & Loss Audit
          </h1>
          <p className="text-xs text-pos-muted mt-0.5">
            Sales, raw material cost, and gross margin for the selected period.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 border border-pos-control hover:bg-pos-inset text-pos-secondary rounded-md text-xs font-semibold transition"
          >
            <Printer className="w-3.5 h-3.5 text-pos-muted" />
            <span>Print Report</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-4 py-2 bg-pos-action hover:bg-pos-action-hover text-white rounded-md text-xs font-bold transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Date Filter & Category Selection */}
      <div className="bg-pos-surface p-3 rounded-lg border border-pos-border flex flex-wrap items-center justify-between gap-3">
        {/* Date Filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-pos-muted mr-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            <span>Period:</span>
          </span>

          {[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'week', label: 'Last 7 Days' },
            { id: 'custom', label: 'Custom Dates' },
            { id: 'month', label: 'This Month' },
            { id: 'all', label: 'All Orders' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setDateFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                dateFilter === f.id
                  ? 'bg-pos-action text-white'
                  : 'bg-pos-surface text-pos-secondary hover:bg-pos-inset border border-pos-control'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-pos-muted">Category:</span>
          <select
            value={selectedCategoryId}
            onChange={e => setSelectedCategoryId(e.target.value)}
            className="px-3 py-1.5 border border-pos-control rounded-md text-xs bg-pos-surface text-pos-secondary focus-visible:border-pos-accent"
          >
            <option value="all">All Categories & Deals</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-pos-secondary">
        <label>Payment <select aria-label="Profit payment filter" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} className="bg-pos-surface border border-pos-control rounded p-2"><option value="all">All Modes</option><option value="cash">Cash</option><option value="card">Card</option><option value="scan">Scan</option><option value="other">Other / Legacy</option></select></label>
        {dateFilter === 'custom' && <><label>Start date <input type="date" aria-label="Profit start date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="bg-pos-surface border border-pos-control rounded p-2" /></label><label>End date <input type="date" aria-label="Profit end date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="bg-pos-surface border border-pos-control rounded p-2" /></label></>}
        {range.error && <p role="alert" className="text-pos-danger-text">{range.error}</p>}
      </div>
      <div id="profit-loss-print-area" className="space-y-6">
        <div className="flex flex-wrap gap-5 text-sm text-pos-secondary">
          {(['cash', 'card', 'scan', 'other'] as const).map(method => <p key={method}><span className="capitalize">{method}</span>: <strong>{formatPKR(filteredOrders.filter(order => (method === 'other' ? !['cash', 'card', 'scan'].includes(order.paymentMethod) : order.paymentMethod === method)).reduce((sum, order) => sum + order.totalPaisa, 0))}</strong></p>)}
        </div>
        <div className="hidden print:block border-b border-pos-control pb-4">
          <h1 className="text-2xl font-black text-pos-text">Profit &amp; Loss Audit</h1>
          <p className="text-sm text-pos-secondary">Maltiva Crust • Phase 3 DHA Lahore</p>
        </div>

        {/* Primary KPI Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Selling Revenue */}
        <div className="bg-pos-surface p-4 rounded-lg border border-pos-border space-y-1.5">
          <span className="text-[11px] font-bold text-pos-secondary uppercase tracking-normal block">
            Customer Selling Revenue
          </span>
          <p className="text-2xl font-black text-pos-text font-mono tracking-tight">
            {formatPKR(totalRevenue)}
          </p>
          <p className="text-[11px] text-pos-muted">
            Total sales generated across {filteredOrders.length} orders
          </p>
        </div>

        {/* Total Raw Material Cost */}
        <div className="bg-pos-surface p-4 rounded-lg border border-pos-border space-y-1.5">
          <span className="text-[11px] font-bold text-pos-secondary uppercase tracking-normal block">
            Raw Material Food Cost
          </span>
          <p className="text-2xl font-black text-pos-danger-text font-mono tracking-tight">
            {formatPKR(totalRawCost)}
          </p>
          <p className="text-[11px] text-pos-muted">
            Raw ingredient expense to prepare items
          </p>
        </div>

        {/* Net Gross Profit */}
        <div className="bg-pos-surface p-4 rounded-lg border border-pos-border space-y-1.5">
          <span className="text-[11px] font-bold text-pos-accent uppercase tracking-normal block">
            Net Gross Profit (PKR)
          </span>
          <p className="text-2xl font-black text-pos-accent font-mono tracking-tight">
            {formatPKR(totalGrossProfit)}
          </p>
          <p className="text-[11px] text-pos-muted">
            Revenue minus raw material costs
          </p>
        </div>

        {/* Profit Margin % */}
        <div className="bg-pos-surface p-4 rounded-lg border border-pos-border space-y-1.5">
          <span className="text-[11px] font-bold text-pos-secondary uppercase tracking-normal block">
            Overall Profit Margin
          </span>
          <p className="text-2xl font-black text-pos-text font-mono tracking-tight">
            {overallMarginPercent.toFixed(1)}%
          </p>
          <p className="text-[11px] text-pos-muted">
            Effective gross margin on takeaway menu
          </p>
        </div>
        </div>

        {/* Itemized Profit & Loss Table */}
        <div className="bg-pos-surface rounded-lg border border-pos-border overflow-hidden">
        <div className="p-4 border-b border-pos-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-pos-text">
              Itemized Profit Margin Breakdown
            </h2>
            <p className="text-xs text-pos-muted mt-0.5">
              Exact raw material cost, selling price, and net profit per item sold
            </p>
          </div>
          <span className="text-xs font-bold text-pos-muted font-mono">
            {itemsList.length} menu items sold
          </span>
        </div>

        {itemsList.length === 0 ? (
          <div className="py-12 text-center text-pos-muted text-xs">
            No sales recorded in the selected period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-pos-inset border-b border-pos-divider text-pos-muted font-semibold uppercase text-[10px]">
                <tr>
                  <th className="p-4">Dish / Deal Name</th>
                  <th className="p-4">Category</th>
                  <th className="p-4 text-center">Qty Sold</th>
                  <th className="p-4 text-right">Raw Cost (PKR)</th>
                  <th className="p-4 text-right">Selling Price (PKR)</th>
                  <th className="p-4 text-right">Profit / Unit</th>
                  <th className="p-4 text-right">Total Revenue</th>
                  <th className="p-4 text-right">Total Raw Cost</th>
                  <th className="p-4 text-right">Net Profit</th>
                  <th className="p-4 text-center">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pos-divider">
                {itemsList.map(item => {
                  const unitProfit = item.avgSellingPrice - item.avgCostPrice;
                  return (
                    <tr key={item.productId} className="hover:bg-pos-inset/70 transition">
                      <td className="p-4 font-bold text-pos-text">
                        {item.productName}
                      </td>
                      <td className="p-4 text-pos-muted">
                        {item.categoryName}
                      </td>
                      <td className="p-4 text-center font-bold font-mono">
                        {item.quantity}
                      </td>
                      <td className="p-4 text-right font-mono text-pos-danger-text font-semibold">
                        {formatPKR(item.avgCostPrice)}
                      </td>
                      <td className="p-4 text-right font-mono text-pos-text font-semibold">
                        {formatPKR(item.avgSellingPrice)}
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-pos-accent">
                        +{formatPKR(unitProfit)}
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-pos-text">
                        {formatPKR(item.totalRevenue)}
                      </td>
                      <td className="p-4 text-right font-mono text-pos-danger-text">
                        {formatPKR(item.totalCostPaisa)}
                      </td>
                      <td className="p-4 text-right font-mono font-black text-pos-accent">
                        {formatPKR(item.grossProfit)}
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.profitMarginPercent >= 50
                              ? 'bg-pos-success-bg text-pos-success-text'
                              : item.profitMarginPercent >= 30
                              ? 'bg-pos-info-bg text-pos-info-text'
                              : 'bg-pos-warning-bg text-pos-warning-text'
                          }`}
                        >
                          {item.profitMarginPercent.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
