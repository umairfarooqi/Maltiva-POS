import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import db, { initDb } from './src/services/db';
import { 
  INITIAL_CATEGORIES, 
  INITIAL_PRODUCTS, 
  INITIAL_USERS, 
  INITIAL_PRINTER_SETTINGS 
} from './src/data/initialData';
import { Order, Product, Category, User, InventoryLog, PrinterSettings } from './src/types/pos';

// Initialize the SQLite Database
initDb();

// Utility to handle JSON in SQLite (for arrays/objects)
const parseJson = <T>(val: string | null): T | [] => (val ? JSON.parse(val) : []);
const stringifyJson = (val: any) => JSON.stringify(val);

// Seed Database with Initial Data if empty
function seedDatabase() {
  const userCount = db.prepare('SELECT count(*) as count FROM users').get() as { count: number };
  if (userCount.count === 0) {
    console.log('Seeding initial data into SQLite...');
    
    const insertUser = db.prepare(`
      INSERT INTO users (id, name, username, email, password, pin, role, avatar, active, branch, securityQuestion, securityAnswer)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    INITIAL_USERS.forEach(u => {
      insertUser.run(u.id, u.name, u.username, u.email, u.password, u.pin, u.role, u.avatar, 1, u.branch, u.securityQuestion, u.securityAnswer);
    });

    const insertCat = db.prepare(`INSERT INTO categories (id, name, icon, "order") VALUES (?, ?, ?, ?)`);
    INITIAL_CATEGORIES.forEach(c => {
      insertCat.run(c.id, c.name, c.icon, c.order);
    });

    const insertProd = db.prepare(`
      INSERT INTO products (id, name, categoryId, categoryName, price, costPrice, stockQuantity, minStockThreshold, image, description, isAvailable, isDeal, bundledProducts, variations)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    INITIAL_PRODUCTS
      .filter(p => p.name !== 'Untitled Dish' && Number(p.price) > 0)
      .forEach(p => {
      insertProd.run(
        p.id, p.name, p.categoryId, p.categoryName, p.price, p.costPrice,
        p.stockQuantity, p.minStockThreshold, p.image, p.description,
        1, p.isDeal ? 1 : 0, stringifyJson(p.bundledProducts || []), stringifyJson(p.variations || [])
      );
      });

    // Seed initial settings
    const setStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    setStmt.run('storeName', INITIAL_PRINTER_SETTINGS.storeName);
    setStmt.run('tagline', INITIAL_PRINTER_SETTINGS.tagline);
    setStmt.run('address', INITIAL_PRINTER_SETTINGS.address);
    setStmt.run('whatsApp', INITIAL_PRINTER_SETTINGS.whatsApp);
    setStmt.run('taxRatePercent', INITIAL_PRINTER_SETTINGS.taxRatePercent.toString());
    setStmt.run('paperWidth', INITIAL_PRINTER_SETTINGS.paperWidth);
    setStmt.run('autoPrintDualSlips', INITIAL_PRINTER_SETTINGS.autoPrintDualSlips ? 'true' : 'false');
    setStmt.run('customerDisplayGreeting', INITIAL_PRINTER_SETTINGS.customerDisplayGreeting);
  }
}

seedDatabase();

function loadOrder(id: string): Order | undefined {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as any;
  if (!row) return undefined;
  const items = db.prepare('SELECT * FROM order_items WHERE orderId = ? ORDER BY rowid').all(id).map((item: any) => ({
    ...item, selectedVariations: parseJson(item.selectedVariations), bundledProducts: parseJson(item.bundledProducts),
  }));
  const cash = db.prepare("SELECT tendered FROM payments WHERE order_id = ? AND method = 'cash'").get(id) as any;
  return { ...row, idempotencyKey: row.idempotency_key, items, cashTendered: cash?.tendered,
    synced: true, persistenceState: 'saved' };
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    const orderCount = db.prepare('SELECT count(*) as count FROM orders').get() as { count: number };
    res.json({
      status: 'ok',
      db: 'SQLite Professional',
      activeOrders: orderCount.count,
      timestamp: new Date().toISOString(),
    });
  });

  // Full Initial Data Sync
  app.get('/api/data', (req: Request, res: Response) => {
    const categories = db.prepare('SELECT * FROM categories').all() as Category[];
    const fetchedProducts = db.prepare('SELECT *, bundledProducts as bundledProducts_json, variations as variations_json FROM products').all().map((p: any) => ({
      ...p,
      bundledProducts: parseJson(p.bundledProducts_json || p.bundledProducts),
      variations: parseJson(p.variations_json || p.variations || '[]'),
    })) as Product[];
    const validProducts = fetchedProducts.filter(p => p.name !== 'Untitled Dish' && Number(p.price) > 0);
    const orders = (db.prepare('SELECT id FROM orders ORDER BY createdAt DESC, rowid DESC').all() as { id: string }[]).map(row => loadOrder(row.id)!);
    const tables = db.prepare('SELECT * FROM tables').all();
    const users = db.prepare('SELECT * FROM users').all() as User[];
    
    // Get settings from KV table
    const settingsRows = db.prepare('SELECT * FROM settings').all() as { key: string, value: string }[];
    const settingsMap: any = {};
    settingsRows.forEach(row => settingsMap[row.key] = row.value);

    const printerSettings: PrinterSettings = {
      storeName: settingsMap.storeName || 'Maltiva Crust',
      tagline: settingsMap.tagline || '',
      address: settingsMap.address || '',
      whatsApp: settingsMap.whatsApp || '',
      taxRatePercent: parseFloat(settingsMap.taxRatePercent || '0'),
      paperWidth: settingsMap.paperWidth || '80mm',
      autoPrintDualSlips: settingsMap.autoPrintDualSlips === 'true',
      customerDisplayGreeting: settingsMap.customerDisplayGreeting || 'Welcome!',
    };

    const inventoryLogs = db.prepare('SELECT * FROM inventory_logs ORDER BY timestamp DESC').all() as InventoryLog[];

    res.json({
      categories,
      products: validProducts,
      orders,
      tables,
      users,
      printerSettings,
      inventoryLogs,
      isOnline: true,
    });
  });

  // PRODUCTS CRUD
  app.get('/api/products', (req: Request, res: Response) => {
    const fetchedProducts = db.prepare('SELECT *, bundledProducts as bundledProducts_json, variations as variations_json FROM products').all().map((p: any) => ({
      ...p,
      bundledProducts: parseJson(p.bundledProducts_json || p.bundledProducts),
      variations: parseJson(p.variations_json || p.variations || '[]'),
    })) as Product[];
    const validProducts = fetchedProducts.filter(p => p.name !== 'Untitled Dish' && Number(p.price) > 0);
    res.json(validProducts);
  });

  app.post('/api/products', (req: Request, res: Response) => {
    const data = req.body;
    const id = data.id || `prod-${Date.now()}`;

    const insert = db.prepare(`
      INSERT INTO products (id, name, categoryId, categoryName, price, costPrice, stockQuantity, minStockThreshold, image, description, isAvailable, isDeal, bundledProducts, variations)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      id, data.name, data.categoryId, data.categoryName, data.price, data.costPrice,
      data.stockQuantity, data.minStockThreshold, data.image, data.description,
      data.isAvailable !== false ? 1 : 0, data.isDeal ? 1 : 0,
      stringifyJson(data.bundledProducts || []), stringifyJson(data.variations || [])
    );

    res.status(201).json({ ...data, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  });

  app.put('/api/products/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const data = req.body;

    const update = db.prepare(`
      UPDATE products SET 
        name = ?, categoryId = ?, categoryName = ?, price = ?, costPrice = ?,
        stockQuantity = ?, minStockThreshold = ?, image = ?, description = ?,
        isAvailable = ?, isDeal = ?, bundledProducts = ?, variations = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    update.run(
      data.name, data.categoryId, data.categoryName, data.price, data.costPrice,
      data.stockQuantity, data.minStockThreshold, data.image, data.description,
      data.isAvailable !== false ? 1 : 0, data.isDeal ? 1 : 0,
      stringifyJson(data.bundledProducts || []), stringifyJson(data.variations || []), id
    );

    res.json({
      ...data,
      id,
      updatedAt: new Date().toISOString(),
      createdAt: data.createdAt || new Date().toISOString(),
    });
  });

  app.delete('/api/products/:id', (req: Request, res: Response) => {
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // CATEGORIES CRUD
  app.post('/api/categories', (req: Request, res: Response) => {
    const { name, icon, id: requestedId } = req.body;
    const id = requestedId || `cat-${Date.now()}`;
    db.prepare('INSERT INTO categories (id, name, icon, "order") VALUES (?, ?, ?, ?)').run(id, name, icon, 0);
    res.status(201).json({ id, name, icon, itemCount: 0, order: 0 });
  });

  app.put('/api/categories/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, icon } = req.body;
    db.prepare('UPDATE categories SET name = ?, icon = ? WHERE id = ?').run(name, icon, id);

    // Update product category names
    db.prepare('UPDATE products SET categoryName = ? WHERE categoryId = ?').run(name, id);
    const updatedCategory = { ...(req.body || {}), id, name, icon };
    res.json(updatedCategory);
  });

  app.delete('/api/categories/:id', (req: Request, res: Response) => {
    const fallbackId = 'cat-uncategorized';
    const fallbackName = 'Uncategorized';
    if (req.params.id === fallbackId) {
      res.status(400).json({ error: 'The Uncategorized category cannot be deleted' });
      return;
    }
    const transaction = db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO categories (id, name, icon, "order") VALUES (?, ?, ?, ?)')
        .run(fallbackId, fallbackName, '📦', 999);
      db.prepare('UPDATE products SET categoryId = ?, categoryName = ? WHERE categoryId = ?')
        .run(fallbackId, fallbackName, req.params.id);
      db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    });
    transaction();
    res.json({ success: true });
  });

  // Reconcile keys from this browser's durable outbox. Unsent keys are known only to the browser.
  app.get('/api/orders/pending-status', (req: Request, res: Response) => {
    const input = req.query.key;
    const keys = input === undefined ? [] : Array.isArray(input) ? input : [input];
    if (keys.length > 100 || keys.some(key => typeof key !== 'string' || key.length > 200)) {
      res.status(400).json({ error: 'Provide at most 100 valid outbox keys' });
      return;
    }
    const savedOrders: Order[] = [];
    const pendingKeys: string[] = [];
    for (const key of keys) {
      const row = db.prepare('SELECT id FROM orders WHERE idempotency_key = ?').get(key) as { id: string } | undefined;
      if (row) savedOrders.push(loadOrder(row.id)!);
      else pendingKeys.push(key as string);
    }
    res.json({ savedOrders, pendingKeys, pendingCount: pendingKeys.length });
  });

  // Phase 1 preserves the existing accounting inputs; authoritative pricing is phase 2.
  const createOrder = db.transaction((order: Order, key: string) => {
    const existing = db.prepare('SELECT id FROM orders WHERE idempotency_key = ?').get(key) as { id: string } | undefined;
    if (existing) return loadOrder(existing.id)!;
    if (!order.id || !order.orderNumber || !Array.isArray(order.items) || order.items.length === 0 ||
        !Number.isFinite(order.total) || order.total < 0 ||
        order.items.some(item => !item.id || !item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      throw Object.assign(new Error('The sale needs valid items and a total'), { status: 400 });
    }
    const createdAt = new Date().toISOString();
    const tendered = order.paymentMethod === 'cash' ? (order.cashTendered ?? order.total) : null;
    const changeDue = tendered === null ? 0 : Math.max(0, tendered - order.total);
    db.prepare(`
      INSERT INTO orders (id, idempotency_key, orderNumber, tokenNumber, customerName, status, orderType,
        subtotal, tax, discount, total, totalCost, profit, profitMarginPercent, paymentMethod,
        cashierId, cashierName, cashierRole, createdAt, changeDue)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(order.id, key, order.orderNumber, order.tokenNumber, order.customerName ?? null, order.status,
      order.orderType, order.subtotal, order.tax, order.discount, order.total, order.totalCost,
      order.profit, order.profitMarginPercent, order.paymentMethod, order.cashierId, order.cashierName,
      order.cashierRole, createdAt, changeDue);
    const itemStmt = db.prepare(`
      INSERT INTO order_items (id, orderId, productId, productName, categoryName, unitPrice, unitCost,
        quantity, totalPrice, totalCost, selectedVariations, notes, bundledProducts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of order.items) {
      const prod = db.prepare('SELECT name, stockQuantity FROM products WHERE id = ?').get(item.productId) as any;
      if (!prod) throw Object.assign(new Error(`Product is no longer present: ${item.productName}`), { status: 400 });
      itemStmt.run(item.id, order.id, item.productId, item.productName, item.categoryName, item.unitPrice,
        item.unitCost, item.quantity, item.totalPrice, item.totalCost, stringifyJson(item.selectedVariations || []),
        item.notes ?? null, stringifyJson(item.bundledProducts || []));
      db.prepare('UPDATE products SET stockQuantity = stockQuantity - ? WHERE id = ?').run(item.quantity, item.productId);
      db.prepare(`INSERT INTO stock_movements (id, product_id, delta, type, ref, user_id, created_at)
        VALUES (?, ?, ?, 'sale', ?, ?, ?)`).run(randomUUID(), item.productId, -item.quantity, order.id, order.cashierId, createdAt);
      db.prepare(`INSERT INTO inventory_logs (id, productId, productName, previousStock, changeAmount,
        newStock, type, reason, userId, userName, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), item.productId, prod.name, prod.stockQuantity, -item.quantity,
        prod.stockQuantity - item.quantity, 'sale', `Order ${order.orderNumber}`, order.cashierId, order.cashierName, createdAt);
    }
    db.prepare(`INSERT INTO payments (id, order_id, method, amount, tendered, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(randomUUID(), order.id, order.paymentMethod, order.total, tendered, createdAt);
    return loadOrder(order.id)!;
  });

  app.post('/api/orders', (req: Request, res: Response) => {
    const key = req.get('Idempotency-Key') || req.body?.idempotencyKey;
    if (typeof key !== 'string' || !key.trim() || key.length > 200) {
      res.status(400).json({ error: 'An idempotency key is required' });
      return;
    }
    try {
      const order = createOrder(req.body, key);
      // A replay also returns 201: it acknowledges this key's original committed sale.
      res.status(201).json({ success: true, order });
    } catch (err: any) {
      const status = err.status || (['SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY'].includes(err.code) ? 409 : 500);
      res.status(status).json({ error: err.status ? err.message : status === 409
        ? 'Sale conflicts with an existing record. Review the order before retrying.'
        : 'Sale could not be saved. Your cart is retained; retry or review it.' });
    }
  });

  // AUTHENTICATION
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE (username = ? OR email = ?) AND active = 1').get(username, username) as User;

    if (user && (user.password === password || user.pin === password)) {
      res.json({ success: true, user });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  // SETTINGS
  app.get('/api/settings/printer', (req: Request, res: Response) => {
    const settingsRows = db.prepare('SELECT * FROM settings').all() as { key: string, value: string }[];
    const settingsMap: any = {};
    settingsRows.forEach(row => settingsMap[row.key] = row.value);
    
    res.json({
      storeName: settingsMap.storeName || 'Maltiva Crust',
      taxRatePercent: parseFloat(settingsMap.taxRatePercent || '0'),
      paperWidth: settingsMap.paperWidth || '80mm',
      autoPrintDualSlips: settingsMap.autoPrintDualSlips === 'true',
      customerDisplayGreeting: settingsMap.customerDisplayGreeting || 'Welcome!',
    });
  });

  app.put('/api/settings/printer', (req: Request, res: Response) => {
    const data = req.body;
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    
    const settingsToSave = {
      storeName: data.storeName,
      taxRatePercent: data.taxRatePercent?.toString(),
      paperWidth: data.paperWidth,
      autoPrintDualSlips: data.autoPrintDualSlips ? 'true' : 'false',
      customerDisplayGreeting: data.customerDisplayGreeting,
    };

    for (const [key, value] of Object.entries(settingsToSave)) {
      if (value !== undefined) stmt.run(key, value);
    }

    res.json({ success: true });
  });

  // Vite Middleware
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  const HOST = process.env.HOST || '127.0.0.1';
  app.listen(Number(PORT), HOST, () => {
    console.log(`Maltiva Professional POS running on http://${HOST}:${PORT}`);
  });
}

startServer();
