import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import { fromMoneyRow, toMoneyRow } from './src/services/moneyMigration';
import { quoteSale, loadProduct, taxSettings, problem } from './src/services/pricing';
import { integer } from './src/shared/money';
import db, { initDb } from './src/services/db';
import { 
  INITIAL_CATEGORIES, 
  INITIAL_PRODUCTS, 
  INITIAL_USERS, 
  INITIAL_PRINTER_SETTINGS 
} from './src/data/initialData';
import { Order, Product, Category, User, InventoryLog, PrinterSettings } from './src/types/pos';

// Initialize the SQLite Database


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
      INSERT INTO products (id, name, categoryId, categoryName, price_paisa, cost_price_paisa, stockQuantity, minStockThreshold, image, description, isAvailable, isDeal, bundledProducts, variations)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    INITIAL_PRODUCTS
      .filter(p => p.name !== 'Untitled Dish' && Number(p.pricePaisa) > 0)
      .forEach(p => {
      insertProd.run(
        p.id, p.name, p.categoryId, p.categoryName, p.pricePaisa, p.costPricePaisa,
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
    setStmt.run('taxBp', INITIAL_PRINTER_SETTINGS.taxBp.toString());
    setStmt.run('taxInclusive', 'false');
    setStmt.run('paperWidth', INITIAL_PRINTER_SETTINGS.paperWidth);
    setStmt.run('autoPrintDualSlips', INITIAL_PRINTER_SETTINGS.autoPrintDualSlips ? 'true' : 'false');
    setStmt.run('customerDisplayGreeting', INITIAL_PRINTER_SETTINGS.customerDisplayGreeting);
  }
}



function loadOrder(id: string): Order | undefined {
  const row = fromMoneyRow('orders', db.prepare('SELECT * FROM orders WHERE id=?').get(id));
  if (!row) return;
  const items = db.prepare('SELECT * FROM order_items WHERE orderId=? ORDER BY rowid').all(id).map((raw: any) => {
    const item = fromMoneyRow('order_items', raw);
    return { ...item, selectedVariations: parseJson(item.selectedVariations), bundledProducts: parseJson(item.bundledProducts) };
  });
  const cash = db.prepare("SELECT tendered_paisa FROM payments WHERE order_id=? AND method='cash'").get(id) as any;
  return { ...row, idempotencyKey: row.idempotency_key, items, cashTenderedPaisa: cash?.tendered_paisa,
    taxInclusive: Boolean(row.taxInclusive), profitIncomplete: Boolean(row.profitIncomplete), synced: true, persistenceState: 'saved' };
}
function mappedValues(table: string, input: any) {
  const columns = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => c.name));
  return Object.fromEntries(Object.entries(toMoneyRow(table, input)).filter(([k,v]) => columns.has(k) && v !== undefined).map(([k,v]) => [k, typeof v === 'boolean' ? Number(v) : v]));
}
function insertMapped(table: string, input: any) {
  const row = mappedValues(table, input); const columns = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${columns.map(c => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...Object.values(row));
}
function validateProduct(data: any) {
  if (data.moneySchemaVersion !== 2) problem('Reload the menu before saving: paisa schema required');
  integer(data.pricePaisa); integer(data.costPricePaisa);
  if (!Array.isArray(data.variations) || !Array.isArray(data.bundledProducts)) problem('Invalid menu options');
  for (const group of data.variations) for (const option of group.options) {
    integer(option.priceDeltaPaisa, 'Option price', true); integer(option.costDeltaPaisa, 'Option cost', true);
  }
  for (const bundle of data.bundledProducts) {
    if (bundle.unitPricePaisa !== undefined) integer(bundle.unitPricePaisa);
    if (bundle.rawCostPaisa !== undefined) integer(bundle.rawCostPaisa);
  }
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
    const fetchedProducts = (db.prepare('SELECT id FROM products').all() as { id: string }[]).map(row => loadProduct(db, row.id)!);
    const validProducts = fetchedProducts.filter(p => p.name !== 'Untitled Dish' && Number(p.pricePaisa) > 0);
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
      ...taxSettings(db), moneySchemaVersion: 2,
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
    const fetchedProducts = (db.prepare('SELECT id FROM products').all() as { id: string }[]).map(row => loadProduct(db, row.id)!);
    const validProducts = fetchedProducts.filter(p => p.name !== 'Untitled Dish' && Number(p.pricePaisa) > 0);
    res.json(validProducts);
  });

  app.post('/api/products', (req, res) => {
    const data = req.body; validateProduct(data);
    const id = data.id || `prod-${Date.now()}`;
    insertMapped('products', { ...data, id, variations: stringifyJson(data.variations), bundledProducts: stringifyJson(data.bundledProducts) });
    res.status(201).json(loadProduct(db, id));
  });
  app.put('/api/products/:id', (req, res) => {
    const data = req.body; validateProduct(data);
    const row = mappedValues('products', { ...data, variations: stringifyJson(data.variations), bundledProducts: stringifyJson(data.bundledProducts), updatedAt: new Date().toISOString() });
    delete row.id;
    db.prepare(`UPDATE products SET ${Object.keys(row).map(k => `"${k}"=?`).join(',')} WHERE id=?`).run(...Object.values(row), req.params.id);
    res.json(loadProduct(db, req.params.id));
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

  app.post('/api/orders/quote', (req, res) => {
    try { res.json(quoteSale(db, req.body)); }
    catch (error: any) { res.status(error.status || 400).json({ error: error.message }); }
  });
  const createOrder = db.transaction((input: any, key: string) => {
    const existing = db.prepare('SELECT id FROM orders WHERE idempotency_key=?').get(key) as {id: string} | undefined;
    if (existing) return loadOrder(existing.id)!;
    const quote = quoteSale(db, input);
    if (input.moneySchemaVersion !== 2 || input.pricingFingerprint !== quote.pricingFingerprint) {
      problem('Prices need review. Review the current total and retry this sale.', 409);
    }
    if (!input.id || !input.orderNumber) problem('Sale identity is required');
    if (!['cash', 'card', 'scan', 'online'].includes(input.paymentMethod)) problem('Choose one supported payment method');
    const tenderedPaisa = input.paymentMethod === 'cash' ? integer(input.cashTenderedPaisa, 'Cash tender') : null;
    if (tenderedPaisa !== null && tenderedPaisa < quote.totalPaisa) problem('Cash tender must cover the server total');
    if (input.paymentMethod !== 'cash' && input.cashTenderedPaisa != null) problem('Only cash may carry tender');
    const createdAt = new Date().toISOString();
    const order = { ...input, ...quote, createdAt, idempotency_key: key, legacyDerived: false, profitIncomplete: false,
      changeDuePaisa: tenderedPaisa === null ? 0 : tenderedPaisa - quote.totalPaisa };
    insertMapped('orders', order);
    for (const item of quote.items) {
      const prod = db.prepare('SELECT stockQuantity FROM products WHERE id=?').get(item.productId) as any;
      insertMapped('order_items', { ...item, orderId: input.id, legacyDerived: false,
        selectedVariations: stringifyJson(item.selectedVariations), bundledProducts: stringifyJson(item.bundledProducts) });
      db.prepare('UPDATE products SET stockQuantity=stockQuantity-? WHERE id=?').run(item.quantity, item.productId);
      db.prepare("INSERT INTO stock_movements (id,product_id,delta,type,ref,user_id,created_at) VALUES (?,?,?,'sale',?,?,?)")
        .run(randomUUID(), item.productId, -item.quantity, input.id, input.cashierId, createdAt);
      db.prepare(`INSERT INTO inventory_logs (id,productId,productName,previousStock,changeAmount,newStock,type,reason,userId,userName,timestamp)
        VALUES (?,?,?,?,?,?,'sale',?,?,?,?)`).run(randomUUID(), item.productId, item.productName, prod.stockQuantity, -item.quantity,
          prod.stockQuantity - item.quantity, `Order ${input.orderNumber}`, input.cashierId, input.cashierName, createdAt);
    }
    insertMapped('payments', { id: randomUUID(), order_id: input.id, method: input.paymentMethod,
      amountPaisa: quote.totalPaisa, tenderedPaisa, created_at: createdAt });
    return loadOrder(input.id)!;
  });
  app.post('/api/orders', (req, res) => {
    const key = req.get('Idempotency-Key') || req.body?.idempotencyKey;
    if (typeof key !== 'string' || !key.trim() || key.length > 200) { res.status(400).json({error: 'An idempotency key is required'}); return; }
    try { res.status(201).json({ success: true, order: createOrder(req.body, key) }); }
    catch (error: any) {
      const status = error.status || (['SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY'].includes(error.code) ? 409 : error.code ? 500 : 400);
      res.status(status).json({ error: error.status ? error.message : 'Sale could not be saved. Review this cart before retrying.' });
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
      ...taxSettings(db), moneySchemaVersion: 2,
      paperWidth: settingsMap.paperWidth || '80mm',
      autoPrintDualSlips: settingsMap.autoPrintDualSlips === 'true',
      customerDisplayGreeting: settingsMap.customerDisplayGreeting || 'Welcome!',
    });
  });

  app.put('/api/settings/printer', (req: Request, res: Response) => {
    const data = req.body;
    if (data.taxInclusive !== undefined && typeof data.taxInclusive !== 'boolean') problem('Tax mode must be a boolean');
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    
    const settingsToSave = {
      storeName: data.storeName,
      taxBp: data.taxBp === undefined ? undefined : String(integer(data.taxBp, 'Tax basis points')),
      taxInclusive: data.taxInclusive === undefined ? undefined : data.taxInclusive ? 'true' : 'false',
      paperWidth: data.paperWidth,
      autoPrintDualSlips: data.autoPrintDualSlips ? 'true' : 'false',
      customerDisplayGreeting: data.customerDisplayGreeting,
    };

    for (const [key, value] of Object.entries(settingsToSave)) {
      if (value !== undefined) stmt.run(key, value);
    }

    res.json({ success: true });
  });

  app.use((error: any, _req: Request, res: Response, _next: any) => {
    res.status(error.status || 400).json({ error: error.message || 'Invalid request' });
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

initDb().then(() => { seedDatabase(); return startServer(); }).catch(error => { console.error(error); process.exitCode = 1; });
