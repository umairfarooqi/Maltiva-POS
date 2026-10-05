import { parseRupees } from '../shared/money';
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
  AlertTriangle,
  FileDown,
  Settings2,
} from 'lucide-react';
import { PrinterSettings, User } from '../types/pos';
import { PosStorage } from '../services/storage';

interface SettingsViewProps {
  settings: PrinterSettings;
  onSaveSettings: (settings: PrinterSettings) => void | Promise<void>;
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
  const [saveError, setSaveError] = useState('');
  const [taxError, setTaxError] = useState('');
  const [cashierSaved, setCashierSaved] = useState(false);
  const [isWipeSalesDialogOpen, setIsWipeSalesDialogOpen] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (taxError) { setSaveError(taxError); return; }
    try { await onSaveSettings(formData); setSaveError(''); }
    catch (error) { setSaveError((error as Error).message); return; }
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
    PosStorage.setOrders([]);
    // Pending recovery copies (IndexedDB and legacy queue) must survive history clearing.
    window.location.reload();
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-[#F4F6F5] select-none">
      {/* Top Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-lg border border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#E6F7F5] text-[#007462]">
              System Administration
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Management Console</h1>
          <p className="text-xs text-slate-500">Configure your store, hardware, and professional business rules.</p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-3 bg-[#008f77] hover:bg-[#007462] text-white rounded-md text-xs font-bold transition-colors cursor-pointer"
        >
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{saved ? 'Settings Applied!' : 'Apply All Changes'}</span>
        </button>
      </header>
      {saveError && <p role="alert" className="text-sm text-rose-700">{saveError}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        
        {/* SECTION 1: STORE IDENTITY */}
        <section className="bg-white p-5 rounded-lg border border-slate-200 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <Store className="w-5 h-5 text-[#00A389]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Store Identity</h2>
              <p className="text-[11px] text-slate-500">Brand details printed on receipts</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-600 block mb-1.5">Store Name</label>
              <input
                type="text"
                value={formData.storeName}
                onChange={e => setFormData({ ...formData, storeName: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-md text-xs focus-visible:border-[#008f77]"
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
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-md text-xs focus-visible:border-[#008f77]"
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
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-md text-xs focus-visible:border-[#008f77]"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1.5">Sales Tax %</label>
              <input
                type="number"
                value={formData.taxBp / 100}
                step="0.01" min="0"
                onChange={e => {
                  try { setFormData({ ...formData, taxBp: parseRupees(e.target.value || '0') }); setTaxError(''); }
                  catch { setTaxError('Tax rate must have at most two decimal places.'); }
                }}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono focus-visible:border-[#008f77]"
              />
              {taxError && <p role="alert" className="text-xs text-rose-700">{taxError}</p>}
            </div>
            <label className="text-xs text-slate-600 flex items-center gap-2">
              <input type="checkbox" checked={formData.taxInclusive ?? false} onChange={e => setFormData({ ...formData, taxInclusive: e.target.checked })} />
              Prices include tax
            </label>
          </div>
        </section>

        {/* SECTION 2: HARDWARE CONFIGURATION */}
        <section className="bg-white p-5 rounded-lg border border-slate-200 space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#E6F7F5] rounded-md">
                <Printer className="w-5 h-5 text-[#007462]" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Hardware & Terminal</h2>
                <p className="text-[11px] text-slate-500">Printer and dual-screen optimization</p>
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
                className={`py-2.5 px-4 rounded-md border text-xs font-bold transition-colors cursor-pointer ${
                  formData.paperWidth === '80mm'
                    ? 'border-[#008f77] bg-[#E6F7F5] text-[#007462]'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                80mm Standard
              </button>
              <button
                onClick={() => setFormData({ ...formData, paperWidth: '58mm' })}
                className={`py-2.5 px-4 rounded-md border text-xs font-bold transition-colors cursor-pointer ${
                  formData.paperWidth === '58mm'
                    ? 'border-[#008f77] bg-[#E6F7F5] text-[#007462]'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                58mm Compact
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-md border border-slate-200 space-y-3">
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

            <div className="flex items-center justify-between p-4 bg-[#E6F7F5] border border-emerald-100 rounded-md">
              <div className="flex items-center gap-3">
                <Monitor className="w-4 h-4 text-[#007462]" />
                <span className="text-xs font-bold text-slate-800">Customer Facing Display</span>
              </div>
              <button
                onClick={handleOpenCustomerDisplay}
                className="p-2 bg-white border border-emerald-200 text-[#007462] rounded-md hover:bg-[#008f77] hover:text-white transition-colors cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 3: BUSINESS RULES (The KFC Level) */}
        <section className="bg-white p-5 rounded-lg border border-slate-200 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
              <div className="p-2 bg-[#E6F7F5] rounded-md">
                <ShieldCheck className="w-5 h-5 text-[#007462]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Business Operations</h2>
              <p className="text-[11px] text-slate-500">Permissions, shifts, and inventory rules</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-md border border-slate-200 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-2">Order Void Permission</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['admin', 'manager', 'cashier'] as const).map(role => (
                    <button
                      key={role}
                      onClick={() => setFormData({ ...formData, voidOrderPermission: role })}
                      className={`py-2 px-1 rounded-lg border text-[10px] font-bold capitalize transition-all cursor-pointer ${
                        formData.voidOrderPermission === role
                          ? 'border-[#008f77] bg-[#E6F7F5] text-[#007462]'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
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
                    <Settings2 className="w-4 h-4 text-slate-400 group-hover:text-[#008f77] transition-colors" />
                    <div>
                      <p className="text-xs font-bold text-slate-700">Enable Shift Tracking</p>
                      <p className="text-[10px] text-slate-500">Track cash drawer open/close totals</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.enableShiftTracking}
                    onChange={e => setFormData({ ...formData, enableShiftTracking: e.target.checked })}
                    className="w-4 h-4 accent-[#008f77]"
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
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono focus-visible:border-[#008f77]"
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
        <section className="bg-white p-5 rounded-lg border border-slate-200 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
              <div className="p-2 bg-[#E6F7F5] rounded-md">
                <UserCog className="w-5 h-5 text-[#007462]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Staff Security</h2>
              <p className="text-[11px] text-slate-500">Manage terminal access and PINs</p>
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
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono focus-visible:border-[#008f77]"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">Access PIN</label>
                <input
                  type="text"
                  required
                  value={cashierPass}
                  onChange={e => setCashierPass(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono focus-visible:border-[#008f77]"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-[#008f77] hover:bg-[#007462] text-white rounded-md text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {cashierSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              <span>{cashierSaved ? 'Credentials Updated!' : 'Update Security PIN'}</span>
            </button>
          </form>
        </section>
      </div>

      {/* DATABASE MAINTENANCE (Bottom Bar) */}
      <footer className="bg-white p-5 rounded-lg border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-5">
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
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-bold transition cursor-pointer"
          >
            <FileDown className="w-4 h-4 text-[#00A389]" />
            <span>Backup DB</span>
          </button>
          <button
            onClick={() => setIsWipeSalesDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-md text-xs font-bold transition cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Wipe Sales</span>
          </button>
        </div>
      </footer>

      {isWipeSalesDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="wipe-sales-title"
            aria-describedby="wipe-sales-description"
            className="bg-white rounded-lg max-w-sm w-full p-6 border border-slate-200 text-center"
          >
            <div className="w-12 h-12 rounded-md bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 id="wipe-sales-title" className="text-lg font-bold text-slate-900 mb-2">
              Wipe all sales?
            </h2>
            <p id="wipe-sales-description" className="text-xs text-slate-500 mb-6">
              Clear cached sales history on this device. Pending sales remain available for recovery; saved sales reload from the server.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsWipeSalesDialogOpen(false)}
                className="px-4 py-2 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearDemoOrders}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-md text-xs font-bold transition"
              >
                Wipe Sales
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
