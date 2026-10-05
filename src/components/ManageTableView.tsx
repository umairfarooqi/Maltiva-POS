import React, { useState } from 'react';
import { Users, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { TableItem, Order } from '../types/pos';
import { formatPKR } from '../utils/formatCurrency';

interface ManageTableViewProps {
  tables: TableItem[];
  orders: Order[];
  onSelectTableForOrder: (table: TableItem) => void;
  onUpdateTableStatus: (tableId: string, status: TableItem['status']) => void;
}

export const ManageTableView: React.FC<ManageTableViewProps> = ({
  tables,
  orders,
  onSelectTableForOrder,
  onUpdateTableStatus,
}) => {
  const [filter, setFilter] = useState<'all' | 'available' | 'occupied' | 'reserved' | 'cleaning'>('all');

  const filteredTables = tables.filter(t => {
    if (filter === 'all') return true;
    return t.status === filter;
  });

  const getStatusBadge = (status: TableItem['status']) => {
    switch (status) {
      case 'available':
        return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Available' };
      case 'occupied':
        return { bg: 'bg-[#E6F7F5] text-[#00A389] border-[#A8E2D9]', label: 'Occupied' };
      case 'reserved':
        return { bg: 'bg-purple-50 text-purple-700 border-purple-200', label: 'Reserved' };
      case 'cleaning':
        return { bg: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Cleaning' };
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-6 space-y-4 sm:space-y-5 bg-[#F4F6F5]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 bg-white p-4 sm:p-5 rounded-lg border border-slate-200">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight">
            Floor Plan & Table Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Maltiva Dining Room • 12 Active Tables
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md text-xs overflow-x-auto max-w-full scrollbar-none">
          {(['all', 'available', 'occupied', 'reserved', 'cleaning'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-2.5 sm:px-3 py-1.5 rounded capitalize font-semibold transition shrink-0 ${
                filter === s ? 'bg-white text-slate-800' : 'text-slate-600'
              }`}
            >
              {s} ({s === 'all' ? tables.length : tables.filter(t => t.status === s).length})
            </button>
          ))}
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {filteredTables.map(table => {
          const badge = getStatusBadge(table.status);
          const activeOrder = orders.find(o => o.tableId === table.id && o.status !== 'served' && o.status !== 'cancelled');

          return (
            <div
              key={table.id}
              className="bg-white rounded-lg p-4 border border-slate-200 hover:border-slate-300 transition-colors flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg}`}>
                    {badge.label}
                  </span>
                  <div className="flex items-center gap-1 text-slate-400 text-xs">
                    <Users className="w-3.5 h-3.5" />
                    <span>{table.capacity} seats</span>
                  </div>
                </div>

                <div className="text-center py-4">
                  <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                    {table.number}
                  </h3>
                  {activeOrder ? (
                    <div className="mt-2 text-xs">
                      <p className="font-bold text-[#00A389]">
                        Order {activeOrder.orderNumber}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {formatPKR(activeOrder.totalPaisa)} • {activeOrder.items.length} items
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1">
                      {table.status === 'cleaning' ? 'Needs sanitation' : 'Ready for guests'}
                    </p>
                  )}
                </div>
              </div>

              {/* Status Switchers & Start Order */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                {table.status === 'occupied' ? (
                  <button
                    onClick={() => onSelectTableForOrder(table)}
                    className="w-full py-2 bg-[#008f77] hover:bg-[#007462] text-white rounded-md text-xs font-bold transition"
                  >
                    View / Edit Bill
                  </button>
                ) : (
                  <button
                    onClick={() => onSelectTableForOrder(table)}
                    className="w-full py-2 bg-[#E6F7F5] hover:bg-[#008f77] text-[#007462] hover:text-white rounded-md text-xs font-bold transition"
                  >
                    Seat & Start Order
                  </button>
                )}

                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <button
                    onClick={() => onUpdateTableStatus(table.id, 'available')}
                    className="py-1 rounded bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 font-medium transition"
                  >
                    Available
                  </button>
                  <button
                    onClick={() => onUpdateTableStatus(table.id, 'reserved')}
                    className="py-1 rounded bg-slate-50 hover:bg-purple-50 hover:text-purple-700 text-slate-600 font-medium transition"
                  >
                    Reserve
                  </button>
                  <button
                    onClick={() => onUpdateTableStatus(table.id, 'cleaning')}
                    className="py-1 rounded bg-slate-50 hover:bg-amber-50 hover:text-amber-700 text-slate-600 font-medium transition"
                  >
                    Clean
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
