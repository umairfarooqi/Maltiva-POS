import React, { useState } from 'react';
import {
  Printer,
  Save,
  Check,
  Monitor,
  ShieldCheck,
  HardDrive,
  ExternalLink,
  Store,
  Phone,
  MapPin,
  BellRing,
  UserCog,
  ChefHat,
  Trash2,
  FileDown,
  Settings2,
} from 'lucide-react';
import { PrinterSettings, User } from '../types/pos';
import { PosStorage } from '../services/storage';

interface SettingsViewProps {
  settings: PrinterSettings;
  onSaveSettings: (settings: PrinterSettings) => void;
  currentUser: User;
  onUpdateCashierCredentials?: (username: string, pin: string) => void;
  onOpenTestPrint: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSaveSettings,
  currentUser,
  onUpdateCashierCredentials,
  onOpenTestPrint,
}) => {
  const [formData, setFormData] = useState<PrinterSettings>({ ...settings });
  const [cashierUser, setCashierUser] = useState(settings.cashierUsername || 'cashier');
  const [cashierPass, setCashierPass] = useState(settings.cashierPin || '1234');
  const [saved, setSaved] = useState(false);
  const [cashierSaved, setCashierSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleUpdateCashier = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateCashierCredentials) {
      onUpdateCashierCredentials(cashierUser.trim().toLowerCase(), cashierPass.trim());
    }
    setCashierSaved(true);
    setTimeout(() => setCashierSaved(false), 2000);
  };

  const handleOpenCustomerDisplay = () => {
    window.open('/customer-display', 'MaltivaCustomerDisplay', 'width=1024,height=768');
  };

  const handleExportBackup = () => {
    const data = {
      categories: PosStorage.getCategories(),
      products: PosStorage.getProducts(),
      orders: PosStorage.getOrders(),
      settings: PosStorage.getPrinterSettings(),
      exportTimestamp: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maltiva_backup_${Date.now()}.json`;
    a.click();
  };

  const handleClearDemoOrders = () => {
    if (confirm('Clear all orders? Products and settings will stay.')) {
      PosStorage.setOrders([]);
      PosStorage.clearOfflineQueue();
      window.location.reload();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-[#F8FAFA] select-none">
      {/* Top Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
              System Administration
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Management Console</h1>
          <p className="text-xs text-slate-500">Configure your store, hardware, and professional business rules.</p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-3 bg-[#00A389] hover:bg-[#008f77] text-white rounded-2xl text-xs font-bold shadow-lg shadow-[#00A389]/20 transition-all cursor-pointer"
        >
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{saved ? 'Settings Applied!' : 'Apply All Changes'}</span>
        </button>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* SECTION 1: STORE IDENTITY */}
        <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <Store className="w-5 h-5 text-[#00A389]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Store Identity</h2>
              <p className="text-[11px] text-slate-400">Brand details printed on receipts</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-600 block mb-1.5">Store Name</label>
              <input
                type="text"
                value={formData.storeName}
                onChange={e => setFormData({ ...formData, storeName: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#00A389]/20 focus:border-[#00A389] outline-none transition-all"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-600 block mb-1.5">Location / Address</label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#00A389]/20 focus:border-[#00A389] outline-none transition-all"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1.5">WhatsApp Contact</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={formData.whatsApp}
                  onChange={e => setFormData({ ...formData, whatsApp: e.target.value })}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#00A389]/20 focus:border-[#00A389] outline-none transition-all"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1.5">Sales Tax %</label>
              <input
                type="number"
                value={formData.taxRatePercent}
                onChange={e => setFormData({ ...formData, taxRatePercent: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-[#00A389]/20 focus:border-[#00A389] outline-none transition-all"
              />
            </div>
          </div>
        </section>

        {/* SECTION 2: HARDWARE CONFIGURATION */}
        <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Printer className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Hardware & Terminal</h2>
                <p className="text-[11px] text-slate-400">Printer and dual-screen optimization</p>
              </div>
            </div>
            <button
              onClick={onOpenTestPrint}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold transition cursor-pointer"
            >
              Print Test Slip
            </button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setFormData({ ...formData, paperWidth: '80mm' })}
                className={`py-2.5 px-4 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  formData.paperWidth === '80mm'
                    ? 'border-blue-600 bg-blue-50 text-blue-600'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                80mm Standard
              </button>
              <button
                onClick={() => setFormData({ ...formData, paperWidth: '58mm' })}
                className={`py-2.5 px-4 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  formData.paperWidth === '58mm'
                    ? 'border-blue-600 bg-blue-50 text-blue-600'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                58mm Compact
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex items-center gap-3">
                  <ChefHat className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  <div>
                    <p className="text-xs font-bold text-slate-700">Kitchen Printer</p>
                    <p className="text-[10px] text-slate-500">Send separate slips to the kitchen</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={formData.kitchenPrinterEnabled}
                  onChange={e => setFormData({ ...formData, kitchenPrinterEnabled: e.target.checked })}
                  className="w-4 h-4 accent-blue-600"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex items-center gap-3">
                  <Printer className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  <div>
                    <p className="text-xs font-bold text-slate-700">Auto-Print Dual Slips</p>
                    <p className="text-[10px] text-slate-500">Instant print on order placement</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={formData.autoPrintDualSlips}
                  onChange={e => setFormData({ ...formData, autoPrintDualSlips: e.target.checked })}
                  className="w-4 h-4 accent-blue-600"
                />
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-blue-50/50 border border-blue-100 rounded-2xl">
              <div className="flex items-center gap-3">
                <Monitor className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-blue-900">Customer Facing Display</span>
              </div>
              <button
                onClick={handleOpenCustomerDisplay}
                className="p-2 bg-white border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 3: BUSINESS RULES (The KFC Level) */}
        <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
            <div className="p-2 bg-orange-50 rounded-lg">
              <ShieldCheck className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Business Operations</h2>
              <p className="text-[11px] text-slate-400">Permissions, shifts, and inventory rules</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-2">Order Void Permission</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['admin', 'manager', 'cashier'] as const).map(role => (
                    <button
                      key={role}
                      onClick={() => setFormData({ ...formData, voidOrderPermission: role })}
                      className={`py-2 px-1 rounded-lg border text-[10px] font-bold capitalize transition-all cursor-pointer ${
                        formData.voidOrderPermission === role
                          ? 'border-orange-600 bg-orange-50 text-orange-600'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <Settings2 className="w-4 h-4 text-slate-400 group-hover:text-orange-500 transition-colors" />
                    <div>
                      <p className="text-xs font-bold text-slate-700">Enable Shift Tracking</p>
                      <p className="text-[10px] text-slate-500">Track cash drawer open/close totals</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.enableShiftTracking}
                    onChange={e => setFormData({ ...formData, enableShiftTracking: e.target.checked })}
                    className="w-4 h-4 accent-orange-600"
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">Global Low-Stock Alert</label>
                <div className="relative">
                  <BellRing className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    value={formData.globalLowStockThreshold}
                    onChange={e => setFormData({ ...formData, globalLowStockThreshold: parseInt(e.target.value) || 0 })}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <p className="text-[10px] text-slate-400 italic">Items below this count will be flagged red.</p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: USER & SECURITY (Admin Control) */}
        <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
            <div className="p-2 bg-purple-50 rounded-lg">
              <UserCog className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Staff Security</h2>
              <p className="text-[11px] text-slate-400">Manage terminal access and PINs</p>
            </div>
          </div>

          <form onSubmit={handleUpdateCashier} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">Cashier Username</label>
                <input
                  type="text"
                  required
                  value={cashierUser}
                  onChange={e => setCashierUser(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">Access PIN</label>
                <input
                  type="text"
                  required
                  value={cashierPass}
                  onChange={e => setCashierPass(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-xs font-bold shadow-lg shadow-purple-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {cashierSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              <span>{cashierSaved ? 'Credentials Updated!' : 'Update Security PIN'}</span>
            </button>
          </form>
        </section>
      </div>

      {/* DATABASE MAINTENANCE (Bottom Bar) */}
      <footer className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-100 rounded-lg">
            <HardDrive className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">System Maintenance</h3>
            <p className="text-[11px] text-slate-500">Manage your local SSD database snapshots</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExportBackup}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <FileDown className="w-4 h-4 text-[#00A389]" />
            <span>Backup DB</span>
          </button>
          <button
            onClick={handleClearDemoOrders}
            className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Wipe Sales</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
