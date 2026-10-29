import type { Category, Product } from '../types/pos';
import { integer } from '../shared/money';

export const DEFAULT_UNCATEGORIZED_CATEGORY: Category = {
  id: 'cat-uncategorized',
  name: 'Uncategorized',
  icon: '📦',
  itemCount: 0,
  order: 999,
};

/** Curated 1:1 square food images used when a dish does not have a custom image uploaded yet. */
const DEFAULT_SQUARE_DISH_IMAGES = {
  pizzaClassic: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=400&fit=crop&q=80',
  pizzaPremium: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=400&fit=crop&q=80',
  pizzaPepperoni: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400&h=400&fit=crop&q=80',
  sandwich: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=400&fit=crop&q=80',
  panini: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=400&h=400&fit=crop&q=80',
  wrap: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400&h=400&fit=crop&q=80',
  cookie: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=400&h=400&fit=crop&q=80',
  brownie: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400&h=400&fit=crop&q=80',
  bananaBread: 'https://images.unsplash.com/photo-1586444248902-2f64eddc13df?w=400&h=400&fit=crop&q=80',
  chickenBread: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=400&fit=crop&q=80',
  drink: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400&h=400&fit=crop&q=80',
  fries: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=400&h=400&fit=crop&q=80',
  deal: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop&q=80',
};

export function getDefaultProductImage(raw: Partial<Product>): string {
  const key = `${raw.id || ''} ${raw.name || ''} ${raw.categoryId || ''} ${raw.categoryName || ''}`.toLowerCase();

  if (key.includes('cookie') || key.includes('macadamia')) return DEFAULT_SQUARE_DISH_IMAGES.cookie;
  if (key.includes('brownie')) return DEFAULT_SQUARE_DISH_IMAGES.brownie;
  if (key.includes('chicken bread') || key.includes('chicken-bread')) return DEFAULT_SQUARE_DISH_IMAGES.chickenBread;
  if (key.includes('banana') || key.includes('bakery') || key.includes('bread')) return DEFAULT_SQUARE_DISH_IMAGES.bananaBread;
  if (key.includes('wrap') || key.includes('shawarma') || key.includes('roll')) return DEFAULT_SQUARE_DISH_IMAGES.wrap;
  if (key.includes('panini') || key.includes('roast beef')) return DEFAULT_SQUARE_DISH_IMAGES.panini;
  if (key.includes('sandwich') || key.includes('club') || key.includes('fit fuel')) return DEFAULT_SQUARE_DISH_IMAGES.sandwich;
  if (key.includes('drink') || key.includes('bottle') || key.includes('margarita') || key.includes('shake') || key.includes('beverage')) {
    if (!raw.isDeal && !key.includes('deal')) return DEFAULT_SQUARE_DISH_IMAGES.drink;
  }
  if (key.includes('fries')) return DEFAULT_SQUARE_DISH_IMAGES.fries;
  if (key.includes('pepperoni')) return DEFAULT_SQUARE_DISH_IMAGES.pizzaPepperoni;
  if (key.includes('premium') || key.includes('kabab') || key.includes('signature') || key.includes('mega melt')) {
    return DEFAULT_SQUARE_DISH_IMAGES.pizzaPremium;
  }
  if (key.includes('pizza') || key.includes('tikka') || key.includes('fajita') || key.includes('malai') || key.includes('bbq')) {
    return DEFAULT_SQUARE_DISH_IMAGES.pizzaClassic;
  }
  if (raw.isDeal || key.includes('deal') || key.includes('combo')) return DEFAULT_SQUARE_DISH_IMAGES.deal;

  return DEFAULT_SQUARE_DISH_IMAGES.pizzaClassic;
}

export function normalizeProduct(raw: Partial<Product>): Product {
  const now = new Date().toISOString();
  const priceValue = Number(raw.pricePaisa);
  const costValue = Number(raw.costPricePaisa);
  const stockValue = Number(raw.stockQuantity);
  const thresholdValue = Number(raw.minStockThreshold);
  const trimmedImage = typeof raw.image === 'string' ? raw.image.trim() : '';
  const resolvedImage =
    trimmedImage && !trimmedImage.endsWith('/placeholder-dish.svg')
      ? trimmedImage
      : getDefaultProductImage(raw);

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
    image: resolvedImage,
    description: typeof raw.description === 'string' ? raw.description : '',
    isAvailable: raw.isAvailable !== false,
    isDeal: Boolean(raw.isDeal),
    variations: Array.isArray(raw.variations) ? raw.variations.map(group => ({
      ...group,
      options: Array.isArray(group.options) ? group.options.map(opt => ({
        ...opt,
        priceDeltaPaisa: opt.priceDeltaPaisa === undefined ? 0 : integer(Number(opt.priceDeltaPaisa), 'Option price', true),
        costDeltaPaisa: opt.costDeltaPaisa === undefined ? 0 : integer(Number(opt.costDeltaPaisa), 'Option cost', true),
      })) : [],
    })) : [],
    bundledProducts: Array.isArray(raw.bundledProducts) ? raw.bundledProducts : [],
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
  };
}
