import React from 'react';

interface MaltivaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  collapsed?: boolean;
}

export const MaltivaLogo: React.FC<MaltivaLogoProps> = ({
  className = '',
  size = 'md',
  showSubtitle: _showSubtitle,
  collapsed = false,
}) => {
  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  return (
    <div
      className={`flex items-center select-none ${
        collapsed ? 'justify-center w-full' : 'gap-3'
      } ${className}`}
    >
      <img src="/maltiva-logo.svg" alt={collapsed ? "Maltiva Crust" : ""} className={`${iconSizes[size]} shrink-0 object-contain`} />

      {/* Brand Name matching Image 2 ("Tasty Station" typography style) */}
      {!collapsed && (
        <div className="leading-tight animate-in fade-in duration-150 overflow-hidden whitespace-nowrap">
          <h1 className="text-lg font-bold text-pos-text tracking-tight leading-none">
            Maltiva
          </h1>
          <p className="text-sm font-medium text-pos-muted leading-none mt-1">
            Crust
          </p>
        </div>
      )}
    </div>
  );
};
