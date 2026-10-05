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
      {/* 3-segment teal geometric emblem matching Image 2 reference */}
      <svg
        className={`${iconSizes[size]} shrink-0 transition-transform duration-200`}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M18 3C9.716 3 3 9.716 3 18h15V3z"
          fill="#00A389"
        />
        <path
          d="M3 20c.5 7.9 6.9 14.3 14.8 14.8V20H3z"
          fill="#00B69B"
        />
        <path
          d="M20 34.8C27.9 34.3 34.3 27.9 34.8 20H20v14.8z"
          fill="#00A389"
        />
        <path
          d="M20 18h14.8C34.3 10.1 27.9 3.7 20 3.2V18z"
          fill="#008F77"
        />
      </svg>

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
