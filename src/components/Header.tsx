import React from 'react';
import { Menu, ShoppingCart } from 'lucide-react';
import { User } from '../types/pos';
import { Button } from './ui/Button';
import { Avatar } from './ui/Avatar';

interface HeaderProps {
  currentUser: User;
  onOpenMobileSidebar?: () => void;
  onOpenMobileCart?: () => void;
  cartItemCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onOpenMobileSidebar,
  onOpenMobileCart,
  cartItemCount = 0,
}) => {
  return (
    <header className="lg:hidden h-14 px-4 bg-pos-chrome border-b border-pos-divider flex items-center justify-between gap-3 shrink-0 select-none font-sans">
      {/* Left: Mobile menu toggle (< lg) */}
      <div className="flex items-center gap-2.5">
        {onOpenMobileSidebar && (
          <Button variant="ghost" size="icon"
            onClick={onOpenMobileSidebar}
            aria-label="Open navigation"
            className="-ml-1.5"
            title="Open navigation"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </Button>
        )}
        <span className="text-sm font-bold text-pos-text tracking-tight">Maltiva POS</span>
      </div>

      {/* Right: Mobile Cart Trigger & User Profile */}
      <div className="flex items-center gap-3 shrink-0">
        {onOpenMobileCart && (
          <Button variant="primary" size="compact"
            onClick={onOpenMobileCart}
            aria-label={`Open cart, ${cartItemCount} items`}
            className="lg:hidden tabular-nums"
            title="View Cart"
          >
            <ShoppingCart className="w-4 h-4" aria-hidden="true" />
            <span>{cartItemCount}</span>
          </Button>
        )}

        <div className="flex items-center gap-2.5">
          <Avatar name={currentUser.name} src={currentUser.avatar} />
          <div className="text-left leading-tight hidden sm:block">
            <h3 className="text-xs font-semibold text-pos-text">
              {currentUser.name}
            </h3>
            <p className="text-xs text-pos-muted capitalize">
              {currentUser.accountRole && currentUser.accountRole !== currentUser.role
                ? `${currentUser.accountRole} · Till`
                : currentUser.role}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
