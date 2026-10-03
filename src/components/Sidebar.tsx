import React, { useState } from 'react';
import {
  Store,
  UtensilsCrossed,
  LayoutDashboard,
  TrendingUp,
  Settings,
  LogOut,
  Pin,
  PinOff,
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

  // Desktop hover state & user pin toggle
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  // Expanded if hovered OR pinned (on desktop)
  const isExpandedDesktop = isHovered || isPinned || activeTab === 'manage_dishes';

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
      {/* ======================================================== */}
      {/* DESKTOP SIDEBAR WITH HOVER-TO-EXPAND & ZERO CONFLICT     */}
      {/* Base spacer keeps main content grid rock-solid & static */}
      {/* ======================================================== */}
      <aside
        className="hidden lg:block relative shrink-0 h-full transition-all duration-300"
        style={{ width: isPinned || activeTab === 'manage_dishes' ? 240 : 76 }}
      >
        {/* Floating panel that expands on hover without shifting layout */}
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`absolute top-0 left-0 bottom-0 z-40 bg-white h-full border-r border-slate-100 flex flex-col justify-between py-6 transition-all duration-200 ease-out select-none ${
            isExpandedDesktop
              ? 'w-60 px-4 shadow-2xl shadow-slate-900/10 border-slate-200/90'
              : 'w-[76px] px-2.5'
          }`}
        >
          <div>
            {/* Header: Logo & Pin button */}
            <div className={`flex items-center mb-8 ${isExpandedDesktop ? 'justify-between pl-1' : 'justify-center'}`}>
              <MaltivaLogo
                size="sm"
                showSubtitle={false}
                collapsed={!isExpandedDesktop}
              />

              {isExpandedDesktop && (
                <button
                  type="button"
                  onClick={() => setIsPinned(!isPinned)}
                  title={isPinned ? 'Unpin sidebar (auto-collapse)' : 'Pin sidebar open'}
                  className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                    isPinned
                      ? 'bg-[#E6F7F5] text-[#00A389]'
                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                </button>
              )}
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
                    className={`w-full flex items-center rounded-2xl transition cursor-pointer ${
                      isExpandedDesktop
                        ? 'gap-3.5 px-3.5 py-3 text-[15px]'
                        : 'justify-center p-3'
                    } ${
                      isActive
                        ? 'bg-[#E6F7F5] text-[#00A389] font-semibold shadow-xs'
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
                className={`w-full flex items-center rounded-2xl transition cursor-pointer ${
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
              className={`w-full flex items-center rounded-2xl text-[15px] font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer ${
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
        <div className="lg:hidden fixed inset-0 z-50 flex bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-64 h-full bg-white shadow-2xl animate-in slide-in-from-left duration-200 flex flex-col justify-between py-6 px-4">
            <div>
              {/* Brand Logo & Close */}
              <div className="flex items-center justify-between mb-8 pl-1">
                <MaltivaLogo size="sm" showSubtitle={false} collapsed={false} />
                {onCloseMobile && (
                  <button
                    onClick={onCloseMobile}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
                  >
                    ✕
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
                      className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[15px] font-medium transition cursor-pointer ${
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
                  className={`w-full flex items-center gap-3.5 px-4 py-2.5 rounded-2xl text-[15px] font-medium transition cursor-pointer ${
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
                className="w-full flex items-center gap-3.5 px-4 py-2.5 rounded-2xl text-[15px] font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
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
