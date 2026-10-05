import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { CartItem, Product, SelectedVariationItem, VariationGroup } from '../types/pos';
import { Dialog } from './ui/Dialog';
import { formatPKR } from '../utils/formatCurrency';

interface VariationModalProps {
  product: Product;
  error?: string;
  maximumQuantity?: number;
  initialItem?: CartItem;
  onClose: () => void;
  onAddToCart: (
    product: Product,
    selectedVariations: SelectedVariationItem[],
    quantity: number,
    notes: string
  ) => boolean | void;
}

export const VariationModal: React.FC<VariationModalProps> = ({
  product,
  initialItem,
  error,
  maximumQuantity = Infinity,
  onClose,
  onAddToCart,
}) => {

  // Initialize selected variations with defaults for required groups
  const [selectedVariations, setSelectedVariations] = useState<SelectedVariationItem[]>(() => {
    if (initialItem) return initialItem.selectedVariations;
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
          priceDeltaPaisa: opt.priceDeltaPaisa,
          costDeltaPaisa: opt.costDeltaPaisa,
        });
      }
    });
    return initial;
  });

  const [quantity, setQuantity] = useState(initialItem?.quantity || 1);
  const [notes, setNotes] = useState(initialItem?.notes || '');

  const [missingGroup, setMissingGroup] = useState<string | null>(null);

  // Calculate live item pricePaisa
  const variationPriceSum = selectedVariations.reduce((sum, v) => sum + v.priceDeltaPaisa, 0);
  const unitPricePaisa = product.pricePaisa + variationPriceSum;
  const totalPricePaisa = unitPricePaisa * quantity;

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
            priceDeltaPaisa: option.priceDeltaPaisa,
            costDeltaPaisa: option.costDeltaPaisa,
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
          priceDeltaPaisa: option.priceDeltaPaisa,
          costDeltaPaisa: option.costDeltaPaisa,
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
          setMissingGroup(group.id);
          document.getElementById(`option-group-${group.id}`)?.focus();
          return;
        }
      }
    }

    if (onAddToCart(product, selectedVariations, quantity, notes) !== false) onClose();
  };

  return (
    <Dialog label={initialItem ? `Edit ${product.name}` : `Customize ${product.name}`} onClose={onClose} className="bg-pos-surface rounded-lg max-w-md w-full overflow-hidden border border-pos-border flex flex-col max-h-[90vh]">
        {error && <p role="alert" className="p-4 text-sm text-pos-danger-text">{error}</p>}
        {/* Header */}
        <div className="p-5 border-b border-pos-divider flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={product.image}
              alt={product.name}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-md object-cover border border-pos-border"
            />
            <div>
              <span className="text-[11px] font-semibold text-pos-accent uppercase tracking-wider">
                {product.categoryName}
              </span>
              <h3 className="text-base font-bold text-pos-text leading-tight">
                {product.name}
              </h3>
              <p className="text-xs text-pos-muted">
                Base price: {formatPKR(product.pricePaisa)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close item options"
            className="w-8 h-8 rounded-md bg-pos-raised text-pos-muted hover:text-pos-secondary hover:bg-pos-raised flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Variations List (Scrollable) */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {product.variations.length === 0 ? (
            <p className="text-sm text-pos-muted py-2">
              No extra variations for this dish. You can add notes or adjust quantity below.
            </p>
          ) : (
            product.variations.map(group => (
              <div key={group.id} id={`option-group-${group.id}`} tabIndex={-1} className="space-y-2">
                {missingGroup === group.id && <p role="alert" className="text-sm text-pos-danger-text">Choose an option for {group.name}.</p>}
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-pos-text uppercase tracking-wider">
                    {group.name}
                  </h4>
                  <span className="text-[11px] font-medium text-pos-muted">
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
                        aria-pressed={isSelected}
                        onClick={() => { handleSelectOption(group, opt.id); setMissingGroup(null); }}
                        className={`w-full flex items-center justify-between p-3 rounded-md border text-xs transition ${
                          isSelected
                            ? 'border-pos-accent bg-pos-selected text-pos-text font-semibold'
                            : 'border-pos-border hover:border-pos-control text-pos-secondary bg-pos-surface'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-4 h-4 rounded-${group.multiSelect ? 'md' : 'full'} flex items-center justify-center border ${
                              isSelected
                                ? 'bg-pos-action border-pos-accent text-white'
                                : 'border-pos-control'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <span>{opt.name}</span>
                        </div>
                        <span className={`font-mono ${isSelected ? 'text-pos-accent' : 'text-pos-muted'}`}>
                          {opt.priceDeltaPaisa > 0
                            ? `+${formatPKR(opt.priceDeltaPaisa)}`
                            : opt.priceDeltaPaisa < 0
                            ? `-${formatPKR(Math.abs(opt.priceDeltaPaisa))}`
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
            <label htmlFor="item-notes" className="text-xs font-bold text-pos-text uppercase tracking-wider block">
              Special Instructions
            </label>
            <input
              id="item-notes"
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Less salt, dressing on the side..."
              className="w-full px-3.5 py-2.5 bg-pos-inset border border-pos-control rounded-md text-xs text-pos-secondary placeholder:text-pos-muted focus-visible:border-pos-accent"
            />
          </div>
        </div>

        {/* Footer: Quantity & Add Button */}
        <div className="p-5 border-t border-pos-divider bg-pos-inset/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 bg-pos-surface border border-pos-control rounded-md p-1">
            <button
              aria-label="Decrease item quantity"
              disabled={quantity <= 1}
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-pos-secondary hover:bg-pos-raised font-bold transition"
            >
              -
            </button>
            <span className="w-6 text-center font-bold text-pos-text text-sm font-mono">
              {quantity}
            </span>
            <button
              disabled={quantity >= maximumQuantity}
              aria-label="Increase item quantity"
              onClick={() => setQuantity(quantity + 1)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-pos-accent hover:bg-pos-selected font-bold transition"
            >
              +
            </button>
          </div>

          <button
            onClick={handleAdd}
            className="flex-1 py-3 px-4 bg-pos-action hover:bg-pos-action-hover text-white rounded-md text-sm font-bold flex items-center justify-between transition"
          >
            <span>{initialItem ? 'Update item' : 'Add to Order'}</span>
            <span className="font-mono">{formatPKR(totalPricePaisa)}</span>
          </button>
        </div>
    </Dialog>
  );
};
