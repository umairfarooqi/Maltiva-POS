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
    setFormImage('https://images.unsplash.com/photo-1513104890138-7c749659a591?w=300&auto=format&fit=crop&q=80');
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
    setDealImage('https://images.unsplash.com/photo-1544025162-d76694265947?w=300&auto=format&fit=crop&q=80');
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
    const parsedStock = parseInt(formStock, 10);
    const parsedMinThreshold = parseInt(formMinThreshold, 10);

    const finalPrice = !isNaN(parsedPrice) ? parsedPrice : (editingProduct?.pricePaisa ?? 0);
    const finalCost = !isNaN(parsedCost) ? parsedCost : (editingProduct?.costPricePaisa ?? 0);
    const finalImage =
      formImage.trim() ||
      editingProduct?.image ||
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&auto=format&fit=crop&q=80';

    if (submitting.current) return;
    submitting.current = true; setIsSaving(true);
    try { await onSaveProduct({
      id: editingProduct?.id,
      name: formName.trim() || editingProduct?.name || 'Maltiva Special Dish',
      categoryId: formCategoryId || editingProduct?.categoryId || 'cat-special',
      categoryName: category?.name || editingProduct?.categoryName || 'Special Dishes',
      pricePaisa: finalPrice,
      costPricePaisa: finalCost,
      stockQuantity: !isNaN(parsedStock) ? parsedStock : (editingProduct?.stockQuantity ?? 25),
      minStockThreshold: !isNaN(parsedMinThreshold) ? parsedMinThreshold : (editingProduct?.minStockThreshold ?? 5),
      image: finalImage,
      description: formDescription,
      isDeal: false,
      variations: packagedVariations,
    }); setIsDishModalOpen(false); }
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
    const parsedStock = parseInt(dealStock, 10);
    const parsedMinThreshold = parseInt(dealMinThreshold, 10);

    const finalPrice = !isNaN(parsedPrice) ? parsedPrice : (editingDeal?.pricePaisa ?? 0);
    const finalCost = !isNaN(parsedCost) ? parsedCost : (editingDeal?.costPricePaisa ?? 0);
    const finalImage =
      dealImage.trim() ||
      editingDeal?.image ||
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=300&auto=format&fit=crop&q=80';

    if (submitting.current) return;
    submitting.current = true; setIsSaving(true);
    try { await onSaveProduct({
      id: editingDeal?.id,
      name: dealName.trim() || editingDeal?.name || 'Maltiva Mega Combo Deal',
      categoryId: dealCategoryId || editingDeal?.categoryId || 'cat-deals',
      categoryName: category.name,
      pricePaisa: finalPrice,
      costPricePaisa: finalCost,
      stockQuantity: !isNaN(parsedStock) ? parsedStock : (editingDeal?.stockQuantity ?? 30),
      minStockThreshold: !isNaN(parsedMinThreshold) ? parsedMinThreshold : (editingDeal?.minStockThreshold ?? 5),
      image: finalImage,
      description: dealDescription,
      isDeal: true,
      bundledProducts: dealBundledItems,
      variations: editingDeal?.variations || [],
    }); setIsDealModalOpen(false); }
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
            <button
              onClick={openCreateCategoryModal}
              title="Add category"
              className="p-1.5 rounded-lg text-pos-accent hover:bg-pos-selected transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
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
                  className={`group relative w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-pos-surface text-pos-accent border-pos-accent'
                      : 'bg-pos-surface border-pos-border/70 text-pos-secondary hover:border-pos-control hover:bg-pos-surface'
                  }`}
                >
                  <button type="button" onClick={() => setSelectedCategoryId(cat.id)} aria-pressed={isSelected} className="flex min-w-0 flex-1 items-center gap-3 truncate text-left">
                    <span className="w-6 text-center text-base shrink-0">{cat.icon || '🍽'}</span>
                    <span className="truncate">{cat.name}</span>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`min-w-5 text-center text-[10px] px-1.5 py-0.5 rounded-full font-mono transition-opacity ${
                        isSelected ? 'bg-pos-action text-white' : 'bg-pos-raised text-pos-muted'
                      } ${cat.id !== 'cat-all' ? 'group-hover:opacity-0' : ''}`}
                    >
                      {actualCount}
                    </span>
                  </div>
                  {cat.id !== 'cat-all' && (
                      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md bg-pos-surface px-1 opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                        <button
                          type="button"
                          onClick={e => openEditCategoryModal(cat, e)}
                          aria-label={`Edit ${cat.name}`}
                          className="p-1 text-pos-muted hover:text-pos-accent transition"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={e => handleDeleteCategoryClick(cat.id, e)}
                          aria-label={`Delete ${cat.name}`}
                          className="p-1 text-pos-muted hover:text-pos-danger-text transition"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <button
          onClick={openCreateCategoryModal}
          className="w-full py-2.5 bg-pos-action hover:bg-pos-action-hover text-white rounded-md text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      </aside>

      {/* COLUMN 2: Manage Dishes Main Area */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden px-5 py-5 lg:px-7 select-none">
        <div className="md:hidden flex flex-wrap items-center gap-2 mb-4">
          <label htmlFor="mobile-category" className="text-sm text-pos-secondary">Category</label>
          <select id="mobile-category" value={selectedCategoryId} onChange={e => setSelectedCategoryId(e.target.value)} className="min-w-[10rem] flex-1 bg-pos-inset border border-pos-control p-2 rounded-md text-sm">{categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select>
          <button type="button" onClick={openCreateCategoryModal} className="p-2 text-sm text-pos-accent">Add category</button>
          {selectedCategoryId !== 'cat-all' && <><button type="button" onClick={() => openEditCategoryModal(activeCategory)} className="p-2 text-sm text-pos-accent">Edit category</button>{selectedCategoryId !== 'cat-uncategorized' && <button type="button" onClick={() => handleDeleteCategoryClick(selectedCategoryId)} className="p-2 text-sm text-pos-danger-text">Delete category</button>}</>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-pos-divider">
          <h1 className="text-lg font-semibold text-pos-text tracking-tight">Manage Dishes</h1>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="relative w-full sm:w-56 lg:w-64">
              <Search className="w-4 h-4 text-pos-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search dishes or deals..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-pos-surface border border-pos-control rounded-md text-xs focus-visible:border-pos-accent transition-colors"
              />
            </div>
            <button
              onClick={openCreateDealModal}
              className="px-3.5 py-2.5 bg-pos-surface border border-pos-warning-border hover:bg-pos-warning-bg text-pos-warning-text rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              Create Deal
            </button>
            <button
              onClick={openCreateDishModal}
              className="px-3.5 py-2.5 bg-pos-action hover:bg-pos-action-hover text-white rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add New Dish
            </button>
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
                className={`p-1.5 rounded-md transition ${
                  viewMode === 'grid' ? 'bg-pos-raised text-pos-accent' : 'text-pos-muted'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                title="List view"
                className={`p-1.5 rounded-md transition ${
                  viewMode === 'list' ? 'bg-pos-raised text-pos-accent' : 'text-pos-muted'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-1 pb-3 scrollbar-none">
          {categoryProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-10 bg-pos-surface rounded-lg border border-dashed border-pos-control">
              <Package className="w-12 h-12 text-pos-border mb-3" />
              <p className="text-sm font-semibold text-pos-secondary">No dishes found in this category</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
              {categoryProducts.map(rawProduct => {
                const product = normalizeProduct(rawProduct);
                const safePrice = Number(product.pricePaisa) || 0;
                const safeCost = Number(product.costPricePaisa) || 0;
                const margin =
                  safePrice > 0 ? ((safePrice - safeCost) / safePrice) * 100 : 0;

                return (
                  <div
                    key={product.id}
                    className="bg-pos-surface rounded-md p-2 border border-pos-border hover:border-pos-control transition-colors group relative cursor-pointer flex flex-col"
                  >
                    <div className="relative mb-2 flex items-center justify-center">
                      <button type="button" aria-label={`Edit product image for ${product.name}`} onClick={() => openEditDishModal(product)} className="w-12 h-12 rounded-full overflow-hidden bg-pos-inset ring-1 ring-pos-divider">
                        <img
                          src={product.image}
                          alt={product.name}
                          onError={event => {
                            if (!event.currentTarget.src.endsWith('/placeholder-dish.svg')) {
                              event.currentTarget.src = '/placeholder-dish.svg';
                            }
                          }}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      </button>
                      {product.isDeal && (
                        <span className="absolute top-0 left-0 z-10 rounded-full border border-pos-warning-border bg-pos-warning-bg px-1.5 py-0.5 text-[8px] font-black uppercase text-pos-warning-text">
                          Deal
                        </span>
                      )}
                      <div className="absolute top-0 right-0 z-20">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            toggleProductMenu(e, product.id);
                          }}
                          aria-label={`Actions for ${product.name}`}
                          aria-haspopup="menu"
                          aria-expanded={openMenuProductId === product.id}
                          className="p-1.5 rounded-full bg-pos-surface text-pos-muted hover:text-pos-text transition cursor-pointer z-10"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>


                      </div>
                    </div>

                    <div className="mb-2 space-y-1">
                      {!product.isDeal && (
                        <span className="mb-1 inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full bg-pos-selected px-1.5 py-0.5 text-[8px] font-bold uppercase text-pos-accent ring-1 ring-pos-success-border">
                          {product.categoryName}
                        </span>
                      )}
                      <h3 className="min-h-7 line-clamp-2 text-[11px] font-semibold leading-[14px] text-pos-text">
                        <button type="button" className="text-left" onClick={() => openEditDishModal(product)}>{product.name}</button>
                      </h3>
                      <ProductStockBadge product={product} />
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-pos-divider">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-pos-secondary">Selling Price</span>
                        <span className="text-xs font-bold text-pos-text">
                          {formatPKR(safePrice)}
                        </span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-[10px] text-pos-secondary">Margin</span>
                        <span
                          className={`text-xs font-bold ${
                            margin > 40 ? 'text-pos-success-text' : 'text-pos-warning-text'
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
            <div className="space-y-3">
              {categoryProducts.map(rawProduct => {
                const product = normalizeProduct(rawProduct);
                const safePrice = Number(product.pricePaisa) || 0;
                return (
                  <div
                    key={product.id}
                    className="bg-pos-surface p-3 sm:p-4 rounded-lg border border-pos-border flex flex-wrap items-center justify-between gap-3 group hover:border-pos-control transition cursor-pointer"
                  >
                    <div className="flex flex-1 basis-full min-w-0 items-center gap-3 sm:basis-0">
                      <div className="shrink-0 w-12 h-12 rounded-md overflow-hidden bg-pos-inset">
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
                          {product.isDeal && <span className="rounded border border-pos-warning-border bg-pos-warning-bg px-1.5 py-0.5 text-[10px] font-bold uppercase text-pos-warning-text">Deal</span>}
                        </div>
                        <span className="text-xs text-pos-secondary">{product.categoryName}</span>
                        <div><ProductStockBadge product={product} /></div>
                      </div>
                    </div>
                    <div className="flex w-full shrink-0 items-center justify-end gap-4 border-t border-pos-divider pt-2 sm:w-auto sm:border-0 sm:pt-0 sm:gap-6">
                      <div className="text-right">
                        <span className="block text-[10px] text-pos-muted">Margin</span>
                        <span className="text-xs font-semibold text-pos-secondary">{safePrice > 0 ? (((safePrice - (Number(product.costPricePaisa) || 0)) / safePrice) * 100).toFixed(0) : 0}%</span>
                      </div>
                      <span className="text-sm font-bold text-pos-text">
                        {formatPKR(safePrice)}
                      </span>
                      <button onClick={e => toggleProductMenu(e, product.id)} aria-label={`Actions for ${product.name}`} aria-haspopup="menu" aria-expanded={openMenuProductId === product.id} className="p-2 text-pos-muted hover:text-pos-text transition">
                        <MoreVertical className="w-4 h-4" />
                      </button>
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
        <Dialog label="Dish editor" busy={isSaving || isDeleting} onClose={() => setIsDishModalOpen(false)} className="bg-pos-surface rounded-lg max-w-3xl w-full p-6 border border-pos-border max-h-[90vh] overflow-y-auto scrollbar-none">
            {(moneyError || saveError) && <p role="alert" tabIndex={-1} className="mb-4 rounded bg-pos-danger-bg p-3 text-sm text-pos-danger-text">{moneyError || saveError}</p>}
            {isSaving && <p role="status" className="text-sm text-pos-muted mb-3">Saving changes...</p>}
            <fieldset disabled={isSaving || isDeleting} className="min-w-0">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-pos-text">
                {editingProduct ? 'Edit Dish' : 'Add New Dish'}
              </h3>
              <button
                onClick={() => setIsDishModalOpen(false)}
                aria-label="Close dish editor"
                className="p-2 text-pos-muted hover:text-pos-secondary rounded-md hover:bg-pos-raised transition cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSaveDish} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-5">
                <div className="group">
                  <label htmlFor="manage-field-2" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                    Dish Name
                  </label>
                  <input id="manage-field-2"
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm focus-visible:border-pos-accent"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="group">
                    <label htmlFor="manage-field-3" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                      Category
                    </label>
                    <select id="manage-field-3"
                      value={formCategoryId}
                      onChange={e => setFormCategoryId(e.target.value)}
                      className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm focus-visible:border-pos-accent cursor-pointer"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="group">
                    <label htmlFor="manage-field-4" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                      Selling Price (PKR)
                    </label>
                    <input id="manage-field-4"
                      type="number"
                      value={formPrice}
                      onChange={e => { setFormPrice(e.target.value); setMoneyError(''); } }
                      className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm font-mono focus-visible:border-pos-accent"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="group">
                    <label htmlFor="manage-field-5" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                      Cost Price (PKR)
                    </label>
                    <input id="manage-field-5"
                      type="number"
                      value={formCostPrice}
                      onChange={e => { setFormCostPrice(e.target.value); setMoneyError(''); } }
                      className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm font-mono focus-visible:border-pos-accent"
                    />
                  </div>
                  <div className="group">
                    <label htmlFor="manage-field-6" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                      Initial Stock
                    </label>
                    <input id="manage-field-6"
                      type="number"
                      value={formStock}
                      onChange={e => setFormStock(e.target.value)}
                      className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm font-mono focus-visible:border-pos-accent"
                    />
                  </div>
                </div>
                <div className="group">
                  <label htmlFor="manage-field-7" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                    Image URL
                  </label>
                  <input id="manage-field-7"
                    type="text"
                    value={formImage}
                    onChange={e => setFormImage(e.target.value)}
                    className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm focus-visible:border-pos-accent"
                  />
                </div>
                <div className="group">
                  <label htmlFor="manage-field-8" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                    Description
                  </label>
                  <textarea id="manage-field-8"
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm focus-visible:border-pos-accent"
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
                    {formatPKR((parseRupees(formPrice) || 0) - (parseRupees(formCostPrice) || 0))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-pos-secondary uppercase tracking-wider">
                      Variations & Add-ons
                    </label>
                    <button
                      type="button"
                      onClick={addDynamicVariation}
                      className="text-xs font-bold text-pos-accent hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Option
                    </button>
                  </div>

                  <div className="space-y-3">
                    {formGroups.map((group, index) => <div key={group.id} className="rounded-md border border-pos-border p-3 space-y-2">
                      <input aria-label="Variation group name" value={group.name} onChange={e => setFormGroups(prev => prev.map(g => g.id === group.id ? { ...g, name: e.target.value } : g))} className="w-full bg-pos-inset rounded p-2 text-sm" />
                      <label className="flex gap-2 text-xs"><input type="checkbox" checked={group.required} onChange={e => setFormGroups(prev => prev.map(g => g.id === group.id ? { ...g, required: e.target.checked } : g))} />Required choice</label>
                      <label className="flex gap-2 text-xs"><input type="checkbox" checked={group.multiSelect} onChange={e => setFormGroups(prev => prev.map(g => g.id === group.id ? { ...g, multiSelect: e.target.checked } : g))} />Allow multiple choices</label>
                      <button type="button" className="text-xs text-pos-danger-text" onClick={() => { setFormGroups(prev => prev.filter(g => g.id !== group.id)); setFormVariations(prev => prev.filter(v => v.groupId !== group.id)); }}>Remove group {index + 1}</button>
                    </div>)}
                    <button type="button" className="text-xs text-pos-accent" onClick={() => setFormGroups(prev => [...prev, { id: `group-${Date.now()}`, name: 'New group', required: false, multiSelect: false }])}>Add variation group</button>
                  </div>
                  <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                    {formVariations.map((v, idx) => (
                      <div
                        key={v.id || idx}
                        className="flex flex-wrap items-center gap-2 bg-pos-inset p-2.5 rounded-md border border-pos-control"
                      >
                        <select aria-label="Option group" value={v.groupId} onChange={e => setFormVariations(prev => prev.map(opt => opt.id === v.id ? { ...opt, groupId: e.target.value } : opt))} className="w-24 rounded bg-pos-surface p-1 text-xs">{formGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
                        <input
                          type="text"
                          placeholder="Option Name (e.g., Extra Cheese)"
                          value={v.name}
                          onChange={e => {
                            const updated = [...formVariations];
                            updated[idx].name = e.target.value;
                            setFormVariations(updated);
                          }}
                          className="min-w-0 flex-1 px-3 py-1.5 bg-pos-surface border border-pos-control rounded-md text-xs focus-visible:border-pos-accent"
                        />
                        <input
                          type="number"
                          placeholder="+Price"
                          value={rupeeText(v.priceDeltaPaisa)}
                          onChange={e => {
                            const updated = [...formVariations];
                            try { updated[idx].priceDeltaPaisa = parseRupees(e.target.value || '0', true); setMoneyError(''); }
                            catch (error) { setMoneyError((error as Error).message); return; }
                            setFormVariations(updated);
                          }}
                          className="w-20 px-2 py-1.5 bg-pos-surface border border-pos-control rounded-md text-xs font-mono focus-visible:border-pos-accent"
                        />
                        <button
                          type="button"
                          onClick={() => removeDynamicVariation(idx)}
                          className="p-1.5 text-pos-muted hover:text-pos-danger-text transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-pos-divider">
                  <button
                    type="button"
                    onClick={() => setIsDishModalOpen(false)}
                    className="px-5 py-2.5 rounded-md text-xs font-bold text-pos-secondary hover:bg-pos-raised transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-pos-action hover:bg-pos-action-hover text-white rounded-md text-xs font-bold transition cursor-pointer"
                  >
                    Save Dish
                  </button>
                </div>
              </div>
            </form>
            </fieldset>
        </Dialog>
      )}

      {/* DEAL MODAL */}
      {isDealModalOpen && (
        <Dialog label="Deal editor" busy={isSaving || isDeleting} onClose={() => setIsDealModalOpen(false)} className="bg-pos-surface rounded-lg max-w-3xl w-full p-6 border border-pos-border max-h-[90vh] overflow-y-auto scrollbar-none">
            {(moneyError || saveError) && <p role="alert" tabIndex={-1} className="mb-4 rounded bg-pos-danger-bg p-3 text-sm text-pos-danger-text">{moneyError || saveError}</p>}
            {isSaving && <p role="status" className="text-sm text-pos-muted mb-3">Saving changes...</p>}
            <fieldset disabled={isSaving || isDeleting} className="min-w-0">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-pos-text">
                {editingDeal ? 'Edit Deal' : 'Create New Deal'}
              </h3>
              <button
                onClick={() => setIsDealModalOpen(false)}
                aria-label="Close deal editor"
                className="p-2 text-pos-muted hover:text-pos-secondary rounded-md hover:bg-pos-raised transition cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSaveDeal} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-5">
                <div className="group">
                  <label htmlFor="manage-field-9" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                    Deal Title
                  </label>
                  <input id="manage-field-9"
                    type="text"
                    value={dealName}
                    onChange={e => setDealName(e.target.value)}
                    className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm focus-visible:border-pos-accent"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="group">
                    <label htmlFor="manage-field-10" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                      Deal Price (PKR)
                    </label>
                    <input id="manage-field-10"
                      type="number"
                      value={dealPrice}
                      onChange={e => { setDealPrice(e.target.value); setMoneyError(''); } }
                      className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm font-mono focus-visible:border-pos-accent"
                      required
                    />
                  </div>
                  <div className="group">
                    <label htmlFor="manage-field-11" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                      Estimated Cost
                    </label>
                    <input id="manage-field-11"
                      type="number"
                      value={dealCostPrice}
                      onChange={e => { setDealCostPrice(e.target.value); setMoneyError(''); } }
                      className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm font-mono focus-visible:border-pos-accent"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="group">
                    <label htmlFor="manage-field-12" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                      Stock Available
                    </label>
                    <input id="manage-field-12"
                      type="number"
                      value={dealStock}
                      onChange={e => setDealStock(e.target.value)}
                      className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm font-mono focus-visible:border-pos-accent"
                    />
                  </div>
                  <div className="group">
                    <label htmlFor="manage-field-13" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                      Image URL
                    </label>
                    <input id="manage-field-13"
                      type="text"
                      value={dealImage}
                      onChange={e => setDealImage(e.target.value)}
                      className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm focus-visible:border-pos-accent"
                    />
                  </div>
                </div>
                <div className="group">
                  <label htmlFor="manage-field-14" className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
                    Description
                  </label>
                  <textarea id="manage-field-14"
                    value={dealDescription}
                    onChange={e => setDealDescription(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm focus-visible:border-pos-accent"
                  />
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label htmlFor="manage-field-15" className="text-xs font-bold text-pos-secondary block mb-2 uppercase tracking-wider">
                    Bundled Items
                  </label>

                  <div className="flex items-center gap-2 mb-3">
                    <select id="manage-field-15"
                      value={selectedProductToAdd}
                      onChange={e => setSelectedProductToAdd(e.target.value)}
                      className="flex-1 px-3 py-2 bg-pos-inset border border-pos-control rounded-md text-xs focus-visible:border-pos-accent"
                    >
                      <option value="">Select Existing Dish...</option>
                      {products
                        .filter(p => !p.isDeal)
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({formatPKR(p.pricePaisa)})
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddProductToDeal}
                      className="px-3 py-2 bg-pos-strong text-white rounded-md text-xs font-bold hover:bg-pos-strong transition cursor-pointer"
                    >
                      Add
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <input
                      type="text"
                      placeholder="Or Custom Item (e.g. 1.5L Cold Drink)"
                      value={customItemInput}
                      onChange={e => setCustomItemInput(e.target.value)}
                      className="flex-1 px-3 py-2 bg-pos-inset border border-pos-control rounded-md text-xs focus-visible:border-pos-accent"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomItemToDeal}
                      className="px-3 py-2 bg-pos-strong text-white rounded-md text-xs font-bold hover:bg-pos-strong transition cursor-pointer"
                    >
                      Custom
                    </button>
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
                          <button
                            type="button"
                            onClick={() => handleUpdateDealItemQty(idx, -1)}
                            className="p-1 text-pos-muted hover:text-pos-text"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold text-pos-text w-4 text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateDealItemQty(idx, 1)}
                            className="p-1 text-pos-muted hover:text-pos-text"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveDealItem(idx)}
                            className="p-1 text-pos-danger-text hover:text-pos-danger-text ml-2"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
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

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-pos-divider">
                  <button
                    type="button"
                    onClick={() => setIsDealModalOpen(false)}
                    className="px-5 py-2.5 rounded-md text-xs font-bold text-pos-secondary hover:bg-pos-raised transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-pos-action hover:bg-pos-action-hover text-white rounded-md text-xs font-bold transition cursor-pointer"
                  >
                    Save Deal
                  </button>
                </div>
              </div>
            </form>
            </fieldset>
        </Dialog>
      )}

      {/* CATEGORY MODAL */}
      {isCategoryModalOpen && (
        <Dialog label="Category editor" busy={isSaving || isDeleting} onClose={() => setIsCategoryModalOpen(false)} className="bg-pos-surface rounded-lg max-w-sm w-full p-6 max-h-[90dvh] overflow-y-auto border border-pos-border">
            {(moneyError || saveError) && <p role="alert" tabIndex={-1} className="mb-4 rounded bg-pos-danger-bg p-3 text-sm text-pos-danger-text">{moneyError || saveError}</p>}
            {isSaving && <p role="status" className="text-sm text-pos-muted mb-3">Saving changes...</p>}
            <fieldset disabled={isSaving || isDeleting} className="min-w-0">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-pos-text">
                {editingCategory ? 'Edit Category' : 'New Category'}
              </h3>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                aria-label="Close category editor"
                className="p-1.5 text-pos-muted hover:text-pos-secondary rounded-md hover:bg-pos-raised transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveCategorySubmit} className="space-y-4">
              <div>
                <label htmlFor="category-name-input" className="text-xs font-bold text-pos-secondary block mb-1 uppercase tracking-wider">
                  Category Name
                </label>
                <input id="category-name-input"
                  type="text"
                  value={catNameInput}
                  onChange={e => setCatNameInput(e.target.value)}
                  className="w-full px-4 py-2.5 bg-pos-inset border border-pos-control rounded-md text-xs focus-visible:border-pos-accent"
                  required
                />
              </div>
              <div>
                <label htmlFor="category-icon-input" className="text-xs font-bold text-pos-secondary block mb-1 uppercase tracking-wider">
                  Icon Emoji
                </label>
                <input id="category-icon-input"
                  type="text"
                  value={catIconInput}
                  onChange={e => setCatIconInput(e.target.value)}
                  className="w-full px-4 py-2.5 bg-pos-inset border border-pos-control rounded-md text-lg text-center focus-visible:border-pos-accent"
                  required
                />
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {FAST_FOOD_CATEGORY_EMOJIS.map(({ emoji, label }) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setCatIconInput(emoji)}
                      aria-label={`Use ${label} emoji`}
                      className={`h-10 rounded-md border text-lg transition hover:border-pos-accent hover:bg-pos-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pos-accent ${
                        catIconInput === emoji
                          ? 'border-pos-accent bg-pos-selected'
                          : 'border-pos-border bg-pos-surface'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-pos-divider">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 rounded-md text-xs font-bold text-pos-secondary hover:bg-pos-raised"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-pos-action hover:bg-pos-action-hover text-white rounded-md text-xs font-bold transition"
                >
                  Save
                </button>
              </div>
            </form>
            </fieldset>
        </Dialog>
      )}

      {/* STOCK ADJUSTMENT MODAL */}
      {isStockModalOpen && selectedStockProduct && (
        <Dialog label="Adjust stock" busy={isSaving || isDeleting} onClose={() => setIsStockModalOpen(false)} className="bg-pos-surface rounded-lg max-w-sm w-full p-6 max-h-[90dvh] overflow-y-auto border border-pos-border">
            {(moneyError || saveError) && <p role="alert" tabIndex={-1} className="mb-4 rounded bg-pos-danger-bg p-3 text-sm text-pos-danger-text">{moneyError || saveError}</p>}
            {isSaving && <p role="status" className="text-sm text-pos-muted mb-3">Saving changes...</p>}
            <fieldset disabled={isSaving || isDeleting} className="min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-pos-text">Adjust Stock</h3>
              <button
                onClick={() => setIsStockModalOpen(false)}
                aria-label="Close stock adjustment"
                className="p-1 text-pos-muted hover:text-pos-secondary rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-pos-muted mb-4">
              Adjust inventory quantity for{' '}
              <span className="font-bold text-pos-text">{selectedStockProduct.name}</span>.
            </p>
            <form onSubmit={handleStockAdjustSubmit} className="space-y-4">
              <div>
                <label htmlFor="manage-field-18" className="text-xs font-bold text-pos-secondary block mb-1 uppercase tracking-wider">
                  Type
                </label>
                <select id="manage-field-18"
                  value={stockType}
                  onChange={e => setStockType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-pos-inset border border-pos-control rounded-md text-xs focus-visible:border-pos-accent"
                >
                  <option value="restock">Restock (+ Stock)</option>
                  <option value="adjustment">Manual Adjustment (+ Stock)</option>
                  <option value="waste">Waste / Loss (- Stock)</option>
                </select>
              </div>
              <div>
                <label htmlFor="manage-field-19" className="text-xs font-bold text-pos-secondary block mb-1 uppercase tracking-wider">
                  Quantity
                </label>
                <input id="manage-field-19"
                  type="number"
                  value={stockChangeQty}
                  onChange={e => setStockChangeQty(e.target.value)}
                  className="w-full px-3 py-2 bg-pos-inset border border-pos-control rounded-md text-xs font-mono focus-visible:border-pos-accent"
                  required
                />
              </div>
              <div>
                <label htmlFor="manage-field-20" className="text-xs font-bold text-pos-secondary block mb-1 uppercase tracking-wider">
                  Reason
                </label>
                <input id="manage-field-20"
                  type="text"
                  value={stockReason}
                  onChange={e => setStockReason(e.target.value)}
                  className="w-full px-3 py-2 bg-pos-inset border border-pos-control rounded-md text-xs focus-visible:border-pos-accent"
                  required
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-pos-divider">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-4 py-2 rounded-md text-xs font-bold text-pos-secondary hover:bg-pos-raised"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-pos-strong hover:bg-pos-strong text-white rounded-md text-xs font-bold"
                >
                  Apply
                </button>
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
              <button
                onClick={() => setDeleteConfirmTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-md text-xs font-bold text-pos-secondary hover:bg-pos-raised transition"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-pos-danger-action hover:bg-pos-danger-hover text-white rounded-md text-xs font-bold transition"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
            </fieldset>
        </Dialog>
      )}
    </div>
  );
};
