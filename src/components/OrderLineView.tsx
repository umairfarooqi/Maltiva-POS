import React, { useState, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  Flame,
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
        return { icon: '🍲', bg: 'bg-[#F3F4F6] text-slate-600' };
      case 'cat-deals':
        return { icon: '🔥', bg: 'bg-rose-50 text-rose-500' };
      case 'cat-pizza':
        return { icon: '🍕', bg: 'bg-orange-50 text-orange-600' };
      case 'cat-sandwiches':
        return { icon: '🥪', bg: 'bg-purple-50 text-purple-600' };
      case 'cat-fries':
        return { icon: '🍟', bg: 'bg-yellow-50 text-yellow-600' };
      case 'cat-drinks':
        return { icon: '🥤', bg: 'bg-teal-50 text-teal-600' };
      default:
        return { icon: '🍽️', bg: 'bg-slate-50 text-slate-600' };
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-10 space-y-8 select-none bg-[#F8FAFA] font-sans">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Food Menu
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => scrollCategories('left')}
              className="w-9 h-9 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition cursor-pointer shadow-sm"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => scrollCategories('right')}
              className="w-9 h-9 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition cursor-pointer shadow-sm"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          ref={categoryScrollRef}
          className="flex items-center gap-4 overflow-x-auto pb-4 scrollbar-none"
        >
          {categories.map(cat => {
            const isSelected = activeCategoryId === cat.id;
            const actualCount =
              cat.id === 'cat-all'
                ? products.length
                : cat.id === 'cat-deals'
                ? products.filter(p => p.isDeal === true || p.categoryId === 'cat-deals').length
                : products.filter(p => p.categoryId === cat.id).length;

            const { icon, bg } = getCategoryMeta(cat.id);

            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className={`min-w-[160px] p-4 rounded-2xl transition-all duration-200 flex items-center gap-3 shrink-0 cursor-pointer text-left border-2 ${
                  isSelected
                    ? 'border-[#00A389] bg-white shadow-md shadow-[#00A389]/10'
                    : 'border-transparent bg-white/60 hover:bg-white hover:shadow-sm'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 transition-transform ${isSelected ? 'scale-110' : ''} ${bg}`}>
                  {cat.id === 'cat-deals' ? (
                    <Flame className="w-6 h-6 fill-rose-500 text-rose-500" />
                  ) : (
                    icon
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className={`text-sm font-bold truncate transition-colors ${isSelected ? 'text-[#00A389]' : 'text-slate-700'}`}>
                    {cat.name}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">{actualCount} items</p>
                </div>
              </button>
            );
          })}
        </div>
        <div className="border-b border-slate-200 my-6" />
      </div>

      {filteredProducts.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200">
          <p className="text-sm font-semibold text-slate-600">No dishes available</p>
          <p className="text-xs text-slate-400 mt-1">Try another category above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
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
                className={`group bg-white rounded-3xl p-5 border transition-all duration-300 flex flex-col cursor-pointer relative ${
                  qtyInCart > 0
                    ? 'border-2 border-[#00A389] shadow-lg shadow-[#00A389]/10'
                    : 'border-slate-100 hover:border-slate-300 hover:shadow-md'
                }`}
              >
                <div className="relative mb-5 flex items-center justify-center">
                  <div className="w-32 h-32 rounded-full overflow-hidden bg-slate-50 border-4 border-white shadow-sm">
                    <img
                      src={product.image}
                      alt={product.name}
                      onError={event => {
                        if (!event.currentTarget.src.endsWith('/placeholder-dish.svg')) {
                          event.currentTarget.src = '/placeholder-dish.svg';
                        }
                      }}
                      className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                    />
                  </div>
                  {product.isDeal ? (
                    <span className="absolute top-0 right-0 px-2 py-1 rounded-full bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider shadow-sm">
                      DEAL
                    </span>
                  ) : null}
                </div>

                <div className="flex-1 mb-4">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    {product.categoryName}
                  </span>
                  <h3 className="text-base font-bold text-slate-900 leading-tight line-clamp-1">
                    {product.name}
                  </h3>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                  <span className="text-lg font-black text-slate-900">
                    {formatPKR(product.price)}
                  </span>

                  {qtyInCart === 0 ? (
                    <div className="w-9 h-9 rounded-full bg-[#00A389] text-white flex items-center justify-center shadow-md shadow-[#00A389]/30 group-hover:scale-110 transition cursor-pointer">
                      <Plus className="w-5 h-5" />
                    </div>
                  ) : (
                    <div
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-2 bg-slate-100 rounded-full p-1 border border-slate-200"
                    >
                      <button
                        onClick={() => onQuickDecrementFromCart(product)}
                        className="w-7 h-7 rounded-full bg-white text-slate-600 hover:bg-slate-50 flex items-center justify-center transition cursor-pointer shadow-sm"
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
                        className="w-7 h-7 rounded-full bg-[#00A389] text-white flex items-center justify-center transition cursor-pointer shadow-sm"
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
        <div className="xl:hidden fixed bottom-6 left-6 right-6 z-40">
          <button
            onClick={onOpenMobileCart}
            className="w-full bg-[#00A389] hover:bg-[#008f77] text-white py-4 px-6 rounded-2xl shadow-2xl flex items-center justify-between font-bold text-sm transition active:scale-95 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-white text-[#00A389] flex items-center justify-center text-xs font-black">
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
