import { Order, Product, Category, TableItem, User, LoginStaff, InventoryLog, PrinterSettings } from '../types/pos';
import { PosStorage } from './storage';
import { PendingOutbox } from './pendingOutbox';
import { sessionFetch, endSession, queueSessionRevocation, flushSessionRevocations } from './session';
import { DEFAULT_UNCATEGORIZED_CATEGORY, normalizeProduct } from '../utils/normalizeProduct';

export type SaleResult = { success: boolean; state: 'saved' | 'pending' | 'rejected'; order: Order; error?: string };

/** Optional cache failure must never erase complete server history held in memory. */
export function mergeRecoveryState(previous: Order[], recovered: Order[]): Order[] {
  const generation = PosStorage.getDatabaseGeneration();
  const confirmed = previous.filter(order => order.persistenceState === 'saved' &&
    (!localStorage.getItem('pos_database_changed') || order.databaseGeneration === generation));
  return mergeOrders([...recovered, ...confirmed], []);
}

function mergeOrders(serverOrders: Order[], pending: Order[], rejected: Order[] = []): Order[] {
  const merged = new Map<string, Order>();
  for (const order of [...rejected, ...serverOrders, ...pending]) merged.set(order.idempotencyKey || order.id, order);
  return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function mergeRecovery(serverOrders: Order[], pending: Order[], rejected: Order[], durableSaved: Order[] = []): Order[] {
  // Read the cache after the asynchronous recovery snapshots: a 201 may have arrived meanwhile.
  const cached = PosStorage.getOrders();
  const generation = PosStorage.getDatabaseGeneration();
  const acknowledged = [...cached.filter(order => order.persistenceState === 'saved'), ...durableSaved]
    .filter(order => !localStorage.getItem('pos_database_changed') || order.databaseGeneration === generation);
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

function authHeaders(): Record<string, string> {
  const token = PosStorage.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  if (order.recoveryBlockedReason) {
    const { recoveryBlockedReason: _previousReason, ...retry } = order;
    order = await PendingOutbox.put(retry);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let response: Response;
  let body: any;
  try {
    response = await sessionFetch('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': order.idempotencyKey!, ...authHeaders() },
      body: JSON.stringify(order), signal: controller.signal,
    });
    try { body = await response.json(); } catch (error) {
      // A 201 may already have committed, even if its body cannot be decoded.
      if (response.status === 201) return pendingResult(order);
      body = {};
    }
  } catch (error) {
    if (error instanceof TypeError || (error as any)?.name === 'AbortError' || (error as any)?.name === 'SessionChangedError') {
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
  // A session failure says nothing about whether an earlier attempt committed.
  // Keep the durable intent pending so signing in can safely replay the same key.
  if (response.status === 401 || response.status === 403) return pendingResult(order);
  if (body?.code === 'RECOVERY_OWNER_REQUIRED' || body?.code === 'DATABASE_CHANGED') {
    const blocked = await PendingOutbox.block(order, body.error || 'The original cashier must review this pending sale.');
    return { ...pendingResult(blocked), error: blocked.recoveryBlockedReason };
  }
  const error = typeof body?.error === 'string' ? body.error : body?.error?.message ||
    `Server rejected the sale (HTTP ${response.status}). Retry or review this cart.`;
  const rejected = await PendingOutbox.reject(order, error);
  return { success: false, state: 'rejected', order: rejected, error };
}

let replay: Promise<{ syncedCount: number; rejectedCount: number; pendingCount: number; reachable: boolean }> | null = null;

async function persistProduct(url: string, method: string, product: Omit<Product, 'stockQuantity'>): Promise<Product> {
  let response: Response;
  try {
    response = await sessionFetch(url, { method, headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(product), signal: AbortSignal.timeout(5000) });
  } catch { throw new Error('Menu changes need the local server. Keep this form and retry when it is available.'); }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Menu changes could not be saved. Keep this form and retry.');
  if (body.id !== product.id || body.moneySchemaVersion !== 2) throw new Error('Could not confirm the saved menu. Keep this form and retry.');
  return normalizeProduct(body);
}

let catalogRequest = 0;

function assertSession(token: string | null, isCurrent: () => boolean = () => true) {
  if (PosStorage.getToken() !== token) {
    throw Object.assign(new Error('The active session changed.'), { name: 'SessionChangedError' });
  }
  if (!isCurrent()) throw Object.assign(new Error('This data request was superseded.'), { name: 'SupersededRequestError' });
}

export const PosApi = {
  async loadRecoveryOrders(): Promise<Order[]> {
    const pending = await PendingOutbox.list();
    const [rejected, acknowledged] = await Promise.all([PendingOutbox.rejected(), PendingOutbox.acknowledged()]);
    const orders = mergeRecovery([], pending, rejected, acknowledged);
    return orders;
  },
  async fetchCatalog(isCurrent: () => boolean = () => true): Promise<{ categories: Category[]; products: Product[]; printerSettings: PrinterSettings }> {
    const token = PosStorage.getToken();
    const request = ++catalogRequest;
    const response = await sessionFetch('/api/data?scope=catalog', { headers: authHeaders(), signal: AbortSignal.timeout(5000) });
    const data = await response.json();
    assertSession(token, () => request === catalogRequest && isCurrent());
    if (!response.ok || !data || data.historyIncluded !== false || !Array.isArray(data.products) || !Array.isArray(data.categories) || !data.printerSettings) {
      throw new Error('Menu and stock could not be refreshed. Retry when the POS server is available.');
    }
    const products = data.products.filter((product: Product) => product.name !== 'Untitled Dish' && Number(product.pricePaisa) > 0).map(normalizeProduct);
    optionalCache(() => PosStorage.setProducts(products));
    optionalCache(() => PosStorage.setCategories(data.categories));
    optionalCache(() => PosStorage.setPrinterSettings(data.printerSettings));
    return { products, categories: data.categories, printerSettings: data.printerSettings };
  },
  async getSession(): Promise<{ user: User; expiresAt: number }> {
    await flushSessionRevocations();
    const token = PosStorage.getToken();
    if (!token) throw new Error('Please sign in again.');
    const response = await sessionFetch('/api/auth/session', {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000), cache: 'no-store',
    });
    if (!response.ok) throw new Error('Please sign in again.');
    const data = await response.json();
    if (!data.user?.id || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Date.now()) {
      endSession(token);
      throw new Error('Please sign in again.');
    }
    if (PosStorage.getToken() !== token) throw new Error('The active session changed.');
    PosStorage.setSession(data.user);
    return data;
  },
  async fetchLoginStaff(): Promise<LoginStaff[]> {
    const response = await sessionFetch('/api/auth/staff', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Could not load staff for sign-in.');
    const staff = await response.json();
    if (!Array.isArray(staff)) throw new Error('Invalid staff list.');
    return staff;
  },
  async saveMoneySettings(settings: PrinterSettings): Promise<void> {
    const response = await sessionFetch('/api/settings/printer', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(settings), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Tax settings could not be saved on the server. Retry when it is available.');
  },
  async quoteOrder(order: Order): Promise<{ quote?: any; unreachable?: boolean; error?: string; code?: string }> {
    try {
      const response = await sessionFetch('/api/orders/quote', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(order), signal: AbortSignal.timeout(5000) });
      const body = await response.json();
      if (!response.ok) return { error: body.error || 'Could not price this basket. Review the items.', code: body.code };
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
  async fetchInitialData(isCurrent: () => boolean = () => true): Promise<{
    categories: Category[];
    products: Product[];
    orders: Order[];
    tables: TableItem[];
    users: User[];
    printerSettings: PrinterSettings;
    inventoryLogs: InventoryLog[];
    isOnline: boolean;
  }> {
    const requestToken = PosStorage.getToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const headers = authHeaders();
    try {
      const res = await sessionFetch('/api/data', { ...(Object.keys(headers).length ? { headers } : {}), signal: controller.signal });

      if (res.ok) {
        const data = await res.json();
        assertSession(requestToken, isCurrent);
        if (data.historyIncluded === false) throw new Error('Complete saved history was not returned. Retry report loading.');
        // Update local cache
        const fetchedProducts: Product[] = Array.isArray(data.products) ? data.products : [];
        const validProducts = fetchedProducts.filter(
          product => product.name !== 'Untitled Dish' && Number(product.pricePaisa) > 0
        );
        const normalizedProducts = validProducts.map(normalizeProduct);
        const products = normalizedProducts;
        const serverOrders: Order[] = (data.orders || []).map((order: Order) => ({ ...order, idempotencyKey: order.idempotencyKey || order.id, synced: true, persistenceState: 'saved' }));
        const pending = await PendingOutbox.list();
        const rejected = await PendingOutbox.rejected();
        const acknowledged = await PendingOutbox.acknowledged();
        // Recovery reads can yield through logout, account switching or cancellation.
        // Commit the entire snapshot only while this request still owns the session.
        assertSession(requestToken, isCurrent);
        const orders = mergeRecovery(serverOrders, pending, rejected, acknowledged);
        optionalCache(() => PosStorage.setCategories(data.categories));
        optionalCache(() => PosStorage.setProducts(normalizedProducts));
        optionalCache(() => PosStorage.setOrders(orders));
        optionalCache(() => PosStorage.setTables(data.tables || []));
        optionalCache(() => PosStorage.setUsers(data.users));
        optionalCache(() => PosStorage.setPrinterSettings(data.printerSettings));
        optionalCache(() => PosStorage.setInventoryLogs(data.inventoryLogs || []));

        return { ...data, products, orders, tables: data.tables || [], isOnline: true };
      }
    } catch (error) {
      assertSession(requestToken, isCurrent);
      if (['SessionChangedError', 'SupersededRequestError'].includes((error as Error)?.name)) throw error;
      // Only a still-owned request may use the offline recovery fallback.
    } finally { clearTimeout(timeoutId); }

    assertSession(requestToken, isCurrent);
    const pending = await PendingOutbox.list();
    const rejected = await PendingOutbox.rejected();
    const acknowledged = await PendingOutbox.acknowledged();
    assertSession(requestToken, isCurrent);
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
      const replayToken = PosStorage.getToken();
      let syncedCount = 0;
      let rejectedCount = 0;
      let reachable = false;
      const queue = await PendingOutbox.list();
      // Read server status in bounded batches. Only a POST acknowledgment (201) clears a recovery copy.
      for (let offset = 0; offset < Math.max(1, queue.length); offset += 100) {
        if (PosStorage.getToken() !== replayToken) return { syncedCount, rejectedCount, pendingCount: (await PendingOutbox.list()).length, reachable: false };
        const batch = queue.slice(offset, offset + 100);
        const query = new URLSearchParams();
        batch.forEach(order => query.append('key', order.idempotencyKey!));
        try {
          const response = await sessionFetch(`/api/orders/pending-status?${query}`, { headers: authHeaders(), signal: AbortSignal.timeout(5000) });
          reachable = true;
          if (!response.ok) return { syncedCount, rejectedCount, pendingCount: (await PendingOutbox.list()).length, reachable };
          if (response.ok) await response.json();
        } catch { return { syncedCount, rejectedCount, pendingCount: (await PendingOutbox.list()).length, reachable: false }; }
      }
      for (const order of await PendingOutbox.list()) {
        if (PosStorage.getToken() !== replayToken) break;
        const result = await submitSale(order);
        if (result.state === 'saved') syncedCount++;
        if (result.state === 'rejected') { rejectedCount++; try { cacheOrder(result.order); } catch { /* rejection remains durable in IndexedDB */ } }
        if (result.state === 'pending' && !result.order.recoveryBlockedReason) { reachable = false; break; }
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
    const { stockQuantity: _stock, ...catalog } = normalized;
    const updated = await persistProduct(`/api/products/${normalized.id}`, 'PUT', catalog);
    optionalCache(() => PosStorage.setProducts(PosStorage.getProducts().map(p => p.id === updated.id ? updated : p)));
    return updated;
  },

  async deleteProduct(productId: string, _isOnline: boolean): Promise<boolean> {
    const headers = authHeaders();
    const response = await sessionFetch(`/api/products/${encodeURIComponent(productId)}`, { method: 'DELETE', ...(Object.keys(headers).length ? { headers } : {}) });
    if (!response.ok) throw new Error('Product could not be deleted. Retry when the server is available.');
    optionalCache(() => PosStorage.setProducts(PosStorage.getProducts().filter(p => p.id !== productId)));
    return true;
  },

  // Category CRUD
  async createCategory(name: string, icon: string, _isOnline: boolean): Promise<Category> {
    const category = { id: `cat-${crypto.randomUUID()}`, name: name.trim(), icon, itemCount: 0, order: 99 };
    const response = await sessionFetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(category) });
    if (!response.ok) throw new Error('Category could not be saved on the server. Retry when it is available.');
    const saved = { ...category, ...await response.json() };
    if (!saved.id) throw new Error('Server did not confirm the category.');
    optionalCache(() => PosStorage.setCategories([...PosStorage.getCategories(), saved]));
    return saved;
  },

  async updateCategory(category: Category, _isOnline: boolean): Promise<Category> {
    const response = await sessionFetch(`/api/categories/${encodeURIComponent(category.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(category) });
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
      const headers = authHeaders();
      const res = await sessionFetch(`/api/categories/${categoryId}`, { method: 'DELETE', ...(Object.keys(headers).length ? { headers } : {}) });
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
    _isOnline: boolean
  ): Promise<{ product: Product; log: InventoryLog }> {
    const signature = JSON.stringify({ productId, changeAmount, reason, type, userId: user.id });
    const operationId = stockAdjustmentKeys.get(signature) || crypto.randomUUID();
    stockAdjustmentKeys.set(signature, operationId);
    const response = await sessionFetch('/api/inventory/adjust', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
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

  // AUTHENTICATION & LOGIN (server is the only source of truth; credentials never live in the browser)
  async login(
    username: string,
    passwordOrPin: string,
    _isOnline?: boolean
  ): Promise<{ success: boolean; user?: User; expiresAt?: number; error?: string }> {
    try {
      await flushSessionRevocations();
      const previousToken = PosStorage.getToken();
      const res = await sessionFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim().toLowerCase(), password: passwordOrPin.trim(), pin: passwordOrPin.trim() }),
      });
      const data = await res.json();
      if (PosStorage.getToken() !== previousToken) return { success: false, error: 'The session changed in another window. Please retry.' };
      if (res.ok && data.user && data.token && Number.isSafeInteger(data.expiresAt) && data.expiresAt > Date.now()) {
        PosStorage.setToken(data.token);
        PosStorage.setSession(data.user);
        return { success: true, user: data.user, expiresAt: data.expiresAt };
      }
      return { success: false, error: data.error || 'Invalid credentials' };
    } catch {
      return { success: false, error: 'Cannot reach the POS server. Start it and retry.' };
    }
  },

  async logout(): Promise<void> {
    const token = PosStorage.getToken();
    let queued = false;
    try { if (token) { queueSessionRevocation(token); queued = true; } }
    catch { /* Storage failure must never prevent the local terminal locking. */ }
    finally { endSession(token, 'You have been logged out.'); }
    if (token && !queued) {
      try { await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) }); }
      catch { /* Local lock still takes effect when storage and server are unavailable. */ }
    }
    await flushSessionRevocations();
  },

  async approveOverride(username: string, pin: string): Promise<{ approved: boolean; approvalToken?: string; approver?: User; error?: string }> {
    try {
      const res = await sessionFetch('/api/auth/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ username: username.trim().toLowerCase(), pin: pin.trim() }),
      });
      const data = await res.json();
      return res.ok ? { approved: true, approvalToken: data.approvalToken, approver: data.approver } : { approved: false, error: data.error || 'Manager approval failed.' };
    } catch {
      return { approved: false, error: 'Cannot reach the POS server.' };
    }
  },

  // USER MANAGEMENT (admin token required by the server)
  async listUsers(): Promise<User[]> {
    const res = await sessionFetch('/api/users', { headers: authHeaders() });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not load staff accounts.');
    return body;
  },

  async createUser(input: Partial<User> & { password: string; pin: string }): Promise<User> {
    const res = await sessionFetch('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(input),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not create the staff account.');
    return body;
  },

  async updateUser(id: string, changes: Partial<User> & { password?: string; pin?: string }): Promise<User> {
    const res = await sessionFetch(`/api/users/${encodeURIComponent(id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(changes),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not update the staff account.');
    return body;
  },

  async resetUserPin(id: string, pin: string, password?: string): Promise<User> {
    const res = await sessionFetch(`/api/users/${encodeURIComponent(id)}/reset-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ pin, ...(password ? { password } : {}) }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not reset staff PIN.');
    return body;
  },
};
