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
    <header className="lg:hidden h-14 px-4 bg-pos-chrome border-b border-pos-divider flex items-center justify-between gap-3 shrink-0 select-none font-sans">
      {/* Left: Mobile menu toggle (< lg) */}
      <div className="flex items-center gap-2.5">
        {onOpenMobileSidebar && (
          <button
            onClick={onOpenMobileSidebar}
            aria-label="Open navigation"
            className="p-2 -ml-1.5 text-pos-secondary hover:text-pos-text rounded-lg hover:bg-pos-raised cursor-pointer active:scale-95 transition"
            title="Open navigation"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
        <span className="text-sm font-bold text-pos-text tracking-tight">Maltiva POS</span>
      </div>

      {/* Right: Mobile Cart Trigger & User Profile */}
      <div className="flex items-center gap-3 shrink-0">
        {onOpenMobileCart && (
          <button
            onClick={onOpenMobileCart}
            aria-label={`Open cart, ${cartItemCount} items`}
            className="xl:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pos-action text-white font-bold text-xs active:scale-95 transition"
            title="View Cart"
          >
            <ShoppingCart className="w-4 h-4" aria-hidden="true" />
            <span>{cartItemCount}</span>
          </button>
        )}

        <div className="flex items-center gap-2.5">
          {currentUser.avatar ? (
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="w-8 h-8 rounded-full object-cover border border-pos-border"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-pos-selected border border-pos-accent/40 text-pos-accent flex items-center justify-center text-xs font-bold">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="text-left leading-tight hidden sm:block">
            <h3 className="text-xs font-semibold text-pos-text">
              {currentUser.name}
            </h3>
            <p className="text-[10px] text-pos-muted capitalize">
              {currentUser.role}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
