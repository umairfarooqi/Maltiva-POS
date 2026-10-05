import { Order, Product, Category, TableItem, User, InventoryLog, PrinterSettings } from '../types/pos';
import { PosStorage } from './storage';
import { PendingOutbox } from './pendingOutbox';
import { DEFAULT_UNCATEGORIZED_CATEGORY, normalizeProduct } from '../utils/normalizeProduct';

export type SaleResult = { success: boolean; state: 'saved' | 'pending' | 'rejected'; order: Order; error?: string };

function mergeOrders(serverOrders: Order[], pending: Order[], rejected: Order[] = []): Order[] {
  const merged = new Map<string, Order>();
  for (const order of [...rejected, ...serverOrders, ...pending]) merged.set(order.idempotencyKey || order.id, order);
  return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function mergeRecovery(serverOrders: Order[], pending: Order[], rejected: Order[], durableSaved: Order[] = []): Order[] {
  // Read the cache after the asynchronous recovery snapshots: a 201 may have arrived meanwhile.
  const cached = PosStorage.getOrders();
  const acknowledged = [...cached.filter(order => order.persistenceState === 'saved'), ...durableSaved];
  const acknowledgedKeys = new Set(acknowledged.map(order => order.idempotencyKey || order.id));
  return mergeOrders([...acknowledged, ...serverOrders],
    pending.filter(order => !acknowledgedKeys.has(order.idempotencyKey || order.id)),
    [...cached.filter(order => order.persistenceState === 'rejected'), ...rejected]);
}

function cacheOrder(order: Order) {
  PosStorage.setOrders(mergeOrders([order], [], PosStorage.getOrders()));
}

function optionalCache(write: () => void) {
  try { write(); } catch { /* Cache capacity must not block durable sale recovery. */ }
}

function pendingResult(order: Order): SaleResult {
  optionalCache(() => cacheOrder(order));
  return { success: false, state: 'pending', order };
}

async function saved(order: Order): Promise<Order> {
  const canonical: Order = { ...order, idempotencyKey: order.idempotencyKey || order.id, persistenceState: 'saved', synced: true };
  try { cacheOrder(canonical); } catch {
    await PendingOutbox.acknowledge(canonical);
    return canonical;
  }
  await PendingOutbox.remove(canonical.idempotencyKey!);
  return canonical;
}

const stockAdjustmentKeys = new Map<string, string>();

const submissions = new Map<string, Promise<SaleResult>>();

async function submitSale(order: Order): Promise<SaleResult> {
  const key = order.idempotencyKey!;
  const existing = submissions.get(key);
  if (existing) return existing;
  const request = sendSale(order);
  submissions.set(key, request);
  try { return await request; } finally { submissions.delete(key); }
}

async function sendSale(order: Order): Promise<SaleResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let response: Response;
  let body: any;
  try {
    response = await fetch('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': order.idempotencyKey! },
      body: JSON.stringify(order), signal: controller.signal,
    });
    try { body = await response.json(); } catch (error) {
      // A 201 may already have committed, even if its body cannot be decoded.
      if (response.status === 201) return pendingResult(order);
      body = {};
    }
  } catch (error) {
    if (error instanceof TypeError || (error as any)?.name === 'AbortError') {
      return pendingResult(order);
    }
    throw error;
  } finally { clearTimeout(timeout); }
  if (response.status === 201) {
    if (body?.order?.id && Array.isArray(body.order.items) &&
        (body.order.idempotencyKey || body.order.id) === order.idempotencyKey) {
      return { success: true, state: 'saved', order: await saved(body.order) };
    }
    return pendingResult(order);
  }
  const error = typeof body?.error === 'string' ? body.error : body?.error?.message ||
    `Server rejected the sale (HTTP ${response.status}). Retry or review this cart.`;
  const rejected = await PendingOutbox.reject(order, error);
  return { success: false, state: 'rejected', order: rejected, error };
}

let replay: Promise<{ syncedCount: number; rejectedCount: number; pendingCount: number; reachable: boolean }> | null = null;

async function persistProduct(url: string, method: string, product: Product): Promise<Product> {
  let response: Response;
  try {
    response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product), signal: AbortSignal.timeout(5000) });
  } catch { throw new Error('Menu changes need the local server. Keep this form and retry when it is available.'); }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Menu changes could not be saved. Keep this form and retry.');
  if (body.id !== product.id || body.moneySchemaVersion !== 2) throw new Error('Could not confirm the saved menu. Keep this form and retry.');
  return normalizeProduct(body);
}

export const PosApi = {
  async saveMoneySettings(settings: PrinterSettings): Promise<void> {
    const response = await fetch('/api/settings/printer', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Tax settings could not be saved on the server. Retry when it is available.');
  },
  async quoteOrder(order: Order): Promise<{ quote?: any; unreachable?: boolean; error?: string }> {
    try {
      const response = await fetch('/api/orders/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order), signal: AbortSignal.timeout(5000) });
      const body = await response.json();
      if (!response.ok) return { error: body.error || 'Could not price this basket. Review the items.' };
      if (body.moneySchemaVersion !== 2 || typeof body.pricingFingerprint !== 'string' || !Array.isArray(body.items)) {
        return { error: 'Invalid pricing response. Keep this cart and retry.' };
      }
      return { quote: body };
    } catch (error) {
      if (error instanceof TypeError || (error as any)?.name === 'TimeoutError' || (error as any)?.name === 'AbortError') return { unreachable: true };
      return { error: 'Could not read pricing. Keep this cart and retry.' };
    }
  },
  // Sync all data from backend or return local cache
  async fetchInitialData(): Promise<{
    categories: Category[];
    products: Product[];
    orders: Order[];
    tables: TableItem[];
    users: User[];
    printerSettings: PrinterSettings;
    inventoryLogs: InventoryLog[];
    isOnline: boolean;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    try {
      const res = await fetch('/api/data', { signal: controller.signal });

      if (res.ok) {
        const data = await res.json();
        // Update local cache
        optionalCache(() => PosStorage.setCategories(data.categories));
        const fetchedProducts: Product[] = Array.isArray(data.products) ? data.products : [];
        const validProducts = fetchedProducts.filter(
          product => product.name !== 'Untitled Dish' && Number(product.pricePaisa) > 0
        );
        const normalizedProducts = validProducts.map(normalizeProduct);
        optionalCache(() => PosStorage.setProducts(normalizedProducts));
        const products = normalizedProducts;
        const serverOrders: Order[] = (data.orders || []).map((order: Order) => ({ ...order, idempotencyKey: order.idempotencyKey || order.id, synced: true, persistenceState: 'saved' }));
        const pending = await PendingOutbox.list();
        const rejected = await PendingOutbox.rejected();
        const acknowledged = await PendingOutbox.acknowledged();
        const orders = mergeRecovery(serverOrders, pending, rejected, acknowledged);
        optionalCache(() => PosStorage.setOrders(orders));
        optionalCache(() => PosStorage.setTables(data.tables || []));
        optionalCache(() => PosStorage.setUsers(data.users));
        optionalCache(() => PosStorage.setPrinterSettings(data.printerSettings));
        optionalCache(() => PosStorage.setInventoryLogs(data.inventoryLogs || []));

        return { ...data, products, orders, tables: data.tables || [], isOnline: true };
      }
    } catch {
      // Network failed or offline: fall back to local storage seamlessly
    } finally { clearTimeout(timeoutId); }

    const pending = await PendingOutbox.list();
    const rejected = await PendingOutbox.rejected();
    const acknowledged = await PendingOutbox.acknowledged();
    const orders = mergeRecovery(PosStorage.getOrders().filter(order => order.persistenceState !== 'pending' && order.persistenceState !== 'rejected'), pending, rejected, acknowledged);
    optionalCache(() => PosStorage.setOrders(orders));
    return {
      categories: PosStorage.getCategories(),
      products: PosStorage.getProducts(),
      orders,
      tables: PosStorage.getTables(),
      users: PosStorage.getUsers(),
      printerSettings: PosStorage.getPrinterSettings(),
      inventoryLogs: PosStorage.getInventoryLogs(),
      isOnline: false,
    };
  },

  // Persist the recovery copy before transport, including when internet connectivity is absent.
  async placeOrder(order: Order, _isOnline: boolean): Promise<SaleResult> {
    let staged: Order;
    try { staged = await PendingOutbox.put(order); }
    catch {
      const error = 'Cannot store a recovery copy. The sale was not sent; keep this cart and retry.';
      return { success: false, state: 'rejected', order: { ...order, persistenceState: 'rejected', rejectionReason: error }, error };
    }
    return submitSale(staged);
  },

  async syncOfflineQueue(): Promise<{ syncedCount: number; rejectedCount: number; pendingCount: number; reachable: boolean }> {
    if (replay) return replay;
    replay = (async () => {
      let syncedCount = 0;
      let rejectedCount = 0;
      let reachable = false;
      const queue = await PendingOutbox.list();
      // Read server status in bounded batches. Only a POST acknowledgment (201) clears a recovery copy.
      for (let offset = 0; offset < Math.max(1, queue.length); offset += 100) {
        const batch = queue.slice(offset, offset + 100);
        const query = new URLSearchParams();
        batch.forEach(order => query.append('key', order.idempotencyKey!));
        try {
          const response = await fetch(`/api/orders/pending-status?${query}`, { signal: AbortSignal.timeout(5000) });
          reachable = true;
          if (response.ok) await response.json();
        } catch { return { syncedCount, rejectedCount, pendingCount: (await PendingOutbox.list()).length, reachable: false }; }
      }
      for (const order of await PendingOutbox.list()) {
        const result = await submitSale(order);
        if (result.state === 'saved') syncedCount++;
        if (result.state === 'rejected') { rejectedCount++; try { cacheOrder(result.order); } catch { /* rejection remains durable in IndexedDB */ } }
        if (result.state === 'pending') { reachable = false; break; }
      }
      return { syncedCount, rejectedCount, pendingCount: (await PendingOutbox.list()).length, reachable };
    })();
    try { return await replay; } finally { replay = null; }
  },

  // Product CRUD
  async createProduct(productData: Partial<Product>, _isOnline: boolean): Promise<Product> {
    const newProd = normalizeProduct({ ...productData, id: productData.id || `prod-${Date.now()}` });
    const savedProduct = await persistProduct('/api/products', 'POST', newProd);
    optionalCache(() => PosStorage.setProducts([savedProduct, ...PosStorage.getProducts().filter(p => p.id !== savedProduct.id)]));
    return savedProduct;
  },

  async updateProduct(product: Product, _isOnline: boolean): Promise<Product> {
    const normalized = normalizeProduct(product);
    const updated = await persistProduct(`/api/products/${normalized.id}`, 'PUT', normalized);
    optionalCache(() => PosStorage.setProducts(PosStorage.getProducts().map(p => p.id === updated.id ? updated : p)));
    return updated;
  },

  async deleteProduct(productId: string, _isOnline: boolean): Promise<boolean> {
    const response = await fetch(`/api/products/${encodeURIComponent(productId)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Product could not be deleted. Retry when the server is available.');
    optionalCache(() => PosStorage.setProducts(PosStorage.getProducts().filter(p => p.id !== productId)));
    return true;
  },

  // Category CRUD
  async createCategory(name: string, icon: string, _isOnline: boolean): Promise<Category> {
    const category = { id: `cat-${crypto.randomUUID()}`, name: name.trim(), icon, itemCount: 0, order: 99 };
    const response = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(category) });
    if (!response.ok) throw new Error('Category could not be saved on the server. Retry when it is available.');
    const saved = { ...category, ...await response.json() };
    if (!saved.id) throw new Error('Server did not confirm the category.');
    optionalCache(() => PosStorage.setCategories([...PosStorage.getCategories(), saved]));
    return saved;
  },

  async updateCategory(category: Category, _isOnline: boolean): Promise<Category> {
    const response = await fetch(`/api/categories/${encodeURIComponent(category.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(category) });
    if (!response.ok) throw new Error('Category could not be updated on the server. Retry when it is available.');
    const saved = { ...category, ...await response.json() };
    optionalCache(() => {
      PosStorage.setCategories(PosStorage.getCategories().map(c => c.id === category.id ? saved : c));
      PosStorage.setProducts(PosStorage.getProducts().map(p => p.categoryId === category.id ? { ...p, categoryName: saved.name } : p));
    });
    return saved;
  },

  async deleteCategory(categoryId: string, _isOnline: boolean): Promise<boolean> {
    if (categoryId === DEFAULT_UNCATEGORIZED_CATEGORY.id) return false;
    {
      const res = await fetch(`/api/categories/${categoryId}`, { method: 'DELETE' });
      if (!res.ok) {
        let message = 'Delete failed';
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {
          // keep fallback message
        }
        throw new Error(message);
      }
    }

    const cats = PosStorage.getCategories().filter(c => c.id !== categoryId);
    if (!cats.some(category => category.id === DEFAULT_UNCATEGORIZED_CATEGORY.id)) {
      cats.push(DEFAULT_UNCATEGORIZED_CATEGORY);
    }
    PosStorage.setCategories(cats);

    const products = PosStorage.getProducts().map(product =>
      product.categoryId === categoryId
        ? normalizeProduct({
            ...product,
            categoryId: DEFAULT_UNCATEGORIZED_CATEGORY.id,
            categoryName: DEFAULT_UNCATEGORIZED_CATEGORY.name,
          })
        : normalizeProduct(product)
    );
    PosStorage.setProducts(products);

    return true;
  },

  // Stock Adjustment
  async adjustStock(
    productId: string,
    changeAmount: number,
    reason: string,
    type: 'restock' | 'adjustment' | 'waste',
    user: User,
    isOnline: boolean
  ): Promise<{ product: Product; log: InventoryLog }> {
    const signature = JSON.stringify({ productId, changeAmount, reason, type, userId: user.id });
    const operationId = stockAdjustmentKeys.get(signature) || crypto.randomUUID();
    stockAdjustmentKeys.set(signature, operationId);
    const response = await fetch('/api/inventory/adjust', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationId, productId, changeAmount, reason, type, userId: user.id, userName: user.name }) });
    if (!response.ok) throw new Error('Stock adjustment could not be confirmed. Keep this form open and retry.');
    const result = await response.json();
    if (!result.product?.id || !result.log?.id) throw new Error('Server did not confirm the stock adjustment.');
    stockAdjustmentKeys.delete(signature);
    optionalCache(() => {
      PosStorage.setProducts(PosStorage.getProducts().map(p => p.id === productId ? normalizeProduct(result.product) : p));
      PosStorage.setInventoryLogs([result.log, ...PosStorage.getInventoryLogs().filter(log => log.id !== result.log.id)]);
    });
    return result;
  },

  // AUTHENTICATION & LOGIN
  async login(
    username: string,
    passwordOrPin: string,
    isOnline: boolean
  ): Promise<{ success: boolean; user?: User; error?: string }> {
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = passwordOrPin.trim();

    // If online, try server authentication
    if (isOnline) {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: cleanUser, password: cleanPass }),
        });
        const data = await res.json();
        if (res.ok && data.user) {
          PosStorage.setSession(data.user);
          return { success: true, user: data.user };
        } else {
          return { success: false, error: data.error || 'Invalid credentials' };
        }
      } catch {
        // network failure, fallback to offline local credentials check
      }
    }

    // Offline / Local fallback authentication
    const users = PosStorage.getUsers();
    const matched = users.find(
      u =>
        u.active &&
        (u.username?.toLowerCase() === cleanUser || u.email?.toLowerCase() === cleanUser)
    );

    if (!matched) {
      return { success: false, error: 'User account not found' };
    }

    const passMatches =
      (matched.password && matched.password === cleanPass) ||
      (matched.pin && matched.pin === cleanPass);

    if (!passMatches) {
      return { success: false, error: 'Incorrect password or PIN' };
    }

    PosStorage.setSession(matched);
    return { success: true, user: matched };
  },

  async forgotPassword(
    identifier: string,
    isOnline: boolean
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const clean = identifier.trim().toLowerCase();

    if (isOnline) {
      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: clean }),
        });
        const data = await res.json();
        if (res.ok) {
          return { success: true, data };
        } else {
          return { success: false, error: data.error || 'User not found' };
        }
      } catch {
        // fallback
      }
    }

    const users = PosStorage.getUsers();
    const user = users.find(
      u =>
        u.active &&
        (u.username?.toLowerCase() === clean || u.email?.toLowerCase() === clean)
    );

    if (!user) {
      return { success: false, error: 'No active staff account found with this username' };
    }

    return {
      success: true,
      data: {
        username: user.username,
        name: user.name,
        role: user.role,
        securityQuestion: user.securityQuestion || 'What is your registered 4-digit PIN?',
        hasPin: Boolean(user.pin),
      },
    };
  },

  async resetPassword(
    username: string,
    newPassword: string,
    verificationCode: string,
    isOnline: boolean
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const clean = username.trim().toLowerCase();

    if (isOnline) {
      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: clean, newPassword, verificationCode }),
        });
        const data = await res.json();
        if (res.ok) {
          // Update local copy as well
          const localUsers = PosStorage.getUsers();
          const idx = localUsers.findIndex(
            u => u.username?.toLowerCase() === clean || u.email?.toLowerCase() === clean
          );
          if (idx !== -1) {
            localUsers[idx].password = newPassword;
            if (/^\d{4}$/.test(newPassword)) localUsers[idx].pin = newPassword;
            PosStorage.setUsers(localUsers);
          }
          return { success: true, message: data.message };
        } else {
          return { success: false, error: data.error || 'Password reset failed' };
        }
      } catch {
        // fallback
      }
    }

    // Local / Offline fallback
    const localUsers = PosStorage.getUsers();
    const idx = localUsers.findIndex(
      u => u.username?.toLowerCase() === clean || u.email?.toLowerCase() === clean
    );

    if (idx === -1) {
      return { success: false, error: 'User not found' };
    }

    localUsers[idx].password = newPassword;
    if (/^\d{4}$/.test(newPassword)) localUsers[idx].pin = newPassword;
    PosStorage.setUsers(localUsers);

    return {
      success: true,
      message: 'Password successfully updated! You can now sign in with your new credentials.',
    };
  },
};
