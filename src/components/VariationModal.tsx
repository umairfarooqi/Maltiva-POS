import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { Product, SelectedVariationItem, VariationGroup } from '../types/pos';
import { formatPKR } from '../utils/formatCurrency';

interface VariationModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (
    product: Product,
    selectedVariations: SelectedVariationItem[],
    quantity: number,
    notes: string
  ) => void;
}

export const VariationModal: React.FC<VariationModalProps> = ({
  product,
  onClose,
  onAddToCart,
}) => {
  if (!product) return null;

  // Initialize selected variations with defaults for required groups
  const [selectedVariations, setSelectedVariations] = useState<SelectedVariationItem[]>(() => {
    const initial: SelectedVariationItem[] = [];
    product.variations.forEach(group => {
      if (group.required && group.options.length > 0 && !group.multiSelect) {
        // Pick first option by default
        const opt = group.options[0];
        initial.push({
          groupId: group.id,
          groupName: group.name,
          optionId: opt.id,
          optionName: opt.name,
          priceDelta: opt.priceDelta,
          costDelta: opt.costDelta,
        });
      }
    });
    return initial;
  });

  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  // Calculate live item price
  const variationPriceSum = selectedVariations.reduce((sum, v) => sum + v.priceDelta, 0);
  const unitPrice = product.price + variationPriceSum;
  const totalPrice = unitPrice * quantity;

  const handleSelectOption = (group: VariationGroup, optionId: string) => {
    const option = group.options.find(o => o.id === optionId);
    if (!option) return;

    if (group.multiSelect) {
      const alreadySelected = selectedVariations.some(
        v => v.groupId === group.id && v.optionId === optionId
      );
      if (alreadySelected) {
        setSelectedVariations(prev =>
          prev.filter(v => !(v.groupId === group.id && v.optionId === optionId))
        );
      } else {
        setSelectedVariations(prev => [
          ...prev,
          {
            groupId: group.id,
            groupName: group.name,
            optionId: option.id,
            optionName: option.name,
            priceDelta: option.priceDelta,
            costDelta: option.costDelta,
          },
        ]);
      }
    } else {
      // Single select: replace choice in this group
      setSelectedVariations(prev => [
        ...prev.filter(v => v.groupId !== group.id),
        {
          groupId: group.id,
          groupName: group.name,
          optionId: option.id,
          optionName: option.name,
          priceDelta: option.priceDelta,
          costDelta: option.costDelta,
        },
      ]);
    }
  };

  const handleAdd = () => {
    // Check required groups
    for (const group of product.variations) {
      if (group.required) {
        const hasChoice = selectedVariations.some(v => v.groupId === group.id);
        if (!hasChoice) {
          alert(`Please select an option for "${group.name}".`);
          return;
        }
      }
    }

    onAddToCart(product, selectedVariations, quantity, notes);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={product.image}
              alt={product.name}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-2xl object-cover border border-slate-100"
            />
            <div>
              <span className="text-[11px] font-semibold text-[#00A389] uppercase tracking-wider">
                {product.categoryName}
              </span>
              <h3 className="text-base font-bold text-slate-800 leading-tight">
                {product.name}
              </h3>
              <p className="text-xs text-slate-400">
                Base price: {formatPKR(product.price)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 hover:bg-slate-200 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Variations List (Scrollable) */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {product.variations.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">
              No extra variations for this dish. You can add notes or adjust quantity below.
            </p>
          ) : (
            product.variations.map(group => (
              <div key={group.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    {group.name}
                  </h4>
                  <span className="text-[11px] font-medium text-slate-400">
                    {group.required ? 'Required' : 'Optional'}
                    {group.multiSelect && ' • Choose multiple'}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {group.options.map(opt => {
                    const isSelected = selectedVariations.some(
                      v => v.groupId === group.id && v.optionId === opt.id
                    );
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectOption(group, opt.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs transition ${
                          isSelected
                            ? 'border-[#00A389] bg-[#E6F7F5] text-slate-900 font-semibold'
                            : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-4 h-4 rounded-${group.multiSelect ? 'md' : 'full'} flex items-center justify-center border ${
                              isSelected
                                ? 'bg-[#00A389] border-[#00A389] text-white'
                                : 'border-slate-300'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <span>{opt.name}</span>
                        </div>
                        <span className={`font-mono ${isSelected ? 'text-[#00A389]' : 'text-slate-500'}`}>
                          {opt.priceDelta > 0
                            ? `+${formatPKR(opt.priceDelta)}`
                            : opt.priceDelta < 0
                            ? `-${formatPKR(Math.abs(opt.priceDelta))}`
                            : 'Rs. 0'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          {/* Kitchen Notes */}
          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
              Special Instructions
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Less salt, dressing on the side..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#00A389]"
            />
          </div>
        </div>

        {/* Footer: Quantity & Add Button */}
        <div className="p-5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold transition"
            >
              -
            </button>
            <span className="w-6 text-center font-bold text-slate-800 text-sm font-mono">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#00A389] hover:bg-[#E6F7F5] font-bold transition"
            >
              +
            </button>
          </div>

          <button
            onClick={handleAdd}
            className="flex-1 py-3 px-4 bg-[#00A389] hover:bg-[#008f77] text-white rounded-xl text-sm font-bold shadow-md shadow-[#00A389]/25 flex items-center justify-between transition"
          >
            <span>Add to Order</span>
            <span className="font-mono">{formatPKR(totalPrice)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
