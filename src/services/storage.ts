import { Order, Product, Category, TableItem, User, InventoryLog, PrinterSettings, Customer, CartItem, PaymentMethod } from '../types/pos';
import { checkoutData, checkoutCart } from './clientPrivacy';
import { upgradeMoney } from '../shared/moneyUpgrade';
import {
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_ORDERS,
  INITIAL_TABLES,
  INITIAL_PRINTER_SETTINGS,
  INITIAL_CUSTOMERS,
} from '../data/initialData';

export interface CheckoutDraft {
  cart: CartItem[];
  paymentMethod: PaymentMethod;
  attempt?: Order;
}

const STORAGE_KEYS = {
  CATEGORIES: 'tasty_pos_categories',
  PRODUCTS: 'tasty_pos_products',
  ORDERS: 'tasty_pos_orders',
  TABLES: 'tasty_pos_tables',
  USERS: 'tasty_pos_users',
  CUSTOMERS: 'tasty_pos_customers',
  PRINTER: 'tasty_pos_printer',
  LOGS: 'tasty_pos_logs',
  OFFLINE_QUEUE: 'tasty_pos_offline_queue',
  ACTIVE_USER: 'tasty_pos_active_user',
  DRAFT: 'tasty_pos_checkout_draft',
};

export class PosStorage {
  private static revision = 0;
  private static memoryToken: string | null = null;
  private static privateMemory = new Map<string, unknown>();

  static invalidatePrivateMemory() {
    this.revision++;
    this.privateMemory.clear();
    this.memoryToken = this.getToken();
  }
  static sessionRevision() {
    if (this.memoryToken !== this.getToken()) this.invalidatePrivateMemory();
    return this.revision;
  }
  private static remember(key: string, value: unknown) {
    this.sessionRevision();
    if (this.getToken()) this.privateMemory.set(key, structuredClone(value));
  }
  private static remembered<T>(key: string): T | undefined {
    this.sessionRevision();
    const value = this.privateMemory.get(key);
    return value === undefined ? undefined : structuredClone(value) as T;
  }
  /** Remove private fields from old persisted data without removing a recovery copy. */
  static sanitizeBrowserData() {
    for (const key of [STORAGE_KEYS.PRODUCTS, STORAGE_KEYS.ORDERS, STORAGE_KEYS.DRAFT,
      STORAGE_KEYS.OFFLINE_QUEUE, STORAGE_KEYS.ACTIVE_USER, 'pos_customer_confirmation', 'pos_customer_display_state']) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const safe = JSON.stringify(checkoutData(JSON.parse(raw)));
          if (safe !== raw) localStorage.setItem(key, safe);
        }
      } catch { /* Preserve unreadable/recovery bytes; safe readers never expose private fields. */ }
    }
    for (const key of [STORAGE_KEYS.USERS, STORAGE_KEYS.LOGS]) {
      try { localStorage.removeItem(key); } catch { /* Readers ignore legacy private caches. */ }
    }
  }

  static getDatabaseGeneration(): string | null {
    return localStorage.getItem('pos_database_generation');
  }

  static observeDatabaseGeneration(generation: string, restored: boolean): boolean {
    const previous = this.getDatabaseGeneration();
    const changed = previous ? previous !== generation : restored;
    if (changed) {
      this.invalidatePrivateMemory();
      localStorage.setItem('pos_database_changed', 'true');
      // Never remove drafts, legacy pending sales or IndexedDB recovery copies.
      for (const key of [STORAGE_KEYS.CATEGORIES, STORAGE_KEYS.PRODUCTS, STORAGE_KEYS.ORDERS,
        STORAGE_KEYS.TABLES, STORAGE_KEYS.USERS, STORAGE_KEYS.CUSTOMERS, STORAGE_KEYS.PRINTER,
        STORAGE_KEYS.LOGS, 'pos_customer_confirmation']) localStorage.removeItem(key);
    }
    if (previous !== generation) localStorage.setItem('pos_database_generation', generation);
    return changed;
  }
  static getDraft(): CheckoutDraft | null {
    let value: any;
    try {
      value = JSON.parse(localStorage.getItem(STORAGE_KEYS.DRAFT) || 'null');
    } catch { return null; }
    return value && Array.isArray(value.cart) ? checkoutCart(upgradeMoney<CheckoutDraft>(value)) : null;
  }

  static setDraft(draft: CheckoutDraft) {
    localStorage.setItem(STORAGE_KEYS.DRAFT, JSON.stringify(checkoutData(upgradeMoney(draft))));
  }

  static clearDraft() {
    localStorage.removeItem(STORAGE_KEYS.DRAFT);
  }

  static getCategories(): Category[] {
    const data = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
    return data ? JSON.parse(data) : INITIAL_CATEGORIES;
  }

  static setCategories(categories: Category[]) {
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
  }

  static getProducts(): Product[] {
    const memory = this.remembered<Product[]>(STORAGE_KEYS.PRODUCTS);
    if (memory) return memory;
    const data = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    if (!data) {
      return checkoutData(upgradeMoney(this.filterValidProducts(INITIAL_PRODUCTS)));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) throw new Error('Invalid product cache');
    } catch {
      const products = this.filterValidProducts(INITIAL_PRODUCTS);
      return checkoutData(upgradeMoney(products));
    }
    // A conversion error leaves the original cache intact and reports the invalid row.
    return checkoutData(this.filterValidProducts(upgradeMoney<Product[]>(parsed)));
  }

  static setProducts(products: Product[]) {
    this.remember(STORAGE_KEYS.PRODUCTS, this.filterValidProducts(upgradeMoney<Product[]>(products)));
    localStorage.setItem(
      STORAGE_KEYS.PRODUCTS,
      JSON.stringify(checkoutData(this.filterValidProducts(upgradeMoney<Product[]>(products))))
    );
  }

  private static filterValidProducts(products: Product[]): Product[] {
    return products.filter(product =>
      product &&
      product.name !== 'Untitled Dish' &&
      Number(product.pricePaisa ?? (product as any).price) >= 0
    );
  }

  static getOrders(): Order[] {
    const memory = this.remembered<Order[]>(STORAGE_KEYS.ORDERS);
    if (memory) return memory;
    const data = localStorage.getItem(STORAGE_KEYS.ORDERS);
    return checkoutData(upgradeMoney(data ? JSON.parse(data) : []));
  }

  static setOrders(orders: Order[]) {
    this.remember(STORAGE_KEYS.ORDERS, upgradeMoney<Order[]>(orders));
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(checkoutData(upgradeMoney(orders))));
  }

  static getTables(): TableItem[] {
    const data = localStorage.getItem(STORAGE_KEYS.TABLES);
    try { const parsed = data ? JSON.parse(data) : INITIAL_TABLES; return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }

  static setTables(tables: TableItem[]) {
    localStorage.setItem(STORAGE_KEYS.TABLES, JSON.stringify(tables));
  }

  static getUsers(): User[] {
    return this.remembered<User[]>(STORAGE_KEYS.USERS) || [];
  }

  static setUsers(users: User[]) {
    this.remember(STORAGE_KEYS.USERS, checkoutData(users));
    localStorage.removeItem(STORAGE_KEYS.USERS);
  }

  static getCustomers(): Customer[] {
    const data = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    return upgradeMoney(data ? JSON.parse(data) : INITIAL_CUSTOMERS);
  }

  static setCustomers(customers: Customer[]) {
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(upgradeMoney(customers)));
  }

  static getPrinterSettings(): PrinterSettings {
    const data = localStorage.getItem(STORAGE_KEYS.PRINTER);
    return upgradeMoney(data ? JSON.parse(data) : INITIAL_PRINTER_SETTINGS);
  }

  static setPrinterSettings(settings: PrinterSettings) {
    localStorage.setItem(STORAGE_KEYS.PRINTER, JSON.stringify(upgradeMoney(settings)));
  }

  static getInventoryLogs(): InventoryLog[] {
    return this.remembered<InventoryLog[]>(STORAGE_KEYS.LOGS) || [];
  }

  static setInventoryLogs(logs: InventoryLog[]) {
    this.remember(STORAGE_KEYS.LOGS, logs);
    localStorage.removeItem(STORAGE_KEYS.LOGS);
  }

  static getOfflineQueue(): Order[] {
    const data = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
    return checkoutData(upgradeMoney(data ? JSON.parse(data) : []));
  }

  static setOfflineQueue(queue: Order[]) {
    localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(checkoutData(upgradeMoney(queue))));
  }

  static addToOfflineQueue(order: Order) {
    const current = this.getOfflineQueue();
    // Prevent duplicate entries in queue
    if (!current.some(o => o.id === order.id || o.offlineQueueId === order.offlineQueueId)) {
      current.push(order);
      this.setOfflineQueue(current);
    }
  }

  static clearOfflineQueue() {
    localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify([]));
  }

  static getActiveUser(): User | null {
    const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER);
    if (data) {
      try {
        return checkoutData(JSON.parse(data));
      } catch {
        // fallback
      }
    }
    return null;
  }

  static setActiveUser(user: User) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(checkoutData(user)));
  }

  static getSession(): User | null {
    const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER);
    if (data) {
      try {
        return checkoutData(JSON.parse(data));
      } catch {
        return null;
      }
    }
    return null;
  }

  static setSession(user: User) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(checkoutData(user)));
  }

  static clearSession() {
    this.invalidatePrivateMemory();
    this.sanitizeBrowserData();
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_USER);
    localStorage.removeItem('tasty_pos_auth_token');
  }

  static getToken(): string | null {
    try { return localStorage.getItem('tasty_pos_auth_token'); } catch { return null; }
  }

  static setToken(token: string) {
    if (this.getToken() !== token) { this.invalidatePrivateMemory(); this.sanitizeBrowserData(); }
    localStorage.setItem('tasty_pos_auth_token', token);
    this.memoryToken = token;
  }
}
