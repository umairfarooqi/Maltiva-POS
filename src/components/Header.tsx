import React from 'react';
import { Menu, ShoppingCart } from 'lucide-react';
import { User } from '../types/pos';

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
    <header className="h-16 px-6 lg:px-8 bg-pos-chrome border-b border-pos-divider flex items-center justify-between gap-4 shrink-0 select-none font-sans">
      {/* Left: Mobile menu toggle only (< lg), completely clean */}
      <div className="flex items-center gap-3">
        {onOpenMobileSidebar && (
          <button
            onClick={onOpenMobileSidebar}
            aria-label="Open navigation"
            className="lg:hidden p-2 -ml-2 text-pos-secondary hover:text-pos-text rounded-md hover:bg-pos-raised cursor-pointer"
            title="Open navigation"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Right: Only User Profile (Bell icon and Next Token removed per request) */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Mobile Cart Trigger (< xl) */}
        {onOpenMobileCart && (
          <button
            onClick={onOpenMobileCart}
            aria-label={`Open cart, ${cartItemCount} items`}
            className="xl:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-pos-action text-white font-bold text-xs"
            title="View Cart"
          >
            <ShoppingCart className="w-4 h-4" aria-hidden="true" />
            <span>{cartItemCount}</span>
          </button>
        )}

        {/* User Profile matching reference */}
        <div className="flex items-center gap-3">
          <img
            src={currentUser.avatar}
            alt={currentUser.name}
            className="w-10 h-10 rounded-full object-cover border border-pos-border"
          />
          <div className="text-left leading-tight hidden sm:block">
            <h3 className="text-sm font-semibold text-pos-text">
              {currentUser.name}
            </h3>
            <p className="text-xs text-pos-muted capitalize mt-0.5">
              {currentUser.role}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
