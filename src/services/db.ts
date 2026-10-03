import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'maltiva_pos.db');
const db = new Database(DB_PATH);

export function initDb() {
  console.log('Initializing Professional SQLite Database...');

  // Enable WAL mode for better performance and crash resistance
  db.pragma('journal_mode = WAL');

  // 1. Users Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password TEXT,
      pin TEXT,
      role TEXT CHECK(role IN ('admin', 'cashier', 'manager')) NOT NULL,
      avatar TEXT,
      active INTEGER DEFAULT 1,
      branch TEXT,
      securityQuestion TEXT,
      securityAnswer TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 2. Categories Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      itemCount INTEGER DEFAULT 0,
      "order" INTEGER DEFAULT 0
    )
  `).run();

  // 3. Products Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      categoryId TEXT,
      categoryName TEXT,
      price REAL NOT NULL,
      costPrice REAL DEFAULT 0,
      stockQuantity INTEGER DEFAULT 0,
      minStockThreshold INTEGER DEFAULT 5,
      image TEXT,
      description TEXT,
      isAvailable INTEGER DEFAULT 1,
      isDeal INTEGER DEFAULT 0,
      bundledProducts TEXT,
      variations TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(categoryId) REFERENCES categories(id)
    )
  `).run();

  const productColumns = db.prepare('PRAGMA table_info(products)').all() as Array<{ name: string }>;
  if (!productColumns.some(column => column.name === 'variations')) {
    db.prepare('ALTER TABLE products ADD COLUMN variations TEXT').run();
  }

  // 4. Orders Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      orderNumber TEXT UNIQUE NOT NULL,
      tokenNumber INTEGER,
      customerName TEXT,
      status TEXT NOT NULL,
      orderType TEXT,
      subtotal REAL,
      tax REAL,
      discount REAL DEFAULT 0,
      total REAL,
      totalCost REAL,
      profit REAL,
      profitMarginPercent REAL,
      paymentMethod TEXT,
      cashierId TEXT,
      cashierName TEXT,
      cashierRole TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      synced INTEGER DEFAULT 1,
      offlineQueueId TEXT,
      FOREIGN KEY(cashierId) REFERENCES users(id)
    )
  `).run();

  // 5. Order Items Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      orderId TEXT NOT NULL,
      productId TEXT,
      productName TEXT,
      categoryName TEXT,
      unitPrice REAL,
      unitCost REAL,
      quantity INTEGER,
      totalPrice REAL,
      totalCost REAL,
      selectedVariations TEXT,
      notes TEXT,
      bundledProducts TEXT,
      FOREIGN KEY(orderId) REFERENCES orders(id) ON DELETE CASCADE
    )
  `).run();

  // 6. Inventory Logs Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS inventory_logs (
      id TEXT PRIMARY KEY,
      productId TEXT,
      productName TEXT,
      previousStock INTEGER,
      changeAmount INTEGER,
      newStock INTEGER,
      type TEXT,
      reason TEXT,
      userId TEXT,
      userName TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 7. Settings Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `).run();

  // 8. Tables Table (Dine-in management)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL,
      status TEXT DEFAULT 'available',
      currentOrderId TEXT,
      currentOrderNumber TEXT,
      guestCount INTEGER DEFAULT 0,
      FOREIGN KEY(currentOrderId) REFERENCES orders(id)
    )
  `).run();

  console.log('Database Vault Ready.');
}

export default db;
