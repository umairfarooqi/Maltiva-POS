import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { CartItem, Product, SelectedVariationItem, VariationGroup } from '../types/pos';
import { Dialog, DialogHeader } from './ui/Dialog';
import { formatPKR } from '../utils/formatCurrency';
import { Button } from './ui/Button';
import { Input } from './ui/Field';
import { QuantityStepper } from './ui/QuantityStepper';

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
    <Dialog size="md" label={initialItem ? `Edit ${product.name}` : `Customize ${product.name}`} onClose={onClose}>
        {error && <p role="alert" className="p-4 text-sm text-pos-danger-text">{error}</p>}
        {/* Header */}
        <DialogHeader
          className="border-b border-pos-divider p-3"
          media={<img
                src={product.image}
                alt={product.name}
                referrerPolicy="no-referrer"
                onError={event => {
                  if (!event.currentTarget.src.endsWith('/placeholder-dish.svg')) {
                    event.currentTarget.src = '/placeholder-dish.svg';
                  }
                }}
                className="size-12 shrink-0 rounded-pos-control border border-pos-border object-cover"
              />}
          eyebrow={product.categoryName}
          title={product.name}
          description={`Base price: ${formatPKR(product.pricePaisa)}`}
          onClose={onClose}
          closeLabel="Close item options"
        />

        {/* Variations List (Scrollable) */}
        <div className="min-h-0 p-3 overflow-y-auto space-y-4 flex-1">
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
                  <span className="text-xs font-medium text-pos-muted">
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
                            className={`w-4 h-4 ${group.multiSelect ? 'rounded-md' : 'rounded-full'} flex items-center justify-center border ${
                              isSelected
                                ? 'bg-pos-action border-pos-accent text-pos-action-text'
                                : 'border-pos-control'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <span>{opt.name}</span>
                        </div>
                        <span className={`tabular-nums ${isSelected ? 'text-pos-accent' : 'text-pos-muted'}`}>
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
            <Input
              id="item-notes"
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Less salt, dressing on the side..."
              className="w-full"
            />
          </div>
        </div>

        {/* Footer: Quantity & Add Button */}
        <div className="shrink-0 p-3 border-t border-pos-divider bg-pos-inset/60 flex flex-wrap items-center justify-between gap-2">
          <QuantityStepper
            value={quantity}
            decrementLabel="Decrease item quantity"
            incrementLabel="Increase item quantity"
            decrementDisabled={quantity <= 1}
            incrementDisabled={quantity >= maximumQuantity}
            onDecrement={() => setQuantity(Math.max(1, quantity - 1))}
            onIncrement={() => setQuantity(quantity + 1)}
          />

          <Button variant="primary" size="checkout"
            onClick={handleAdd}
            disabled={maximumQuantity < 1 || quantity > maximumQuantity}
            className="min-w-0 flex-1 justify-between! gap-3! px-4! tabular-nums"
          >
            <span>{initialItem ? 'Update item' : 'Add to Order'}</span>
            <span className="tabular-nums">{formatPKR(totalPricePaisa)}</span>
          </Button>
        </div>
    </Dialog>
  );
};
