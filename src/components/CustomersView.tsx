import React, { useState } from 'react';
import { Search, UserPlus, Phone, Mail, Award, Clock } from 'lucide-react';
import { Customer } from '../types/pos';
import { formatPKR } from '../utils/formatCurrency';

interface CustomersViewProps {
  customers: Customer[];
  onSelectCustomer?: (customer: Customer) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  onSelectCustomer: _onSelectCustomer,
}) => {
  const [search, setSearch] = useState('');

  const filtered = customers.filter(c => {
    const email = c.email?.toLowerCase() ?? '';
    return (
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      email.includes(search.toLowerCase())
    );
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-[#F4F6F5]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-lg border border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            Customer Directory & Loyalty
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Repeat diners, lifetime spend, and branch visit frequency
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative max-w-xs w-full">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, phone or email..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs text-slate-700 placeholder:text-slate-500 focus-visible:border-[#008f77]"
            />
          </div>

          <button className="flex items-center gap-1.5 px-4 py-2 bg-[#008f77] hover:bg-[#007462] text-white rounded-md text-xs font-bold transition">
            <UserPlus className="w-3.5 h-3.5" />
            <span>New Customer</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(cust => (
          <div
            key={cust.id}
            className="bg-white p-4 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-sm border border-slate-200">
                  {cust.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 leading-tight">
                    {cust.name}
                  </h3>
                  <div className="flex items-center gap-1 text-[11px] text-[#00A389] font-semibold mt-0.5">
                    <Award className="w-3 h-3" />
                    <span>VIP Diners Club</span>
                  </div>
                </div>
              </div>

              <span className="text-xs font-mono font-bold text-slate-800 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-300">
                {formatPKR(cust.totalSpent)}
              </span>
            </div>

            <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{cust.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span>{cust.email}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                <span>Last visited: {cust.lastVisit} ({cust.totalOrders} total visits)</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
