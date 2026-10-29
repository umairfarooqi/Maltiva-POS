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
  Search,
  X,
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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  const totalCartQty = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartPrice = cart.reduce((sum, item) => sum + item.totalPricePaisa, 0);

  const filteredProducts = products.filter(product => {
    const matchesCategory =
      activeCategoryId === 'cat-all'
        ? true
        : activeCategoryId === 'cat-deals'
          ? product.isDeal === true || product.categoryId === 'cat-deals'
          : product.categoryId === activeCategoryId;

    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      product.name.toLowerCase().includes(q) ||
      (product.categoryName && product.categoryName.toLowerCase().includes(q));

    return matchesCategory && matchesSearch;
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

  const getCategoryMeta = (catId: string, catName = '') => {
    const lower = `${catId} ${catName}`.toLowerCase();
    if (catId === 'cat-all') return { icon: CookingPot, bg: 'bg-pos-raised text-pos-secondary' };
    if (catId === 'cat-deals' || lower.includes('deal') || lower.includes('combo')) {
      return { icon: Flame, bg: 'bg-pos-warning-bg text-pos-warning-text' };
    }
    if (lower.includes('pizza')) return { icon: Pizza, bg: 'bg-pos-raised text-pos-secondary' };
    if (lower.includes('sandwich') || lower.includes('burger') || lower.includes('wrap') || lower.includes('shawarma') || lower.includes('bread') || lower.includes('bakery')) {
      return { icon: Sandwich, bg: 'bg-pos-raised text-pos-secondary' };
    }
    if (lower.includes('drink') || lower.includes('shake') || lower.includes('beverage') || lower.includes('coffee') || lower.includes('tea')) {
      return { icon: CupSoda, bg: 'bg-pos-raised text-pos-secondary' };
    }
    return { icon: UtensilsCrossed, bg: 'bg-pos-raised text-pos-secondary' };
  };

  return (
    <div className="min-w-0 flex-1 flex flex-col overflow-hidden select-none bg-pos-canvas font-sans">
      {/* Top Sticky Header & Category Strip */}
      <div className="shrink-0 bg-pos-chrome border-b border-pos-divider px-3 pt-2 pb-2 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold text-pos-text tracking-tight">
              Food Menu
            </h1>
            <span className="text-xs font-semibold text-pos-muted bg-pos-raised px-2 py-0.5 rounded-full">
              {filteredProducts.length}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
            <div className="relative flex-1 sm:w-60 max-w-xs">
              <Search className="w-4 h-4 text-pos-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Quick search dish..."
                aria-label="Search menu items"
                className="w-full h-11 pl-9 pr-12 rounded-lg bg-pos-inset border border-pos-border text-xs text-pos-text placeholder:text-pos-muted focus-visible:border-pos-accent transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-0 top-1/2 -translate-y-1/2 min-w-11 min-h-11 flex items-center justify-center p-1 text-pos-muted hover:text-pos-text rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => scrollCategories('left')}
                aria-label="Previous menu categories"
                className="w-11 h-11 rounded-lg border border-pos-border bg-pos-surface flex items-center justify-center text-pos-muted hover:text-pos-text hover:bg-pos-raised transition cursor-pointer active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollCategories('right')}
                aria-label="Next menu categories"
                className="w-11 h-11 rounded-lg border border-pos-border bg-pos-surface flex items-center justify-center text-pos-muted hover:text-pos-text hover:bg-pos-raised transition cursor-pointer active:scale-95"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Sleek Touch Category Bar */}
        <div
          ref={categoryScrollRef}
          className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none"
        >
          {categories.map(cat => {
            const isSelected = activeCategoryId === cat.id;
            const actualCount =
              cat.id === 'cat-all'
                ? products.length
                : cat.id === 'cat-deals'
                  ? products.filter(p => p.isDeal === true || p.categoryId === 'cat-deals').length
                  : products.filter(p => p.categoryId === cat.id).length;

            const { icon: Icon } = getCategoryMeta(cat.id, cat.name);

            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                aria-pressed={isSelected}
                className={`h-11 px-3 rounded-lg transition-all duration-150 flex items-center gap-2 shrink-0 cursor-pointer text-left border active:scale-[0.98] ${isSelected
                    ? 'border-pos-accent bg-pos-selected text-pos-accent shadow-xs'
                    : 'border-pos-border bg-pos-surface text-pos-secondary hover:border-pos-control hover:text-pos-text'
                  }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-pos-accent' : 'text-pos-muted'}`} aria-hidden="true" />
                <div className="flex items-center gap-2">
                  <h3 className={`text-xs font-bold whitespace-nowrap ${isSelected ? 'text-pos-accent' : 'text-pos-text'}`}>
                    {cleanCategoryLabel(cat.name)}
                  </h3>
                  <p
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${isSelected
                        ? 'bg-pos-action text-white'
                        : 'bg-pos-raised text-pos-muted'
                      }`}
                  >
                    {actualCount} items
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Product Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24 lg:pb-3">
        {filteredProducts.length === 0 ? (
          <div className="py-16 text-center bg-pos-surface rounded-xl border border-dashed border-pos-border">
            <p className="text-sm font-semibold text-pos-secondary">No dishes available</p>
            <p className="text-xs text-pos-muted mt-1">Try another category or search term above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11.5rem),1fr))] gap-3">
            {filteredProducts.map(rawProduct => {
              const product = normalizeProduct(rawProduct);
              const qtyInCart = getProductCartQty(product.id);
              const cannotAdd = isLocked || !product.isAvailable || qtyInCart >= product.stockQuantity;
              const addItem = (event?: React.MouseEvent) => {
                event?.stopPropagation();
                if (!cannotAdd) {
                  if (product.variations?.length) onOpenVariationModal(product);
                  else onQuickAddToCart(product);
                }
              };
              const plainQty = cart
                .filter(item => item.product.id === product.id && item.selectedVariations.length === 0 && !item.notes?.trim())
                .reduce((sum, item) => sum + item.quantity, 0);
              const hasVariations = product.variations && product.variations.length > 0;

              return (
                <div
                  key={product.id}
                  onClick={addItem}
                  className={`group h-full bg-pos-surface rounded-xl p-3 border transition-all duration-150 flex flex-col justify-between relative overflow-hidden ${cannotAdd ? 'cursor-not-allowed' : 'cursor-pointer active:scale-[0.99]'
                    } ${qtyInCart > 0
                      ? 'border-pos-accent bg-pos-selected/25 ring-1 ring-pos-accent/40'
                      : 'border-pos-border hover:border-pos-control hover:bg-pos-raised/40'
                    }`}
                >
                  {/* Top Active Accent Bar when in Cart */}
                  {qtyInCart > 0 && (
                    <div className="absolute inset-x-0 top-0 h-1 bg-pos-action z-20" />
                  )}

                  <div>
                      {/* Top Row: 1:1 Image + Badges */}
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <button
                          type="button"
                          disabled={cannotAdd}
                          aria-label={`Add ${product.name}`}
                          onClick={e => {
                            e.stopPropagation();
                            addItem();
                          }}
                          className="relative w-14 h-14 aspect-square shrink-0 rounded-xl overflow-hidden bg-pos-inset border border-pos-border/70 block disabled:opacity-60"
                        >
                          <img
                            src={product.image}
                            alt={product.name}
                            onError={event => {
                              if (!event.currentTarget.src.endsWith('/placeholder-dish.svg')) {
                                event.currentTarget.src = '/placeholder-dish.svg';
                              }
                            }}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                          />
                        </button>

                        <div className="flex flex-col items-end gap-1 min-w-0">
                          {product.isDeal && (
                          <span className="rounded-md border border-pos-warning-border bg-pos-warning-bg px-1.5 py-0.5 text-[9px] font-black uppercase text-pos-warning-text leading-none">
                            DEAL
                          </span>
                        )}
                        {hasVariations && (
                          <span className="shrink-0 rounded-md bg-pos-raised border border-pos-border px-1.5 py-0.5 text-[9px] font-semibold text-pos-secondary leading-none">
                            Options
                          </span>
                        )}
                        <ProductStockBadge product={product} />
                      </div>
                    </div>

                        {/* Full-Width Category & Dish Name (No Side Cramping) */}
                        <div className="mb-2.5 space-y-0.5">
                          <span className="block truncate text-[10px] font-bold uppercase tracking-wider text-pos-accent">
                            {product.isDeal ? 'Combo Deal' : cleanCategoryLabel(product.categoryName)}
                          </span>

                        <h3 className="min-h-10 text-sm font-bold leading-snug text-pos-text">
                          <button
                            type="button"
                            disabled={cannotAdd}
                            onClick={e => {
                              e.stopPropagation();
                              addItem();
                            }}
                            className="text-left w-full disabled:opacity-60 cursor-pointer"
                          >
                            <span className="line-clamp-2">{product.name}</span>
                          </button>
                        </h3>

                        {product.isAvailable && product.stockQuantity > 0 && qtyInCart >= product.stockQuantity && (
                          <p className="text-[10px] font-medium text-pos-warning-text">Max stock in order</p>
                        )}
                      </div>
                    </div>

                      {/* Bottom Bar: Price on Left + Touch Action Controls on Right */}
                      <div className="mt-auto flex items-center justify-between gap-2 pt-2.5 border-t border-pos-divider/80">
                        <span className="text-base font-black text-pos-text font-mono tracking-tight whitespace-nowrap">
                          {formatPKR(product.pricePaisa)}
                        </span>

                        {qtyInCart === 0 ? (
                          <button
                            type="button"
                            disabled={cannotAdd}
                            aria-label={`Add one ${product.name}`}
                            onClick={e => {
                              e.stopPropagation();
                              addItem();
                            }}
                            className="w-10 h-10 shrink-0 rounded-lg bg-pos-action hover:bg-pos-action-hover text-white flex items-center justify-center transition cursor-pointer disabled:opacity-40 active:scale-95"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        ) : (
                          <div
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1 bg-pos-inset rounded-lg p-0.5 border border-pos-accent/50 shrink-0"
                          >
                            <button
                              disabled={isLocked || plainQty === 0}
                              title={plainQty === 0 ? 'Use the cart to edit customized items' : undefined}
                              onClick={event => { event.stopPropagation(); onQuickDecrementFromCart(product); }}
                              aria-label={`Remove one ${product.name}`}
                              className="w-9 h-9 rounded-md bg-pos-surface text-pos-text hover:bg-pos-raised flex items-center justify-center transition cursor-pointer disabled:opacity-40 active:scale-95"
                            >
                              <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                            </button>
                            <span className="text-xs font-black font-mono text-pos-accent min-w-[18px] text-center">
                              {qtyInCart}
                            </span>
                            <button
                              disabled={cannotAdd}
                              onClick={addItem}
                              aria-label={`Add one ${product.name}`}
                              className="w-9 h-9 rounded-md bg-pos-action hover:bg-pos-action-hover text-white flex items-center justify-center transition cursor-pointer disabled:opacity-40 active:scale-95"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    );
            })}
                  </div>
        )}
                </div>

      {
                totalCartQty > 0 && onOpenMobileCart && (
                  <div className="lg:hidden fixed bottom-4 right-4 z-40">
                    <button
                      onClick={onOpenMobileCart}
                      aria-label={`Proceed to checkout, ${totalCartQty} items, ${formatPKR(totalCartPrice)}`}
                      className="inline-flex max-w-[calc(100vw-2rem)] items-center gap-3 bg-pos-action hover:bg-pos-action-hover text-white py-3 px-4 rounded-xl border border-pos-accent font-bold text-sm transition active:scale-[0.98] cursor-pointer"
                    >
                      <span className="w-7 h-7 shrink-0 rounded-lg bg-pos-surface text-pos-accent flex items-center justify-center text-xs font-black">
                        {totalCartQty}
                      </span>
                      <span className="whitespace-nowrap">Checkout</span>
                      <span className="text-base font-black whitespace-nowrap font-mono">{formatPKR(totalCartPrice)}</span>
                    </button>
                  </div>
                )
              }
    </div>
        );
};
