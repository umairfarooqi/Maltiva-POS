import { Order, Product, Category, TableItem, User, InventoryLog, PrinterSettings, Customer, CartItem, PaymentMethod } from '../types/pos';
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
  static getDatabaseGeneration(): string | null {
    return localStorage.getItem('pos_database_generation');
  }

  static observeDatabaseGeneration(generation: string, restored: boolean): boolean {
    const previous = this.getDatabaseGeneration();
    const changed = previous ? previous !== generation : restored;
    if (changed) {
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
    return value && Array.isArray(value.cart) ? upgradeMoney(value) : null;
  }

  static setDraft(draft: CheckoutDraft) {
    localStorage.setItem(STORAGE_KEYS.DRAFT, JSON.stringify(upgradeMoney(draft)));
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
    const data = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    if (!data) {
      return upgradeMoney(this.filterValidProducts(INITIAL_PRODUCTS));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) throw new Error('Invalid product cache');
    } catch {
      const products = this.filterValidProducts(INITIAL_PRODUCTS);
      return upgradeMoney(products);
    }
    // A conversion error leaves the original cache intact and reports the invalid row.
    return this.filterValidProducts(upgradeMoney<Product[]>(parsed));
  }

  static setProducts(products: Product[]) {
    localStorage.setItem(
      STORAGE_KEYS.PRODUCTS,
      JSON.stringify(this.filterValidProducts(upgradeMoney<Product[]>(products)))
    );
  }

  private static filterValidProducts(products: Product[]): Product[] {
    return products.filter(product =>
      product &&
      product.name !== 'Untitled Dish' &&
      Number(product.pricePaisa ?? (product as any).price) > 0
    );
  }

  static getOrders(): Order[] {
    const data = localStorage.getItem(STORAGE_KEYS.ORDERS);
    return upgradeMoney(data ? JSON.parse(data) : []);
  }

  static setOrders(orders: Order[]) {
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(upgradeMoney(orders)));
  }

  static getTables(): TableItem[] {
    const data = localStorage.getItem(STORAGE_KEYS.TABLES);
    try { const parsed = data ? JSON.parse(data) : INITIAL_TABLES; return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }

  static setTables(tables: TableItem[]) {
    localStorage.setItem(STORAGE_KEYS.TABLES, JSON.stringify(tables));
  }

  static getUsers(): User[] {
    const data = localStorage.getItem(STORAGE_KEYS.USERS);
    try { return data ? JSON.parse(data) : []; } catch { return []; }
  }

  static setUsers(users: User[]) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
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
    const data = localStorage.getItem(STORAGE_KEYS.LOGS);
    return upgradeMoney(data ? JSON.parse(data) : []);
  }

  static setInventoryLogs(logs: InventoryLog[]) {
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
  }

  static getOfflineQueue(): Order[] {
    const data = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
    return upgradeMoney(data ? JSON.parse(data) : []);
  }

  static setOfflineQueue(queue: Order[]) {
    localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(upgradeMoney(queue)));
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
        return JSON.parse(data);
      } catch {
        // fallback
      }
    }
    return null;
  }

  static setActiveUser(user: User) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(user));
  }

  static getSession(): User | null {
    const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER);
    if (data) {
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    }
    return null;
  }

  static setSession(user: User) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(user));
  }

  static clearSession() {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_USER);
    localStorage.removeItem('tasty_pos_auth_token');
  }

  static getToken(): string | null {
    try { return localStorage.getItem('tasty_pos_auth_token'); } catch { return null; }
  }

  static setToken(token: string) {
    localStorage.setItem('tasty_pos_auth_token', token);
  }
}
