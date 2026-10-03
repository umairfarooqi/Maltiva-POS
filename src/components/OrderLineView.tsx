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

interface OrderLineViewProps {
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
  const totalCartPrice = cart.reduce((sum, item) => sum + item.totalPrice, 0);

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
        return { icon: CookingPot, bg: 'bg-slate-100 text-slate-700' };
      case 'cat-deals':
        return { icon: Flame, bg: 'bg-rose-50 text-rose-600' };
      case 'cat-pizza':
        return { icon: Pizza, bg: 'bg-slate-100 text-slate-700' };
      case 'cat-sandwiches':
        return { icon: Sandwich, bg: 'bg-slate-100 text-slate-700' };
      case 'cat-fries':
        return { icon: UtensilsCrossed, bg: 'bg-slate-100 text-slate-700' };
      case 'cat-drinks':
        return { icon: CupSoda, bg: 'bg-slate-100 text-slate-700' };
      default:
        return { icon: UtensilsCrossed, bg: 'bg-slate-100 text-slate-700' };
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 xl:pb-6 space-y-6 select-none bg-[#F4F6F5] font-sans">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Food Menu
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => scrollCategories('left')}
              aria-label="Previous menu categories"
              className="w-9 h-9 rounded-md border border-slate-300 bg-white flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => scrollCategories('right')}
              aria-label="Next menu categories"
              className="w-9 h-9 rounded-md border border-slate-300 bg-white flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition cursor-pointer"
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
                    ? 'border-[#008f77] bg-white'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${bg}`}>
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 className={`text-sm font-bold truncate transition-colors ${isSelected ? 'text-[#00A389]' : 'text-slate-700'}`}>
                    {cleanCategoryLabel(cat.name)}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">{actualCount} items</p>
                </div>
              </button>
            );
          })}
        </div>
        <div className="border-b border-slate-200 my-4" />
      </div>

      {filteredProducts.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-lg border border-dashed border-slate-300">
          <p className="text-sm font-semibold text-slate-600">No dishes available</p>
          <p className="text-xs text-slate-500 mt-1">Try another category above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
          {filteredProducts.map(rawProduct => {
            const product = normalizeProduct(rawProduct);
            const qtyInCart = getProductCartQty(product.id);
            const hasVariations = product.variations && product.variations.length > 0;

            return (
              <div
                key={product.id}
                onClick={() => {
                  if (hasVariations) {
                    onOpenVariationModal(product);
                  } else {
                    onQuickAddToCart(product);
                  }
                }}
                className={`group h-full bg-white rounded-lg p-4 border transition-colors duration-200 flex flex-col cursor-pointer relative ${
                  qtyInCart > 0
                    ? 'border-[#008f77]'
                    : 'border-slate-200 hover:border-slate-400'
                }`}
              >
                <div className="relative mb-3">
                  <div className="aspect-[4/3] overflow-hidden rounded-md bg-slate-100 border border-slate-200">
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
                    <span className="absolute top-2 left-2 z-10 rounded border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800">
                      DEAL
                    </span>
                  ) : null}
                </div>

                <div className="mb-4 flex-1">
                  {!product.isDeal && (
                  <span className="mb-2 inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase text-teal-800 ring-1 ring-teal-100">
                      {cleanCategoryLabel(product.categoryName)}
                    </span>
                  )}
                  <h3 className="min-h-11 line-clamp-2 text-base font-bold leading-5 text-slate-900">
                    {product.name}
                  </h3>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                  <span className="text-lg font-black text-slate-900">
                    {formatPKR(product.price)}
                  </span>

                  {qtyInCart === 0 ? (
                  <div className="w-9 h-9 rounded-md bg-[#008f77] text-white flex items-center justify-center transition cursor-pointer">
                      <Plus className="w-5 h-5" />
                    </div>
                  ) : (
                    <div
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-2 bg-slate-100 rounded-md p-1 border border-slate-200"
                    >
                      <button
                        onClick={() => onQuickDecrementFromCart(product)}
                        aria-label={`Remove one ${product.name}`}
                        className="w-7 h-7 rounded bg-white text-slate-600 hover:bg-slate-50 flex items-center justify-center transition cursor-pointer"
                      >
                        <Minus className="w-3 h-3 stroke-[3]" />
                      </button>
                      <span className="text-xs font-bold text-slate-900 min-w-[16px] text-center">
                        {qtyInCart}
                      </span>
                      <button
                        onClick={() => {
                          if (hasVariations) {
                            onOpenVariationModal(product);
                          } else {
                            onQuickAddToCart(product);
                          }
                        }}
                        aria-label={`Add one ${product.name}`}
                        className="w-7 h-7 rounded bg-[#008f77] text-white flex items-center justify-center transition cursor-pointer"
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
        <div className="xl:hidden fixed bottom-4 left-4 right-4 z-40">
          <button
            onClick={onOpenMobileCart}
            className="w-full bg-[#008f77] hover:bg-[#007462] text-white py-3 px-4 rounded-lg border border-[#007462] flex items-center justify-between font-bold text-sm transition active:scale-[0.98] cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded bg-white text-[#008f77] flex items-center justify-center text-xs font-black">
                {totalCartQty}
              </span>
              <span className="tracking-tight">Proceed to Checkout</span>
            </div>
            <span className="text-lg font-black">{formatPKR(totalCartPrice)}</span>
          </button>
        </div>
      )}
    </div>
  );
};
