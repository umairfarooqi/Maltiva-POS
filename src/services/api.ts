import { Order, Product, Category, TableItem, User, InventoryLog, PrinterSettings } from '../types/pos';
import { PosStorage } from './storage';
import { DEFAULT_UNCATEGORIZED_CATEGORY, normalizeProduct } from '../utils/normalizeProduct';

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
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch('/api/data', { signal: controller.signal });
      clearTimeout(timeoutId);

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
        PosStorage.setOrders(data.orders);
        PosStorage.setTables(data.tables);
        PosStorage.setUsers(data.users);
        PosStorage.setPrinterSettings(data.printerSettings);
        PosStorage.setInventoryLogs(data.inventoryLogs || []);

        return { ...data, products, isOnline: true };
      }
    } catch {
      // Network failed or offline: fall back to local storage seamlessly
    }

    return {
      categories: PosStorage.getCategories(),
      products: PosStorage.getProducts(),
      orders: PosStorage.getOrders(),
      tables: PosStorage.getTables(),
      users: PosStorage.getUsers(),
      printerSettings: PosStorage.getPrinterSettings(),
      inventoryLogs: PosStorage.getInventoryLogs(),
      isOnline: false,
    };
  },

  // Save new order with offline queueing & deduplication
  async placeOrder(order: Order, isOnline: boolean): Promise<{ success: boolean; order: Order }> {
    // 1. Immediately deduct local stock
    const products = PosStorage.getProducts();
    const logs = PosStorage.getInventoryLogs();

    order.items.forEach(item => {
      const p = products.find(prod => prod.id === item.productId);
      if (p) {
        const prev = p.stockQuantity;
        p.stockQuantity = Math.max(0, prev - item.quantity);
        logs.unshift({
          id: `log-local-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          productId: p.id,
          productName: p.name,
          previousStock: prev,
          changeAmount: -item.quantity,
          newStock: p.stockQuantity,
          type: 'sale',
          reason: `Sale ${order.orderNumber} (${item.quantity}x ${item.productName})`,
          userId: order.cashierId,
          userName: order.cashierName,
          timestamp: new Date().toISOString(),
        });
      }
    });

    PosStorage.setProducts(products);
    PosStorage.setInventoryLogs(logs);

    // 2. Save order locally
    const currentOrders = PosStorage.getOrders();
    currentOrders.unshift(order);
    PosStorage.setOrders(currentOrders);

    // 3. If online, send to server. If fails or offline, enqueue in offline queue
    if (isOnline) {
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(order),
        });
        if (res.ok) {
          const result = await res.json();
          order.synced = true;
          return { success: true, order: result.order || order };
        }
      } catch {
        // failed network, queue for background sync
      }
    }

    // Queue for sync
    order.synced = false;
    PosStorage.addToOfflineQueue(order);
    return { success: true, order };
  },

  // Synchronize queued offline orders
  async syncOfflineQueue(): Promise<{ syncedCount: number }> {
    const queue = PosStorage.getOfflineQueue();
    if (queue.length === 0) return { syncedCount: 0 };

    try {
      const res = await fetch('/api/orders/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queuedOrders: queue }),
      });

      if (res.ok) {
        const data = await res.json();
        PosStorage.clearOfflineQueue();
        if (data.products) PosStorage.setProducts(data.products);
        if (data.orders) PosStorage.setOrders(data.orders);
        return { syncedCount: data.syncedCount || queue.length };
      }
    } catch {
      // Still offline, will retry next turn
    }

    return { syncedCount: 0 };
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
        if (res.ok) return await res.json();
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

    if (isOnline) {
      try {
        await fetch(`/api/categories/${categoryId}`, { method: 'DELETE' });
      } catch {
        // saved locally
      }
    }
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
