import React, { useState } from 'react';
import {
  Store,
  UtensilsCrossed,
  LayoutDashboard,
  TrendingUp,
  Settings,
  LogOut,
  PanelLeft,
  PanelLeftClose,
  X,
} from 'lucide-react';
import { UserRole } from '../types/pos';
import { MaltivaLogo } from './MaltivaLogo';

export type NavTab =
  | 'order_line'
  | 'manage_dishes'
  | 'dashboard'
  | 'profit_loss'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  userRole: UserRole;
  userName: string;
  onLogout: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  userRole,
  userName: _userName,
  onLogout,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const isCashier = userRole === 'cashier';

  const [isCollapsed, setIsCollapsed] = useState(false);
  const isExpandedDesktop = !isCollapsed;

  // Pure Takeaway Navigation Items
  const navItems = [
    { id: 'order_line' as NavTab, label: 'Order Line', icon: Store, adminOnly: false },
    { id: 'manage_dishes' as NavTab, label: 'Dishes & Deals', icon: UtensilsCrossed, adminOnly: true },
    { id: 'dashboard' as NavTab, label: 'Daily Sales', icon: LayoutDashboard, adminOnly: true },
    { id: 'profit_loss' as NavTab, label: 'Profit & Loss', icon: TrendingUp, adminOnly: true },
  ];

  const handleNavClick = (tabId: NavTab) => {
    onSelectTab(tabId);
    if (onCloseMobile) onCloseMobile();
  };

  const visibleItems = isCashier
    ? navItems.filter(item => !item.adminOnly)
    : navItems;

  return (
    <>
      <aside
        className="hidden lg:block shrink-0 h-full transition-[width] duration-200 ease-out"
        style={{ width: isCollapsed ? 76 : 240 }}
      >
        <div
          className={`h-full w-full bg-white border-r border-slate-100 flex flex-col justify-between py-6 select-none ${
            isExpandedDesktop ? 'px-4' : 'px-2.5'
          }`}
        >
          <div>
            <div className={`flex items-center mb-8 ${isExpandedDesktop ? 'justify-between pl-1' : 'flex-col gap-3'}`}>
              <MaltivaLogo
                size="sm"
                showSubtitle={false}
                collapsed={isCollapsed}
              />

              <button
                type="button"
                onClick={() => setIsCollapsed(prev => !prev)}
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                {isCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>
            </div>

            {/* Primary Navigation Items */}
            <nav className="space-y-1.5">
              {visibleItems.map(item => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    title={!isExpandedDesktop ? item.label : undefined}
                    className={`w-full flex items-center rounded-md transition cursor-pointer ${
                      isExpandedDesktop
                        ? 'gap-3.5 px-3.5 py-3 text-[15px]'
                        : 'justify-center p-3'
                    } ${
                      isActive
                        ? 'bg-[#E6F7F5] text-[#007462] font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 shrink-0 ${
                        isActive ? 'text-[#00A389]' : 'text-slate-400'
                      }`}
                    />
                    {isExpandedDesktop && (
                      <span className="truncate whitespace-nowrap animate-in fade-in duration-150">
                        {item.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Bottom Navigation items: Settings & Logout */}
          <div className="space-y-1.5 pt-6 border-t border-slate-100">
            {!isCashier && (
              <button
                onClick={() => handleNavClick('settings')}
                title={!isExpandedDesktop ? 'Settings' : undefined}
                className={`w-full flex items-center rounded-md transition cursor-pointer ${
                  isExpandedDesktop
                    ? 'gap-3.5 px-3.5 py-2.5 text-[15px]'
                    : 'justify-center p-2.5'
                } ${
                  activeTab === 'settings'
                    ? 'bg-[#E6F7F5] text-[#00A389] font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Settings
                  className={`w-5 h-5 shrink-0 ${
                    activeTab === 'settings' ? 'text-[#00A389]' : 'text-slate-400'
                  }`}
                />
                {isExpandedDesktop && (
                  <span className="truncate whitespace-nowrap animate-in fade-in duration-150">
                    Settings
                  </span>
                )}
              </button>
            )}

            <button
              onClick={onLogout}
              title={!isExpandedDesktop ? 'Logout' : undefined}
              className={`w-full flex items-center rounded-md text-[15px] font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer ${
                isExpandedDesktop
                  ? 'gap-3.5 px-3.5 py-2.5'
                  : 'justify-center p-2.5'
              }`}
            >
              <LogOut className="w-5 h-5 shrink-0 text-slate-400 group-hover:text-rose-600" />
              {isExpandedDesktop && (
                <span className="truncate whitespace-nowrap animate-in fade-in duration-150">
                  Logout
                </span>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* MOBILE / TABLET DRAWER (< lg)                            */}
      {/* ======================================================== */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex bg-black/50 animate-in fade-in duration-150">
          <div className="w-64 h-full bg-white border-r border-slate-200 animate-in slide-in-from-left duration-200 flex flex-col justify-between py-6 px-4">
            <div>
              {/* Brand Logo & Close */}
              <div className="flex items-center justify-between mb-8 pl-1">
                <MaltivaLogo size="sm" showSubtitle={false} collapsed={false} />
                {onCloseMobile && (
                  <button
                    onClick={onCloseMobile}
                    aria-label="Close navigation"
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Navigation Items */}
              <nav className="space-y-1.5">
                {visibleItems.map(item => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-md text-[15px] font-medium transition cursor-pointer ${
                        isActive
                          ? 'bg-[#E6F7F5] text-[#00A389] font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 shrink-0 ${
                          isActive ? 'text-[#00A389]' : 'text-slate-400'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Bottom Actions */}
            <div className="space-y-1.5 pt-6 border-t border-slate-100">
              {!isCashier && (
                <button
                  onClick={() => handleNavClick('settings')}
                  className={`w-full flex items-center gap-3.5 px-4 py-2.5 rounded-md text-[15px] font-medium transition cursor-pointer ${
                    activeTab === 'settings'
                      ? 'bg-[#E6F7F5] text-[#00A389] font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Settings
                    className={`w-5 h-5 shrink-0 ${
                      activeTab === 'settings' ? 'text-[#00A389]' : 'text-slate-400'
                    }`}
                  />
                  <span>Settings</span>
                </button>
              )}

              <button
                onClick={onLogout}
                className="w-full flex items-center gap-3.5 px-4 py-2.5 rounded-md text-[15px] font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
              >
                <LogOut className="w-5 h-5 shrink-0 text-slate-400" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
