import React from 'react';
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
    <header className="h-16 px-6 lg:px-8 bg-white border-b border-slate-100 flex items-center justify-between gap-4 shrink-0 select-none font-sans">
      {/* Left: Mobile menu toggle only (< lg), completely clean */}
      <div className="flex items-center gap-3">
        {onOpenMobileSidebar && (
          <button
            onClick={onOpenMobileSidebar}
            className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 cursor-pointer"
            title="Open Menu"
          >
            <span className="text-xl">☰</span>
          </button>
        )}
      </div>

      {/* Right: Only User Profile (Bell icon and Next Token removed per request) */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Mobile Cart Trigger (< xl) */}
        {onOpenMobileCart && (
          <button
            onClick={onOpenMobileCart}
            className="xl:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00A389] text-white font-bold text-xs shadow-xs"
            title="View Cart"
          >
            <span>🛒</span>
            <span>{cartItemCount}</span>
          </button>
        )}

        {/* User Profile matching reference */}
        <div className="flex items-center gap-3">
          <img
            src={currentUser.avatar}
            alt={currentUser.name}
            className="w-10 h-10 rounded-full object-cover border border-slate-200"
          />
          <div className="text-left leading-tight hidden sm:block">
            <h3 className="text-sm font-semibold text-slate-900">
              {currentUser.name}
            </h3>
            <p className="text-xs text-slate-400 capitalize mt-0.5">
              {currentUser.role}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
