import React from 'react';
import { Product } from '../types/pos';

export function ProductStockBadge({ product }: { product: Product }) {
  const soldOut = product.stockQuantity <= 0;
  const unavailable = !product.isAvailable;
  if (!soldOut && !unavailable && product.stockQuantity > product.minStockThreshold) return null;
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${
      soldOut || unavailable ? 'bg-pos-danger-bg text-pos-danger-text' : 'bg-pos-warning-bg text-pos-warning-text'
    }`}>
      {soldOut ? 'Sold out' : unavailable ? 'Unavailable' : `Low stock · ${product.stockQuantity} left`}
    </span>
  );
}
