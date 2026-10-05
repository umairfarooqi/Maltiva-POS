import React, { useState, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CookingPot,
  CupSoda,
  Plus,
  Minus,
  Flame,
  Pizza,
  Sandwich,
  UtensilsCrossed,
} from 'lucide-react';
import { Product, Category, CartItem } from '../types/pos';
import { formatPKR } from '../utils/formatCurrency';
import { normalizeProduct } from '../utils/normalizeProduct';
import { ProductStockBadge } from './ProductStockBadge';

interface OrderLineViewProps {
  isLocked?: boolean;
  products: Product[];
  categories: Category[];
  cart: CartItem[];
  onQuickAddToCart: (product: Product) => void;
  onQuickDecrementFromCart: (product: Product) => void;
  onOpenVariationModal: (product: Product) => void;
  onOpenMobileCart?: () => void;
}

const cleanCategoryLabel = (name: string) =>
  name.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '').replace(/\s{2,}/g, ' ').trim();

export const OrderLineView: React.FC<OrderLineViewProps> = ({
  products,
  isLocked = false,
  categories,
  cart,
  onQuickAddToCart,
  onQuickDecrementFromCart,
  onOpenVariationModal,
  onOpenMobileCart,
}) => {
  const [activeCategoryId, setActiveCategoryId] = useState<string>('cat-all');
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  const totalCartQty = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartPrice = cart.reduce((sum, item) => sum + item.totalPricePaisa, 0);

  const filteredProducts = products.filter(product => {
    if (activeCategoryId === 'cat-all') return true;
    if (activeCategoryId === 'cat-deals') {
      return product.isDeal === true || product.categoryId === 'cat-deals';
    }
    return product.categoryId === activeCategoryId;
  });

  const getProductCartQty = (productId: string) => {
    return cart
      .filter(item => item.product.id === productId)
      .reduce((sum, item) => sum + item.quantity, 0);
  };

  const scrollCategories = (direction: 'left' | 'right') => {
    if (categoryScrollRef.current) {
      categoryScrollRef.current.scrollBy({
        left: direction === 'left' ? -220 : 220,
        behavior: 'smooth',
      });
    }
  };

  const getCategoryMeta = (catId: string) => {
    switch (catId) {
      case 'cat-all':
        return { icon: CookingPot, bg: 'bg-pos-raised text-pos-secondary' };
      case 'cat-deals':
        return { icon: Flame, bg: 'bg-pos-danger-bg text-pos-danger-text' };
      case 'cat-pizza':
        return { icon: Pizza, bg: 'bg-pos-raised text-pos-secondary' };
      case 'cat-sandwiches':
        return { icon: Sandwich, bg: 'bg-pos-raised text-pos-secondary' };
      case 'cat-fries':
        return { icon: UtensilsCrossed, bg: 'bg-pos-raised text-pos-secondary' };
      case 'cat-drinks':
        return { icon: CupSoda, bg: 'bg-pos-raised text-pos-secondary' };
      default:
        return { icon: UtensilsCrossed, bg: 'bg-pos-raised text-pos-secondary' };
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 xl:pb-6 space-y-6 select-none bg-pos-canvas font-sans">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-pos-text tracking-tight">
            Food Menu
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => scrollCategories('left')}
              aria-label="Previous menu categories"
              className="w-9 h-9 rounded-md border border-pos-control bg-pos-surface flex items-center justify-center text-pos-muted hover:text-pos-text hover:bg-pos-inset transition cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => scrollCategories('right')}
              aria-label="Next menu categories"
              className="w-9 h-9 rounded-md border border-pos-control bg-pos-surface flex items-center justify-center text-pos-muted hover:text-pos-text hover:bg-pos-inset transition cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          ref={categoryScrollRef}
          className="flex items-center gap-3 overflow-x-auto pb-3 scrollbar-none"
        >
          {categories.map(cat => {
            const isSelected = activeCategoryId === cat.id;
            const actualCount =
              cat.id === 'cat-all'
                ? products.length
                : cat.id === 'cat-deals'
                ? products.filter(p => p.isDeal === true || p.categoryId === 'cat-deals').length
                : products.filter(p => p.categoryId === cat.id).length;

            const { icon: Icon, bg } = getCategoryMeta(cat.id);

            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                aria-pressed={isSelected}
                className={`min-w-[148px] p-3 rounded-lg transition-colors duration-200 flex items-center gap-3 shrink-0 cursor-pointer text-left border ${
                  isSelected
                    ? 'border-pos-accent bg-pos-surface'
                    : 'border-pos-border bg-pos-surface hover:border-pos-control'
                }`}
              >
                <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${bg}`}>
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 className={`text-sm font-bold truncate transition-colors ${isSelected ? 'text-pos-accent' : 'text-pos-secondary'}`}>
                    {cleanCategoryLabel(cat.name)}
                  </h3>
                  <p className="text-xs text-pos-muted font-medium">{actualCount} items</p>
                </div>
              </button>
            );
          })}
        </div>
        <div className="border-b border-pos-border my-4" />
      </div>

      {filteredProducts.length === 0 ? (
        <div className="py-16 text-center bg-pos-surface rounded-lg border border-dashed border-pos-control">
          <p className="text-sm font-semibold text-pos-secondary">No dishes available</p>
          <p className="text-xs text-pos-muted mt-1">Try another category above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
          {filteredProducts.map(rawProduct => {
            const product = normalizeProduct(rawProduct);
            const qtyInCart = getProductCartQty(product.id);
            const cannotAdd = isLocked || !product.isAvailable || qtyInCart >= product.stockQuantity;
            const addItem = () => { if (!cannotAdd) { if (product.variations?.length) onOpenVariationModal(product); else onQuickAddToCart(product); } };
            const plainQty = cart.filter(item => item.product.id === product.id && item.selectedVariations.length === 0 && !item.notes?.trim()).reduce((sum, item) => sum + item.quantity, 0);
            const hasVariations = product.variations && product.variations.length > 0;

            return (
              <div
                key={product.id}
                className={`group h-full bg-pos-surface rounded-lg p-3 border transition-colors duration-200 flex flex-col cursor-pointer relative ${
                  qtyInCart > 0
                    ? 'border-pos-accent'
                    : 'border-pos-border hover:border-pos-control'
                }`}
              >
                <button type="button" disabled={cannotAdd} aria-label={`Add ${product.name}`} onClick={addItem} className="relative mb-2 text-left disabled:opacity-60">
                  <div className="aspect-[4/3] overflow-hidden rounded-md bg-pos-raised border border-pos-border">
                    <img
                      src={product.image}
                      alt={product.name}
                      onError={event => {
                        if (!event.currentTarget.src.endsWith('/placeholder-dish.svg')) {
                          event.currentTarget.src = '/placeholder-dish.svg';
                        }
                      }}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-200"
                    />
                  </div>
                  {product.isDeal ? (
                    <span className="absolute top-2 left-2 z-10 rounded border border-pos-warning-border bg-pos-warning-bg px-2 py-0.5 text-[10px] font-black uppercase text-pos-warning-text">
                      DEAL
                    </span>
                  ) : null}
                </button>

                <div className="mb-2">
                  {!product.isDeal && (
                  <span className="mb-1 inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded bg-pos-selected px-2 py-0.5 text-[10px] font-bold uppercase text-pos-accent ring-1 ring-pos-success-border">
                      {cleanCategoryLabel(product.categoryName)}
                    </span>
                  )}
                  <h3 className="line-clamp-2 text-sm font-bold leading-5 text-pos-text">
                    <button type="button" disabled={cannotAdd} onClick={addItem} className="text-left disabled:opacity-60">{product.name}</button>
                  </h3>
                  <div className="mt-1"><ProductStockBadge product={product} /></div>
                  {product.isAvailable && product.stockQuantity > 0 && qtyInCart >= product.stockQuantity && <p className="text-xs text-pos-warning-text mt-1">All available stock is in this order.</p>}
                </div>

                <div className="mt-auto flex items-center justify-between pt-2 border-t border-pos-divider">
                  <span className="text-lg font-black text-pos-text">
                    {formatPKR(product.pricePaisa)}
                  </span>

                  {qtyInCart === 0 ? (
                  <button type="button" disabled={cannotAdd} aria-label={`Add one ${product.name}`} onClick={addItem} className="w-9 h-9 rounded-md bg-pos-action text-white flex items-center justify-center transition cursor-pointer disabled:opacity-40">
                      <Plus className="w-5 h-5" />
                    </button>
                  ) : (
                    <div
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-2 bg-pos-raised rounded-md p-1 border border-pos-border"
                    >
                      <button
                        disabled={isLocked || plainQty === 0}
                        title={plainQty === 0 ? "Use the cart to edit customized items" : undefined}
                        onClick={() => onQuickDecrementFromCart(product)}
                        aria-label={`Remove one ${product.name}`}
                        className="w-7 h-7 rounded bg-pos-surface text-pos-secondary hover:bg-pos-inset flex items-center justify-center transition cursor-pointer"
                      >
                        <Minus className="w-3 h-3 stroke-[3]" />
                      </button>
                      <span className="text-xs font-bold text-pos-text min-w-[16px] text-center">
                        {qtyInCart}
                      </span>
                      <button
                        disabled={cannotAdd}
                        onClick={addItem}
                        aria-label={`Add one ${product.name}`}
                        className="w-7 h-7 rounded bg-pos-action text-white flex items-center justify-center transition cursor-pointer"
                      >
                        <Plus className="w-3 h-3 stroke-[3]" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalCartQty > 0 && onOpenMobileCart && (
        <div className="xl:hidden fixed bottom-4 right-4 z-40">
          <button
            onClick={onOpenMobileCart}
            aria-label={`Proceed to checkout, ${totalCartQty} items, ${formatPKR(totalCartPrice)}`}
            className="inline-flex max-w-[calc(100vw-2rem)] items-center gap-3 bg-pos-action hover:bg-pos-action-hover text-white py-2.5 px-3 rounded-lg border border-pos-accent font-bold text-sm shadow-none transition active:scale-[0.98] cursor-pointer"
          >
            <span className="w-7 h-7 shrink-0 rounded bg-pos-surface text-pos-accent flex items-center justify-center text-xs font-black">
              {totalCartQty}
            </span>
            <span className="whitespace-nowrap">Checkout</span>
            <span className="text-base font-black whitespace-nowrap">{formatPKR(totalCartPrice)}</span>
          </button>
        </div>
      )}
    </div>
  );
};
