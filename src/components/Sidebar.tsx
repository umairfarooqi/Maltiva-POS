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
import { Button } from './ui/Button';
import { Avatar } from './ui/Avatar';

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

type IconType = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;

/** One navigation row. Collapsed rows show only the icon and carry the label as their accessible name. */
function NavItem({ icon: Icon, label, active = false, collapsed = false, tone = 'default', onClick }: {
  icon: IconType; label: string; active?: boolean; collapsed?: boolean; tone?: 'default' | 'danger'; onClick: () => void;
}) {
  const state = active
    ? 'bg-pos-selected text-pos-text font-semibold ring-1 ring-inset ring-pos-accent/40'
    : tone === 'danger'
      ? 'text-pos-secondary hover:bg-pos-danger-bg hover:text-pos-danger-text'
      : 'text-pos-secondary hover:bg-pos-raised hover:text-pos-text';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={`flex w-full min-h-pos-touch items-center rounded-pos-control text-sm font-medium cursor-pointer transition-colors duration-[var(--pos-transition-fast)] ${
        collapsed ? 'justify-center' : 'gap-3 px-3'
      } ${state}`}
    >
      <Icon className={`size-5 shrink-0 ${active ? 'text-pos-accent' : 'text-pos-muted'}`} aria-hidden="true" />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

function UserCard({ name, role, avatar, collapsed = false }: { name: string; role: UserRole; avatar?: string; collapsed?: boolean }) {
  return (
    <div
      title={collapsed ? `${name} (${role})` : undefined}
      className={`mb-2 flex items-center rounded-pos-control border border-pos-border bg-pos-inset ${collapsed ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'}`}
    >
      <Avatar name={name} src={avatar} />
      {!collapsed && (
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-pos-text">{name}</p>
          <p className="mt-0.5 text-xs capitalize text-pos-muted">{role}</p>
        </div>
      )}
    </div>
  );
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

  /** Navigation list and account footer, shared by the desktop rail and the mobile drawer. */
  const renderNav = (collapsed: boolean) => (
    <>
      <nav className="space-y-1" aria-label="Main">
        {visibleItems.map(item => (
          <NavItem key={item.id} icon={item.icon} label={item.label} collapsed={collapsed}
            active={activeTab === item.id} onClick={() => handleNavClick(item.id)} />
        ))}
      </nav>
    </>
  );
  const renderFooter = (collapsed: boolean) => (
    <div className="space-y-1 border-t border-pos-divider pt-4">
      <UserCard name={userName} role={userRole} avatar={userAvatar} collapsed={collapsed} />
      {!isCashier && (
        <NavItem icon={Settings} label="Settings" collapsed={collapsed}
          active={activeTab === 'settings'} onClick={() => handleNavClick('settings')} />
      )}
      <NavItem icon={LogOut} label="Logout" collapsed={collapsed} tone="danger" onClick={onLogout} />
    </div>
  );

  return (
    <>
      <aside
        className="hidden lg:block shrink-0 h-full overflow-y-auto transition-[width] duration-200 ease-out"
        style={{ width: isCollapsed ? 72 : 228 }}
      >
        <div className={`flex h-full w-full select-none flex-col justify-between border-r border-pos-divider bg-pos-chrome py-4 ${isCollapsed ? 'px-2' : 'px-3'}`}>
          <div>
            <div className={`mb-5 flex items-center ${isCollapsed ? 'flex-col gap-2.5' : 'justify-between pl-1.5'}`}>
              <MaltivaLogo size="sm" showSubtitle={false} collapsed={isCollapsed} />
              <Button
                variant="ghost"
                size="icon-compact"
                onClick={() => setIsCollapsed(prev => !prev)}
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isCollapsed ? <PanelLeft className="size-4" aria-hidden="true" /> : <PanelLeftClose className="size-4" aria-hidden="true" />}
              </Button>
            </div>
            {renderNav(isCollapsed)}
          </div>
          {renderFooter(isCollapsed)}
        </div>
      </aside>

      {/* Mobile / tablet drawer (< lg) */}
      {isMobileOpen && (
        <Dialog label="Navigation" onClose={() => onCloseMobile?.()} backdropClassName="!p-0 !justify-start"
          className="flex h-full w-64 flex-col justify-between overflow-y-auto border-r border-pos-border bg-pos-chrome px-4 py-5">
          <div>
            <div className="mb-6 flex items-center justify-between pl-1">
              <MaltivaLogo size="sm" showSubtitle={false} collapsed={false} />
              {onCloseMobile && (
                <Button variant="ghost" size="icon" onClick={onCloseMobile} aria-label="Close navigation">
                  <X className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
            {renderNav(false)}
          </div>
          {renderFooter(false)}
        </Dialog>
      )}
    </>
  );
};
