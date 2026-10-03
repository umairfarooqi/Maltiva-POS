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

function mergeRecovery(serverOrders: Order[], pending: Order[], rejected: Order[]): Order[] {
  // Read the cache after the asynchronous recovery snapshots: a 201 may have arrived meanwhile.
  const cached = PosStorage.getOrders();
  const acknowledged = cached.filter(order => order.persistenceState === 'saved');
  const acknowledgedKeys = new Set(acknowledged.map(order => order.idempotencyKey || order.id));
  return mergeOrders([...acknowledged, ...serverOrders],
    pending.filter(order => !acknowledgedKeys.has(order.idempotencyKey || order.id)),
    [...cached.filter(order => order.persistenceState === 'rejected'), ...rejected]);
}

function cacheOrder(order: Order) {
  PosStorage.setOrders(mergeOrders([order], [], PosStorage.getOrders()));
}

async function saved(order: Order): Promise<Order> {
  const canonical: Order = { ...order, idempotencyKey: order.idempotencyKey || order.id, persistenceState: 'saved', synced: true };
  cacheOrder(canonical);
  await PendingOutbox.remove(canonical.idempotencyKey!);
  return canonical;
}

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
      if (response.status === 201 && (error instanceof TypeError || (error as any)?.name === 'AbortError')) throw error;
      body = {};
    }
  } catch (error) {
    if (error instanceof TypeError || (error as any)?.name === 'AbortError') {
      try { cacheOrder(order); } catch { /* the IndexedDB recovery copy is already committed */ }
      return { success: false, state: 'pending', order };
    }
    throw error;
  } finally { clearTimeout(timeout); }
  if (response.status === 201 && body.order?.id && Array.isArray(body.order.items) &&
      (body.order.idempotencyKey || body.order.id) === order.idempotencyKey) {
    return { success: true, state: 'saved', order: await saved(body.order) };
  }
  const error = typeof body.error === 'string' ? body.error : body.error?.message ||
    `Server rejected the sale (HTTP ${response.status}). Retry or review this cart.`;
  const rejected = await PendingOutbox.reject(order, error);
  return { success: false, state: 'rejected', order: rejected, error };
}

let replay: Promise<{ syncedCount: number; pendingCount: number; reachable: boolean }> | null = null;

export const PosApi = {
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
        PosStorage.setCategories(data.categories);
        const fetchedProducts: Product[] = Array.isArray(data.products) ? data.products : [];
        const validProducts = fetchedProducts.filter(
          product => product.name !== 'Untitled Dish' && Number(product.price) > 0
        );
        const normalizedProducts = validProducts.map(normalizeProduct);
        PosStorage.setProducts(normalizedProducts);
        const products = PosStorage.getProducts();
        const serverOrders: Order[] = (data.orders || []).map((order: Order) => ({ ...order, idempotencyKey: order.idempotencyKey || order.id, synced: true, persistenceState: 'saved' }));
        const pending = await PendingOutbox.list();
        const rejected = await PendingOutbox.rejected();
        const orders = mergeRecovery(serverOrders, pending, rejected);
        PosStorage.setOrders(orders);
        PosStorage.setTables(data.tables || []);
        PosStorage.setUsers(data.users);
        PosStorage.setPrinterSettings(data.printerSettings);
        PosStorage.setInventoryLogs(data.inventoryLogs || []);

        return { ...data, products, orders, tables: data.tables || [], isOnline: true };
      }
    } catch {
      // Network failed or offline: fall back to local storage seamlessly
    } finally { clearTimeout(timeoutId); }

    const pending = await PendingOutbox.list();
    const rejected = await PendingOutbox.rejected();
    const orders = mergeRecovery(PosStorage.getOrders().filter(order => order.persistenceState !== 'pending'), pending, rejected);
    PosStorage.setOrders(orders);
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

  async syncOfflineQueue(): Promise<{ syncedCount: number; pendingCount: number; reachable: boolean }> {
    if (replay) return replay;
    replay = (async () => {
      let syncedCount = 0;
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
        } catch { return { syncedCount, pendingCount: (await PendingOutbox.list()).length, reachable: false }; }
      }
      for (const order of await PendingOutbox.list()) {
        const result = await submitSale(order);
        if (result.state === 'saved') syncedCount++;
        if (result.state === 'rejected') { try { cacheOrder(result.order); } catch { /* rejection remains durable in IndexedDB */ } }
        if (result.state === 'pending') { reachable = false; break; }
      }
      return { syncedCount, pendingCount: (await PendingOutbox.list()).length, reachable };
    })();
    try { return await replay; } finally { replay = null; }
  },

  // Product CRUD
  async createProduct(productData: Partial<Product>, isOnline: boolean): Promise<Product> {
    const newProd = normalizeProduct({ ...productData, id: productData.id || `prod-${Date.now()}` });

    const localProducts = PosStorage.getProducts();
    localProducts.unshift(newProd);
    PosStorage.setProducts(localProducts);

    if (isOnline) {
      try {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newProd),
        });
        if (res.ok) {
          return normalizeProduct(await res.json());
        }
      } catch {
        // saved locally
      }
    }

    return newProd;
  },

  async updateProduct(product: Product, isOnline: boolean): Promise<Product> {
    const normalized = normalizeProduct(product);
    const localProducts = PosStorage.getProducts();
    const idx = localProducts.findIndex(p => p.id === normalized.id);
    if (idx !== -1) {
      localProducts[idx] = normalized;
      PosStorage.setProducts(localProducts);
    }

    if (isOnline) {
      try {
        const res = await fetch(`/api/products/${normalized.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalized),
        });
        if (res.ok) {
          const updated = await res.json();
          if (updated && updated.id) {
            return normalizeProduct(updated);
          }
        }
      } catch {
        // saved locally
      }
    }

    return normalized;
  },

  async deleteProduct(productId: string, isOnline: boolean): Promise<boolean> {
    const localProducts = PosStorage.getProducts().filter(p => p.id !== productId);
    PosStorage.setProducts(localProducts);

    if (isOnline) {
      try {
        await fetch(`/api/products/${productId}`, { method: 'DELETE' });
      } catch {
        // removed locally
      }
    }
    return true;
  },

  // Category CRUD
  async createCategory(name: string, icon: string, isOnline: boolean): Promise<Category> {
    const newCat: Category = {
      id: `cat-${Date.now()}`,
      name: name || 'New Category',
      icon: icon || '🍽️',
      itemCount: 0,
      order: 99,
    };
    const cats = PosStorage.getCategories();
    cats.push(newCat);
    PosStorage.setCategories(cats);

    if (isOnline) {
      try {
        const res = await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newCat),
        });
        if (res.ok) {
          const saved = await res.json();
          return { ...newCat, ...saved, id: newCat.id };
        }
      } catch {
        // saved locally
      }
    }
    return newCat;
  },

  async updateCategory(category: Category, isOnline: boolean): Promise<Category> {
    const cats = PosStorage.getCategories();
    const idx = cats.findIndex(c => c.id === category.id);
    if (idx !== -1) {
      cats[idx] = category;
      PosStorage.setCategories(cats);
    }

    // Also update categoryName in local products
    const prods = PosStorage.getProducts().map(p =>
      p.categoryId === category.id ? { ...p, categoryName: category.name } : p
    );
    PosStorage.setProducts(prods);

    if (isOnline) {
      try {
        const res = await fetch(`/api/categories/${category.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(category),
        });
        if (res.ok) {
          const updated = await res.json();
          if (updated && updated.id) {
            return updated;
          }
        }
      } catch {
        // saved locally
      }
    }
    return category;
  },

  async deleteCategory(categoryId: string, isOnline: boolean): Promise<boolean> {
    if (categoryId === DEFAULT_UNCATEGORIZED_CATEGORY.id) return false;
    if (isOnline) {
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
    const products = PosStorage.getProducts();
    const product = products.find(p => p.id === productId);
    if (!product) throw new Error('Product not found');

    const prevStock = product.stockQuantity;
    product.stockQuantity = Math.max(0, prevStock + changeAmount);
    product.updatedAt = new Date().toISOString();
    PosStorage.setProducts(products);

    const log: InventoryLog = {
      id: `log-${Date.now()}`,
      productId,
      productName: product.name,
      previousStock: prevStock,
      changeAmount,
      newStock: product.stockQuantity,
      type,
      reason,
      userId: user.id,
      userName: user.name,
      timestamp: new Date().toISOString(),
    };

    const logs = PosStorage.getInventoryLogs();
    logs.unshift(log);
    PosStorage.setInventoryLogs(logs);

    if (isOnline) {
      try {
        await fetch('/api/inventory/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId,
            changeAmount,
            reason,
            type,
            userId: user.id,
            userName: user.name,
          }),
        });
      } catch {
        // logged locally
      }
    }

    return { product, log };
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
