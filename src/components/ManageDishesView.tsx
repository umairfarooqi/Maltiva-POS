import { parseRupees, rupeeText } from '../shared/money';
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  MoreVertical,
  Edit2,
  Trash2,
  Package,
  TrendingUp,
  X,
  PlusCircle,
  AlertTriangle,
  Minus,
} from 'lucide-react';
import { Product, Category, VariationGroup, User, DealBundleItem } from '../types/pos';
import { formatPKR } from '../utils/formatCurrency';
import { normalizeProduct } from '../utils/normalizeProduct';
import { Dialog } from './ui/Dialog';
import { ProductStockBadge } from './ProductStockBadge';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Input, Select, Textarea } from './ui/Field';

interface ManageDishesViewProps {
  defaultLowStockThreshold?: number;
  products: Product[];
  categories: Category[];
  currentUser: User;
  onSaveProduct: (productData: Partial<Product>) => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void>;
  onSaveCategory: (name: string, icon: string) => Promise<void>;
  onUpdateCategory: (category: Category) => Promise<void>;
  onDeleteCategory: (categoryId: string) => Promise<void>;
  onAdjustStock: (
    productId: string,
    changeAmount: number,
    reason: string,
    type: 'restock' | 'adjustment' | 'waste'
  ) => Promise<void>;
}

interface DynamicVariationOption {
  groupId: string;
  id: string;
  name: string;
  priceDeltaPaisa: number;
  costDeltaPaisa: number;
}

const FAST_FOOD_CATEGORY_EMOJIS = [
  { emoji: '🍔', label: 'burger' },
  { emoji: '🍕', label: 'pizza' },
  { emoji: '🍟', label: 'fries' },
  { emoji: '🌭', label: 'hot dog' },
  { emoji: '🥪', label: 'sandwich' },
  { emoji: '🌮', label: 'taco' },
  { emoji: '🍗', label: 'chicken' },
  { emoji: '🥤', label: 'drink' },
  { emoji: '🍩', label: 'donut' },
  { emoji: '🍦', label: 'ice cream' },
];

export const ManageDishesView: React.FC<ManageDishesViewProps> = ({
  products,
  defaultLowStockThreshold = 5,
  categories,
  currentUser: _currentUser,
  onSaveProduct,
  onDeleteProduct,
  onSaveCategory,
  onUpdateCategory,
  onDeleteCategory,
  onAdjustStock,
}) => {
  const [moneyError, setMoneyError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const submitting = useRef(false);
  const [formGroups, setFormGroups] = useState<Omit<VariationGroup, 'options'>[]>([]);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('cat-all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [isDishModalOpen, setIsDishModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isDealModalOpen, setIsDealModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Product | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [selectedStockProduct, setSelectedStockProduct] = useState<Product | null>(null);
  const [openMenuProductId, setOpenMenuProductId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuProduct = products.find(product => product.id === openMenuProductId);
  const closeProductMenu = (restoreFocus = false) => {
    setOpenMenuProductId(null);
    if (restoreFocus) menuTriggerRef.current?.focus({ preventScroll: true });
  };
  const toggleProductMenu = (event: React.MouseEvent<HTMLButtonElement>, productId: string) => {
    event.stopPropagation();
    menuTriggerRef.current = event.currentTarget;
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPosition({
      left: Math.max(12, Math.min(rect.right - 192, window.innerWidth - 204)),
      top: rect.bottom + 160 < window.innerHeight - 12 ? rect.bottom + 4 : Math.max(12, rect.top - 160),
    });
    setOpenMenuProductId(previous => previous === productId ? null : productId);
  };
  useLayoutEffect(() => {
    if (!openMenuProductId || !menuRef.current || !menuTriggerRef.current) return;
    const anchor = menuTriggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    setMenuPosition({
      left: Math.max(12, Math.min(anchor.right - menu.width, window.innerWidth - menu.width - 12)),
      top: Math.max(12, Math.min(
        anchor.bottom + menu.height + 4 <= window.innerHeight - 12 ? anchor.bottom + 4 : anchor.top - menu.height - 4,
        window.innerHeight - menu.height - 12,
      )),
    });
    menuRef.current.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [openMenuProductId]);
  useEffect(() => { setOpenMenuProductId(null); }, [viewMode, selectedCategoryId, searchQuery]);
  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeProductMenu(true);
    } else if (event.key === 'Tab') {
      closeProductMenu(true);
    }
  };
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    id: string;
    name: string;
    type: 'dish' | 'deal' | 'category';
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  useEffect(() => { if (saveError || moneyError) document.querySelector<HTMLElement>('[role="dialog"] [role="alert"]')?.focus(); }, [saveError, moneyError]);
  useEffect(() => { setSaveError(''); setMoneyError(''); }, [isDishModalOpen, isDealModalOpen, isCategoryModalOpen, isStockModalOpen, deleteConfirmTarget?.id]);

  useEffect(() => {
    const handleOutsideClick = () => setOpenMenuProductId(null);
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeProductMenu(true); };
    window.addEventListener('click', handleOutsideClick);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleOutsideClick);
    window.addEventListener('scroll', handleOutsideClick, true);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleOutsideClick);
      window.removeEventListener('scroll', handleOutsideClick, true);
    };
  }, []);

  const activeCategory =
    categories.find(c => c.id === selectedCategoryId) || categories[0] || {
      id: 'cat-all',
      name: 'All Menu',
      icon: '🍽️',
      itemCount: products.length,
      order: 0,
    };

  const categoryProducts = products.filter(p => {
    const matchesCategory =
      selectedCategoryId === 'cat-all'
        ? true
        : selectedCategoryId === 'cat-deals'
          ? p.isDeal === true || p.categoryId === 'cat-deals'
          : p.categoryId === selectedCategoryId;

    const matchesSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.categoryName && p.categoryName.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesSearch;
  });

  const [formName, setFormName] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('cat-pizza');
  const [formPrice, setFormPrice] = useState('850');
  const [formCostPrice, setFormCostPrice] = useState('320');
  const [formStock, setFormStock] = useState('30');
  const [formMinThreshold, setFormMinThreshold] = useState('5');
  const [formImage, setFormImage] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formVariations, setFormVariations] = useState<DynamicVariationOption[]>([]);

  // Partially entered money is valid editing state; final validation remains in Save.
  const previewProfit = (() => {
    try { return parseRupees(formPrice) - parseRupees(formCostPrice); }
    catch { return null; }
  })();

  const [dealName, setDealName] = useState('');
  const [dealCategoryId, setDealCategoryId] = useState('cat-deals');
  const [dealPrice, setDealPrice] = useState('1999');
  const [dealCostPrice, setDealCostPrice] = useState('800');
  const [dealStock, setDealStock] = useState('40');
  const [dealMinThreshold, setDealMinThreshold] = useState('5');
  const [dealImage, setDealImage] = useState('');
  const [dealDescription, setDealDescription] = useState('');
  const [dealBundledItems, setDealBundledItems] = useState<DealBundleItem[]>([]);
  const [selectedProductToAdd, setSelectedProductToAdd] = useState('');
  const [customItemInput, setCustomItemInput] = useState('');

  const [catNameInput, setCatNameInput] = useState('');
  const [catIconInput, setCatIconInput] = useState('🍽️');

  const [stockChangeQty, setStockChangeQty] = useState('10');
  const [stockType, setStockType] = useState<'restock' | 'adjustment' | 'waste'>('restock');
  const [stockReason, setStockReason] = useState('Fresh inventory arrival');

  const openCreateDishModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormCategoryId(
      selectedCategoryId !== 'cat-all' && selectedCategoryId !== 'cat-deals'
        ? selectedCategoryId
        : categories[0]?.id || 'cat-pizza'
    );
    setFormPrice('850');
    setFormCostPrice('320');
    setFormStock('25');
    setFormMinThreshold(String(defaultLowStockThreshold));
    setFormImage('');
    setFormDescription('');
    setFormVariations([]);
    setFormGroups([]);
    setIsDishModalOpen(true);
  };

  const openEditDishModal = (product: Product) => {
    if (product.isDeal) {
      openEditDealModal(product);
      return;
    }
    setEditingProduct(product);
    setFormName(product.name || '');
    setFormCategoryId(product.categoryId || categories[0]?.id || 'cat-pizza');
    setFormPrice(product.pricePaisa != null && !isNaN(product.pricePaisa) ? rupeeText(product.pricePaisa) : '');
    setFormCostPrice(product.costPricePaisa != null && !isNaN(product.costPricePaisa) ? rupeeText(product.costPricePaisa) : '');
    setFormStock(product.stockQuantity != null ? product.stockQuantity.toString() : '0');
    setFormMinThreshold(product.minStockThreshold != null ? product.minStockThreshold.toString() : '5');
    setFormImage(product.image || '');
    setFormDescription(product.description || '');

    const flattened: DynamicVariationOption[] = [];
    if (product.variations) {
      product.variations.forEach(g => {
        g.options.forEach(opt => {
          flattened.push({
            groupId: g.id,
            id: opt.id,
            name: opt.name,
            priceDeltaPaisa: opt.priceDeltaPaisa || 0,
            costDeltaPaisa: opt.costDeltaPaisa || 0,
          });
        });
      });
    }
    setFormVariations(flattened);
    setFormGroups((product.variations || []).map(({ options, ...group }) => group));
    setIsDishModalOpen(true);
  };

  const openCreateDealModal = () => {
    setEditingDeal(null);
    setDealName('');
    setDealCategoryId('cat-deals');
    setDealPrice('2199');
    setDealCostPrice('850');
    setDealStock('35');
    setDealMinThreshold(String(defaultLowStockThreshold));
    setDealImage('');
    setDealDescription('');
    setDealBundledItems([]);
    setSelectedProductToAdd('');
    setCustomItemInput('');
    setIsDealModalOpen(true);
  };

  const openEditDealModal = (dealProduct: Product) => {
    setEditingDeal(dealProduct);
    setDealName(dealProduct.name || '');
    setDealCategoryId(dealProduct.categoryId || 'cat-deals');
    setDealPrice(dealProduct.pricePaisa != null && !isNaN(dealProduct.pricePaisa) ? rupeeText(dealProduct.pricePaisa) : '');
    setDealCostPrice(dealProduct.costPricePaisa != null && !isNaN(dealProduct.costPricePaisa) ? rupeeText(dealProduct.costPricePaisa) : '');
    setDealStock(dealProduct.stockQuantity != null ? dealProduct.stockQuantity.toString() : '0');
    setDealMinThreshold(dealProduct.minStockThreshold != null ? dealProduct.minStockThreshold.toString() : '5');
    setDealImage(dealProduct.image || '');
    setDealDescription(dealProduct.description || '');
    setDealBundledItems(dealProduct.bundledProducts || []);
    setSelectedProductToAdd('');
    setCustomItemInput('');
    setIsDealModalOpen(true);
  };

  const openCreateCategoryModal = () => {
    setEditingCategory(null);
    setCatNameInput('');
    setCatIconInput('🍕');
    setIsCategoryModalOpen(true);
  };

  const openEditCategoryModal = (cat: Category, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingCategory(cat);
    setCatNameInput(cat.name);
    setCatIconInput(cat.icon || '🍽️');
    setIsCategoryModalOpen(true);
  };

  const handleSaveDish = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    if (moneyError) return;
    const category = categories.find(c => c.id === formCategoryId);
    const packagedVariations: VariationGroup[] = formGroups.map(group => ({
      ...group, options: formVariations.filter(opt => opt.groupId === group.id).map(({ groupId, ...option }) => option)
    }));
    if (packagedVariations.some(group => !group.name.trim() || group.options.length === 0 || group.options.some(opt => !opt.name.trim()))) {
      setSaveError('Each variation group needs a name and at least one named option.'); return;
    }

    let parsedPrice: number, parsedCost: number;
    try { parsedPrice = parseRupees(formPrice); parsedCost = parseRupees(formCostPrice); setMoneyError(''); }
    catch (error) { setMoneyError((error as Error).message); return; }
    const parsedStock = Number(formStock);
    if (!editingProduct && (!formStock.trim() || !Number.isSafeInteger(parsedStock) || parsedStock < 0)) {
      setSaveError('Opening stock must be a nonnegative whole number.'); return;
    }
    const parsedMinThreshold = parseInt(formMinThreshold, 10);

    const finalPrice = !isNaN(parsedPrice) ? parsedPrice : (editingProduct?.pricePaisa ?? 0);
    const finalCost = !isNaN(parsedCost) ? parsedCost : (editingProduct?.costPricePaisa ?? 0);
    const finalImage =
      formImage.trim() ||
      editingProduct?.image ||
      '';

    if (submitting.current) return;
    submitting.current = true; setIsSaving(true);
    try {
      await onSaveProduct({
        id: editingProduct?.id,
        name: formName.trim() || editingProduct?.name || 'Maltiva Special Dish',
        categoryId: formCategoryId || editingProduct?.categoryId || 'cat-special',
        categoryName: category?.name || editingProduct?.categoryName || 'Special Dishes',
        pricePaisa: finalPrice,
        costPricePaisa: finalCost,
        ...(!editingProduct ? { stockQuantity: parsedStock } : {}),
        minStockThreshold: !isNaN(parsedMinThreshold) ? parsedMinThreshold : (editingProduct?.minStockThreshold ?? 5),
        image: finalImage,
        description: formDescription,
        isDeal: false,
        variations: packagedVariations,
      }); setIsDishModalOpen(false);
    }
    catch (error) { setSaveError((error as Error).message); }
    finally { submitting.current = false; setIsSaving(false); }
  };

  const handleSaveDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    if (moneyError) return;
    const category = categories.find(c => c.id === dealCategoryId) || {
      name: 'Deals & Combos',
      id: 'cat-deals',
    };

    let parsedPrice: number, parsedCost: number;
    try { parsedPrice = parseRupees(dealPrice); parsedCost = parseRupees(dealCostPrice); setMoneyError(''); }
    catch (error) { setMoneyError((error as Error).message); return; }
    const parsedStock = Number(dealStock);
    if (!editingDeal && (!dealStock.trim() || !Number.isSafeInteger(parsedStock) || parsedStock < 0)) {
      setSaveError('Opening stock must be a nonnegative whole number.'); return;
    }
    const parsedMinThreshold = parseInt(dealMinThreshold, 10);

    const finalPrice = !isNaN(parsedPrice) ? parsedPrice : (editingDeal?.pricePaisa ?? 0);
    const finalCost = !isNaN(parsedCost) ? parsedCost : (editingDeal?.costPricePaisa ?? 0);
    const finalImage =
      dealImage.trim() ||
      editingDeal?.image ||
      '';

    if (submitting.current) return;
    submitting.current = true; setIsSaving(true);
    try {
      await onSaveProduct({
        id: editingDeal?.id,
        name: dealName.trim() || editingDeal?.name || 'Maltiva Mega Combo Deal',
        categoryId: dealCategoryId || editingDeal?.categoryId || 'cat-deals',
        categoryName: category.name,
        pricePaisa: finalPrice,
        costPricePaisa: finalCost,
        ...(!editingDeal ? { stockQuantity: parsedStock } : {}),
        minStockThreshold: !isNaN(parsedMinThreshold) ? parsedMinThreshold : (editingDeal?.minStockThreshold ?? 5),
        image: finalImage,
        description: dealDescription,
        isDeal: true,
        bundledProducts: dealBundledItems,
        variations: editingDeal?.variations || [],
      }); setIsDealModalOpen(false);
    }
    catch (error) { setSaveError((error as Error).message); }
    finally { submitting.current = false; setIsSaving(false); }
  };

  const handleSaveCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = catNameInput.trim() || `Category ${categories.length}`;
    const cleanIcon = catIconInput.trim() || '🍽️';
    if (submitting.current) return;
    submitting.current = true; setIsSaving(true); setSaveError('');
    try {
      if (editingCategory) await onUpdateCategory({ ...editingCategory, name: cleanName, icon: cleanIcon });
      else await onSaveCategory(cleanName, cleanIcon);
      setIsCategoryModalOpen(false);
    } catch (error) { setSaveError((error as Error).message); }
    finally { submitting.current = false; setIsSaving(false); }
  };

  const handleDeleteCategoryClick = (catId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (catId === 'cat-all' || catId === 'cat-uncategorized') return;
    const cat = categories.find(c => c.id === catId);
    setDeleteConfirmTarget({ id: catId, name: cat?.name || 'Category', type: 'category' });
  };

  const handleExecuteDelete = async () => {
    if (!deleteConfirmTarget || submitting.current) return;
    submitting.current = true; setSaveError('');
    setIsDeleting(true);
    try {
      if (deleteConfirmTarget.type === 'category') {
        await onDeleteCategory(deleteConfirmTarget.id);
        if (selectedCategoryId === deleteConfirmTarget.id) setSelectedCategoryId('cat-all');
      } else {
        await onDeleteProduct(deleteConfirmTarget.id);
      }
      setDeleteConfirmTarget(null);
    } catch (error) { setSaveError((error as Error).message); }
    finally { submitting.current = false; setIsDeleting(false); }
  };

  const handleStockAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStockProduct) return;
    const amount = Number(stockChangeQty);
    if (!Number.isSafeInteger(amount) || amount === 0) { setSaveError('Enter a nonzero whole stock quantity.'); return; }
    if (submitting.current) return;
    submitting.current = true; setIsSaving(true); setSaveError('');
    try {
      await onAdjustStock(selectedStockProduct.id, stockType === 'waste' ? -Math.abs(amount) : amount, stockReason, stockType);
      setIsStockModalOpen(false);
    } catch (error) { setSaveError((error as Error).message); }
    finally { submitting.current = false; setIsSaving(false); }
  };

  const addDynamicVariation = () => {
    const groupId = formGroups[0]?.id || `vgroup-${Date.now()}`;
    if (!formGroups.length) setFormGroups([{ id: groupId, name: "Options & Variations", required: false, multiSelect: true }]);
    setFormVariations(prev => [
      ...prev,
      { groupId, id: `opt-${Date.now()}`, name: '', priceDeltaPaisa: 0, costDeltaPaisa: 0 },
    ]);
  };

  const removeDynamicVariation = (indexToRemove: number) => {
    setFormVariations(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleAddProductToDeal = () => {
    if (!selectedProductToAdd) return;
    const prod = products.find(p => p.id === selectedProductToAdd);
    if (!prod) return;
    const existingIdx = dealBundledItems.findIndex(b => b.productId === prod.id);
    if (existingIdx !== -1) {
      const updated = [...dealBundledItems];
      updated[existingIdx].quantity += 1;
      setDealBundledItems(updated);
    } else {
      setDealBundledItems(prev => [
        ...prev,
        { productId: prod.id, productName: prod.name, quantity: 1, unitPricePaisa: prod.pricePaisa },
      ]);
    }
    setSelectedProductToAdd('');
  };

  const handleAddCustomItemToDeal = () => {
    if (!customItemInput.trim()) return;
    setDealBundledItems(prev => [
      ...prev,
      { productName: customItemInput.trim(), quantity: 1, unitPricePaisa: 0 },
    ]);
    setCustomItemInput('');
  };

  const handleUpdateDealItemQty = (index: number, delta: number) => {
    const updated = [...dealBundledItems];
    const newQty = updated[index].quantity + delta;
    if (newQty <= 0) {
      setDealBundledItems(updated.filter((_, idx) => idx !== index));
    } else {
      updated[index].quantity = newQty;
      setDealBundledItems(updated);
    }
  };

  const handleRemoveDealItem = (index: number) => {
    setDealBundledItems(prev => prev.filter((_, idx) => idx !== index));
  };

  return (
    <div className="flex-1 flex min-w-0 overflow-hidden bg-pos-surface">
      {/* COLUMN 1: Categories Sidebar */}
      <aside className="hidden md:flex w-72 shrink-0 flex-col justify-between border-r border-pos-border bg-pos-chrome px-3 py-5 select-none">
        <div>
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-sm font-bold text-pos-text tracking-tight">Dish Categories</h2>
            <Button variant="ghost" size="icon-compact"
              onClick={openCreateCategoryModal}
              title="Add category"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="space-y-1.5 max-h-[calc(100vh-190px)] overflow-y-auto px-1 scrollbar-none">
            {categories.map(cat => {
              const isSelected = selectedCategoryId === cat.id;
              const actualCount =
                cat.id === 'cat-all'
                  ? products.length
                  : cat.id === 'cat-deals'
                    ? products.filter(p => p.isDeal || p.categoryId === 'cat-deals').length
                    : products.filter(p => p.categoryId === cat.id).length;
              return (
                <div
                  key={cat.id}
                  className={`group relative w-full flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${isSelected
                      ? 'bg-pos-surface text-pos-accent border-pos-accent'
                      : 'bg-pos-surface border-pos-border/70 text-pos-secondary hover:border-pos-control hover:bg-pos-surface'
                    }`}
                >
                  <button type="button" onClick={() => setSelectedCategoryId(cat.id)} aria-pressed={isSelected} className="flex min-h-pos-touch min-w-0 flex-1 items-center gap-2 truncate text-left">
                    <span className="w-6 text-center text-base shrink-0">{cat.icon || '🍽'}</span>
                    <span className="truncate">{cat.name}</span>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`min-w-5 text-center text-[10px] px-1.5 py-0.5 rounded-full font-mono transition-opacity ${isSelected ? 'bg-pos-action text-pos-action-text' : 'bg-pos-raised text-pos-muted'
                        } `}
                    >
                      {actualCount}
                    </span>
                  </div>
                  {cat.id !== 'cat-all' && (
                    <div className={`category-actions w-full shrink-0 items-center justify-end gap-1 rounded-md bg-pos-surface ${isSelected ? "flex" : "hidden group-hover:flex group-focus-within:flex"}`}>
                      <Button variant="ghost" size="icon"
                        type="button"
                        onClick={e => openEditCategoryModal(cat, e)}
                        aria-label={`Edit ${cat.name}`}
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost-destructive" size="icon"
                        type="button"
                        onClick={e => handleDeleteCategoryClick(cat.id, e)}
                        aria-label={`Delete ${cat.name}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <Button variant="primary" size="compact"
          onClick={openCreateCategoryModal}
          className="w-full"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </Button>
      </aside>

      {/* COLUMN 2: Manage Dishes Main Area */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden px-5 py-5 lg:px-7 select-none">
        <div className="md:hidden flex flex-wrap items-center gap-2 mb-4">
          <label htmlFor="mobile-category" className="text-sm text-pos-secondary">Category</label>
          <Select size="compact" id="mobile-category" value={selectedCategoryId} onChange={e => setSelectedCategoryId(e.target.value)} className="min-w-[10rem] flex-1">{categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</Select>
          <button type="button" onClick={openCreateCategoryModal} className="p-2 text-sm text-pos-accent">Add category</button>
          {selectedCategoryId !== 'cat-all' && <><button type="button" onClick={() => openEditCategoryModal(activeCategory)} className="p-2 text-sm text-pos-accent">Edit category</button>{selectedCategoryId !== 'cat-uncategorized' && <button type="button" onClick={() => handleDeleteCategoryClick(selectedCategoryId)} className="p-2 text-sm text-pos-danger-text">Delete category</button>}</>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-pos-divider">
          <h1 className="text-lg font-semibold text-pos-text tracking-tight">Manage Dishes</h1>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="relative w-full sm:w-56 lg:w-64">
              <Search className="w-4 h-4 text-pos-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Search dishes or deals..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3"
              />
            </div>
            <Button variant="secondary" size="compact"
              onClick={openCreateDealModal}
            >
              <PlusCircle className="w-4 h-4" />
              Create Deal
            </Button>
            <Button variant="primary" size="compact"
              onClick={openCreateDishModal}
            >
              <Plus className="w-4 h-4" />
              Add New Dish
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 py-4">
          <h2 className="text-base font-semibold text-pos-text">
            {activeCategory.name} <span className="text-sm font-medium text-pos-muted">({categoryProducts.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-pos-surface p-0.5 rounded-lg border border-pos-border">
              <button
                onClick={() => setViewMode('grid')}
                title="Grid view"
                className={`p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-pos-raised text-pos-accent' : 'text-pos-muted'
                  }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                title="List view"
                className={`p-1.5 rounded-md transition ${viewMode === 'list' ? 'bg-pos-raised text-pos-accent' : 'text-pos-muted'
                  }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-1 pb-3 scrollbar-none">
          {categoryProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-10 bg-pos-surface rounded-xl border border-dashed border-pos-border">
              <Package className="w-12 h-12 text-pos-border mb-3" />
              <p className="text-sm font-semibold text-pos-secondary">No dishes found in this category</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-3.5">
              {categoryProducts.map(rawProduct => {
                const product = normalizeProduct(rawProduct);
                const safePrice = Number(product.pricePaisa) || 0;
                const safeCost = Number(product.costPricePaisa) || 0;
                const margin =
                  safePrice > 0 ? ((safePrice - safeCost) / safePrice) * 100 : 0;

                return (
                  <div
                    key={product.id}
                    className="bg-pos-surface rounded-xl p-3 border border-pos-border hover:border-pos-control transition-colors group relative cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2.5 mb-2.5">
                        <button
                          type="button"
                          aria-label={`Edit product image for ${product.name}`}
                          onClick={() => openEditDishModal(product)}
                          className="w-14 h-14 aspect-square rounded-xl overflow-hidden bg-pos-inset border border-pos-border/70 flex items-center justify-center shrink-0"
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

                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1">
                            {product.isDeal && (
                              <Badge tone="accent">
                                Deal
                              </Badge>
                            )}
                            <Button variant="ghost" size="icon-compact"
                              onClick={e => {
                                e.stopPropagation();
                                toggleProductMenu(e, product.id);
                              }}
                              aria-label={`Actions for ${product.name}`}
                              aria-haspopup="menu"
                              aria-expanded={openMenuProductId === product.id}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </div>
                          <ProductStockBadge product={product} />
                        </div>
                      </div>

                      <div className="mb-2.5 space-y-0.5">
                        <span className="block truncate text-[10px] font-bold uppercase tracking-wider text-pos-accent">
                          {product.isDeal ? 'Combo Deal' : product.categoryName}
                        </span>
                        <h3 className="min-h-10 line-clamp-2 text-sm font-bold leading-snug text-pos-text">
                          <button type="button" className="text-left w-full" onClick={() => openEditDishModal(product)}>{product.name}</button>
                        </h3>
                      </div>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2 pt-2.5 border-t border-pos-divider">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-pos-muted">Price</span>
                        <span className="text-sm font-black font-mono text-pos-text whitespace-nowrap">
                          {formatPKR(safePrice)}
                        </span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-[10px] text-pos-muted">Margin</span>
                        <span
                          className={`text-xs font-bold font-mono ${margin > 40 ? 'text-pos-success-text' : 'text-pos-warning-text'
                            }`}
                        >
                          {margin.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2.5">
              {categoryProducts.map(rawProduct => {
                const product = normalizeProduct(rawProduct);
                const safePrice = Number(product.pricePaisa) || 0;
                return (
                  <div
                    key={product.id}
                    className="bg-pos-surface p-3 sm:p-3.5 rounded-xl border border-pos-border flex flex-wrap items-center justify-between gap-3 group hover:border-pos-control transition cursor-pointer"
                  >
                    <div className="flex flex-1 basis-full min-w-0 items-center gap-3 sm:basis-0">
                      <div className="shrink-0 w-12 h-12 aspect-square rounded-xl overflow-hidden bg-pos-inset border border-pos-border/70 flex items-center justify-center">
                        <img
                          src={product.image}
                          alt={product.name}
                          onError={event => {
                            if (!event.currentTarget.src.endsWith('/placeholder-dish.svg')) {
                              event.currentTarget.src = '/placeholder-dish.svg';
                            }
                          }}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="break-words [overflow-wrap:anywhere] text-sm font-bold text-pos-text"><button type="button" className="text-left" onClick={() => openEditDishModal(product)}>{product.name}</button></h3>
                          {product.isDeal && <Badge tone="accent">Deal</Badge>}
                        </div>
                        <span className="text-xs text-pos-muted">{product.categoryName}</span>
                        <div><ProductStockBadge product={product} /></div>
                      </div>
                    </div>
                    <div className="flex w-full shrink-0 items-center justify-end gap-4 border-t border-pos-divider pt-2 sm:w-auto sm:border-0 sm:pt-0 sm:gap-6">
                      <div className="text-right">
                        <span className="block text-[10px] text-pos-muted">Margin</span>
                        <span className="text-xs font-semibold font-mono text-pos-secondary">{safePrice > 0 ? (((safePrice - (Number(product.costPricePaisa) || 0)) / safePrice) * 100).toFixed(0) : 0}%</span>
                      </div>
                      <span className="text-sm font-bold font-mono text-pos-text">
                        {formatPKR(safePrice)}
                      </span>
                      <Button variant="ghost" size="icon" onClick={e => toggleProductMenu(e, product.id)} aria-label={`Actions for ${product.name}`} aria-haspopup="menu" aria-expanded={openMenuProductId === product.id} >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {menuProduct && createPortal(
        <div
          ref={menuRef}
          onKeyDown={handleMenuKeyDown}
          role="menu" aria-label={`Actions for ${menuProduct.name}`}
          style={menuPosition}
          className="fixed w-48 max-w-[calc(100vw-1.5rem)] bg-pos-surface rounded-md border border-pos-border z-50 p-1"
          onClick={e => e.stopPropagation()}
        >
          <button
            role="menuitem"
            onClick={e => {
              setOpenMenuProductId(null);
              e.stopPropagation();
              menuProduct.isDeal
                ? openEditDealModal(menuProduct)
                : openEditDishModal(menuProduct);
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-pos-secondary hover:bg-pos-inset hover:text-pos-text transition cursor-pointer"
          >
            <Edit2 className="w-4 h-4 text-pos-muted" />
            <span>Edit Product</span>
          </button>
          <button
            role="menuitem"
            onClick={e => {
              setOpenMenuProductId(null);
              e.stopPropagation();
              setSelectedStockProduct(menuProduct);
              setIsStockModalOpen(true);
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-pos-secondary hover:bg-pos-inset hover:text-pos-text transition cursor-pointer"
          >
            <Package className="w-4 h-4 text-pos-muted" />
            <span>Adjust Stock</span>
          </button>
          <div className="h-px bg-pos-raised my-1" />
          <button
            role="menuitem"
            onClick={e => {
              setOpenMenuProductId(null);
              e.stopPropagation();
              setDeleteConfirmTarget({
                id: menuProduct.id,
                name: menuProduct.name,
                type: menuProduct.isDeal ? 'deal' : 'dish',
              });
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-pos-danger-text hover:bg-pos-danger-bg transition cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Product</span>
          </button>
        </div>
        , document.body)}

      {/* DISH MODAL */}
      {isDishModalOpen && (
        <Dialog label="Dish editor" busy={isSaving || isDeleting} onClose={() => setIsDishModalOpen(false)} className="pos-editor bg-pos-surface rounded-lg max-w-3xl w-full p-4 border border-pos-border max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
          {(moneyError || saveError) && <p role="alert" tabIndex={-1} className="mb-4 rounded bg-pos-danger-bg p-3 text-sm text-pos-danger-text">{moneyError || saveError}</p>}
          {isSaving && <p role="status" className="text-sm text-pos-muted mb-3">Saving changes...</p>}
          <fieldset disabled={isSaving || isDeleting} className="contents">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h3 className="text-lg font-bold text-pos-text">
                {editingProduct ? 'Edit Dish' : 'Add New Dish'}
              </h3>
              <Button variant="ghost" size="icon"
                onClick={() => setIsDishModalOpen(false)}
                aria-label="Close dish editor"
              >
                <X className="w-6 h-6" />
              </Button>
            </div>
            <form onSubmit={handleSaveDish} className="min-h-0 flex flex-col overflow-hidden">
              <div className="min-h-0 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-4 pr-1">
                <div className="space-y-5">
                  <div className="group">
                    <label htmlFor="manage-field-2" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                      Dish Name
                    </label>
                    <Input id="manage-field-2"
                      type="text"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      className="w-full"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label htmlFor="manage-field-3" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                        Category
                      </label>
                      <Select id="manage-field-3"
                        value={formCategoryId}
                        onChange={e => setFormCategoryId(e.target.value)}
                        className="w-full"
                      >
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="group">
                      <label htmlFor="manage-field-4" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                        Selling Price (PKR)
                      </label>
                      <Input id="manage-field-4"
                        type="number"
                        value={formPrice}
                        onChange={e => { setFormPrice(e.target.value); setMoneyError(''); }}
                        className="w-full tabular-nums"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label htmlFor="manage-field-5" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                        Cost Price (PKR)
                      </label>
                      <Input id="manage-field-5"
                        type="number"
                        value={formCostPrice}
                        onChange={e => { setFormCostPrice(e.target.value); setMoneyError(''); }}
                        className="w-full tabular-nums"
                      />
                    </div>
                    <div className="group">
                      <label htmlFor="manage-field-6" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                        {editingProduct ? 'Stock when opened' : 'Opening stock'}
                      </label>
                      <Input id="manage-field-6"
                        type="number"
                        min="0" step="1" readOnly={Boolean(editingProduct)}
                        aria-describedby={editingProduct ? 'dish-stock-help' : undefined}
                        value={formStock}
                        onChange={e => setFormStock(e.target.value)}
                        className="w-full tabular-nums"
                      />
                      {editingProduct && <p id="dish-stock-help" className="mt-1 text-xs text-pos-muted">Use Adjust Stock from the product menu to record quantity changes.</p>}
                    </div>
                  </div>
                  <div className="group">
                    <label htmlFor="manage-field-7" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                      Image URL
                    </label>
                    <Input id="manage-field-7"
                      type="text"
                      value={formImage}
                      onChange={e => setFormImage(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="group">
                    <label htmlFor="manage-field-8" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                      Description
                    </label>
                    <Textarea id="manage-field-8"
                      value={formDescription}
                      onChange={e => setFormDescription(e.target.value)}
                      rows={3}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                  <div className="p-5 bg-pos-success-bg rounded-md border border-pos-success-border flex flex-col items-center justify-center text-center space-y-2">
                    <div className="flex items-center gap-2 text-pos-success-text">
                      <TrendingUp className="w-5 h-5" />
                      <span className="text-sm font-bold">Estimated Profit</span>
                    </div>
                    <div className="text-3xl font-black text-pos-success-text">
                      {previewProfit === null ? 'Enter valid prices' : formatPKR(previewProfit)}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-pos-secondary uppercase tracking-wider">
                        Variations & Add-ons
                      </label>
                      <Button variant="link" size="inline"
                        type="button"
                        onClick={addDynamicVariation}
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Option
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {formGroups.map((group, index) => <div key={group.id} className="rounded-md border border-pos-border p-3 space-y-2">
                        <Input size="compact" aria-label="Variation group name" value={group.name} onChange={e => setFormGroups(prev => prev.map(g => g.id === group.id ? { ...g, name: e.target.value } : g))} className="w-full" />
                        <label className="flex gap-2 text-xs"><input type="checkbox" checked={group.required} onChange={e => setFormGroups(prev => prev.map(g => g.id === group.id ? { ...g, required: e.target.checked } : g))} />Required choice</label>
                        <label className="flex gap-2 text-xs"><input type="checkbox" checked={group.multiSelect} onChange={e => setFormGroups(prev => prev.map(g => g.id === group.id ? { ...g, multiSelect: e.target.checked } : g))} />Allow multiple choices</label>
                        <button type="button" className="text-xs text-pos-danger-text" onClick={() => { setFormGroups(prev => prev.filter(g => g.id !== group.id)); setFormVariations(prev => prev.filter(v => v.groupId !== group.id)); }}>Remove group {index + 1}</button>
                      </div>)}
                      <Button variant="link" size="inline" type="button" onClick={() => setFormGroups(prev => [...prev, { id: `group-${Date.now()}`, name: 'New group', required: false, multiSelect: false }])}>Add variation group</Button>
                    </div>
                    <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                      {formVariations.map((v, idx) => (
                        <div
                          key={v.id || idx}
                          className="flex flex-wrap items-center gap-2 bg-pos-inset p-2.5 rounded-md border border-pos-control"
                        >
                          <Select size="compact" aria-label="Option group" value={v.groupId} onChange={e => setFormVariations(prev => prev.map(opt => opt.id === v.id ? { ...opt, groupId: e.target.value } : opt))} className="w-24">{formGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</Select>
                          <Input size="compact"
                            type="text"
                            placeholder="Option Name (e.g., Extra Cheese)"
                            value={v.name}
                            onChange={e => {
                              const updated = [...formVariations];
                              updated[idx].name = e.target.value;
                              setFormVariations(updated);
                            }}
                            className="min-w-0 flex-1"
                          />
                          <Input size="compact"
                            type="number"
                            placeholder="+Price"
                            value={rupeeText(v.priceDeltaPaisa)}
                            onChange={e => {
                              const updated = [...formVariations];
                              try { updated[idx].priceDeltaPaisa = parseRupees(e.target.value || '0', true); setMoneyError(''); }
                              catch (error) { setMoneyError((error as Error).message); return; }
                              setFormVariations(updated);
                            }}
                            className="w-20 tabular-nums"
                          />
                          <Button variant="ghost-destructive" size="icon-compact"
                            type="button"
                            aria-label={`Remove option ${v.name || idx + 1}`}
                            onClick={() => removeDynamicVariation(idx)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="shrink-0 bg-pos-surface pt-3 mt-3 pos-editor-actions flex items-center justify-end gap-3 border-t border-pos-divider">
                <Button variant="ghost"
                  type="button"
                  onClick={() => setIsDishModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button variant="primary"
                  type="submit"
                >
                  Save Dish
                </Button>
              </div>
            </form>
          </fieldset>
        </Dialog>
      )}

      {/* DEAL MODAL */}
      {isDealModalOpen && (
        <Dialog label="Deal editor" busy={isSaving || isDeleting} onClose={() => setIsDealModalOpen(false)} className="pos-editor bg-pos-surface rounded-lg max-w-3xl w-full p-4 border border-pos-border max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
          {(moneyError || saveError) && <p role="alert" tabIndex={-1} className="mb-4 rounded bg-pos-danger-bg p-3 text-sm text-pos-danger-text">{moneyError || saveError}</p>}
          {isSaving && <p role="status" className="text-sm text-pos-muted mb-3">Saving changes...</p>}
          <fieldset disabled={isSaving || isDeleting} className="contents">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h3 className="text-lg font-bold text-pos-text">
                {editingDeal ? 'Edit Deal' : 'Create New Deal'}
              </h3>
              <Button variant="ghost" size="icon"
                onClick={() => setIsDealModalOpen(false)}
                aria-label="Close deal editor"
              >
                <X className="w-6 h-6" />
              </Button>
            </div>
            <form onSubmit={handleSaveDeal} className="min-h-0 flex flex-col overflow-hidden">
              <div className="min-h-0 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-4 pr-1">
                <div className="space-y-5">
                  <div className="group">
                    <label htmlFor="manage-field-9" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                      Deal Title
                    </label>
                    <Input id="manage-field-9"
                      type="text"
                      value={dealName}
                      onChange={e => setDealName(e.target.value)}
                      className="w-full"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label htmlFor="manage-field-10" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                        Deal Price (PKR)
                      </label>
                      <Input id="manage-field-10"
                        type="number"
                        value={dealPrice}
                        onChange={e => { setDealPrice(e.target.value); setMoneyError(''); }}
                        className="w-full tabular-nums"
                        required
                      />
                    </div>
                    <div className="group">
                      <label htmlFor="manage-field-11" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                        Estimated Cost
                      </label>
                      <Input id="manage-field-11"
                        type="number"
                        value={dealCostPrice}
                        onChange={e => { setDealCostPrice(e.target.value); setMoneyError(''); }}
                        className="w-full tabular-nums"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label htmlFor="manage-field-12" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                        {editingDeal ? 'Stock when opened' : 'Opening stock'}
                      </label>
                      <Input id="manage-field-12"
                        type="number"
                        min="0" step="1" readOnly={Boolean(editingDeal)}
                        aria-describedby={editingDeal ? 'deal-stock-help' : undefined}
                        value={dealStock}
                        onChange={e => setDealStock(e.target.value)}
                        className="w-full tabular-nums"
                      />
                      {editingDeal && <p id="deal-stock-help" className="mt-1 text-xs text-pos-muted">Use Adjust Stock from the product menu to record quantity changes.</p>}
                    </div>
                    <div className="group">
                      <label htmlFor="manage-field-13" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                        Image URL
                      </label>
                      <Input id="manage-field-13"
                        type="text"
                        value={dealImage}
                        onChange={e => setDealImage(e.target.value)}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div className="group">
                    <label htmlFor="manage-field-14" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                      Description
                    </label>
                    <Textarea id="manage-field-14"
                      value={dealDescription}
                      onChange={e => setDealDescription(e.target.value)}
                      rows={3}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label htmlFor="manage-field-15" className="text-xs font-bold text-pos-secondary block mb-2 uppercase tracking-wider">
                      Bundled Items
                    </label>

                    <div className="flex items-center gap-2 mb-3">
                      <Select size="compact" id="manage-field-15"
                        value={selectedProductToAdd}
                        onChange={e => setSelectedProductToAdd(e.target.value)}
                        className="flex-1"
                      >
                        <option value="">Select Existing Dish...</option>
                        {products
                          .filter(p => !p.isDeal)
                          .map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({formatPKR(p.pricePaisa)})
                            </option>
                          ))}
                      </Select>
                      <Button variant="secondary" size="compact"
                        type="button"
                        onClick={handleAddProductToDeal}
                      >
                        Add
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 mb-4">
                      <Input size="compact"
                        type="text"
                        placeholder="Or Custom Item (e.g. 1.5L Cold Drink)"
                        value={customItemInput}
                        onChange={e => setCustomItemInput(e.target.value)}
                        className="flex-1"
                      />
                      <Button variant="secondary" size="compact"
                        type="button"
                        onClick={handleAddCustomItemToDeal}
                      >
                        Custom
                      </Button>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {dealBundledItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-pos-inset p-2.5 rounded-md border border-pos-control text-xs"
                        >
                          <span className="font-medium text-pos-text truncate max-w-[150px]">
                            {item.productName}
                          </span>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon-compact"
                              type="button"
                              aria-label={`Decrease ${item.productName} bundle quantity`}
                              onClick={() => handleUpdateDealItemQty(idx, -1)}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="font-bold text-pos-text w-4 text-center">
                              {item.quantity}
                            </span>
                            <Button variant="ghost" size="icon-compact"
                              type="button"
                              aria-label={`Increase ${item.productName} bundle quantity`}
                              onClick={() => handleUpdateDealItemQty(idx, 1)}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost-destructive" size="icon-compact"
                              type="button"
                              aria-label={`Remove ${item.productName} from deal`}
                              onClick={() => handleRemoveDealItem(idx)}
                              className="ml-2"
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {dealBundledItems.length === 0 && (
                        <p className="text-xs text-pos-muted text-center py-4 bg-pos-inset rounded-md border border-dashed border-pos-control">
                          No items added to deal yet.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="shrink-0 bg-pos-surface pt-3 mt-3 pos-editor-actions flex items-center justify-end gap-3 border-t border-pos-divider">
                <Button variant="ghost"
                  type="button"
                  onClick={() => setIsDealModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button variant="primary"
                  type="submit"
                >
                  Save Deal
                </Button>
              </div>
            </form>
          </fieldset>
        </Dialog>
      )}

      {/* CATEGORY MODAL */}
      {isCategoryModalOpen && (
        <Dialog label="Category editor" busy={isSaving || isDeleting} onClose={() => setIsCategoryModalOpen(false)} className="bg-pos-surface rounded-lg max-w-sm w-full p-4 max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden border border-pos-border">
          {(moneyError || saveError) && <p role="alert" tabIndex={-1} className="mb-4 rounded bg-pos-danger-bg p-3 text-sm text-pos-danger-text">{moneyError || saveError}</p>}
          {isSaving && <p role="status" className="text-sm text-pos-muted mb-3">Saving changes...</p>}
          <fieldset disabled={isSaving || isDeleting} className="contents">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h3 className="text-lg font-bold text-pos-text">
                {editingCategory ? 'Edit Category' : 'New Category'}
              </h3>
              <Button variant="ghost" size="icon"
                onClick={() => setIsCategoryModalOpen(false)}
                aria-label="Close category editor"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <form onSubmit={handleSaveCategorySubmit} className="min-h-0 flex flex-col overflow-hidden">
              <div className="min-h-0 overflow-y-auto space-y-4 pr-1">
                <div>
                  <label htmlFor="category-name-input" className="text-xs font-bold text-pos-secondary block mb-1 uppercase tracking-wider">
                    Category Name
                  </label>
                  <Input id="category-name-input"
                    type="text"
                    value={catNameInput}
                    onChange={e => setCatNameInput(e.target.value)}
                    className="w-full"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="category-icon-input" className="text-xs font-bold text-pos-secondary block mb-1 uppercase tracking-wider">
                    Icon Emoji
                  </label>
                  <Input id="category-icon-input"
                    type="text"
                    value={catIconInput}
                    onChange={e => setCatIconInput(e.target.value)}
                    className="w-full text-lg text-center"
                    required
                  />
                  <div className="mt-2 grid grid-cols-5 gap-2">
                    {FAST_FOOD_CATEGORY_EMOJIS.map(({ emoji, label }) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setCatIconInput(emoji)}
                        aria-label={`Use ${label} emoji`}
                        className={`h-10 rounded-md border text-lg transition hover:border-pos-accent hover:bg-pos-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pos-accent ${catIconInput === emoji
                            ? 'border-pos-accent bg-pos-selected'
                            : 'border-pos-border bg-pos-surface'
                          }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="shrink-0 flex items-center justify-end gap-2 pt-3 mt-3 border-t border-pos-divider">
                <Button variant="ghost"
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button variant="primary"
                  type="submit"
                >
                  Save
                </Button>
              </div>
            </form>
          </fieldset>
        </Dialog>
      )}

      {/* STOCK ADJUSTMENT MODAL */}
      {isStockModalOpen && selectedStockProduct && (
        <Dialog label="Adjust stock" busy={isSaving || isDeleting} onClose={() => setIsStockModalOpen(false)} className="bg-pos-surface rounded-lg max-w-sm w-full p-4 max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden border border-pos-border">
          {(moneyError || saveError) && <p role="alert" tabIndex={-1} className="mb-4 rounded bg-pos-danger-bg p-3 text-sm text-pos-danger-text">{moneyError || saveError}</p>}
          {isSaving && <p role="status" className="text-sm text-pos-muted mb-3">Saving changes...</p>}
          <fieldset disabled={isSaving || isDeleting} className="contents">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-pos-text">Adjust Stock</h3>
              <Button variant="ghost" size="icon"
                onClick={() => setIsStockModalOpen(false)}
                aria-label="Close stock adjustment"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <p className="text-xs text-pos-muted mb-4">
              Adjust inventory quantity for{' '}
              <span className="font-bold text-pos-text">{selectedStockProduct.name}</span>.
            </p>
            <form onSubmit={handleStockAdjustSubmit} className="min-h-0 flex flex-col overflow-hidden">
              <div className="min-h-0 overflow-y-auto space-y-4 pr-1">
                <div>
                  <label htmlFor="manage-field-18" className="text-xs font-bold text-pos-secondary block mb-1 uppercase tracking-wider">
                    Type
                  </label>
                  <Select size="compact" id="manage-field-18"
                    value={stockType}
                    onChange={e => setStockType(e.target.value as any)}
                    className="w-full"
                  >
                    <option value="restock">Restock (+ Stock)</option>
                    <option value="adjustment">Manual Adjustment (+ Stock)</option>
                    <option value="waste">Waste / Loss (- Stock)</option>
                  </Select>
                </div>
                <div>
                  <label htmlFor="manage-field-19" className="text-xs font-bold text-pos-secondary block mb-1 uppercase tracking-wider">
                    Quantity
                  </label>
                  <Input size="compact" id="manage-field-19"
                    type="number"
                    value={stockChangeQty}
                    onChange={e => setStockChangeQty(e.target.value)}
                    className="w-full tabular-nums"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="manage-field-20" className="text-xs font-bold text-pos-secondary block mb-1 uppercase tracking-wider">
                    Reason
                  </label>
                  <Input size="compact" id="manage-field-20"
                    type="text"
                    value={stockReason}
                    onChange={e => setStockReason(e.target.value)}
                    className="w-full"
                    required
                  />
                </div>
              </div>
              <div className="shrink-0 flex items-center justify-end gap-2 pt-3 mt-3 border-t border-pos-divider">
                <Button variant="ghost"
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button variant="primary"
                  type="submit"
                >
                  Apply
                </Button>
              </div>
            </form>
          </fieldset>
        </Dialog>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {deleteConfirmTarget && (
        <Dialog label="Confirm deletion" busy={isSaving || isDeleting} onClose={() => setDeleteConfirmTarget(null)} className="bg-pos-surface rounded-lg max-w-sm w-full p-6 max-h-[90dvh] overflow-y-auto border border-pos-border text-center">
          {(moneyError || saveError) && <p role="alert" tabIndex={-1} className="mb-4 rounded bg-pos-danger-bg p-3 text-sm text-pos-danger-text">{moneyError || saveError}</p>}
          {isSaving && <p role="status" className="text-sm text-pos-muted mb-3">Saving changes...</p>}
          <fieldset disabled={isSaving || isDeleting} className="min-w-0">
            <div className="w-12 h-12 rounded-md bg-pos-danger-bg text-pos-danger-text flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-pos-text mb-2">Are you sure?</h3>
            <p className="text-xs text-pos-muted mb-6">
              You are about to delete{' '}
              <span className="font-bold text-pos-text">"{deleteConfirmTarget.name}"</span>. This action cannot be undone.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="ghost"
                onClick={() => setDeleteConfirmTarget(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button variant="destructive"
                onClick={handleExecuteDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </Button>
            </div>
          </fieldset>
        </Dialog>
      )}
    </div>
  );
};
