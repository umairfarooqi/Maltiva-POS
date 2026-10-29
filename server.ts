import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { fromMoneyRow, toMoneyRow } from './src/services/moneyMigration';
import { quoteSale, loadProduct, taxSettings, problem } from './src/services/pricing';
import { integer } from './src/shared/money';
import db, { initDb } from './src/services/db';
import { 
  INITIAL_CATEGORIES, 
  INITIAL_PRODUCTS, 
  INITIAL_PRINTER_SETTINGS 
} from './src/data/initialData';
import { Order, Product, Category, User, InventoryLog, PrinterSettings } from './src/types/pos';

// Initialize the SQLite Database


// Utility to handle JSON in SQLite (for arrays/objects)
const parseJson = <T>(val: string | null): T | [] => (val ? JSON.parse(val) : []);
const stringifyJson = (val: any) => JSON.stringify(val);

// ---------- Authentication helpers ----------
const HASH_PREFIX = 's1$';
function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  return `${HASH_PREFIX}${salt.toString('hex')}$${scryptSync(secret, salt, 32).toString('hex')}`;
}
function isHashed(stored?: string | null): boolean { return !!stored && stored.startsWith(HASH_PREFIX); }
function verifySecret(stored: string | null | undefined, input: string): boolean {
  if (!stored || typeof input !== 'string' || !input) return false;
  if (isHashed(stored)) {
    const [, saltHex, hashHex] = stored.split('$');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(input, Buffer.from(saltHex, 'hex'), expected.length);
    return timingSafeEqual(expected, actual);
  }
  // Legacy plaintext value (upgraded to a hash on the next successful login)
  const a = Buffer.from(stored); const b = Buffer.from(input);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authSecret(): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'authSecret'").get() as { value: string } | undefined;
  if (row) return row.value;
  const secret = randomBytes(32).toString('hex');
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('authSecret', secret);
  return secret;
}
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
function signToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return `${payload}.${createHmac('sha256', authSecret()).update(payload).digest('base64url')}`;
}
function userFromToken(header?: string): any | null {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', authSecret()).update(payload).digest('base64url');
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!sub || exp < Date.now()) return null;
    return db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(sub) || null;
  } catch { return null; }
}

/** Strips credentials before a user record leaves the server. */
function publicUser(u: any): User {
  const { password: _p, pin: _n, securityAnswer: _a, ...rest } = u;
  return { ...rest, active: Boolean(u.active) } as User;
}

// Simple in-memory brute-force protection: 5 failures locks the key for 60 seconds.
const failures = new Map<string, { count: number; until: number }>();
function isLocked(key: string): boolean { const f = failures.get(key); return !!f && f.until > Date.now(); }
function recordFailure(key: string) {
  const f = failures.get(key);
  const lockExpired = !!f && f.until > 0 && f.until <= Date.now();
  const count = (f && !lockExpired ? f.count : 0) + 1;
  failures.set(key, { count, until: count >= 5 ? Date.now() + 60_000 : 0 });
}
function clearFailures(key: string) { failures.delete(key); }

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
function validateNewCredentials(body: any, requirePassword = true): string | null {
  if (requirePassword || body.password !== undefined) {
    if (typeof body.password !== 'string' || body.password.length < 6) return 'Password must be at least 6 characters.';
  }
  if (requirePassword || body.pin !== undefined) {
    if (typeof body.pin !== 'string' || !/^\d{4}$/.test(body.pin)) return 'PIN must be exactly 4 digits.';
  }
  return null;
}

// Seed Database with Initial Data if empty (no user accounts are ever seeded: first admin is created at setup)
function seedDatabase() {
  const catCount = db.prepare('SELECT count(*) as count FROM categories').get() as { count: number };
  if (catCount.count === 0) {
    console.log('Seeding initial data into SQLite...');

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
    const users = (db.prepare('SELECT * FROM users').all() as any[]).filter(u => u.active).map(publicUser);
    
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
      paperWidth: settingsMap.paperWidth || '58mm',
      autoPrintDualSlips: settingsMap.autoPrintDualSlips === 'true',
      customerDisplayGreeting: settingsMap.customerDisplayGreeting || 'Welcome!',
      globalLowStockThreshold: Number(settingsMap.globalLowStockThreshold ?? 5),
      kitchenPrinterEnabled: settingsMap.kitchenPrinterEnabled === 'true',
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

  const adjustInventory = db.transaction((data: any) => {
    const { operationId, productId, changeAmount, reason, type, userId, userName } = data;
    if (typeof operationId !== 'string' || !operationId || !['restock', 'adjustment', 'waste'].includes(type)) problem('Invalid stock operation');
    const existing = db.prepare('SELECT * FROM inventory_logs WHERE id=?').get(operationId) as InventoryLog | undefined;
    if (existing) {
      if (existing.productId !== productId || existing.changeAmount !== changeAmount || existing.type !== type) problem('Stock operation identity conflicts', 409);
      return { product: loadProduct(db, productId), log: existing };
    }
    integer(changeAmount, 'Stock change', true);
    if (!changeAmount || (type === 'waste' && changeAmount > 0) || (type === 'restock' && changeAmount < 0)) problem('Review the stock change');
    const product = loadProduct(db, productId);
    if (!product) problem('Product not found', 404);
    const newStock = product.stockQuantity + changeAmount;
    integer(newStock, 'New stock quantity');
    const timestamp = new Date().toISOString();
    const log = { id: operationId, productId, productName: product.name, previousStock: product.stockQuantity, changeAmount, newStock, type, reason: reason || '', userId, userName, timestamp };
    db.prepare('UPDATE products SET stockQuantity=?, updatedAt=? WHERE id=?').run(newStock, timestamp, productId);
    db.prepare('INSERT INTO inventory_logs (id,productId,productName,previousStock,changeAmount,newStock,type,reason,userId,userName,timestamp) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(operationId, productId, product.name, product.stockQuantity, changeAmount, newStock, type, reason || '', userId, userName, timestamp);
    db.prepare('INSERT INTO stock_movements (id,product_id,delta,type,ref,user_id,created_at) VALUES (?,?,?,?,?,?,?)').run(operationId, productId, changeAmount, type, operationId, userId, timestamp);
    return { product: loadProduct(db, productId), log };
  });
  app.post('/api/inventory/adjust', (req, res) => {
    try { res.json(adjustInventory(req.body)); }
    catch (error: any) { res.status(error.status || 400).json({ error: error.message }); }
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
  const requireAdmin = (req: Request, res: Response, next: any) => {
    const caller = userFromToken(req.get('Authorization'));
    if (!caller) { res.status(401).json({ error: 'Please sign in again.' }); return; }
    if (caller.role !== 'admin') { res.status(403).json({ error: 'Administrator access required.' }); return; }
    (req as any).caller = caller;
    next();
  };
  const insertUser = (b: any, role: string) => {
    const id = `user-${randomUUID()}`;
    const username = String(b.username).trim().toLowerCase();
    db.prepare(`INSERT INTO users (id, name, username, email, password, pin, role, avatar, active, branch, securityQuestion, securityAnswer)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`).run(
      id, String(b.name).trim(), username, String(b.email || `${username}@maltivacrust.com`).trim(), hashSecret(b.password), hashSecret(b.pin),
      role, b.avatar || '', b.branch || '', 'What is your registered 4-digit PIN?', hashSecret(b.pin));
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  };

  app.get('/api/auth/status', (_req: Request, res: Response) => {
    const { count } = db.prepare('SELECT count(*) as count FROM users').get() as { count: number };
    res.json({ needsSetup: count === 0 });
  });

  // First-run setup: only works while there are no accounts at all.
  app.post('/api/auth/register', (req: Request, res: Response) => {
    const { count } = db.prepare('SELECT count(*) as count FROM users').get() as { count: number };
    if (count > 0) { res.status(403).json({ error: 'Setup is already complete. Ask an administrator to create your account.' }); return; }
    const b = req.body || {};
    if (!String(b.name || '').trim()) { res.status(400).json({ error: 'Full name is required.' }); return; }
    if (!USERNAME_RE.test(String(b.username || '').trim().toLowerCase())) { res.status(400).json({ error: 'Username must be 3-32 characters: letters, numbers, . _ -' }); return; }
    const invalid = validateNewCredentials(b);
    if (invalid) { res.status(400).json({ error: invalid }); return; }
    const user = insertUser(b, 'admin');
    res.status(201).json({ success: true, user: publicUser(user), token: signToken((user as any).id) });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (isLocked(username)) { res.status(429).json({ error: 'Too many failed attempts. Try again in a minute.' }); return; }
    const user = db.prepare('SELECT * FROM users WHERE (lower(username) = ? OR lower(email) = ?) AND active = 1').get(username, username) as any;

    if (user && (verifySecret(user.password, password) || verifySecret(user.pin, password))) {
      clearFailures(username);
      if (!isHashed(user.password) || !isHashed(user.pin) || !isHashed(user.securityAnswer)) {
        db.prepare('UPDATE users SET password = ?, pin = ?, securityAnswer = ? WHERE id = ?').run(
          isHashed(user.password) ? user.password : hashSecret(user.password || password),
          isHashed(user.pin) ? user.pin : hashSecret(user.pin || password),
          isHashed(user.securityAnswer) ? user.securityAnswer : hashSecret(user.securityAnswer || user.pin || password), user.id);
      }
      res.json({ success: true, user: publicUser(user), token: signToken(user.id) });
    } else {
      recordFailure(username);
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
    const id = String(req.body?.identifier || '').trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE (lower(username) = ? OR lower(email) = ?) AND active = 1').get(id, id) as any;
    if (!user) { res.status(404).json({ error: 'No active staff account found with this username' }); return; }
    res.json({ username: user.username, name: user.name, role: user.role, securityQuestion: user.securityQuestion || 'What is your registered 4-digit PIN?' });
  });

  app.post('/api/auth/reset-password', (req: Request, res: Response) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const { newPassword, verificationCode } = req.body || {};
    const key = `reset:${username}`;
    if (isLocked(key)) { res.status(429).json({ error: 'Too many failed attempts. Try again in a minute.' }); return; }
    const user = db.prepare('SELECT * FROM users WHERE lower(username) = ? AND active = 1').get(username) as any;
    if (!user || !verifySecret(user.securityAnswer, String(verificationCode || '').trim())) {
      recordFailure(key); res.status(401).json({ error: 'Recovery PIN is incorrect.' }); return;
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) { res.status(400).json({ error: 'Password must be at least 6 characters.' }); return; }
    clearFailures(key);
    db.prepare('UPDATE users SET password = ?, securityAnswer = ? WHERE id = ?').run(hashSecret(newPassword), hashSecret(String(verificationCode).trim()), user.id);
    res.json({ success: true, message: 'Password successfully updated! You can now sign in with your new credentials.' });
  });

  // USER MANAGEMENT (administrators only)
  app.get('/api/users', requireAdmin, (_req: Request, res: Response) => {
    res.json((db.prepare('SELECT * FROM users ORDER BY createdAt').all() as any[]).map(publicUser));
  });

  app.post('/api/users', requireAdmin, (req: Request, res: Response) => {
    const b = req.body || {};
    if (!String(b.name || '').trim()) { res.status(400).json({ error: 'Full name is required.' }); return; }
    const username = String(b.username || '').trim().toLowerCase();
    if (!USERNAME_RE.test(username)) { res.status(400).json({ error: 'Username must be 3-32 characters: letters, numbers, . _ -' }); return; }
    if (!['admin', 'manager', 'cashier'].includes(b.role)) { res.status(400).json({ error: 'Choose a valid role.' }); return; }
    const invalid = validateNewCredentials(b);
    if (invalid) { res.status(400).json({ error: invalid }); return; }
    if (db.prepare('SELECT 1 FROM users WHERE lower(username) = ?').get(username)) {
      res.status(409).json({ error: `Username "${username}" is already taken.` }); return;
    }
    res.status(201).json(publicUser(insertUser(b, b.role)));
  });

  app.put('/api/users/:id', requireAdmin, (req: Request, res: Response) => {
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    if (!target) { res.status(404).json({ error: 'User not found.' }); return; }
    const b = req.body || {};
    const caller = (req as any).caller;
    const nextActive = b.active === undefined ? Boolean(target.active) : Boolean(b.active);
    const nextRole = b.role === undefined ? target.role : b.role;
    if (!['admin', 'manager', 'cashier'].includes(nextRole)) { res.status(400).json({ error: 'Choose a valid role.' }); return; }
    const losesAdmin = target.role === 'admin' && (!nextActive || nextRole !== 'admin');
    if (losesAdmin) {
      const { count } = db.prepare("SELECT count(*) as count FROM users WHERE role = 'admin' AND active = 1 AND id != ?").get(target.id) as { count: number };
      if (count === 0) { res.status(400).json({ error: 'At least one active administrator is required.' }); return; }
      if (target.id === caller.id) { res.status(400).json({ error: 'You cannot suspend or demote your own account.' }); return; }
    }
    const invalid = validateNewCredentials(b, false);
    if (invalid) { res.status(400).json({ error: invalid }); return; }
    const nextPin = b.pin ? hashSecret(b.pin) : target.pin;
    const nextSecurityAnswer = b.pin ? nextPin : target.securityAnswer;
    db.prepare('UPDATE users SET name = ?, role = ?, active = ?, password = ?, pin = ?, securityAnswer = ? WHERE id = ?').run(
      b.name ? String(b.name).trim() : target.name, nextRole, nextActive ? 1 : 0,
      b.password ? hashSecret(b.password) : target.password, nextPin, nextSecurityAnswer, target.id);
    res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(target.id)));
  });

  // SETTINGS
  app.get('/api/settings/printer', (req: Request, res: Response) => {
    const settingsRows = db.prepare('SELECT * FROM settings').all() as { key: string, value: string }[];
    const settingsMap: any = {};
    settingsRows.forEach(row => settingsMap[row.key] = row.value);
    
    res.json({
      storeName: settingsMap.storeName || 'Maltiva Crust',
      ...taxSettings(db), moneySchemaVersion: 2,
      paperWidth: settingsMap.paperWidth || '58mm',
      autoPrintDualSlips: settingsMap.autoPrintDualSlips === 'true',
      customerDisplayGreeting: settingsMap.customerDisplayGreeting || 'Welcome!',
      globalLowStockThreshold: Number(settingsMap.globalLowStockThreshold ?? 5),
      kitchenPrinterEnabled: settingsMap.kitchenPrinterEnabled === 'true',
    });
  });

  app.put('/api/settings/printer', (req: Request, res: Response) => {
    const data = req.body;
    if (data.taxInclusive !== undefined && typeof data.taxInclusive !== 'boolean') problem('Tax mode must be a boolean');
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    
    const settingsToSave = {
      storeName: data.storeName,
      tagline: data.tagline,
      address: data.address,
      whatsApp: data.whatsApp,
      globalLowStockThreshold: data.globalLowStockThreshold === undefined ? undefined : String(integer(data.globalLowStockThreshold, 'Low-stock threshold')),
      kitchenPrinterEnabled: data.kitchenPrinterEnabled === undefined ? undefined : String(Boolean(data.kitchenPrinterEnabled)),
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
