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
  Users,
  Receipt,
} from 'lucide-react';
import { UserRole } from '../types/pos';
import { Dialog } from './ui/Dialog';
import { MaltivaLogo } from './MaltivaLogo';

export type NavTab =
  | 'order_line'
  | 'receipts'
  | 'manage_dishes'
  | 'dashboard'
  | 'profit_loss'
  | 'staff'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  userRole: UserRole;
  userName: string;
  userAvatar?: string;
  onLogout: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  userRole,
  userName,
  userAvatar,
  onLogout,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const isCashier = userRole === 'cashier';

  const [isCollapsed, setIsCollapsed] = useState(true);
  const isExpandedDesktop = !isCollapsed;

  // Pure Takeaway Navigation Items
  const navItems = [
    { id: 'order_line' as NavTab, label: 'Order Line', icon: Store, adminOnly: false },
    { id: 'receipts' as NavTab, label: 'Receipts', icon: Receipt, adminOnly: false },
    { id: 'manage_dishes' as NavTab, label: 'Dishes & Deals', icon: UtensilsCrossed, adminOnly: true },
    { id: 'dashboard' as NavTab, label: 'Daily Sales', icon: LayoutDashboard, adminOnly: true },
    { id: 'profit_loss' as NavTab, label: 'Profit & Loss', icon: TrendingUp, adminOnly: true, onlyAdmin: true },
    { id: 'staff' as NavTab, label: 'Staff', icon: Users, adminOnly: true, onlyAdmin: true },
  ];

  const handleNavClick = (tabId: NavTab) => {
    onSelectTab(tabId);
    if (onCloseMobile) onCloseMobile();
  };

  const visibleItems = (isCashier
    ? navItems.filter(item => !item.adminOnly)
    : navItems
  ).filter(item => !('onlyAdmin' in item) || userRole === 'admin');

  const userInitial = (userName || 'U').charAt(0).toUpperCase();

  return (
    <>
      <aside
        className="hidden lg:block shrink-0 h-full overflow-y-auto transition-[width] duration-200 ease-out"
        style={{ width: isCollapsed ? 72 : 228 }}
      >
        <div
          className={`h-full w-full bg-pos-chrome border-r border-pos-divider flex flex-col justify-between py-4 select-none ${
            isExpandedDesktop ? 'px-3' : 'px-2'
          }`}
        >
          <div>
            <div className={`flex items-center mb-5 ${isExpandedDesktop ? 'justify-between pl-1.5' : 'flex-col gap-2.5'}`}>
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
                className="p-2 rounded-lg text-pos-muted hover:text-pos-secondary hover:bg-pos-raised transition cursor-pointer active:scale-95"
              >
                {isCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>
            </div>

            {/* Primary Navigation Items */}
            <nav className="space-y-1">
              {visibleItems.map(item => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    title={!isExpandedDesktop ? item.label : undefined}
                    className={`w-full flex items-center rounded-lg transition cursor-pointer active:scale-[0.98] ${
                      isExpandedDesktop
                        ? 'gap-3 px-3 py-2.5 text-sm'
                        : 'justify-center p-3'
                    } ${
                      isActive
                        ? 'bg-pos-selected text-pos-accent font-semibold ring-1 ring-pos-accent/30'
                        : 'text-pos-secondary hover:text-pos-text hover:bg-pos-inset'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 shrink-0 ${
                        isActive ? 'text-pos-accent' : 'text-pos-muted'
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

          {/* Bottom Navigation items: User Profile, Settings & Logout */}
          <div className="space-y-1.5 pt-4 border-t border-pos-divider">
            {/* Active User Badge */}
            <div
              title={!isExpandedDesktop ? `${userName} (${userRole})` : undefined}
              className={`flex items-center rounded-lg bg-pos-inset/70 border border-pos-border/60 mb-2 ${
                isExpandedDesktop ? 'gap-2.5 px-2.5 py-2' : 'justify-center p-2'
              }`}
            >
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={userName}
                  className="w-8 h-8 rounded-full object-cover border border-pos-border shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-pos-selected border border-pos-accent/30 text-pos-accent flex items-center justify-center text-xs font-bold shrink-0">
                  {userInitial}
                </div>
              )}
              {isExpandedDesktop && (
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="text-xs font-semibold text-pos-text truncate">{userName}</p>
                  <p className="text-[10px] font-medium text-pos-accent uppercase tracking-wider mt-0.5">{userRole}</p>
                </div>
              )}
            </div>

            {!isCashier && (
              <button
                onClick={() => handleNavClick('settings')}
                title={!isExpandedDesktop ? 'Settings' : undefined}
                className={`w-full flex items-center rounded-lg transition cursor-pointer active:scale-[0.98] ${
                  isExpandedDesktop
                    ? 'gap-3 px-3 py-2.5 text-sm'
                    : 'justify-center p-2.5'
                } ${
                  activeTab === 'settings'
                    ? 'bg-pos-selected text-pos-accent font-semibold ring-1 ring-pos-accent/30'
                    : 'text-pos-secondary hover:text-pos-text hover:bg-pos-inset'
                }`}
              >
                <Settings
                  className={`w-5 h-5 shrink-0 ${
                    activeTab === 'settings' ? 'text-pos-accent' : 'text-pos-muted'
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
              className={`w-full flex items-center rounded-lg text-sm font-medium text-pos-secondary hover:text-pos-danger-text hover:bg-pos-danger-bg transition cursor-pointer active:scale-[0.98] ${
                isExpandedDesktop
                  ? 'gap-3 px-3 py-2.5'
                  : 'justify-center p-2.5'
              }`}
            >
              <LogOut className="w-5 h-5 shrink-0 text-pos-muted group-hover:text-pos-danger-text" />
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
        <Dialog label="Navigation" onClose={() => onCloseMobile?.()} backdropClassName="!p-0 !justify-start" className="w-64 h-full overflow-y-auto bg-pos-chrome border-r border-pos-border flex flex-col justify-between py-5 px-4">
            <div>
              {/* Brand Logo & Close */}
              <div className="flex items-center justify-between mb-6 pl-1">
                <MaltivaLogo size="sm" showSubtitle={false} collapsed={false} />
                {onCloseMobile && (
                  <button
                    onClick={onCloseMobile}
                    aria-label="Close navigation"
                    className="p-2 text-pos-muted hover:text-pos-secondary rounded-lg hover:bg-pos-raised cursor-pointer"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Navigation Items */}
              <nav className="space-y-1">
                {visibleItems.map(item => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-medium transition cursor-pointer ${
                        isActive
                          ? 'bg-pos-selected text-pos-accent font-semibold ring-1 ring-pos-accent/30'
                          : 'text-pos-secondary hover:text-pos-text hover:bg-pos-inset'
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 shrink-0 ${
                          isActive ? 'text-pos-accent' : 'text-pos-muted'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Bottom Actions */}
            <div className="space-y-1.5 pt-4 border-t border-pos-divider">
              <div className="flex items-center gap-2.5 px-3 py-2 mb-2 rounded-lg bg-pos-inset/70 border border-pos-border/60">
                {userAvatar ? (
                  <img
                    src={userAvatar}
                    alt={userName}
                    className="w-8 h-8 rounded-full object-cover border border-pos-border shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-pos-selected border border-pos-accent/30 text-pos-accent flex items-center justify-center text-xs font-bold shrink-0">
                    {userInitial}
                  </div>
                )}
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="text-xs font-semibold text-pos-text truncate">{userName}</p>
                  <p className="text-[10px] font-medium text-pos-accent uppercase tracking-wider mt-0.5">{userRole}</p>
                </div>
              </div>

              {!isCashier && (
                <button
                  onClick={() => handleNavClick('settings')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                    activeTab === 'settings'
                      ? 'bg-pos-selected text-pos-accent font-semibold ring-1 ring-pos-accent/30'
                      : 'text-pos-secondary hover:text-pos-text hover:bg-pos-inset'
                  }`}
                >
                  <Settings
                    className={`w-5 h-5 shrink-0 ${
                      activeTab === 'settings' ? 'text-pos-accent' : 'text-pos-muted'
                    }`}
                  />
                  <span>Settings</span>
                </button>
              )}

              <button
                onClick={onLogout}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-pos-secondary hover:text-pos-danger-text hover:bg-pos-danger-bg transition cursor-pointer"
              >
                <LogOut className="w-5 h-5 shrink-0 text-pos-muted" />
                <span>Logout</span>
              </button>
            </div>
        </Dialog>
      )}
    </>
  );
};
