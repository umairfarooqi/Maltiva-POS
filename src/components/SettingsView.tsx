import { parseRupees } from '../shared/money';
import React, { useState, useRef } from 'react';
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
import { Dialog } from './ui/Dialog';
import { useTheme } from '../services/theme';

interface SettingsViewProps {
  settings: PrinterSettings;
  onSaveSettings: (settings: PrinterSettings) => void | Promise<void>;
  currentUser: User;
  onUpdateCashierCredentials?: (username: string, pin: string) => void;
  onOpenTestPrint: () => void;
  onResetCustomerDisplay?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSaveSettings,
  currentUser,
  onUpdateCashierCredentials,
  onOpenTestPrint,
  onResetCustomerDisplay,
}) => {
  const { theme, setTheme } = useTheme();
  const [formData, setFormData] = useState<PrinterSettings>({ ...settings });
  const [cashierUser, setCashierUser] = useState(settings.cashierUsername || 'cashier');
  const [cashierPass, setCashierPass] = useState(settings.cashierPin || '1234');
  const saving = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [taxError, setTaxError] = useState('');
  const [cashierSaved, setCashierSaved] = useState(false);
  const [isWipeSalesDialogOpen, setIsWipeSalesDialogOpen] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (taxError) { setSaveError(taxError); return; }
    if (saving.current) return;
    saving.current = true; setIsSaving(true);
    try { await onSaveSettings(formData); setSaveError(''); }
    catch (error) { setSaveError((error as Error).message); return; }
    finally { saving.current = false; setIsSaving(false); }
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
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-pos-canvas select-none">
      {/* Top Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-pos-surface p-4 sm:p-5 rounded-lg border border-pos-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-pos-selected text-pos-accent">
              System Administration
            </span>
          </div>
          <h1 className="text-2xl font-black text-pos-text tracking-tight">Management Console</h1>
          <p className="text-xs text-pos-muted">Configure your store, hardware, and professional business rules.</p>
        </div>
        <button
          disabled={isSaving}
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-3 bg-pos-action hover:bg-pos-action-hover text-white rounded-md text-xs font-bold transition-colors cursor-pointer"
        >
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{isSaving ? 'Saving...' : saved ? 'Settings Applied!' : 'Apply All Changes'}</span>
        </button>
      </header>
      {saveError && <p role="alert" className="text-sm text-pos-danger-text">{saveError}</p>}
      <section aria-labelledby="appearance-title" className="bg-pos-surface p-5 rounded-lg border border-pos-border">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="appearance-title" className="text-sm font-bold text-pos-text">Appearance</h2>
            <p className="mt-1 text-xs text-pos-muted">Choose your theme. Changes apply immediately and are saved on this device.</p>
          </div>
          <button type="button" role="switch" aria-label="Dark mode" aria-checked={theme === 'dark'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex shrink-0 items-center gap-3 rounded-md border border-pos-control px-3 py-2 text-sm font-semibold text-pos-text">
            <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
            <span aria-hidden="true" className={`flex h-6 w-10 items-center rounded-full p-1 ${theme === 'dark' ? 'bg-pos-action justify-end' : 'bg-pos-control justify-start'}`}>
              <span className="h-4 w-4 rounded-full bg-pos-surface theme-switch-thumb" />
            </span>
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        
        {/* SECTION 1: STORE IDENTITY */}
        <section className="bg-pos-surface p-5 rounded-lg border border-pos-border space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-pos-divider">
            <div className="p-2 bg-pos-success-bg rounded-lg">
              <Store className="w-5 h-5 text-pos-accent" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-pos-text">Store Identity</h2>
              <p className="text-[11px] text-pos-muted">Brand details printed on receipts</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-pos-secondary block mb-1.5">Store Name</label>
              <input
                type="text"
                value={formData.storeName}
                onChange={e => setFormData({ ...formData, storeName: e.target.value })}
                className="w-full px-4 py-2.5 bg-pos-inset border border-pos-control rounded-md text-xs focus-visible:border-pos-accent"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-pos-secondary block mb-1.5">Location / Address</label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-pos-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  className="w-full pl-9 pr-4 py-2.5 bg-pos-inset border border-pos-control rounded-md text-xs focus-visible:border-pos-accent"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-pos-secondary block mb-1.5">WhatsApp Contact</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-pos-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={formData.whatsApp}
                  onChange={e => setFormData({ ...formData, whatsApp: e.target.value })}
                  className="w-full pl-9 pr-4 py-2.5 bg-pos-inset border border-pos-control rounded-md text-xs focus-visible:border-pos-accent"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-pos-secondary block mb-1.5">Sales Tax %</label>
              <input
                type="number"
                value={formData.taxBp / 100}
                step="0.01" min="0"
                onChange={e => {
                  try { setFormData({ ...formData, taxBp: parseRupees(e.target.value || '0') }); setTaxError(''); }
                  catch { setTaxError('Tax rate must have at most two decimal places.'); }
                }}
                className="w-full px-4 py-2.5 bg-pos-inset border border-pos-control rounded-md text-xs font-mono focus-visible:border-pos-accent"
              />
              {taxError && <p role="alert" className="text-xs text-pos-danger-text">{taxError}</p>}
            </div>
            <label className="text-xs text-pos-secondary flex items-center gap-2">
              <input type="checkbox" checked={formData.taxInclusive ?? false} onChange={e => setFormData({ ...formData, taxInclusive: e.target.checked })} />
              Prices include tax
            </label>
          </div>
        </section>

        {/* SECTION 2: HARDWARE CONFIGURATION */}
        <section className="bg-pos-surface p-5 rounded-lg border border-pos-border space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-pos-divider">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-pos-selected rounded-md">
                <Printer className="w-5 h-5 text-pos-accent" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-pos-text">Hardware & Terminal</h2>
                <p className="text-[11px] text-pos-muted">Printer and dual-screen optimization</p>
              </div>
            </div>
            <button
              onClick={onOpenTestPrint}
              className="px-3 py-1.5 bg-pos-raised hover:bg-pos-raised text-pos-secondary rounded-lg text-[10px] font-bold transition cursor-pointer"
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
                    ? 'border-pos-accent bg-pos-selected text-pos-accent'
                    : 'border-pos-control text-pos-secondary hover:bg-pos-inset'
                }`}
              >
                80mm Standard
              </button>
              <button
                onClick={() => setFormData({ ...formData, paperWidth: '58mm' })}
                className={`py-2.5 px-4 rounded-md border text-xs font-bold transition-colors cursor-pointer ${
                  formData.paperWidth === '58mm'
                    ? 'border-pos-accent bg-pos-selected text-pos-accent'
                    : 'border-pos-control text-pos-secondary hover:bg-pos-inset'
                }`}
              >
                58mm Compact
              </button>
            </div>

            <div className="p-4 bg-pos-inset rounded-md border border-pos-border space-y-3">
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex items-center gap-3">
                  <ChefHat className="w-4 h-4 text-pos-muted group-hover:text-pos-info-text transition-colors" />
                  <div>
                    <p className="text-xs font-bold text-pos-secondary">Kitchen Printer</p>
                    <p className="text-[10px] text-pos-muted">Send separate slips to the kitchen</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={formData.kitchenPrinterEnabled}
                  onChange={e => setFormData({ ...formData, kitchenPrinterEnabled: e.target.checked })}
                  className="w-4 h-4 accent-pos-action"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex items-center gap-3">
                  <Printer className="w-4 h-4 text-pos-muted group-hover:text-pos-info-text transition-colors" />
                  <div>
                    <p className="text-xs font-bold text-pos-secondary">Open print dialog after confirmed sale</p>
                    <p className="text-[10px] text-pos-muted">Select a printer in the browser dialog to finish printing. Kitchen slip is included when enabled.</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={formData.autoPrintDualSlips}
                  onChange={e => setFormData({ ...formData, autoPrintDualSlips: e.target.checked })}
                  className="w-4 h-4 accent-pos-action"
                />
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-pos-selected border border-pos-success-border rounded-md">
              <div className="flex items-center gap-3">
                <Monitor className="w-4 h-4 text-pos-accent" />
                <span className="text-xs font-bold text-pos-text">Customer Facing Display</span>
              </div>
              {onResetCustomerDisplay && <button type="button" onClick={onResetCustomerDisplay} className="p-2 text-xs text-pos-accent">Reset confirmation</button>}
              <button
                aria-label="Open customer display"
                onClick={handleOpenCustomerDisplay}
                className="p-2 bg-pos-surface border border-pos-success-border text-pos-accent rounded-md hover:bg-pos-action hover:text-white transition-colors cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 3: BUSINESS RULES (The KFC Level) */}
        <section className="bg-pos-surface p-5 rounded-lg border border-pos-border space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-pos-divider">
              <div className="p-2 bg-pos-selected rounded-md">
                <ShieldCheck className="w-5 h-5 text-pos-accent" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-pos-text">Business Operations</h2>
              <p className="text-[11px] text-pos-muted">Permissions, shifts, and inventory rules</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-pos-inset rounded-md border border-pos-border space-y-4">
              <div>
                <label className="text-xs font-bold text-pos-secondary block mb-2">Order Void Permission (unavailable)</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['admin', 'manager', 'cashier'] as const).map(role => (
                    <button
                      disabled
                      key={role}
                      onClick={() => setFormData({ ...formData, voidOrderPermission: role })}
                      className={`py-2 px-1 rounded-lg border text-[10px] font-bold capitalize transition-all cursor-pointer ${
                        formData.voidOrderPermission === role
                          ? 'border-pos-accent bg-pos-selected text-pos-accent'
                          : 'border-pos-control text-pos-secondary hover:bg-pos-inset'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-pos-border">
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <Settings2 className="w-4 h-4 text-pos-muted group-hover:text-pos-accent transition-colors" />
                    <div>
                      <p className="text-xs font-bold text-pos-secondary">Shift Tracking (unavailable)</p>
                      <p className="text-[10px] text-pos-muted">Shift sessions are not implemented yet.</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    disabled
                    checked={false}
                    onChange={e => setFormData({ ...formData, enableShiftTracking: e.target.checked })}
                    className="w-4 h-4 accent-pos-accent"
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-pos-secondary block mb-1.5">Default low-stock threshold</label>
                <div className="relative">
                  <BellRing className="w-4 h-4 text-pos-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    aria-label="Default low-stock threshold"
                    value={formData.globalLowStockThreshold ?? 5}
                    onChange={e => setFormData({ ...formData, globalLowStockThreshold: parseInt(e.target.value) || 0 })}
                    className="w-full pl-9 pr-4 py-2.5 bg-pos-inset border border-pos-control rounded-md text-xs font-mono focus-visible:border-pos-accent"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <p className="text-[10px] text-pos-muted italic">Used for new dishes and deals. Existing per-product thresholds take precedence.</p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: USER & SECURITY (Admin Control) */}
        <section className="bg-pos-surface p-5 rounded-lg border border-pos-border space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-pos-divider">
              <div className="p-2 bg-pos-selected rounded-md">
                <UserCog className="w-5 h-5 text-pos-accent" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-pos-text">Staff Security</h2>
              <p className="text-[11px] text-pos-muted">Local offline access only. Server credentials are managed separately.</p>
            </div>
          </div>

          <form onSubmit={handleUpdateCashier} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-pos-secondary block mb-1.5">Cashier Username</label>
                <input
                  type="text"
                  required
                  value={cashierUser}
                  onChange={e => setCashierUser(e.target.value)}
                  className="w-full px-4 py-2.5 bg-pos-inset border border-pos-control rounded-md text-xs font-mono focus-visible:border-pos-accent"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-pos-secondary block mb-1.5">Access PIN</label>
                <input
                  type="text"
                  required
                  value={cashierPass}
                  onChange={e => setCashierPass(e.target.value)}
                  className="w-full px-4 py-2.5 bg-pos-inset border border-pos-control rounded-md text-xs font-mono focus-visible:border-pos-accent"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-pos-action hover:bg-pos-action-hover text-white rounded-md text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {cashierSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              <span>{cashierSaved ? 'Offline credentials updated' : 'Update offline PIN'}</span>
            </button>
          </form>
        </section>
      </div>

      {/* DATABASE MAINTENANCE (Bottom Bar) */}
      <footer className="bg-pos-surface p-5 rounded-lg border border-pos-border flex flex-col md:flex-row items-center justify-between gap-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-pos-raised rounded-lg">
            <HardDrive className="w-5 h-5 text-pos-secondary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-pos-text">System Maintenance</h3>
            <p className="text-[11px] text-pos-muted">Export or clear the browser cache. Server sales remain intact.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExportBackup}
            className="flex items-center gap-2 px-4 py-2 bg-pos-surface border border-pos-control hover:bg-pos-inset text-pos-secondary rounded-md text-xs font-bold transition cursor-pointer"
          >
            <FileDown className="w-4 h-4 text-pos-accent" />
            <span>Export cached data</span>
          </button>
          <button
            onClick={() => setIsWipeSalesDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-pos-danger-bg hover:bg-pos-danger-bg text-pos-danger-text rounded-md text-xs font-bold transition cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear cached sales</span>
          </button>
        </div>
      </footer>

      {isWipeSalesDialogOpen && (
        <Dialog role="alertdialog" label="Clear cached sales?" onClose={() => setIsWipeSalesDialogOpen(false)} className="bg-pos-surface rounded-lg max-w-sm w-full p-6 border border-pos-border text-center">            <div className="w-12 h-12 rounded-md bg-pos-danger-bg text-pos-danger-text flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 id="wipe-sales-title" className="text-lg font-bold text-pos-text mb-2">
              Clear cached sales?
            </h2>
            <p id="wipe-sales-description" className="text-xs text-pos-muted mb-6">
              Clear cached sales history on this device. Pending sales remain available for recovery; saved sales reload from the server.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsWipeSalesDialogOpen(false)}
                className="px-4 py-2 rounded-md text-xs font-bold text-pos-secondary hover:bg-pos-raised transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearDemoOrders}
                className="px-4 py-2 bg-pos-danger-action hover:bg-pos-danger-hover text-white rounded-md text-xs font-bold transition"
              >
                Clear cached sales
              </button>
            </div>
        </Dialog>
      )}
    </div>
  );
};
