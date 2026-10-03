import { useState, useEffect, useRef } from 'react';
import { Sidebar, NavTab } from './components/Sidebar';
import { Header } from './components/Header';
import { OrderLineView } from './components/OrderLineView';
import { CartDrawer } from './components/CartDrawer';
import { ManageDishesView } from './components/ManageDishesView';
import { DashboardView } from './components/DashboardView';
import { ProfitLossView } from './components/ProfitLossView';
import { SettingsView } from './components/SettingsView';
import { VariationModal } from './components/VariationModal';
import { ThermalReceiptModal } from './components/ThermalReceiptModal';
import { LoginScreen } from './components/LoginScreen';
import { CustomerDisplayWindow } from './components/CustomerDisplayWindow';
import { PosApi } from './services/api';
import { PosStorage } from './services/storage';
import { DEFAULT_UNCATEGORIZED_CATEGORY, normalizeProduct } from './utils/normalizeProduct';
import {
  Product,
  Category,
  Order,
  User,
  CartItem,
  PrinterSettings,
  SelectedVariationItem,
} from './types/pos';

export default function App() {
  // Check if this window was opened as Customer Display for Dual-Screen POS hardware
  const isCustomerDisplay =
    typeof window !== 'undefined' &&
    (window.location.pathname.includes('customer-display') ||
      window.location.search.includes('customer-display'));

  if (isCustomerDisplay) {
    return <CustomerDisplayWindow />;
  }

  // Authentication & Role Session Gateway
  // App opens directly to Login Screen unless already actively logged in
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    return PosStorage.getSession();
  });

  const [allUsers, setAllUsers] = useState<User[]>(PosStorage.getUsers());

  // Navigation State
  const [activeTab, setActiveTab] = useState<NavTab>('order_line');

  // Core Data Store
  const [categories, setCategories] = useState<Category[]>(PosStorage.getCategories());
  const [products, setProducts] = useState<Product[]>(() => PosStorage.getProducts().map(normalizeProduct));
  const [orders, setOrders] = useState<Order[]>(PosStorage.getOrders());
  const [printerSettings, setPrinterSettings] = useState<PrinterSettings>(PosStorage.getPrinterSettings());

  // Connectivity & Sync
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingOfflineCount, setPendingOfflineCount] = useState<number>(
    PosStorage.getOfflineQueue().length
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Takeaway Cart & Active Checkout
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderSequence, setOrderSequence] = useState<number>(() => {
    return PosStorage.getOrders().length + 31;
  });
  const [isProcessingOrder, setIsProcessingOrder] = useState<boolean>(false);

  // Modals & Drawers
  const [variationModalProduct, setVariationModalProduct] = useState<Product | null>(null);
  const [receiptModalOrder, setReceiptModalOrder] = useState<Order | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState<boolean>(false);
  const customerDisplayChannel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    customerDisplayChannel.current = new BroadcastChannel('pos_customer_display');
    return () => {
      customerDisplayChannel.current?.close();
      customerDisplayChannel.current = null;
    };
  }, []);

  // Sync state with Customer Display on Secondary Screen
  useEffect(() => {
    const subtotal = cart.reduce((sum, it) => sum + it.totalPrice, 0);
    const tax = Number(((subtotal * printerSettings.taxRatePercent) / 100).toFixed(2));
    const total = subtotal + tax;

    const displayPayload = {
      cart,
      orderNumber: `#F00${orderSequence}`,
      tokenNumber: orderSequence % 100 || orderSequence,
      subtotal,
      tax,
      total,
      lastPlacedOrder: receiptModalOrder
        ? {
            orderNumber: receiptModalOrder.orderNumber,
            tokenNumber: receiptModalOrder.tokenNumber,
            total: receiptModalOrder.total,
          }
        : null,
    };

    try {
      const serializedPayload = JSON.stringify(displayPayload);
      localStorage.setItem('pos_customer_display_state', serializedPayload);
      customerDisplayChannel.current?.postMessage(displayPayload);
    } catch {
      // ignore
    }
  }, [cart, orderSequence, receiptModalOrder, printerSettings]);

  // Initial Data Fetch & Online/Offline Listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      handleManualSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    PosApi.fetchInitialData().then(data => {
      if (data.categories) setCategories(data.categories);
      if (data.products) {
        const validProducts = data.products.filter(
          product => product.name !== 'Untitled Dish' && Number(product.price) > 0
        );
        setProducts(validProducts.map(normalizeProduct));
      }
      if (data.orders) setOrders(data.orders);
      if (data.users) setAllUsers(data.users);
      if (data.printerSettings) setPrinterSettings(data.printerSettings);
      setIsOnline(data.isOnline);
      setPendingOfflineCount(PosStorage.getOfflineQueue().length);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Offline Queue Synchronizer
  const handleManualSync = async () => {
    const res = await PosApi.syncOfflineQueue();
    setPendingOfflineCount(PosStorage.getOfflineQueue().length);
    if (res.syncedCount > 0) {
      setProducts(PosStorage.getProducts().map(normalizeProduct));
      setOrders(PosStorage.getOrders());
    }
  };

  // Login handler
  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    PosStorage.setSession(user);
    if (user.role === 'cashier') {
      setActiveTab('order_line'); // Cashier locked exclusively to Order Line
    }
  };

  // Logout / Lock Terminal handler
  const handleLogout = () => {
    PosStorage.clearSession();
    setCurrentUser(null);
    setCart([]);
    setIsMobileSidebarOpen(false);
    setIsMobileCartOpen(false);
  };

  // Cart operations
  const handleQuickAddToCart = (product: Product) => {
    const unitPrice = product.price;
    const unitCost = product.costPrice || 0;
    setCart(prev => {
      const existingIdx = prev.findIndex(
        item => item.product.id === product.id && item.selectedVariations.length === 0
      );

      if (existingIdx !== -1) {
        const updated = [...prev];
        const existing = updated[existingIdx];
        const quantity = existing.quantity + 1;
        updated[existingIdx] = {
          ...existing,
          quantity,
          totalPrice: quantity * unitPrice,
          totalCost: quantity * unitCost,
        };
        return updated;
      }

      const newItem: CartItem = {
        cartItemId: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        product: normalizeProduct(product),
        quantity: 1,
        selectedVariations: [],
        unitPrice,
        unitCost,
        totalPrice: unitPrice,
        totalCost: unitCost,
      };
      return [...prev, newItem];
    });
  };

  const handleQuickDecrementFromCart = (product: Product) => {
    setCart(prev => {
      const existingIdx = prev.findIndex(
        item => item.product.id === product.id && item.selectedVariations.length === 0
      );
      if (existingIdx === -1) return prev;

      const updated = [...prev];
      const existing = updated[existingIdx];
      if (existing.quantity > 1) {
        const quantity = existing.quantity - 1;
        updated[existingIdx] = {
          ...existing,
          quantity,
          totalPrice: quantity * existing.unitPrice,
          totalCost: quantity * existing.unitCost,
        };
      } else {
        updated.splice(existingIdx, 1);
      }
      return updated;
    });
  };

  const handleAddVariationToCart = (
    product: Product,
    selectedVariations: SelectedVariationItem[],
    quantity: number
  ) => {
    const deltaPrice = selectedVariations.reduce((sum, v) => sum + v.priceDelta, 0);
    const deltaCost = selectedVariations.reduce((sum, v) => sum + v.costDelta, 0);

    const unitPrice = product.price + deltaPrice;
    const unitCost = (product.costPrice || 0) + deltaCost;

    const newItem: CartItem = {
      cartItemId: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      product,
      quantity,
      selectedVariations,
      unitPrice,
      unitCost,
      totalPrice: unitPrice * quantity,
      totalCost: unitCost * quantity,
    };

    setCart(prev => [...prev, newItem]);
    setVariationModalProduct(null);
  };

  const handleUpdateCartQuantity = (cartItemId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.cartItemId !== cartItemId) return item;
          const quantity = item.quantity + delta;
          if (quantity <= 0) return null;
          return {
            ...item,
            quantity,
            totalPrice: quantity * item.unitPrice,
            totalCost: quantity * item.unitCost,
          };
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleRemoveCartItem = (cartItemId: string) => {
    setCart(prev => prev.filter(item => item.cartItemId !== cartItemId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // Place Takeaway Order & Generate 2 Slips
  const handlePlaceOrder = async (cashTendered: number) => {
    if (cart.length === 0 || isProcessingOrder || !currentUser) return;

    const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
    const tax = Number(((subtotal * printerSettings.taxRatePercent) / 100).toFixed(2));
    const total = subtotal + tax;
    if (cashTendered < total) return;

    setIsProcessingOrder(true);

    const totalCost = cart.reduce((sum, item) => sum + item.totalCost, 0);
    const profit = total - totalCost; // Raw material cost vs customer price
    const profitMarginPercent = total > 0 ? (profit / total) * 100 : 0;

    const orderNum = `#F00${orderSequence}`;
    const tokenNum = orderSequence % 100 || orderSequence;

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber: orderNum,
      tokenNumber: tokenNum,
      customerName: 'Takeaway Customer',
      status: 'in_kitchen',
      orderType: 'take_away',
      items: cart.map(it => ({
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        productId: it.product.id,
        productName: it.product.name,
        categoryName: it.product.categoryName,
        unitPrice: it.unitPrice,
        unitCost: it.unitCost,
        quantity: it.quantity,
        totalPrice: it.totalPrice,
        totalCost: it.totalCost,
        selectedVariations: it.selectedVariations,
        notes: it.notes,
        bundledProducts: it.product.bundledProducts,
      })),
      subtotal,
      tax,
      discount: 0,
      total,
      totalCost,
      profit,
      profitMarginPercent,
      paymentMethod: 'cash',
      cashierId: currentUser.id,
      cashierName: currentUser.name,
      cashierRole: currentUser.role,
      createdAt: new Date().toISOString(),
      synced: isOnline,
      offlineQueueId: `offline-${Date.now()}`,
    };

    // Save order
    try {
      const result = await PosApi.placeOrder(newOrder, isOnline);
      setOrders(prev => [result.order, ...prev]);
      setProducts(PosStorage.getProducts().map(normalizeProduct));
      setCart([]);
      setOrderSequence(prev => prev + 1);
      setIsMobileCartOpen(false);
      setReceiptModalOrder(result.order);
    } finally {
      setIsProcessingOrder(false);
    }
  };

  // Open Preview Modal for existing or current cart
  const handleOpenPrintCurrentCart = () => {
    if (cart.length === 0 || !currentUser) return;
    const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
    const tax = Number(((subtotal * printerSettings.taxRatePercent) / 100).toFixed(2));
    const total = subtotal + tax;
    const totalCost = cart.reduce((sum, item) => sum + item.totalCost, 0);

    const tempOrder: Order = {
      id: 'preview-cart',
      orderNumber: `#F00${orderSequence}`,
      tokenNumber: orderSequence % 100 || orderSequence,
      customerName: currentUser?.name || 'Walk-in Customer',
      status: 'in_kitchen',
      orderType: 'take_away',
      items: cart.map(it => ({
        id: it.cartItemId,
        productId: it.product.id,
        productName: it.product.name,
        categoryName: it.product.categoryName,
        unitPrice: it.unitPrice,
        unitCost: it.unitCost,
        quantity: it.quantity,
        totalPrice: it.totalPrice,
        totalCost: it.totalCost,
        selectedVariations: it.selectedVariations,
        bundledProducts: it.product.bundledProducts,
      })),
      subtotal,
      tax,
      discount: 0,
      total,
      totalCost,
      profit: total - totalCost,
      profitMarginPercent: total > 0 ? ((total - totalCost) / total) * 100 : 0,
      paymentMethod: 'cash',
      cashierId: currentUser.id,
      cashierName: currentUser.name,
      cashierRole: currentUser.role,
      createdAt: new Date().toISOString(),
      synced: true,
    };

    setReceiptModalOrder(tempOrder);
  };

  // Admin CRUD Handlers
  const handleSaveProduct = async (productData: Partial<Product>) => {
    if (productData.id) {
      const existing = products.find(p => p.id === productData.id);
      const merged = normalizeProduct({ ...(existing || {}), ...productData });
      setProducts(prev => prev.map(product => product.id === merged.id ? merged : product));
      const updated = await PosApi.updateProduct(merged, isOnline);
      const normalizedUpdated = normalizeProduct(updated);
      setProducts(prev => prev.map(product => product.id === normalizedUpdated.id ? normalizedUpdated : product));
    } else {
      const created = normalizeProduct(productData);
      setProducts(prev => [created, ...prev]);
      const savedProduct = await PosApi.createProduct(created, isOnline);
      const normalizedSaved = normalizeProduct(savedProduct);
      setProducts(prev => [normalizedSaved, ...prev.filter(product => product.id !== created.id && product.id !== normalizedSaved.id)]);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    setProducts(prev => prev.filter(p => p.id !== productId));
    await PosApi.deleteProduct(productId, isOnline);
  };

  const handleSaveCategory = async (name: string, icon: string) => {
    const created = await PosApi.createCategory(name, icon, isOnline);
    setCategories(prev => [...prev, created]);
  };

  const handleUpdateCategory = async (category: Category) => {
    const updated = await PosApi.updateCategory(category, isOnline);
    setCategories(prev => prev.map(c => (c.id === updated.id ? updated : c)));
    setProducts(prev => prev.map(product =>
      product.categoryId === updated.id ? { ...product, categoryName: updated.name } : product
    ));
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (categoryId === DEFAULT_UNCATEGORIZED_CATEGORY.id) return;
    await PosApi.deleteCategory(categoryId, isOnline);
    setCategories(prev => {
      const next = prev.filter(category => category.id !== categoryId);
      return next.some(category => category.id === DEFAULT_UNCATEGORIZED_CATEGORY.id)
        ? next
        : [...next, DEFAULT_UNCATEGORIZED_CATEGORY];
    });
    setProducts(prev => prev.map(product =>
      product.categoryId === categoryId
        ? normalizeProduct({
            ...product,
            categoryId: DEFAULT_UNCATEGORIZED_CATEGORY.id,
            categoryName: DEFAULT_UNCATEGORIZED_CATEGORY.name,
          })
        : product
    ));
  };

  const handleAdjustStock = async (
    productId: string,
    changeAmount: number,
    reason: string,
    type: 'restock' | 'adjustment' | 'waste'
  ) => {
    if (!currentUser) return;
    const res = await PosApi.adjustStock(productId, changeAmount, reason, type, currentUser, isOnline);
    setProducts(prev => prev.map(p => (p.id === productId ? normalizeProduct(res.product) : p)));
  };

  const handleSaveSettings = (newSettings: PrinterSettings) => {
    setPrinterSettings(newSettings);
    PosStorage.setPrinterSettings(newSettings);
  };

  const handleUpdateCashierCredentials = (newUsername: string, newPin: string) => {
    const localUsers = [...allUsers];
    const cashierIdx = localUsers.findIndex(u => u.role === 'cashier');
    if (cashierIdx !== -1) {
      localUsers[cashierIdx].username = newUsername;
      localUsers[cashierIdx].pin = newPin;
      localUsers[cashierIdx].password = newPin;
      setAllUsers(localUsers);
      PosStorage.setUsers(localUsers);
    }
  };

  const handleAdminRegistered = (newAdmin: User) => {
    const updated = [newAdmin, ...allUsers];
    setAllUsers(updated);
    PosStorage.setUsers(updated);
    setCurrentUser(newAdmin);
    PosStorage.setSession(newAdmin);
  };

  // IF NOT LOGGED IN: DISPLAY AUTHENTICATION GATEWAY
  if (!currentUser) {
    return (
      <LoginScreen
        onLoginSuccess={handleLoginSuccess}
        availableUsers={allUsers}
        isOnline={isOnline}
        onAdminRegistered={handleAdminRegistered}
      />
    );
  }

  const isManageDishesTab = activeTab === 'manage_dishes';

  return (
    <div className={`w-screen h-screen overflow-hidden font-sans antialiased text-slate-800 ${
      isManageDishesTab ? 'bg-[#159F99] p-0 md:p-5 lg:p-7' : 'bg-[#F8FAFA]'
    }`}>
      <div className={`flex h-full w-full overflow-hidden ${
        isManageDishesTab ? 'rounded-xl bg-white shadow-2xl shadow-[#075F5A]/20' : ''
      }`}>
      {/* Sidebar: Role-gated */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={tab => {
          if (currentUser.role === 'cashier' && tab !== 'order_line') {
            return; // Lock cashier to order line
          }
          setActiveTab(tab);
        }}
        userRole={currentUser.role}
        userName={currentUser.name}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#F8FAFA]">
        {/* Top Header - Clean, No Search Bar, No Bell, No Next Token */}
        <Header
          currentUser={currentUser}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onOpenMobileCart={() => setIsMobileCartOpen(true)}
          cartItemCount={cart.reduce((sum, it) => sum + it.quantity, 0)}
        />

        {/* View Body */}
        <div className="flex-1 flex overflow-hidden">
          {activeTab === 'order_line' && (
            <>
              <OrderLineView
                products={products}
                categories={categories}
                cart={cart}
                onQuickAddToCart={handleQuickAddToCart}
                onQuickDecrementFromCart={handleQuickDecrementFromCart}
                onOpenVariationModal={setVariationModalProduct}
                onOpenMobileCart={() => setIsMobileCartOpen(true)}
              />
              <CartDrawer
                cart={cart}
                orderNumber={`#F00${orderSequence}`}
                tokenNumber={orderSequence % 100 || orderSequence}
                onUpdateQuantity={handleUpdateCartQuantity}
                onRemoveItem={handleRemoveCartItem}
                onClearCart={handleClearCart}
                taxRatePercent={printerSettings.taxRatePercent}
                onPlaceOrder={handlePlaceOrder}
                onOpenPrintModal={handleOpenPrintCurrentCart}
                isProcessing={isProcessingOrder}
                isMobileOpen={isMobileCartOpen}
                onCloseMobile={() => setIsMobileCartOpen(false)}
              />
            </>
          )}

          {activeTab === 'manage_dishes' && currentUser.role === 'admin' && (
            <ManageDishesView
              products={products}
              categories={categories}
              currentUser={currentUser}
              onSaveProduct={handleSaveProduct}
              onDeleteProduct={handleDeleteProduct}
              onSaveCategory={handleSaveCategory}
              onUpdateCategory={handleUpdateCategory}
              onDeleteCategory={handleDeleteCategory}
              onAdjustStock={handleAdjustStock}
            />
          )}

          {activeTab === 'dashboard' && currentUser.role === 'admin' && (
            <DashboardView
              orders={orders}
              products={products}
              currentUser={currentUser}
              onNavigateToTab={setActiveTab}
              onSelectOrderPreview={setReceiptModalOrder}
            />
          )}

          {activeTab === 'profit_loss' && currentUser.role === 'admin' && (
            <ProfitLossView
              orders={orders}
              products={products}
              categories={categories}
              userRole={currentUser.role}
            />
          )}

          {activeTab === 'settings' && currentUser.role === 'admin' && (
            <SettingsView
              settings={printerSettings}
              onSaveSettings={handleSaveSettings}
              currentUser={currentUser}
              onUpdateCashierCredentials={handleUpdateCashierCredentials}
              onOpenTestPrint={handleOpenPrintCurrentCart}
            />
          )}
        </div>
      </div>
      </div>

      {/* Variation Customizer Modal */}
      {variationModalProduct && (
        <VariationModal
          product={variationModalProduct}
          onClose={() => setVariationModalProduct(null)}
          onAddToCart={handleAddVariationToCart}
        />
      )}

      {/* Dual Slip Thermal Receipt Print Modal (Customer Slip + Kitchen Slip) */}
      {receiptModalOrder && (
        <ThermalReceiptModal
          order={receiptModalOrder}
          settings={printerSettings}
          onClose={() => setReceiptModalOrder(null)}
        />
      )}
    </div>
  );
}
