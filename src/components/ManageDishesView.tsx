import { parseRupees, rupeeText } from '../shared/money';
import React, { useState, useEffect } from 'react';
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

interface ManageDishesViewProps {
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
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    id: string;
    name: string;
    type: 'dish' | 'deal' | 'category';
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const handleOutsideClick = () => setOpenMenuProductId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
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
    setFormMinThreshold('5');
    setFormImage('https://images.unsplash.com/photo-1513104890138-7c749659a591?w=300&auto=format&fit=crop&q=80');
    setFormDescription('');
    setFormVariations([]);
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
            id: opt.id,
            name: `${g.name ? g.name + ': ' : ''}${opt.name}`,
            priceDeltaPaisa: opt.priceDeltaPaisa || 0,
            costDeltaPaisa: opt.costDeltaPaisa || 0,
          });
        });
      });
    }
    setFormVariations(flattened);
    setIsDishModalOpen(true);
  };

  const openCreateDealModal = () => {
    setEditingDeal(null);
    setDealName('');
    setDealCategoryId('cat-deals');
    setDealPrice('2199');
    setDealCostPrice('850');
    setDealStock('35');
    setDealMinThreshold('5');
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
    const packagedVariations: VariationGroup[] =
      formVariations.length > 0
        ? [
            {
              id: `vgroup-${Date.now()}`,
              name: 'Options & Variations',
              required: false,
              multiSelect: true,
              options: formVariations.map(opt => ({
                id: opt.id || `opt-${Math.random()}`,
                name: opt.name || 'Standard Option',
                priceDeltaPaisa: Number(opt.priceDeltaPaisa) || 0,
                costDeltaPaisa: Number(opt.costDeltaPaisa) || 0,
              })),
            },
          ]
        : [];

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
      variations: [],
    }); setIsDealModalOpen(false); }
    catch (error) { setSaveError((error as Error).message); }
  };

  const handleSaveCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = catNameInput.trim() || `Category ${categories.length}`;
    const cleanIcon = catIconInput.trim() || '🍽️';
    if (editingCategory) {
      await onUpdateCategory({ ...editingCategory, name: cleanName, icon: cleanIcon });
    } else {
      await onSaveCategory(cleanName, cleanIcon);
    }
    setIsCategoryModalOpen(false);
  };

  const handleDeleteCategoryClick = (catId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (catId === 'cat-all' || catId === 'cat-uncategorized') return;
    const cat = categories.find(c => c.id === catId);
    setDeleteConfirmTarget({ id: catId, name: cat?.name || 'Category', type: 'category' });
  };

  const handleExecuteDelete = async () => {
    if (!deleteConfirmTarget) return;
    setIsDeleting(true);
    try {
      if (deleteConfirmTarget.type === 'category') {
        setDeleteConfirmTarget(null);
        await onDeleteCategory(deleteConfirmTarget.id);
        if (selectedCategoryId === deleteConfirmTarget.id) setSelectedCategoryId('cat-all');
      } else {
        setDeleteConfirmTarget(null);
        await onDeleteProduct(deleteConfirmTarget.id);
      }
    } finally {
      setIsDeleting(false);
      setDeleteConfirmTarget(null);
    }
  };

  const handleStockAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStockProduct) return;
    const delta =
      stockType === 'waste'
        ? -Math.abs(parseInt(stockChangeQty, 10) || 1)
        : parseInt(stockChangeQty, 10) || 1;
    await onAdjustStock(selectedStockProduct.id, delta, stockReason, stockType);
    setIsStockModalOpen(false);
  };

  const addDynamicVariation = () => {
    setFormVariations(prev => [
      ...prev,
      { id: `opt-${Date.now()}`, name: '', priceDeltaPaisa: 0, costDeltaPaisa: 0 },
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
    <div className="flex-1 flex min-w-0 overflow-hidden bg-white">
      {/* COLUMN 1: Categories Sidebar */}
      <aside className="hidden md:flex w-72 shrink-0 flex-col justify-between border-r border-slate-200 bg-[#F8FAFA] px-3 py-5 select-none">
        <div>
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-sm font-bold text-slate-800 tracking-tight">Dish Categories</h2>
            <button
              onClick={openCreateCategoryModal}
              title="Add category"
              className="p-1.5 rounded-lg text-[#00A389] hover:bg-[#E6F7F5] transition cursor-pointer"
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
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`group relative w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-white text-[#008f83] border-[#00A389]'
                      : 'bg-white border-slate-200/70 text-slate-600 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3 truncate">
                    <span className="w-6 text-center text-base shrink-0">{cat.icon || '🍽'}</span>
                    <span className="truncate">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`min-w-5 text-center text-[10px] px-1.5 py-0.5 rounded-full font-mono transition-opacity ${
                        isSelected ? 'bg-[#00A389] text-white' : 'bg-slate-100 text-slate-500'
                      } ${cat.id !== 'cat-all' ? 'group-hover:opacity-0' : ''}`}
                    >
                      {actualCount}
                    </span>
                  </div>
                  {cat.id !== 'cat-all' && (
                      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md bg-white px-1 opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={e => openEditCategoryModal(cat, e)}
                          aria-label={`Edit ${cat.name}`}
                          className="p-1 text-slate-400 hover:text-[#00A389] transition"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={e => handleDeleteCategoryClick(cat.id, e)}
                          aria-label={`Delete ${cat.name}`}
                          className="p-1 text-slate-400 hover:text-rose-500 transition"
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
          className="w-full py-2.5 bg-[#008f77] hover:bg-[#007462] text-white rounded-md text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      </aside>

      {/* COLUMN 2: Manage Dishes Main Area */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden px-5 py-5 lg:px-7 select-none">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-100">
          <h1 className="text-lg font-semibold text-slate-900 tracking-tight">Manage Dishes</h1>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="relative w-full sm:w-56 lg:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search dishes or deals..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-md text-xs focus-visible:border-[#008f77] transition-colors"
              />
            </div>
            <button
              onClick={openCreateDealModal}
              className="px-3.5 py-2.5 bg-white border border-amber-200 hover:bg-amber-50 text-amber-800 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              Create Deal
            </button>
            <button
              onClick={openCreateDishModal}
              className="px-3.5 py-2.5 bg-[#008f77] hover:bg-[#007462] text-white rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add New Dish
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {activeCategory.name} <span className="text-sm font-medium text-slate-400">({categoryProducts.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-white p-0.5 rounded-lg border border-slate-200">
              <button
                onClick={() => setViewMode('grid')}
                title="Grid view"
                className={`p-1.5 rounded-md transition ${
                  viewMode === 'grid' ? 'bg-slate-100 text-[#00A389]' : 'text-slate-400'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                title="List view"
                className={`p-1.5 rounded-md transition ${
                  viewMode === 'list' ? 'bg-slate-100 text-[#00A389]' : 'text-slate-400'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-2 scrollbar-none">
          {categoryProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-10 bg-white rounded-lg border border-dashed border-slate-300">
              <Package className="w-12 h-12 text-slate-200 mb-3" />
              <p className="text-sm font-semibold text-slate-600">No dishes found in this category</p>
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
                    className="bg-white rounded-md p-2 border border-slate-200 hover:border-slate-300 transition-colors group relative cursor-pointer flex flex-col"
                    onClick={() =>
                      product.isDeal ? openEditDealModal(product) : openEditDishModal(product)
                    }
                  >
                    <div className="relative mb-2 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-50 ring-1 ring-slate-100">
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
                      </div>
                      {product.isDeal && (
                        <span className="absolute top-0 left-0 z-10 rounded-full border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[8px] font-black uppercase text-amber-800">
                          Deal
                        </span>
                      )}
                      <div className="absolute top-0 right-0 z-20">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setOpenMenuProductId(product.id);
                          }}
                          className="p-1.5 rounded-full bg-white text-slate-400 hover:text-slate-900 transition cursor-pointer z-10"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {openMenuProductId === product.id && (
                          <div
                            className="absolute right-0 mt-1 w-48 bg-white rounded-md border border-slate-200 z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                product.isDeal
                                  ? openEditDealModal(product)
                                  : openEditDishModal(product);
                              }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4 text-slate-400" />
                              <span>Edit Product</span>
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedStockProduct(product);
                                setIsStockModalOpen(true);
                              }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer"
                            >
                              <Package className="w-4 h-4 text-slate-400" />
                              <span>Adjust Stock</span>
                            </button>
                            <div className="h-px bg-slate-100 my-1" />
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setDeleteConfirmTarget({
                                  id: product.id,
                                  name: product.name,
                                  type: product.isDeal ? 'deal' : 'dish',
                                });
                              }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-rose-500 hover:bg-rose-50 transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>Delete Product</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mb-2">
                      {!product.isDeal && (
                        <span className="mb-1 inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full bg-teal-50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-teal-800 ring-1 ring-teal-100">
                          {product.categoryName}
                        </span>
                      )}
                      <h3 className="min-h-7 line-clamp-2 text-[11px] font-semibold leading-[14px] text-slate-900">
                        {product.name}
                      </h3>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-400">Selling Price</span>
                        <span className="text-xs font-bold text-slate-900">
                          {formatPKR(safePrice)}
                        </span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-[9px] text-slate-400">Margin</span>
                        <span
                          className={`text-xs font-bold ${
                            margin > 40 ? 'text-emerald-600' : 'text-amber-600'
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
                    className="bg-white p-4 rounded-lg border border-slate-200 flex items-center justify-between group hover:border-slate-300 transition cursor-pointer"
                    onClick={() =>
                      product.isDeal ? openEditDealModal(product) : openEditDishModal(product)
                    }
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-md overflow-hidden bg-slate-50">
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
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{product.name}</h3>
                        <span className="text-xs text-slate-400">{product.categoryName}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-8">
                      <span className="text-sm font-bold text-slate-900">
                        {formatPKR(safePrice)}
                      </span>
                      <button className="p-2 text-slate-400 hover:text-slate-900 transition">
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

      {/* DISH MODAL */}
      {isDishModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-lg max-w-3xl w-full p-6 border border-slate-200 max-h-[90vh] overflow-y-auto scrollbar-none">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900">
                {editingProduct ? 'Edit Dish' : 'Add New Dish'}
              </h3>
              <button
                onClick={() => setIsDishModalOpen(false)}
                aria-label="Close dish editor"
                className="p-2 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSaveDish} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-5">
                <div className="group">
                  <label className="text-xs font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                    Dish Name
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-md text-sm focus-visible:border-[#008f77]"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="group">
                    <label className="text-xs font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                      Category
                    </label>
                    <select
                      value={formCategoryId}
                      onChange={e => setFormCategoryId(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-md text-sm focus-visible:border-[#008f77] cursor-pointer"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="group">
                    <label className="text-xs font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                      Selling Price (PKR)
                    </label>
                    <input
                      type="number"
                      value={formPrice}
                      onChange={e => { setFormPrice(e.target.value); setMoneyError(''); } }
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-md text-sm font-mono focus-visible:border-[#008f77]"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="group">
                    <label className="text-xs font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                      Cost Price (PKR)
                    </label>
                    <input
                      type="number"
                      value={formCostPrice}
                      onChange={e => { setFormCostPrice(e.target.value); setMoneyError(''); } }
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-md text-sm font-mono focus-visible:border-[#008f77]"
                    />
                  </div>
                  <div className="group">
                    <label className="text-xs font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                      Initial Stock
                    </label>
                    <input
                      type="number"
                      value={formStock}
                      onChange={e => setFormStock(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-md text-sm font-mono focus-visible:border-[#008f77]"
                    />
                  </div>
                </div>
                <div className="group">
                  <label className="text-xs font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                    Image URL
                  </label>
                  <input
                    type="text"
                    value={formImage}
                    onChange={e => setFormImage(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-md text-sm focus-visible:border-[#008f77]"
                  />
                </div>
                <div className="group">
                  <label className="text-xs font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                    Description
                  </label>
                  <textarea
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-md text-sm focus-visible:border-[#008f77]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="p-5 bg-emerald-50 rounded-md border border-emerald-200 flex flex-col items-center justify-center text-center space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900">
                    <TrendingUp className="w-5 h-5" />
                    <span className="text-sm font-bold">Estimated Profit</span>
                  </div>
                  <div className="text-3xl font-black text-emerald-600">
                    {formatPKR((parseRupees(formPrice) || 0) - (parseRupees(formCostPrice) || 0))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Variations & Add-ons
                    </label>
                    <button
                      type="button"
                      onClick={addDynamicVariation}
                      className="text-xs font-bold text-[#00A389] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Option
                    </button>
                  </div>

                  <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                    {formVariations.map((v, idx) => (
                      <div
                        key={v.id || idx}
                        className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-md border border-slate-300"
                      >
                        <input
                          type="text"
                          placeholder="Option Name (e.g., Extra Cheese)"
                          value={v.name}
                          onChange={e => {
                            const updated = [...formVariations];
                            updated[idx].name = e.target.value;
                            setFormVariations(updated);
                          }}
                          className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs focus-visible:border-[#008f77]"
                        />
                        <input
                          type="number"
                          placeholder="+Price"
                          value={v.priceDeltaPaisa}
                          onChange={e => {
                            const updated = [...formVariations];
                            try { updated[idx].priceDeltaPaisa = parseRupees(e.target.value || '0', true); setMoneyError(''); }
                            catch (error) { setMoneyError((error as Error).message); return; }
                            setFormVariations(updated);
                          }}
                          className="w-20 px-2 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-mono focus-visible:border-[#008f77]"
                        />
                        <button
                          type="button"
                          onClick={() => removeDynamicVariation(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-500 transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsDishModalOpen(false)}
                    className="px-5 py-2.5 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-[#008f77] hover:bg-[#007462] text-white rounded-md text-xs font-bold transition cursor-pointer"
                  >
                    Save Dish
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {(moneyError || saveError) && <p role="alert" className="fixed bottom-4 left-4 z-[60] rounded bg-rose-50 p-3 text-sm text-rose-700">{moneyError || saveError}</p>}
      {/* DEAL MODAL */}
      {isDealModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-lg max-w-3xl w-full p-6 border border-slate-200 max-h-[90vh] overflow-y-auto scrollbar-none">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900">
                {editingDeal ? 'Edit Deal' : 'Create New Deal'}
              </h3>
              <button
                onClick={() => setIsDealModalOpen(false)}
                aria-label="Close deal editor"
                className="p-2 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSaveDeal} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-5">
                <div className="group">
                  <label className="text-xs font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                    Deal Title
                  </label>
                  <input
                    type="text"
                    value={dealName}
                    onChange={e => setDealName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-md text-sm focus-visible:border-[#008f77]"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="group">
                    <label className="text-xs font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                      Deal Price (PKR)
                    </label>
                    <input
                      type="number"
                      value={dealPrice}
                      onChange={e => { setDealPrice(e.target.value); setMoneyError(''); } }
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-md text-sm font-mono focus-visible:border-[#008f77]"
                      required
                    />
                  </div>
                  <div className="group">
                    <label className="text-xs font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                      Estimated Cost
                    </label>
                    <input
                      type="number"
                      value={dealCostPrice}
                      onChange={e => { setDealCostPrice(e.target.value); setMoneyError(''); } }
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-md text-sm font-mono focus-visible:border-[#008f77]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="group">
                    <label className="text-xs font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                      Stock Available
                    </label>
                    <input
                      type="number"
                      value={dealStock}
                      onChange={e => setDealStock(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-md text-sm font-mono focus-visible:border-[#008f77]"
                    />
                  </div>
                  <div className="group">
                    <label className="text-xs font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                      Image URL
                    </label>
                    <input
                      type="text"
                      value={dealImage}
                      onChange={e => setDealImage(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-md text-sm focus-visible:border-[#008f77]"
                    />
                  </div>
                </div>
                <div className="group">
                  <label className="text-xs font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                    Description
                  </label>
                  <textarea
                    value={dealDescription}
                    onChange={e => setDealDescription(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-md text-sm focus-visible:border-[#008f77]"
                  />
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-2 uppercase tracking-wider">
                    Bundled Items
                  </label>

                  <div className="flex items-center gap-2 mb-3">
                    <select
                      value={selectedProductToAdd}
                      onChange={e => setSelectedProductToAdd(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs focus-visible:border-[#008f77]"
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
                      className="px-3 py-2 bg-slate-900 text-white rounded-md text-xs font-bold hover:bg-slate-800 transition cursor-pointer"
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
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs focus-visible:border-[#008f77]"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomItemToDeal}
                      className="px-3 py-2 bg-slate-900 text-white rounded-md text-xs font-bold hover:bg-slate-800 transition cursor-pointer"
                    >
                      Custom
                    </button>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {dealBundledItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-slate-50 p-2.5 rounded-md border border-slate-300 text-xs"
                      >
                        <span className="font-medium text-slate-800 truncate max-w-[150px]">
                          {item.productName}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateDealItemQty(idx, -1)}
                            className="p-1 text-slate-400 hover:text-slate-800"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold text-slate-900 w-4 text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateDealItemQty(idx, 1)}
                            className="p-1 text-slate-400 hover:text-slate-800"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveDealItem(idx)}
                            className="p-1 text-rose-400 hover:text-rose-600 ml-2"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {dealBundledItems.length === 0 && (
                      <p className="text-xs text-slate-500 text-center py-4 bg-slate-50 rounded-md border border-dashed border-slate-300">
                        No items added to deal yet.
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsDealModalOpen(false)}
                    className="px-5 py-2.5 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-[#008f77] hover:bg-[#007462] text-white rounded-md text-xs font-bold transition cursor-pointer"
                  >
                    Save Deal
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CATEGORY MODAL */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-lg max-w-sm w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900">
                {editingCategory ? 'Edit Category' : 'New Category'}
              </h3>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                aria-label="Close category editor"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveCategorySubmit} className="space-y-4">
              <div>
                <label htmlFor="category-name-input" className="text-xs font-bold text-slate-600 block mb-1 uppercase tracking-wider">
                  Category Name
                </label>
                <input
                  id="category-name-input"
                  type="text"
                  value={catNameInput}
                  onChange={e => setCatNameInput(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-md text-xs focus-visible:border-[#008f77]"
                  required
                />
              </div>
              <div>
                <label htmlFor="category-icon-input" className="text-xs font-bold text-slate-600 block mb-1 uppercase tracking-wider">
                  Icon Emoji
                </label>
                <input
                  id="category-icon-input"
                  type="text"
                  value={catIconInput}
                  onChange={e => setCatIconInput(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-md text-lg text-center focus-visible:border-[#008f77]"
                  required
                />
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {FAST_FOOD_CATEGORY_EMOJIS.map(({ emoji, label }) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setCatIconInput(emoji)}
                      aria-label={`Use ${label} emoji`}
                      className={`h-10 rounded-md border text-lg transition hover:border-[#00A389] hover:bg-[#E6F7F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A389] ${
                        catIconInput === emoji
                          ? 'border-[#00A389] bg-[#E6F7F5]'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#008f77] hover:bg-[#007462] text-white rounded-md text-xs font-bold transition"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STOCK ADJUSTMENT MODAL */}
      {isStockModalOpen && selectedStockProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-lg max-w-sm w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Adjust Stock</h3>
              <button
                onClick={() => setIsStockModalOpen(false)}
                aria-label="Close stock adjustment"
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Adjust inventory quantity for{' '}
              <span className="font-bold text-slate-800">{selectedStockProduct.name}</span>.
            </p>
            <form onSubmit={handleStockAdjustSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1 uppercase tracking-wider">
                  Type
                </label>
                <select
                  value={stockType}
                  onChange={e => setStockType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs focus-visible:border-[#008f77]"
                >
                  <option value="restock">Restock (+ Stock)</option>
                  <option value="adjustment">Manual Adjustment (+ Stock)</option>
                  <option value="waste">Waste / Loss (- Stock)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1 uppercase tracking-wider">
                  Quantity
                </label>
                <input
                  type="number"
                  value={stockChangeQty}
                  onChange={e => setStockChangeQty(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono focus-visible:border-[#008f77]"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1 uppercase tracking-wider">
                  Reason
                </label>
                <input
                  type="text"
                  value={stockReason}
                  onChange={e => setStockReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs focus-visible:border-[#008f77]"
                  required
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-4 py-2 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-bold"
                >
                  Apply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-lg max-w-sm w-full p-6 border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-md bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Are you sure?</h3>
            <p className="text-xs text-slate-500 mb-6">
              You are about to delete{' '}
              <span className="font-bold text-slate-800">"{deleteConfirmTarget.name}"</span>. This action cannot be undone.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setDeleteConfirmTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-md text-xs font-bold transition"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
