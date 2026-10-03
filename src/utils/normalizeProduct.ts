import type { Category, Product } from '../types/pos';

export const DEFAULT_UNCATEGORIZED_CATEGORY: Category = {
  id: 'cat-uncategorized',
  name: 'Uncategorized',
  icon: '📦',
  itemCount: 0,
  order: 999,
};

export function normalizeProduct(raw: Partial<Product>): Product {
  const now = new Date().toISOString();
  const priceValue = Number(raw.price);
  const costValue = Number(raw.costPrice);
  const stockValue = Number(raw.stockQuantity);
  const thresholdValue = Number(raw.minStockThreshold);

  return {
    id: raw.id || `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled Dish',
    categoryId: raw.categoryId || DEFAULT_UNCATEGORIZED_CATEGORY.id,
    categoryName: raw.categoryName || DEFAULT_UNCATEGORIZED_CATEGORY.name,
    price: Number.isFinite(priceValue) && priceValue >= 0 ? priceValue : 0,
    costPrice: Number.isFinite(costValue) && costValue >= 0 ? costValue : 0,
    stockQuantity: Number.isFinite(stockValue) ? Math.max(0, stockValue) : 0,
    minStockThreshold: Number.isFinite(thresholdValue) ? Math.max(0, thresholdValue) : 5,
    image: typeof raw.image === 'string' && raw.image.trim() ? raw.image.trim() : '/placeholder-dish.svg',
    description: typeof raw.description === 'string' ? raw.description : '',
    isAvailable: raw.isAvailable !== false,
    isDeal: Boolean(raw.isDeal),
    variations: Array.isArray(raw.variations) ? raw.variations : [],
    bundledProducts: Array.isArray(raw.bundledProducts) ? raw.bundledProducts : [],
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
  };
}