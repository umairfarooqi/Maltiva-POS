import { computeTotals } from './shared/money';
import { formatPKR } from './utils/formatCurrency';
import { useState, useEffect, useRef } from 'react';
import { Sidebar, NavTab } from './components/Sidebar';
import { Header } from './components/Header';
import { OrderLineView } from './components/OrderLineView';
import { Dialog } from './components/ui/Dialog';
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
  const [cartError, setCartError] = useState('');
  const [editingCartItem, setEditingCartItem] = useState<CartItem | undefined>();
  const [variationModalProduct, setVariationModalProduct] = useState<Product | null>(null);
  const [customerConfirmation, setCustomerConfirmation] = useState<Order | null>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('pos_customer_confirmation') || 'null');
      return stored?.id && ['saved', 'pending', 'rejected'].includes(stored.persistenceState) ? stored : null;
    } catch { return null; }
  });
  const [autoPrintOrderId, setAutoPrintOrderId] = useState<string | null>(null);
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
      setCustomerConfirmation(recovered);
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
    const totals = computeTotals(cart, printerSettings);
    const { subtotalPaisa, taxPaisa, totalPaisa } = totals;

    const displayPayload = {
      settings: printerSettings,
      cart,
      orderNumber: `#F00${orderSequence}`,
      tokenNumber: orderSequence % 100 || orderSequence,
      subtotalPaisa,
      taxPaisa,
      totalPaisa,
      lastPlacedOrder: customerConfirmation
        ? {
            orderNumber: customerConfirmation.orderNumber,
            tokenNumber: customerConfirmation.tokenNumber,
            totalPaisa: customerConfirmation.totalPaisa,
            persistenceState: customerConfirmation.persistenceState,
          }
        : null,
    };

    try {
      const serializedPayload = JSON.stringify(displayPayload);
      localStorage.setItem('pos_customer_display_state', serializedPayload);
    } catch { /* Broadcast remains available when browser storage is blocked. */ }
    try { customerDisplayChannel.current?.postMessage(displayPayload); } catch { /* Storage is the fallback channel. */ }
  }, [cart, orderSequence, customerConfirmation, printerSettings]);

  useEffect(() => { if (cart.length > 0) setCustomerConfirmation(null); }, [cart]);

  useEffect(() => {
    try {
      if (customerConfirmation) localStorage.setItem('pos_customer_confirmation', JSON.stringify(customerConfirmation));
      else localStorage.removeItem('pos_customer_confirmation');
    } catch { /* Confirmation remains available in this window. */ }
  }, [customerConfirmation]);

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
      if (res.syncedCount > 0 || res.rejectedCount > 0) {
        const data = await PosApi.fetchInitialData();
        setProducts(data.products.map(normalizeProduct));
        setOrders(data.orders);
        setCustomerConfirmation(previous => previous ? data.orders.find(order => order.id === previous.id) || previous : null);
        setReceiptModalOrder(previous => {
          const recovered = previous && data.orders.find(order => order.id === previous.id);
          return recovered?.persistenceState === 'rejected' ? null : recovered || previous;
        });
        setSaleFeedback(previous => {
          if (previous?.state !== 'pending') return previous;
          const recovered = data.orders.find(order => order.id === previous.order.id);
          if (recovered?.persistenceState === 'saved') return { success: true, state: 'saved', order: recovered };
          if (recovered?.persistenceState === 'rejected') return { success: false, state: 'rejected', order: recovered, error: recovered.rejectionReason };
          return previous;
        });
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
    setCustomerConfirmation(null);
    setSaleFeedback(null);
    setIsMobileSidebarOpen(false);
    setIsMobileCartOpen(false);
  };

  const canAddQuantity = (product: Product, quantity: number, exceptLine?: string) => {
    const current = products.find(p => p.id === product.id) || product;
    const alreadyOrdered = cart.filter(item => item.product.id === product.id && item.cartItemId !== exceptLine).reduce((sum, item) => sum + item.quantity, 0);
    if (!current.isAvailable || alreadyOrdered + quantity > current.stockQuantity) {
      setCartError(!current.isAvailable ? `${current.name} is unavailable.` : `Insufficient stock for ${current.name}. Available: ${current.stockQuantity}.`);
      return false;
    }
    setCartError('');
    return true;
  };

  // Cart operations
  const handleQuickAddToCart = (product: Product) => {
    if (orderInFlight.current || !canAddQuantity(product, 1)) return;
    const unitPricePaisa = product.pricePaisa;
    const unitCostPaisa = product.costPricePaisa || 0;
    setCart(prev => {
      const existingIdx = prev.findIndex(
        item => item.product.id === product.id && item.selectedVariations.length === 0 && !item.notes?.trim()
      );

      if (existingIdx !== -1) {
        const updated = [...prev];
        const existing = updated[existingIdx];
        const quantity = existing.quantity + 1;
        updated[existingIdx] = {
          ...existing,
          quantity,
          totalPricePaisa: quantity * unitPricePaisa,
          totalCostPaisa: quantity * unitCostPaisa,
        };
        return updated;
      }

      const newItem: CartItem = {
        cartItemId: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        product: normalizeProduct(product),
        quantity: 1,
        selectedVariations: [],
        unitPricePaisa,
        unitCostPaisa,
        totalPricePaisa: unitPricePaisa,
        totalCostPaisa: unitCostPaisa,
      };
      return [...prev, newItem];
    });
  };

  const handleQuickDecrementFromCart = (product: Product) => {
    if (orderInFlight.current) return;
    setCart(prev => {
      const existingIdx = prev.findIndex(
        item => item.product.id === product.id && item.selectedVariations.length === 0 && !item.notes?.trim()
      );
      if (existingIdx === -1) return prev;

      const updated = [...prev];
      const existing = updated[existingIdx];
      if (existing.quantity > 1) {
        const quantity = existing.quantity - 1;
        updated[existingIdx] = {
          ...existing,
          quantity,
          totalPricePaisa: quantity * existing.unitPricePaisa,
          totalCostPaisa: quantity * existing.unitCostPaisa,
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
    quantity: number,
    notes: string
  ) => {
    if (orderInFlight.current) return;
    if (!canAddQuantity(product, quantity, editingCartItem?.cartItemId)) return false;
    const deltaPrice = selectedVariations.reduce((sum, v) => sum + v.priceDeltaPaisa, 0);
    const deltaCost = selectedVariations.reduce((sum, v) => sum + v.costDeltaPaisa, 0);

    const unitPricePaisa = product.pricePaisa + deltaPrice;
    const unitCostPaisa = (product.costPricePaisa || 0) + deltaCost;

    const newItem: CartItem = {
      cartItemId: editingCartItem?.cartItemId || `cart-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      product,
      quantity,
      selectedVariations,
      notes: notes.trim(),
      unitPricePaisa,
      unitCostPaisa,
      totalPricePaisa: unitPricePaisa * quantity,
      totalCostPaisa: unitCostPaisa * quantity,
    };

    setCart(prev => editingCartItem ? prev.map(item => item.cartItemId === editingCartItem.cartItemId ? newItem : item) : [...prev, newItem]);
    setEditingCartItem(undefined);
    setVariationModalProduct(null);
  };

  const handleUpdateCartQuantity = (cartItemId: string, delta: number) => {
    if (orderInFlight.current) return;
    const line = cart.find(item => item.cartItemId === cartItemId);
    if (delta > 0 && line && !canAddQuantity(line.product, line.quantity + delta, cartItemId)) return;
    setCart(prev =>
      prev
        .map(item => {
          if (item.cartItemId !== cartItemId) return item;
          const quantity = item.quantity + delta;
          if (quantity <= 0) return null;
          return {
            ...item,
            quantity,
            totalPricePaisa: quantity * item.unitPricePaisa,
            totalCostPaisa: quantity * item.unitCostPaisa,
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
  const handlePlaceOrder = async (cashTenderedPaisa: number, selectedPaymentMethod: PaymentMethod) => {
    if (cart.length === 0 || orderInFlight.current || !currentUser) return;
    if (cart.some(item => !canAddQuantity(item.product, 0))) return;

    const totals = computeTotals(cart, printerSettings);
    const { subtotalPaisa, taxPaisa, totalPaisa } = totals;
    if (selectedPaymentMethod === 'cash' && cashTenderedPaisa < totalPaisa) return;

    orderInFlight.current = true;
    setIsProcessingOrder(true);

    const { totalCostPaisa, profitPaisa } = totals;
    const profitMarginPercent = totals.marginBp / 100;

    const orderNum = `#F00${orderSequence}`;
    const tokenNum = orderSequence % 100 || orderSequence;

    let newOrder: Order = checkoutAttempt.current || {
      moneySchemaVersion: 2,
      netRevenuePaisa: totals.netRevenuePaisa,
      taxBp: printerSettings.taxBp, taxInclusive: printerSettings.taxInclusive,
      id: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      cashTenderedPaisa: selectedPaymentMethod === 'cash' ? cashTenderedPaisa : undefined,
      changeDuePaisa: selectedPaymentMethod === 'cash' ? cashTenderedPaisa - totalPaisa : 0,
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
        unitPricePaisa: it.unitPricePaisa,
        unitCostPaisa: it.unitCostPaisa,
        quantity: it.quantity,
        totalPricePaisa: it.totalPricePaisa,
        totalCostPaisa: it.totalCostPaisa,
        selectedVariations: it.selectedVariations,
        notes: it.notes,
        bundledProducts: it.product.bundledProducts,
      })),
      subtotalPaisa,
      taxPaisa,
      discountPaisa: 0,
      totalPaisa,
      totalCostPaisa,
      profitPaisa,
      profitMarginPercent,
      paymentMethod: selectedPaymentMethod,
      cashierId: currentUser.id,
      cashierName: currentUser.name,
      cashierRole: currentUser.role,
      createdAt: new Date().toISOString(),
      synced: false,
    };

    newOrder = { ...newOrder, paymentMethod: selectedPaymentMethod,
      cashTenderedPaisa: selectedPaymentMethod === 'cash' ? cashTenderedPaisa : undefined,
      changeDuePaisa: selectedPaymentMethod === 'cash' ? cashTenderedPaisa - newOrder.totalPaisa : 0 };
    checkoutAttempt.current = newOrder;
    attemptCart.current = JSON.stringify(cart);
    try {
      PosStorage.setDraft({ cart, paymentMethod: selectedPaymentMethod, attempt: newOrder });
      const pricing = await PosApi.quoteOrder(newOrder);
      if (pricing.error) {
        const rejected = await PendingOutbox.reject(newOrder, pricing.error);
        checkoutAttempt.current = rejected;
        PosStorage.setDraft({ cart, paymentMethod: selectedPaymentMethod, attempt: rejected });
        setSaleFeedback({ success: false, state: 'rejected', order: rejected, error: pricing.error });
        return;
      }
      if (pricing.quote) {
        const quote = pricing.quote;
        const changed = quote.totalPaisa !== newOrder.totalPaisa ||
          quote.taxPaisa !== newOrder.taxPaisa || Boolean(quote.taxInclusive) !== Boolean(newOrder.taxInclusive) ||
          quote.items.some((item: any, index: number) => item.unitPricePaisa !== newOrder.items[index]?.unitPricePaisa) ||
          (newOrder.pricingFingerprint && quote.pricingFingerprint !== newOrder.pricingFingerprint);
        newOrder = { ...newOrder, ...quote };
        checkoutAttempt.current = newOrder;
        if (changed) {
          const reviewedCart = cart.map((entry, index) => ({ ...entry,
            ...quote.items[index], cartItemId: entry.cartItemId,
            product: { ...entry.product, name: quote.items[index].productName,
              categoryName: quote.items[index].categoryName } }));
          attemptCart.current = JSON.stringify(reviewedCart);
          setCart(reviewedCart);
          setPrinterSettings(previous => ({ ...previous, taxBp: quote.taxBp, taxInclusive: quote.taxInclusive }));
          const reason = `Prices changed. Current total: ${formatPKR(quote.totalPaisa)}. Review the basket and cash tender, then complete the order.`;
          const rejected = await PendingOutbox.reject(newOrder, reason);
          checkoutAttempt.current = rejected;
          PosStorage.setDraft({ cart: reviewedCart, paymentMethod: selectedPaymentMethod, attempt: rejected });
          setSaleFeedback({ success: false, state: 'rejected', order: rejected, error: reason });
          return;
        }
      }
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
      setAutoPrintOrderId(printerSettings.autoPrintDualSlips ? result.order.id : null);
      setReceiptModalOrder(result.order);
      setCustomerConfirmation(result.order);
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
        pricePaisa: item.unitPricePaisa, costPricePaisa: item.unitCostPaisa, bundledProducts: item.bundledProducts }),
      quantity: item.quantity, selectedVariations: item.selectedVariations, notes: item.notes,
      unitPricePaisa: item.unitPricePaisa, unitCostPaisa: item.unitCostPaisa ?? products.find(p => p.id === item.productId)?.costPricePaisa ?? 0,
      totalPricePaisa: item.totalPricePaisa, totalCostPaisa: item.totalCostPaisa ?? 0,
    }));
    attemptCart.current = JSON.stringify(restored);
    checkoutAttempt.current = order;
    setCart(restored);
    setPaymentMethod(order.paymentMethod);
    setActiveTab('order_line');
    setSaleFeedback({ success: false, state: 'rejected', order, error: order.rejectionReason });
  };

  // Open Preview Modal for existing or current cart
  const handleOpenPrintCurrentCart = (sample = false) => {
    if ((!sample && cart.length === 0) || !currentUser) return;
    const sampleProduct = products[0];
    const printCart: CartItem[] = sample && sampleProduct ? [{ cartItemId: 'test-slip-item', product: { ...sampleProduct, name: 'Sample item - TEST ONLY', isDeal: false, bundledProducts: [] }, quantity: 1, selectedVariations: [], notes: 'Test slip. Do not prepare.', unitPricePaisa: 10000, unitCostPaisa: 0, totalPricePaisa: 10000, totalCostPaisa: 0 }] : sample ? [] : cart;
    const totals = computeTotals(printCart, printerSettings);
    const { subtotalPaisa, taxPaisa, totalPaisa } = totals;
    const { totalCostPaisa, profitPaisa } = totals;

    const tempOrder: Order = {
      moneySchemaVersion: 2, netRevenuePaisa: totals.netRevenuePaisa,
      id: sample ? 'test-slip' : 'preview-cart',
      persistenceState: 'draft',
      orderNumber: sample ? 'TEST SLIP - NOT A SALE' : `#F00${orderSequence}`,
      tokenNumber: orderSequence % 100 || orderSequence,
      customerName: currentUser?.name || 'Walk-in Customer',
      status: 'in_kitchen',
      orderType: 'take_away',
      items: printCart.map(it => ({
        id: it.cartItemId,
        productId: it.product.id,
        productName: it.product.name,
        categoryName: it.product.categoryName,
        unitPricePaisa: it.unitPricePaisa,
        unitCostPaisa: it.unitCostPaisa,
        quantity: it.quantity,
        totalPricePaisa: it.totalPricePaisa,
        totalCostPaisa: it.totalCostPaisa,
        selectedVariations: it.selectedVariations,
        notes: it.notes,
        bundledProducts: it.product.bundledProducts,
      })),
      subtotalPaisa,
      taxPaisa,
      discountPaisa: 0,
      totalPaisa,
      totalCostPaisa,
      profitPaisa,
      profitMarginPercent: totals.marginBp / 100,
      paymentMethod: 'cash',
      cashierId: currentUser.id,
      cashierName: currentUser.name,
      cashierRole: currentUser.role,
      createdAt: new Date().toISOString(),
      synced: true,
    };

    setAutoPrintOrderId(null);
    setReceiptModalOrder(tempOrder);
  };

  // Admin CRUD Handlers
  const handleSaveProduct = async (productData: Partial<Product>) => {
    if (productData.id) {
      const existing = products.find(p => p.id === productData.id);
      const merged = normalizeProduct({ ...(existing || {}), ...productData });
      const updated = await PosApi.updateProduct(merged, isOnline);
      const normalizedUpdated = normalizeProduct(updated);
      setProducts(prev => prev.map(product => product.id === normalizedUpdated.id ? normalizedUpdated : product));
    } else {
      const created = normalizeProduct(productData);
      const savedProduct = await PosApi.createProduct(created, isOnline);
      const normalizedSaved = normalizeProduct(savedProduct);
      setProducts(prev => [normalizedSaved, ...prev.filter(product => product.id !== created.id && product.id !== normalizedSaved.id)]);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    await PosApi.deleteProduct(productId, isOnline);
    setProducts(prev => prev.filter(p => p.id !== productId));
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

  const handleSaveSettings = async (newSettings: PrinterSettings) => {
    await PosApi.saveMoneySettings(newSettings);
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

  const pendingBadge = (pendingOfflineCount > 0 || recoveryError) ? (
    <div role="status" aria-label="Pending sales" className="flex items-center justify-between gap-3 border-b border-pos-border bg-pos-surface px-4 py-2 text-sm shrink-0">
      <span>{pendingOfflineCount > 0
        ? `${pendingOfflineCount} ${pendingOfflineCount === 1 ? 'order' : 'orders'} waiting to sync`
        : 'Recovery needs attention'}</span>
      <button type="button" onClick={() => void handleManualSync()} className="font-semibold text-pos-success-text">Retry sync</button>
    </div>
  ) : null;

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
    <div className="w-screen h-screen overflow-hidden bg-pos-chrome font-sans antialiased text-pos-text">
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
      <div className="flex-1 flex flex-col overflow-hidden bg-pos-chrome">
        {/* Top Header - Clean, No Search Bar, No Bell, No Next Token */}
        <Header
          currentUser={currentUser}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onOpenMobileCart={() => setIsMobileCartOpen(true)}
          cartItemCount={cart.reduce((sum, it) => sum + it.quantity, 0)}
        />

        {pendingBadge}
        {recoveryError && <div role="alert" className="bg-pos-warning-bg px-4 py-2 text-sm">{recoveryError}</div>}
        {saleFeedback && (
          <div role={saleFeedback.state === 'rejected' ? 'alert' : 'status'} aria-label="Sale result" className="bg-pos-inset px-4 py-2 text-sm shrink-0">
            {saleFeedback.state === 'saved' ? 'Saved — sale confirmed by the server.' : saleFeedback.state === 'pending'
              ? 'Pending — recovery copy stored; waiting for the server.' : `Rejected — ${saleFeedback.error}`}
            {saleFeedback.state === 'rejected' && (cart.length
              ? <button type="button" disabled={isProcessingOrder} onClick={() => void handlePlaceOrder(saleFeedback.order.cashTenderedPaisa ?? saleFeedback.order.totalPaisa, paymentMethod)} className="ml-3 font-semibold text-pos-success-text">Retry sale</button>
              : <button type="button" disabled={isProcessingOrder} onClick={() => handleReviewRejected(saleFeedback.order)} className="ml-3 font-semibold text-pos-success-text">Review rejected sale</button>)}
          </div>
        )}
        {orders.filter(order => order.persistenceState === 'rejected' && order.id !== saleFeedback?.order.id).map(order => (
          <div key={order.id} role="alert" className="bg-pos-warning-bg px-4 py-2 text-sm">
            Rejected {order.orderNumber}: {order.rejectionReason}
            <button type="button" disabled={cart.length > 0 || isProcessingOrder} onClick={() => handleReviewRejected(order)} className="ml-3 font-semibold text-pos-success-text">Review rejected order {order.orderNumber}</button>
            {cart.length > 0 && <span className="ml-2">Finish or clear the current cart to review.</span>}
          </div>
        ))}

        {/* View Body */}
        <div className="flex-1 flex overflow-hidden">
          {activeTab === 'order_line' && (
            <>
              <OrderLineView
                isLocked={isProcessingOrder}
                products={products}
                categories={categories}
                cart={cart}
                onQuickAddToCart={handleQuickAddToCart}
                onQuickDecrementFromCart={handleQuickDecrementFromCart}
                onOpenVariationModal={product => { if (!orderInFlight.current && canAddQuantity(product, 1)) { setEditingCartItem(undefined); setVariationModalProduct(product); } }}
                onOpenMobileCart={() => setIsMobileCartOpen(true)}
              />
              <CartDrawer
                error={cartError}
                cart={cart}
                orderNumber={`#F00${orderSequence}`}
                tokenNumber={orderSequence % 100 || orderSequence}
                onUpdateQuantity={handleUpdateCartQuantity}
                onRemoveItem={handleRemoveCartItem}
                onEditItem={item => { if (!orderInFlight.current) { setEditingCartItem(item); setVariationModalProduct(item.product); } }}
                onClearCart={handleClearCart}
                taxBp={printerSettings.taxBp}
                taxInclusive={printerSettings.taxInclusive}
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
              defaultLowStockThreshold={printerSettings.globalLowStockThreshold ?? 5}
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
              onSelectOrderPreview={order => { setAutoPrintOrderId(null); setReceiptModalOrder(order); }}
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
              onResetCustomerDisplay={() => setCustomerConfirmation(null)}
              onOpenTestPrint={() => handleOpenPrintCurrentCart(true)}
            />
          )}
        </div>
      </div>
      </div>

      {cartError && !variationModalProduct && !isMobileCartOpen && <div role="alert" className="fixed top-20 left-1/2 -translate-x-1/2 z-50 rounded-md border border-pos-danger-border bg-pos-danger-bg text-pos-danger-text p-3 text-sm flex items-center gap-3 max-w-[calc(100vw-2rem)]">{cartError}<button type="button" aria-label="Dismiss stock message" onClick={() => setCartError('')}>Dismiss</button></div>}
      {/* Variation Customizer Modal */}
      {variationModalProduct && (
        <VariationModal
          key={editingCartItem?.cartItemId || variationModalProduct.id}
          error={cartError}
          maximumQuantity={Math.max(0, (products.find(p => p.id === variationModalProduct.id)?.stockQuantity ?? variationModalProduct.stockQuantity) - cart.filter(item => item.product.id === variationModalProduct.id && item.cartItemId !== editingCartItem?.cartItemId).reduce((sum, item) => sum + item.quantity, 0))}
          initialItem={editingCartItem}
          product={variationModalProduct}
          onClose={() => { setVariationModalProduct(null); setEditingCartItem(undefined); setCartError(''); }}
          onAddToCart={handleAddVariationToCart}
        />
      )}

      {/* Dual Slip Thermal Receipt Print Modal (Customer Slip + Kitchen Slip) */}
      {receiptModalOrder && (
        <ThermalReceiptModal
          onAutoPrinted={() => setAutoPrintOrderId(null)}
          autoPrint={receiptModalOrder.id === autoPrintOrderId && printerSettings.autoPrintDualSlips}
          order={receiptModalOrder}
          settings={printerSettings}
          onClose={() => { setReceiptModalOrder(null); setAutoPrintOrderId(null); }}
        />
      )}

      {isLogoutConfirmOpen && (
        <Dialog role="alertdialog" label="Log out?" onClose={() => setIsLogoutConfirmOpen(false)} className="w-full max-w-sm rounded-lg border border-pos-border bg-pos-surface p-6">
            <h2 id="logout-confirm-title" className="mb-2 text-lg font-bold text-pos-text">
              Log out?
            </h2>
            <p id="logout-confirm-description" className="mb-6 text-sm text-pos-secondary">
              Are you sure you want to log out of this terminal?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsLogoutConfirmOpen(false)}
                className="rounded-md px-4 py-2 text-sm font-semibold text-pos-secondary hover:bg-pos-raised"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                className="rounded-md bg-pos-danger-hover px-4 py-2 text-sm font-semibold text-white hover:bg-pos-danger-hover"
              >
                Log out
              </button>
            </div>
        </Dialog>
      )}
    </div>
  );
}
