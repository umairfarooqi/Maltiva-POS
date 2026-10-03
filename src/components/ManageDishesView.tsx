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
  priceDelta: number;
  costDelta: number;
}

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
    setFormPrice(product.price != null && !isNaN(product.price) ? product.price.toString() : '');
    setFormCostPrice(product.costPrice != null && !isNaN(product.costPrice) ? product.costPrice.toString() : '');
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
            priceDelta: opt.priceDelta || 0,
            costDelta: opt.costDelta || 0,
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
    setDealPrice(dealProduct.price != null && !isNaN(dealProduct.price) ? dealProduct.price.toString() : '');
    setDealCostPrice(dealProduct.costPrice != null && !isNaN(dealProduct.costPrice) ? dealProduct.costPrice.toString() : '');
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
                priceDelta: Number(opt.priceDelta) || 0,
                costDelta: Number(opt.costDelta) || 0,
              })),
            },
          ]
        : [];

    const parsedPrice = parseFloat(formPrice);
    const parsedCost = parseFloat(formCostPrice);
    const parsedStock = parseInt(formStock, 10);
    const parsedMinThreshold = parseInt(formMinThreshold, 10);

    const finalPrice = !isNaN(parsedPrice) ? parsedPrice : (editingProduct?.price ?? 0);
    const finalCost = !isNaN(parsedCost) ? parsedCost : (editingProduct?.costPrice ?? 0);
    const finalImage =
      formImage.trim() ||
      editingProduct?.image ||
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&auto=format&fit=crop&q=80';

    await onSaveProduct({
      id: editingProduct?.id,
      name: formName.trim() || editingProduct?.name || 'Maltiva Special Dish',
      categoryId: formCategoryId || editingProduct?.categoryId || 'cat-special',
      categoryName: category?.name || editingProduct?.categoryName || 'Special Dishes',
      price: finalPrice,
      costPrice: finalCost,
      stockQuantity: !isNaN(parsedStock) ? parsedStock : (editingProduct?.stockQuantity ?? 25),
      minStockThreshold: !isNaN(parsedMinThreshold) ? parsedMinThreshold : (editingProduct?.minStockThreshold ?? 5),
      image: finalImage,
      description: formDescription,
      isDeal: false,
      variations: packagedVariations,
    });
    setIsDishModalOpen(false);
  };

  const handleSaveDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    const category = categories.find(c => c.id === dealCategoryId) || {
      name: 'Deals & Combos',
      id: 'cat-deals',
    };

    const parsedPrice = parseFloat(dealPrice);
    const parsedCost = parseFloat(dealCostPrice);
    const parsedStock = parseInt(dealStock, 10);
    const parsedMinThreshold = parseInt(dealMinThreshold, 10);

    const finalPrice = !isNaN(parsedPrice) ? parsedPrice : (editingDeal?.price ?? 0);
    const finalCost = !isNaN(parsedCost) ? parsedCost : (editingDeal?.costPrice ?? 0);
    const finalImage =
      dealImage.trim() ||
      editingDeal?.image ||
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=300&auto=format&fit=crop&q=80';

    await onSaveProduct({
      id: editingDeal?.id,
      name: dealName.trim() || editingDeal?.name || 'Maltiva Mega Combo Deal',
      categoryId: dealCategoryId || editingDeal?.categoryId || 'cat-deals',
      categoryName: category.name,
      price: finalPrice,
      costPrice: finalCost,
      stockQuantity: !isNaN(parsedStock) ? parsedStock : (editingDeal?.stockQuantity ?? 30),
      minStockThreshold: !isNaN(parsedMinThreshold) ? parsedMinThreshold : (editingDeal?.minStockThreshold ?? 5),
      image: finalImage,
      description: dealDescription,
      isDeal: true,
      bundledProducts: dealBundledItems,
      variations: [],
    });
    setIsDealModalOpen(false);
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
        await onDeleteCategory(deleteConfirmTarget.id);
        if (selectedCategoryId === deleteConfirmTarget.id) setSelectedCategoryId('cat-all');
      } else {
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
      { id: `opt-${Date.now()}`, name: '', priceDelta: 0, costDelta: 0 },
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
        { productId: prod.id, productName: prod.name, quantity: 1, unitPrice: prod.price },
      ]);
    }
    setSelectedProductToAdd('');
  };

  const handleAddCustomItemToDeal = () => {
    if (!customItemInput.trim()) return;
    setDealBundledItems(prev => [
      ...prev,
      { productName: customItemInput.trim(), quantity: 1, unitPrice: 0 },
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
    <div className="flex-1 flex overflow-hidden bg-[#F8FAFA]">
      {/* COLUMN 1: Categories Sidebar */}
      <div className="hidden md:flex w-72 bg-white border-r border-slate-100 flex-col justify-between shrink-0 p-6 select-none">
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-bold text-slate-800 tracking-tight">Categories</h2>
            <button
              onClick={openCreateCategoryModal}
              className="p-1.5 rounded-lg text-[#00A389] hover:bg-[#E6F7F5] transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-1 scrollbar-none">
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
                  className={`group w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-semibold cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#E6F7F5] text-[#00A389] border border-[#00A389]/20 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <span className="text-lg shrink-0">{cat.icon || '🍽'}</span>
                    <span className="truncate">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                        isSelected ? 'bg-[#00A389] text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {actualCount}
                    </span>
                    {cat.id !== 'cat-all' && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        <button
                          onClick={e => openEditCategoryModal(cat, e)}
                          className="p-1 text-slate-400 hover:text-[#00A389] transition"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={e => handleDeleteCategoryClick(cat.id, e)}
                          className="p-1 text-slate-400 hover:text-rose-500 transition"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <button
          onClick={openCreateCategoryModal}
          className="w-full py-3 bg-[#00A389] hover:bg-[#008f77] text-white rounded-2xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#00A389]/20"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      </div>

      {/* COLUMN 2: Manage Dishes Main Area */}
      <div className="flex-1 flex flex-col overflow-hidden p-8 space-y-6 select-none">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search dishes or deals..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs focus:ring-2 focus:ring-[#00A389]/20 focus:border-[#00A389] outline-none transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={openCreateDealModal}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-xs font-bold transition shadow-md shadow-amber-500/20 cursor-pointer flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              Create Deal
            </button>
            <button
              onClick={openCreateDishModal}
              className="px-4 py-2.5 bg-[#00A389] hover:bg-[#008f77] text-white rounded-2xl text-xs font-bold transition shadow-md shadow-[#00A389]/20 cursor-pointer flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add New Dish
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">
            {activeCategory.name} ({categoryProducts.length})
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-white p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition ${
                  viewMode === 'grid' ? 'bg-slate-100 text-[#00A389]' : 'text-slate-400'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition ${
                  viewMode === 'list' ? 'bg-slate-100 text-[#00A389]' : 'text-slate-400'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 scrollbar-none">
          {categoryProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-10 bg-white rounded-3xl border border-dashed border-slate-200">
              <Package className="w-12 h-12 text-slate-200 mb-3" />
              <p className="text-sm font-semibold text-slate-600">No dishes found in this category</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
              {categoryProducts.map(product => {
                const safePrice = Number(product.price) || 0;
                const safeCost = Number(product.costPrice) || 0;
                const margin =
                  safePrice > 0 ? ((safePrice - safeCost) / safePrice) * 100 : 0;

                return (
                  <div
                    key={product.id}
                    className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-all group relative cursor-pointer"
                    onClick={() =>
                      product.isDeal ? openEditDealModal(product) : openEditDishModal(product)
                    }
                  >
                    <div className="relative mb-4 flex items-center justify-center">
                      <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-50 shadow-inner">
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
                        <span className="absolute -top-2 -right-2 px-2 py-1 rounded-lg bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider shadow-sm">
                          Deal
                        </span>
                      )}
                      <div className="absolute top-0 right-0">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setOpenMenuProductId(product.id);
                          }}
                          className="p-1.5 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-900 transition cursor-pointer shadow-sm z-10"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {openMenuProductId === product.id && (
                          <div
                            className="absolute right-0 mt-1 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200"
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

                    <div className="space-y-1 mb-4">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {product.categoryName}
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 truncate">{product.name}</h3>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-400">Selling Price</span>
                        <span className="text-sm font-black text-slate-900">
                          {formatPKR(safePrice)}
                        </span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-xs text-slate-400">Margin</span>
                        <span
                          className={`text-sm font-bold ${
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
              {categoryProducts.map(product => {
                const safePrice = Number(product.price) || 0;
                return (
                  <div
                    key={product.id}
                    className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between group hover:border-slate-300 transition cursor-pointer"
                    onClick={() =>
                      product.isDeal ? openEditDealModal(product) : openEditDishModal(product)
                    }
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-50">
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
      </div>

      {/* DISH MODAL */}
      {isDishModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl p-8 border border-slate-100 max-h-[90vh] overflow-y-auto scrollbar-none">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-bold text-slate-900">
                {editingProduct ? 'Edit Dish' : 'Add New Dish'}
              </h3>
              <button
                onClick={() => setIsDishModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSaveDish} className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              <div className="space-y-5">
                <div className="group">
                  <label className="text-xs font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                    Dish Name
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#00A389]/20 focus:border-[#00A389] outline-none transition-all"
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
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#00A389]/20 focus:border-[#00A389] outline-none transition-all cursor-pointer"
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
                      onChange={e => setFormPrice(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono focus:ring-2 focus:ring-[#00A389]/20 focus:border-[#00A389] outline-none transition-all"
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
                      onChange={e => setFormCostPrice(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono focus:ring-2 focus:ring-[#00A389]/20 focus:border-[#00A389] outline-none transition-all"
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
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono focus:ring-2 focus:ring-[#00A389]/20 focus:border-[#00A389] outline-none transition-all"
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
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#00A389]/20 focus:border-[#00A389] outline-none transition-all"
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
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#00A389]/20 focus:border-[#00A389] outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100 flex flex-col items-center justify-center text-center space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900">
                    <TrendingUp className="w-5 h-5" />
                    <span className="text-sm font-bold">Estimated Profit</span>
                  </div>
                  <div className="text-3xl font-black text-emerald-600">
                    {formatPKR((parseFloat(formPrice) || 0) - (parseFloat(formCostPrice) || 0))}
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
                        className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-200"
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
                          className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-[#00A389]"
                        />
                        <input
                          type="number"
                          placeholder="+Price"
                          value={v.priceDelta}
                          onChange={e => {
                            const updated = [...formVariations];
                            updated[idx].priceDelta = parseFloat(e.target.value) || 0;
                            setFormVariations(updated);
                          }}
                          className="w-20 px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-none focus:border-[#00A389]"
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
                    className="px-5 py-2.5 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-[#00A389] hover:bg-[#008f77] text-white rounded-2xl text-xs font-bold transition shadow-lg shadow-[#00A389]/20 cursor-pointer"
                  >
                    Save Dish
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEAL MODAL */}
      {isDealModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl p-8 border border-slate-100 max-h-[90vh] overflow-y-auto scrollbar-none">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-bold text-slate-900">
                {editingDeal ? 'Edit Deal' : 'Create New Deal'}
              </h3>
              <button
                onClick={() => setIsDealModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSaveDeal} className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              <div className="space-y-5">
                <div className="group">
                  <label className="text-xs font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                    Deal Title
                  </label>
                  <input
                    type="text"
                    value={dealName}
                    onChange={e => setDealName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
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
                      onChange={e => setDealPrice(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
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
                      onChange={e => setDealCostPrice(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
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
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
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
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
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
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
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
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500/20 outline-none"
                    >
                      <option value="">Select Existing Dish...</option>
                      {products
                        .filter(p => !p.isDeal)
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({formatPKR(p.price)})
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddProductToDeal}
                      className="px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition cursor-pointer"
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
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomItemToDeal}
                      className="px-3 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 transition cursor-pointer"
                    >
                      Custom
                    </button>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {dealBundledItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs"
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
                      <p className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        No items added to deal yet.
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsDealModalOpen(false)}
                    className="px-5 py-2.5 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-xs font-bold transition shadow-lg shadow-amber-500/20 cursor-pointer"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl p-6 border border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900">
                {editingCategory ? 'Edit Category' : 'New Category'}
              </h3>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveCategorySubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1 uppercase tracking-wider">
                  Category Name
                </label>
                <input
                  type="text"
                  value={catNameInput}
                  onChange={e => setCatNameInput(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#00A389]/20 outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1 uppercase tracking-wider">
                  Icon Emoji
                </label>
                <input
                  type="text"
                  value={catIconInput}
                  onChange={e => setCatIconInput(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-lg text-center focus:ring-2 focus:ring-[#00A389]/20 outline-none"
                  required
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#00A389] hover:bg-[#008f77] text-white rounded-xl text-xs font-bold transition shadow-md shadow-[#00A389]/20"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl p-6 border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Adjust Stock</h3>
              <button
                onClick={() => setIsStockModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-full"
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
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none"
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
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none"
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
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none"
                  required
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl p-6 border border-slate-100 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4">
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
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition shadow-md shadow-rose-500/20"
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