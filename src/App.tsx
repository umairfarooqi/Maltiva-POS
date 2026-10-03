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
import { PosApi, SaleResult } from './services/api';
import { PendingOutbox } from './services/pendingOutbox';
import { PosStorage } from './services/storage';
import { DEFAULT_UNCATEGORIZED_CATEGORY, normalizeProduct } from './utils/normalizeProduct';
import {
  Product,
  Category,
  Order,
  User,
  CartItem,
  PrinterSettings,
  PaymentMethod,
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
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [recoveryError, setRecoveryError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Takeaway Cart & Active Checkout
  const initialDraft = useRef(PosStorage.getDraft());
  const [cart, setCart] = useState<CartItem[]>(initialDraft.current?.cart || []);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialDraft.current?.paymentMethod || 'cash');
  const checkoutAttempt = useRef<Order | undefined>(initialDraft.current?.attempt);
  const attemptCart = useRef(JSON.stringify(initialDraft.current?.cart || []));
  const checkoutRecoveryPending = useRef(Boolean(initialDraft.current?.attempt));
  const orderInFlight = useRef(checkoutRecoveryPending.current);
  const [saleFeedback, setSaleFeedback] = useState<SaleResult | null>(() => {
    const attempt = initialDraft.current?.attempt;
    return attempt?.persistenceState === 'rejected' ? { success: false, state: 'rejected', order: attempt, error: attempt.rejectionReason } : null;
  });
  const [orderSequence, setOrderSequence] = useState<number>(() => {
    return PosStorage.getOrders().length + 31;
  });
  const [isProcessingOrder, setIsProcessingOrder] = useState<boolean>(checkoutRecoveryPending.current);

  // Modals & Drawers
  const [variationModalProduct, setVariationModalProduct] = useState<Product | null>(null);
  const [receiptModalOrder, setReceiptModalOrder] = useState<Order | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState<boolean>(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const customerDisplayChannel = useRef<BroadcastChannel | null>(null);

  const reconcileCheckoutDraft = (recoveredOrders: Order[]) => {
    if (!checkoutRecoveryPending.current) return;
    const attempt = checkoutAttempt.current;
    const recovered = attempt && recoveredOrders.find(order =>
      (order.idempotencyKey || order.id) === (attempt.idempotencyKey || attempt.id));
    if (recovered?.persistenceState === 'saved' || recovered?.persistenceState === 'pending') {
      // This basket already belongs to a submitted sale. Do not restore it as a new editable cart.
      checkoutAttempt.current = undefined;
      attemptCart.current = '[]';
      PosStorage.clearDraft();
      setCart([]);
      setPaymentMethod('cash');
      setOrderSequence(previous => previous + 1);
      setSaleFeedback({ success: recovered.persistenceState === 'saved', state: recovered.persistenceState, order: recovered });
    } else if (recovered?.persistenceState === 'rejected') {
      checkoutAttempt.current = recovered;
      setSaleFeedback({ success: false, state: 'rejected', order: recovered, error: recovered.rejectionReason });
    }
    checkoutRecoveryPending.current = false;
    orderInFlight.current = false;
    setIsProcessingOrder(false);
  };

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
            persistenceState: receiptModalOrder.persistenceState,
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

  // Draft recovery is separate from the durable sale outbox.
  useEffect(() => {
    if (attemptCart.current !== JSON.stringify(cart)) {
      checkoutAttempt.current = undefined;
      setSaleFeedback(previous => previous?.state === 'rejected' ? null : previous);
    }
    try { PosStorage.setDraft({ cart, paymentMethod, attempt: checkoutAttempt.current }); }
    catch { setRecoveryError('Draft could not be stored. Keep this window open and review storage.'); }
  }, [cart, paymentMethod]);

  useEffect(() => {
    let active = true;
    const updateCount = async () => {
      try {
        const count = (await PendingOutbox.list()).length;
        if (active) setPendingOfflineCount(count);
      } catch { if (active) setRecoveryError('Recovery storage is unavailable. Existing pending sales are retained.'); }
    };
    const sync = () => { if (!orderInFlight.current) void handleManualSync(); };
    const onStorage = (event: StorageEvent) => { if (event.key === 'pos-outbox-update') void updateCount(); };
    window.addEventListener('online', sync);
    window.addEventListener('pos-outbox-changed', updateCount);
    window.addEventListener('storage', onStorage);
    void updateCount();
    PosApi.fetchInitialData().then(data => {
      if (!active) return;
      reconcileCheckoutDraft(data.orders);
      setCategories(data.categories);
      setProducts(data.products.map(normalizeProduct));
      setOrders(data.orders);
      setAllUsers(data.users);
      setPrinterSettings(data.printerSettings);
      setIsOnline(data.isOnline);
      sync();
    }).catch(() => { if (active) setRecoveryError('Could not load recovery data. Keep this window open and retry sync.'); });
    // Local server recovery does not depend on browser internet connectivity events.
    const timer = window.setInterval(sync, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('online', sync);
      window.removeEventListener('pos-outbox-changed', updateCount);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const handleManualSync = async () => {
    try {
      if (checkoutRecoveryPending.current) {
        const data = await PosApi.fetchInitialData();
        reconcileCheckoutDraft(data.orders);
      }
      const res = await PosApi.syncOfflineQueue();
      setPendingOfflineCount(res.pendingCount);
      setIsOnline(res.reachable);
      setOrders(PosStorage.getOrders());
      if (res.syncedCount > 0) {
        const data = await PosApi.fetchInitialData();
        setProducts(data.products.map(normalizeProduct));
        setOrders(data.orders);
        setReceiptModalOrder(previous => previous ? data.orders.find(order => order.id === previous.id) || previous : null);
        setSaleFeedback(previous => previous?.state === 'pending' && data.orders.some(order => order.id === previous.order.id && order.persistenceState === 'saved')
          ? { success: true, state: 'saved', order: data.orders.find(order => order.id === previous.order.id)! } : previous);
      }
      setRecoveryError('');
    } catch { setRecoveryError('Sync could not finish. Pending sales are retained; retry sync.'); }
  };

  // Login handler
  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    PosStorage.setSession(user);
    if (user.role === 'cashier') {
      setActiveTab('order_line'); // Cashier locked exclusively to Order Line
    }
  };

  // Logout / Lock Terminal handlers
  const handleLogout = () => {
    setIsLogoutConfirmOpen(true);
    setIsMobileSidebarOpen(false);
  };

  const confirmLogout = () => {
    setIsLogoutConfirmOpen(false);
    PosStorage.clearSession();
    setCurrentUser(null);
    setCart([]);
    checkoutAttempt.current = undefined;
    PosStorage.clearDraft();
    setSaleFeedback(null);
    setIsMobileSidebarOpen(false);
    setIsMobileCartOpen(false);
  };

  // Cart operations
  const handleQuickAddToCart = (product: Product) => {
    if (orderInFlight.current) return;
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
    if (orderInFlight.current) return;
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
    if (orderInFlight.current) return;
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
    if (orderInFlight.current) return;
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
    if (orderInFlight.current) return;
    setCart(prev => prev.filter(item => item.cartItemId !== cartItemId));
  };

  const handleClearCart = () => {
    if (orderInFlight.current) return;
    checkoutAttempt.current = undefined;
    setSaleFeedback(null);
    setCart([]);
  };

  // Place Takeaway Order & Generate 2 Slips
  const handlePlaceOrder = async (cashTendered: number, selectedPaymentMethod: PaymentMethod) => {
    if (cart.length === 0 || orderInFlight.current || !currentUser) return;

    const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
    const tax = Number(((subtotal * printerSettings.taxRatePercent) / 100).toFixed(2));
    const total = subtotal + tax;
    if (selectedPaymentMethod === 'cash' && cashTendered < total) return;

    orderInFlight.current = true;
    setIsProcessingOrder(true);

    const totalCost = cart.reduce((sum, item) => sum + item.totalCost, 0);
    const profit = total - totalCost; // Raw material cost vs customer price
    const profitMarginPercent = total > 0 ? (profit / total) * 100 : 0;

    const orderNum = `#F00${orderSequence}`;
    const tokenNum = orderSequence % 100 || orderSequence;

    let newOrder: Order = checkoutAttempt.current || {
      id: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      cashTendered: selectedPaymentMethod === 'cash' ? cashTendered : undefined,
      changeDue: selectedPaymentMethod === 'cash' ? cashTendered - total : 0,
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
      paymentMethod: selectedPaymentMethod,
      cashierId: currentUser.id,
      cashierName: currentUser.name,
      cashierRole: currentUser.role,
      createdAt: new Date().toISOString(),
      synced: false,
    };

    newOrder = { ...newOrder, paymentMethod: selectedPaymentMethod,
      cashTendered: selectedPaymentMethod === 'cash' ? cashTendered : undefined,
      changeDue: selectedPaymentMethod === 'cash' ? cashTendered - newOrder.total : 0 };
    checkoutAttempt.current = newOrder;
    attemptCart.current = JSON.stringify(cart);
    try {
      PosStorage.setDraft({ cart, paymentMethod: selectedPaymentMethod, attempt: newOrder });
      const result = await PosApi.placeOrder(newOrder, isOnline);
      if (result.state === 'rejected') {
        setSaleFeedback(result);
        checkoutAttempt.current = result.order;
        PosStorage.setDraft({ cart, paymentMethod: selectedPaymentMethod, attempt: result.order });
        return;
      }
      setOrders(PosStorage.getOrders());
      setPendingOfflineCount((await PendingOutbox.list()).length);
      setSaleFeedback(result);
      checkoutAttempt.current = undefined;
      PosStorage.clearDraft();
      setCart([]);
      setPaymentMethod('cash');
      setOrderSequence(prev => prev + 1);
      setIsMobileCartOpen(false);
      setReceiptModalOrder(result.order);
      if (result.state === 'saved') {
        // Refresh stock from the transaction that was acknowledged, without resubmitting it.
        const data = await PosApi.fetchInitialData();
        setProducts(data.products.map(normalizeProduct));
        setOrders(data.orders);
      }
    } catch {
      // A transport or storage exception may happen after submission. Resolve the same key before cart edits.
      checkoutRecoveryPending.current = true;
      setRecoveryError('Checkout could not finish. Keep this cart and retry sync before submitting another sale.');
    } finally {
      orderInFlight.current = checkoutRecoveryPending.current;
      setIsProcessingOrder(checkoutRecoveryPending.current);
    }
  };

  const handleReviewRejected = (order: Order) => {
    if (cart.length || orderInFlight.current) return;
    const restored = order.items.map(item => ({
      cartItemId: item.id,
      product: normalizeProduct({ ...(products.find(product => product.id === item.productId) || {}),
        id: item.productId, name: item.productName, categoryName: item.categoryName,
        price: item.unitPrice, costPrice: item.unitCost, bundledProducts: item.bundledProducts }),
      quantity: item.quantity, selectedVariations: item.selectedVariations, notes: item.notes,
      unitPrice: item.unitPrice, unitCost: item.unitCost, totalPrice: item.totalPrice, totalCost: item.totalCost,
    }));
    attemptCart.current = JSON.stringify(restored);
    checkoutAttempt.current = order;
    setCart(restored);
    setPaymentMethod(order.paymentMethod);
    setActiveTab('order_line');
    setSaleFeedback({ success: false, state: 'rejected', order, error: order.rejectionReason });
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
      persistenceState: 'draft',
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

  const pendingBadge = (
    <div role="status" aria-label="Pending sales" className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2 text-sm shrink-0">
      <span>{pendingOfflineCount} {pendingOfflineCount === 1 ? 'order' : 'orders'} waiting to sync</span>
      <button type="button" onClick={() => void handleManualSync()} className="font-semibold text-emerald-700">Retry sync</button>
    </div>
  );

  // IF NOT LOGGED IN: DISPLAY AUTHENTICATION GATEWAY
  if (!currentUser) {
    return (
      <>
      <div className="fixed top-0 inset-x-0 z-50">{pendingBadge}</div>
      <LoginScreen
        onLoginSuccess={handleLoginSuccess}
        availableUsers={allUsers}
        isOnline={isOnline}
        onAdminRegistered={handleAdminRegistered}
      />
      </>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#F8FAFA] font-sans antialiased text-slate-800">
      <div className="flex h-full w-full overflow-hidden">
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

        {pendingBadge}
        {recoveryError && <div role="alert" className="bg-amber-50 px-4 py-2 text-sm">{recoveryError}</div>}
        {saleFeedback && (
          <div role={saleFeedback.state === 'rejected' ? 'alert' : 'status'} aria-label="Sale result" className="bg-slate-50 px-4 py-2 text-sm shrink-0">
            {saleFeedback.state === 'saved' ? 'Saved — sale confirmed by the server.' : saleFeedback.state === 'pending'
              ? 'Pending — recovery copy stored; waiting for the server.' : `Rejected — ${saleFeedback.error}`}
            {saleFeedback.state === 'rejected' && <button type="button" disabled={isProcessingOrder} onClick={() => void handlePlaceOrder(saleFeedback.order.cashTendered ?? saleFeedback.order.total, paymentMethod)} className="ml-3 font-semibold text-emerald-700">Retry sale</button>}
          </div>
        )}
        {orders.filter(order => order.persistenceState === 'rejected' && order.id !== saleFeedback?.order.id).map(order => (
          <div key={order.id} role="alert" className="bg-amber-50 px-4 py-2 text-sm">
            Rejected {order.orderNumber}: {order.rejectionReason}
            <button type="button" disabled={cart.length > 0 || isProcessingOrder} onClick={() => handleReviewRejected(order)} className="ml-3 font-semibold text-emerald-700">Review rejected order {order.orderNumber}</button>
            {cart.length > 0 && <span className="ml-2">Finish or clear the current cart to review.</span>}
          </div>
        ))}

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
                paymentMethod={paymentMethod}
                onSelectPaymentMethod={setPaymentMethod}
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

      {isLogoutConfirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-confirm-title"
            aria-describedby="logout-confirm-description"
            className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6"
          >
            <h2 id="logout-confirm-title" className="mb-2 text-lg font-bold text-slate-900">
              Log out?
            </h2>
            <p id="logout-confirm-description" className="mb-6 text-sm text-slate-600">
              Are you sure you want to log out of this terminal?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsLogoutConfirmOpen(false)}
                className="rounded-md px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
