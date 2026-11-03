import React from 'react';
import { Badge } from './ui/Badge';
import { Product } from '../types/pos';

export function ProductStockBadge({ product }: { product: Product }) {
  const soldOut = product.stockQuantity <= 0;
  const unavailable = !product.isAvailable;
  if (!soldOut && !unavailable && product.stockQuantity > product.minStockThreshold) return null;
  return (
    <Badge tone={soldOut || unavailable ? 'danger' : 'warning'}>
      {soldOut ? 'Sold out' : unavailable ? 'Unavailable' : `Low stock · ${product.stockQuantity} left`}
    </Badge>
  );
}
