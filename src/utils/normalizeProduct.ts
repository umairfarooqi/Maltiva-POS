import type { Category, Product } from '../types/pos';
import { integer } from '../shared/money';

export const DEFAULT_UNCATEGORIZED_CATEGORY: Category = {
  id: 'cat-uncategorized',
  name: 'Uncategorized',
  icon: '📦',
  itemCount: 0,
  order: 999,
};

export function normalizeProduct(raw: Partial<Product>): Product {
  const now = new Date().toISOString();
  const priceValue = Number(raw.pricePaisa);
  const costValue = Number(raw.costPricePaisa);
  const stockValue = Number(raw.stockQuantity);
  const thresholdValue = Number(raw.minStockThreshold);

  return {
    moneySchemaVersion: 2,
    id: raw.id || `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled Dish',
    categoryId: raw.categoryId || DEFAULT_UNCATEGORIZED_CATEGORY.id,
    categoryName: raw.categoryName || DEFAULT_UNCATEGORIZED_CATEGORY.name,
    pricePaisa: raw.pricePaisa === undefined ? 0 : integer(priceValue),
    costPricePaisa: raw.costPricePaisa === undefined ? 0 : integer(costValue),
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
