import React, { useState } from 'react';
import { Users, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { TableItem, Order } from '../types/pos';
import { formatPKR } from '../utils/formatCurrency';
import { Button } from './ui/Button';
import { SegmentedControl } from './ui/SegmentedControl';

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
        return { bg: 'bg-pos-success-bg text-pos-success-text border-pos-success-border', label: 'Available' };
      case 'occupied':
        return { bg: 'bg-pos-selected text-pos-accent border-pos-success-border', label: 'Occupied' };
      case 'reserved':
        return { bg: 'bg-pos-reserved-bg text-pos-reserved-text border-pos-reserved-border', label: 'Reserved' };
      case 'cleaning':
        return { bg: 'bg-pos-warning-bg text-pos-warning-text border-pos-warning-border', label: 'Cleaning' };
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-6 space-y-4 sm:space-y-5 bg-pos-canvas">
      {/* Header */}
      <div className="pos-panel flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 p-4 sm:p-5">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-pos-text tracking-tight">
            Floor Plan & Table Management
          </h1>
          <p className="text-xs text-pos-muted mt-0.5">
            Maltiva Dining Room • 12 Active Tables
          </p>
        </div>

        {/* Filter Tabs */}
        <SegmentedControl
          label="Table status"
          value={filter}
          onChange={setFilter}
          className="overflow-x-auto scrollbar-none tabular-nums"
          options={(['all', 'available', 'occupied', 'reserved', 'cleaning'] as const).map(s => ({
            value: s,
            label: `${s[0].toUpperCase()}${s.slice(1)} (${s === 'all' ? tables.length : tables.filter(t => t.status === s).length})`,
          }))}
        />
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {filteredTables.map(table => {
          const badge = getStatusBadge(table.status);
          const activeOrder = orders.find(o => o.tableId === table.id && o.status !== 'served' && o.status !== 'cancelled');

          return (
            <div
              key={table.id}
              className="pos-panel p-4 hover:border-pos-control transition-colors flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${badge.bg}`}>
                    {badge.label}
                  </span>
                  <div className="flex items-center gap-1 text-pos-muted text-xs">
                    <Users className="w-3.5 h-3.5" />
                    <span>{table.capacity} seats</span>
                  </div>
                </div>

                <div className="text-center py-4">
                  <h3 className="text-2xl font-bold text-pos-text tracking-tight">
                    {table.number}
                  </h3>
                  {activeOrder ? (
                    <div className="mt-2 text-xs">
                      <p className="font-bold text-pos-accent">
                        Order {activeOrder.orderNumber}
                      </p>
                      <p className="text-xs text-pos-muted tabular-nums">
                        {formatPKR(activeOrder.totalPaisa)} • {activeOrder.items.length} items
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-pos-muted mt-1">
                      {table.status === 'cleaning' ? 'Needs sanitation' : 'Ready for guests'}
                    </p>
                  )}
                </div>
              </div>

              {/* Status Switchers & Start Order */}
              <div className="pt-3 border-t border-pos-divider space-y-2">
                {table.status === 'occupied' ? (
                  <Button variant="primary" size="compact"
                    onClick={() => onSelectTableForOrder(table)}
                    className="w-full"
                  >
                    View / Edit Bill
                  </Button>
                ) : (
                  <Button variant="outline" size="compact"
                    onClick={() => onSelectTableForOrder(table)}
                    className="w-full"
                  >
                    Seat & Start Order
                  </Button>
                )}

                <div className="grid grid-cols-3 gap-1 text-xs">
                  <button
                    onClick={() => onUpdateTableStatus(table.id, 'available')}
                    className="py-1 rounded bg-pos-inset hover:bg-pos-success-bg hover:text-pos-success-text text-pos-secondary font-medium transition"
                  >
                    Available
                  </button>
                  <button
                    onClick={() => onUpdateTableStatus(table.id, 'reserved')}
                    className="py-1 rounded bg-pos-inset hover:bg-pos-reserved-bg hover:text-pos-reserved-text text-pos-secondary font-medium transition"
                  >
                    Reserve
                  </button>
                  <button
                    onClick={() => onUpdateTableStatus(table.id, 'cleaning')}
                    className="py-1 rounded bg-pos-inset hover:bg-pos-warning-bg hover:text-pos-warning-text text-pos-secondary font-medium transition"
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
