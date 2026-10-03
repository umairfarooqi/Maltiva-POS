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
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all'>('month');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');

  if (userRole !== 'admin') {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-[#F8FAFA]">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-center">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-800 mb-1">
            Admin Access Required
          </h2>
          <p className="text-xs text-slate-500">
            The Profit & Loss statement contains confidential raw material costs and business net margins, restricted exclusively to Admin.
          </p>
        </div>
      </div>
    );
  }

  // Filter orders by date range
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const filteredOrders = orders.filter(order => {
    if (order.status === 'cancelled') return false;
    const time = new Date(order.createdAt).getTime();

    if (dateFilter === 'today') return time >= startOfToday;
    if (dateFilter === 'yesterday') return time >= startOfYesterday && time < startOfToday;
    if (dateFilter === 'week') return time >= startOfWeek;
    if (dateFilter === 'month') return time >= startOfMonth;
    return true; // all
  });

  // Aggregate items sold from filtered orders
  interface ItemAgg {
    productId: string;
    productName: string;
    categoryName: string;
    quantity: number;
    totalRevenue: number;
    totalCost: number;
    avgSellingPrice: number;
    avgCostPrice: number;
    grossProfit: number;
    profitMarginPercent: number;
  }

  const itemMap: { [id: string]: ItemAgg } = {};

  filteredOrders.forEach(order => {
    order.items.forEach(it => {
      const prod = products.find(p => p.id === it.productId);
      const categoryId = prod?.categoryId;

      if (selectedCategoryId !== 'all' && categoryId !== selectedCategoryId) {
        return;
      }

      const rawUnitCost = it.unitCost !== undefined && it.unitCost > 0 ? it.unitCost : (prod?.costPrice || 0);

      if (!itemMap[it.productId]) {
        itemMap[it.productId] = {
          productId: it.productId,
          productName: it.productName,
          categoryName: it.categoryName || prod?.categoryName || 'General',
          quantity: 0,
          totalRevenue: 0,
          totalCost: 0,
          avgSellingPrice: it.unitPrice,
          avgCostPrice: rawUnitCost,
          grossProfit: 0,
          profitMarginPercent: 0,
        };
      }

      itemMap[it.productId].quantity += it.quantity;
      itemMap[it.productId].totalRevenue += it.totalPrice;
      itemMap[it.productId].totalCost += (it.totalCost || (rawUnitCost * it.quantity));
    });
  });

  const itemsList: ItemAgg[] = Object.values(itemMap).map(item => {
    const grossProfit = item.totalRevenue - item.totalCost;
    const profitMarginPercent = item.totalRevenue > 0 ? (grossProfit / item.totalRevenue) * 100 : 0;
    return {
      ...item,
      grossProfit,
      profitMarginPercent,
    };
  });

  // Total summary calculations
  const totalRevenue = itemsList.reduce((sum, item) => sum + item.totalRevenue, 0);
  const totalRawCost = itemsList.reduce((sum, item) => sum + item.totalCost, 0);
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
      Math.round(item.avgSellingPrice),
      Math.round(item.avgCostPrice),
      Math.round(item.avgSellingPrice - item.avgCostPrice),
      Math.round(item.totalRevenue),
      Math.round(item.totalCost),
      Math.round(item.grossProfit),
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
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 select-none bg-[#F8FAFA]">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
              Admin Confidential
            </span>
            <span className="text-xs text-slate-400">Maltiva Crust • Phase 3 DHA Lahore</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
            Profit & Loss Audit
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Raw material food cost vs customer selling price = accurate gross net profit (e.g. Rs. 50 cost + Rs. 60 selling = Rs. 10 profit)
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print Report</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#00A389] hover:bg-[#008f77] text-white rounded-xl text-xs font-bold shadow-md shadow-[#00A389]/20 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Date Filter & Category Selection */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        {/* Date Filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            <span>Period:</span>
          </span>

          {[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'week', label: 'Last 7 Days' },
            { id: 'month', label: 'This Month' },
            { id: 'all', label: 'All Orders' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setDateFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                dateFilter === f.id
                  ? 'bg-[#00A389] text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">Category:</span>
          <select
            value={selectedCategoryId}
            onChange={e => setSelectedCategoryId(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 focus:outline-none focus:border-[#00A389]"
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

      <div id="profit-loss-print-area" className="space-y-6">
        <div className="hidden print:block border-b border-slate-300 pb-4">
          <h1 className="text-2xl font-black text-slate-900">Profit &amp; Loss Audit</h1>
          <p className="text-sm text-slate-600">Maltiva Crust • Phase 3 DHA Lahore</p>
        </div>

        {/* Primary KPI Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Selling Revenue */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-2xs space-y-1.5">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Customer Selling Revenue
          </span>
          <p className="text-2xl font-black text-slate-900 font-mono tracking-tight">
            {formatPKR(totalRevenue)}
          </p>
          <p className="text-[11px] text-slate-400">
            Total sales generated across {filteredOrders.length} orders
          </p>
        </div>

        {/* Total Raw Material Cost */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-2xs space-y-1.5">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Raw Material Food Cost
          </span>
          <p className="text-2xl font-black text-rose-600 font-mono tracking-tight">
            {formatPKR(totalRawCost)}
          </p>
          <p className="text-[11px] text-slate-400">
            Raw ingredient expense to prepare items
          </p>
        </div>

        {/* Net Gross Profit */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-2xs space-y-1.5">
          <span className="text-xs font-bold text-[#00A389] uppercase tracking-wider block">
            Net Gross Profit (PKR)
          </span>
          <p className="text-2xl font-black text-[#00A389] font-mono tracking-tight">
            {formatPKR(totalGrossProfit)}
          </p>
          <p className="text-[11px] text-slate-400">
            Revenue minus raw material costs
          </p>
        </div>

        {/* Profit Margin % */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-2xs space-y-1.5">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Overall Profit Margin
          </span>
          <p className="text-2xl font-black text-purple-600 font-mono tracking-tight">
            {overallMarginPercent.toFixed(1)}%
          </p>
          <p className="text-[11px] text-slate-400">
            Effective gross margin on takeaway menu
          </p>
        </div>
        </div>

        {/* Itemized Profit & Loss Table */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              Itemized Profit Margin Breakdown
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Exact raw material cost, selling price, and net profit per item sold
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500 font-mono">
            {itemsList.length} menu items sold
          </span>
        </div>

        {itemsList.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No sales recorded in the selected period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[10px]">
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
              <tbody className="divide-y divide-slate-100">
                {itemsList.map(item => {
                  const unitProfit = item.avgSellingPrice - item.avgCostPrice;
                  return (
                    <tr key={item.productId} className="hover:bg-slate-50/70 transition">
                      <td className="p-4 font-bold text-slate-800">
                        {item.productName}
                      </td>
                      <td className="p-4 text-slate-500">
                        {item.categoryName}
                      </td>
                      <td className="p-4 text-center font-bold font-mono">
                        {item.quantity}
                      </td>
                      <td className="p-4 text-right font-mono text-rose-600 font-semibold">
                        {formatPKR(item.avgCostPrice)}
                      </td>
                      <td className="p-4 text-right font-mono text-slate-800 font-semibold">
                        {formatPKR(item.avgSellingPrice)}
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-[#00A389]">
                        +{formatPKR(unitProfit)}
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-slate-900">
                        {formatPKR(item.totalRevenue)}
                      </td>
                      <td className="p-4 text-right font-mono text-rose-600">
                        {formatPKR(item.totalCost)}
                      </td>
                      <td className="p-4 text-right font-mono font-black text-[#00A389]">
                        {formatPKR(item.grossProfit)}
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.profitMarginPercent >= 50
                              ? 'bg-emerald-50 text-emerald-700'
                              : item.profitMarginPercent >= 30
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-amber-50 text-amber-700'
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
