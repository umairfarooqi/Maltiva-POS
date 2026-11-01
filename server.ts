import express, { Request, Response } from 'express';
import path from 'path';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { fromMoneyRow, toMoneyRow } from './src/services/moneyMigration';
import { quoteSale, loadProduct, taxSettings, problem } from './src/services/pricing';
import { integer } from './src/shared/money';
import { allocateOrderNumbers } from './src/services/orderNumbering';
import { assertUnreviewedOwner, checkoutOrigin } from './src/services/checkoutOrigin';
import { assertSaleGeneration, databaseGeneration, wasDatabaseRestored } from './src/services/databaseGeneration';
import { DatabaseBackups } from './src/services/databaseBackups';
import { findReceipts, receiptTimestamp } from './src/services/receiptLookup';
import db, { initDb } from './src/services/db';
import { 
  INITIAL_CATEGORIES, 
  INITIAL_PRODUCTS, 
  INITIAL_PRINTER_SETTINGS 
} from './src/data/initialData';
import { Order, Category, User, InventoryLog, PrinterSettings } from './src/types/pos';

// Utility to handle JSON in SQLite (for arrays/objects)
const parseJson = <T>(val: string | null): T | [] => (val ? JSON.parse(val) : []);
const stringifyJson = (val: any) => JSON.stringify(val);

// ---------- Authentication helpers ----------
const HASH_PREFIX = 's1$';
export function hashSecret(secret: string): string {
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
function signToken(userId: string, ttlMs = TOKEN_TTL_MS, scope = 'session'): { token: string; expiresAt: number } {
  const sid = randomUUID();
  const exp = Date.now() + ttlMs;
  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(Date.now());
  db.prepare('INSERT INTO auth_sessions (id,user_id,scope,expires_at,created_at) VALUES (?,?,?,?,?)')
    .run(sid, userId, scope, exp, new Date().toISOString());
  const payload = Buffer.from(JSON.stringify({ sub: userId, scope, sid, exp })).toString('base64url');
  return { token: `${payload}.${createHmac('sha256', authSecret()).update(payload).digest('base64url')}`, expiresAt: exp };
}
function userFromToken(header?: string, expectedScope = 'session'): any | null {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined) return null;
  const expected = createHmac('sha256', authSecret()).update(payload).digest('base64url');
  const suppliedSignature = Buffer.from(sig);
  const expectedSignature = Buffer.from(expected);
  if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) return null;
  try {
    const { sub, exp, scope, sid } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!sub || !sid || !Number.isSafeInteger(exp) || exp <= Date.now() || scope !== expectedScope) return null;
    const session = db.prepare('SELECT id FROM auth_sessions WHERE id=? AND user_id=? AND scope=? AND expires_at=?')
      .get(sid, sub, scope, exp);
    if (!session) return null;
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(sub) as any;
    return user ? { ...user, authSessionId: sid, authExpiresAt: exp } : null;
  } catch { return null; }
}

/** Strips credentials before a user record leaves the server. */
function publicUser(u: any): User {
  const { password: _p, pin: _n, securityAnswer: _a, authSessionId: _sid, authExpiresAt: _exp, ...rest } = u;
  return { ...rest, active: Boolean(u.active) } as User;
}

/** Strips cost fields from a product for cashier responses (Spec Section 1). */
function stripProductCost(p: any) {
  if (!p) return p;
  const { costPricePaisa: _c, ...rest } = p;
  return {
    ...rest,
    variations: Array.isArray(p.variations) ? p.variations.map((g: any) => ({
      ...g,
      options: Array.isArray(g.options) ? g.options.map(({ costDeltaPaisa: _cd, ...opt }: any) => opt) : [],
    })) : [],
    bundledProducts: Array.isArray(p.bundledProducts) ? p.bundledProducts.map(({ rawCostPaisa: _rc, ...b }: any) => b) : [],
  };
}

/** Strips cost and profit fields from an order for cashier responses (Spec Section 1). */
function stripOrderCostAndProfit(o: any) {
  if (!o) return o;
  const { totalCostPaisa: _tc, profitPaisa: _pr, profitMarginPercent: _pm, marginBp: _mb, lineCosts: _lc, ...rest } = o;
  return {
    ...rest,
    items: Array.isArray(o.items) ? o.items.map(({ unitCostPaisa: _uc, totalCostPaisa: _itc, ...item }: any) => ({
      ...item,
      selectedVariations: Array.isArray(item.selectedVariations)
        ? item.selectedVariations.map(({ costDeltaPaisa: _cost, ...option }: any) => option) : [],
      bundledProducts: Array.isArray(item.bundledProducts)
        ? item.bundledProducts.map(({ rawCostPaisa: _cost, ...bundle }: any) => bundle) : [],
    })) : [],
  };
}

// Brute-force protection: 5 failures locks the key for 5 minutes (Spec Section 2.1).
const LOCKOUT_MS = 5 * 60_000;
const failures = new Map<string, { count: number; until: number }>();
function isLocked(key: string): boolean { const f = failures.get(key); return !!f && f.until > Date.now(); }
function recordFailure(key: string) {
  const f = failures.get(key);
  const lockExpired = !!f && f.until > 0 && f.until <= Date.now();
  const count = (f && !lockExpired ? f.count : 0) + 1;
  failures.set(key, { count, until: count >= 5 ? Date.now() + LOCKOUT_MS : 0 });
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

// Seed Database with Initial Data if empty (no user accounts are ever seeded: admin is provisioned via CLI)
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
  return { ...row, databaseGeneration: databaseGeneration(db), idempotencyKey: row.idempotency_key, items, cashTenderedPaisa: cash?.tendered_paisa,
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
  const backups = new DatabaseBackups(db);

  app.use(express.json());

  // Role authorization middlewares
  const requireAdmin = (req: Request, res: Response, next: any) => {
    const caller = userFromToken(req.get('Authorization'));
    if (!caller) { res.status(401).json({ code: 'SESSION_INVALID', error: 'Please sign in again.' }); return; }
    if (caller.role !== 'admin') { res.status(403).json({ error: 'Administrator access required.' }); return; }
    (req as any).caller = caller;
    next();
  };

  const requireStrictRole = (roles: string[]) => (req: Request, res: Response, next: any) => {
    const caller = userFromToken(req.get('Authorization'));
    if (!caller) { res.status(401).json({ code: 'SESSION_INVALID', error: 'Please sign in again.' }); return; }
    if (!roles.includes(caller.role)) { res.status(403).json({ error: 'Insufficient permissions for this action.' }); return; }
    (req as any).caller = caller;
    next();
  };

  // Deny API access by default, including new routes added below. Only these
  // explicit method/path pairs are public; no financial data is needed to log in.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-POS-Database-Generation', databaseGeneration(db));
    res.set('X-POS-Database-Restored', String(wasDatabaseRestored(db)));
    const publicRoute = (req.method === 'GET' && ['/health', '/auth/staff'].includes(req.path)) ||
      (req.method === 'POST' && req.path === '/auth/login');
    if (publicRoute) { next(); return; }
    requireStrictRole(['admin', 'manager', 'cashier'])(req, res, next);
  });

  app.get('/api/auth/staff', (_req, res) => {
    res.json(db.prepare('SELECT id, name, username, avatar FROM users WHERE active = 1 ORDER BY name').all());
  });

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // Full Initial Data Sync
  app.get('/api/data', (req: Request, res: Response) => {
    const caller = userFromToken(req.get('Authorization'));
    const isCashier = caller?.role === 'cashier';

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

    const inventoryLogs = isCashier ? [] : (db.prepare('SELECT * FROM inventory_logs ORDER BY timestamp DESC').all() as InventoryLog[]);

    res.json({
      categories,
      products: isCashier ? validProducts.map(stripProductCost) : validProducts,
      orders: isCashier ? orders.map(stripOrderCostAndProfit) : orders,
      tables,
      users: caller.role === 'admin' ? users : [],
      printerSettings,
      inventoryLogs,
      isOnline: true,
    });
  });

  // PRODUCTS CRUD
  app.get('/api/products', (req: Request, res: Response) => {
    const caller = userFromToken(req.get('Authorization'));
    const isCashier = caller?.role === 'cashier';
    const fetchedProducts = (db.prepare('SELECT id FROM products').all() as { id: string }[]).map(row => loadProduct(db, row.id)!);
    const validProducts = fetchedProducts.filter(p => p.name !== 'Untitled Dish' && Number(p.pricePaisa) > 0);
    res.json(isCashier ? validProducts.map(stripProductCost) : validProducts);
  });

  app.post('/api/products', requireStrictRole(['admin', 'manager']), (req, res) => {
    const data = req.body; validateProduct(data);
    const stockQuantity = integer(data.stockQuantity === undefined ? 0 : data.stockQuantity, 'Opening stock quantity');
    const id = data.id || `prod-${Date.now()}`;
    insertMapped('products', { ...data, id, stockQuantity, variations: stringifyJson(data.variations), bundledProducts: stringifyJson(data.bundledProducts) });
    res.status(201).json(loadProduct(db, id));
  });
  const updateCatalogProduct = db.transaction((id: string, data: any) => {
    validateProduct(data);
    if (!loadProduct(db, id)) problem('Product not found', 404);
    // Stock snapshots from menu forms are never inventory commands. Preserve
    // concurrent sales/adjustments, including requests from older clients.
    const fields = ['name', 'categoryId', 'categoryName', 'pricePaisa', 'costPricePaisa',
      'minStockThreshold', 'image', 'description', 'isAvailable', 'isDeal'] as const;
    const catalog = Object.fromEntries(fields.filter(field => data[field] !== undefined).map(field => [field, data[field]]));
    const row = mappedValues('products', { ...catalog, variations: stringifyJson(data.variations),
      bundledProducts: stringifyJson(data.bundledProducts), updatedAt: new Date().toISOString() });
    db.prepare(`UPDATE products SET ${Object.keys(row).map(k => `"${k}"=?`).join(',')} WHERE id=?`).run(...Object.values(row), id);
    return loadProduct(db, id);
  });
  app.put('/api/products/:id', requireStrictRole(['admin', 'manager']), (req, res) => {
    res.json(updateCatalogProduct.immediate(req.params.id, req.body));
  });

  app.delete('/api/products/:id', requireStrictRole(['admin', 'manager']), (req: Request, res: Response) => {
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  const adjustInventory = db.transaction((data: any, caller: any) => {
    const { operationId, productId, changeAmount, reason, type } = data;
    const userId = caller.id;
    const userName = caller.name;
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
  app.post('/api/inventory/adjust', requireStrictRole(['admin', 'manager']), (req, res) => {
    try { res.json(adjustInventory.immediate(req.body, (req as any).caller)); }
    catch (error: any) { res.status(error.status || 400).json({ error: error.message }); }
  });

  // CATEGORIES CRUD
  app.post('/api/categories', requireStrictRole(['admin', 'manager']), (req: Request, res: Response) => {
    const { name, icon, id: requestedId } = req.body;
    const id = requestedId || `cat-${Date.now()}`;
    db.prepare('INSERT INTO categories (id, name, icon, "order") VALUES (?, ?, ?, ?)').run(id, name, icon, 0);
    res.status(201).json({ id, name, icon, itemCount: 0, order: 0 });
  });

  app.put('/api/categories/:id', requireStrictRole(['admin', 'manager']), (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, icon } = req.body;
    db.prepare('UPDATE categories SET name = ?, icon = ? WHERE id = ?').run(name, icon, id);

    // Update product category names
    db.prepare('UPDATE products SET categoryName = ? WHERE categoryId = ?').run(name, id);
    const updatedCategory = { ...(req.body || {}), id, name, icon };
    res.json(updatedCategory);
  });

  app.delete('/api/categories/:id', requireStrictRole(['admin', 'manager']), (req: Request, res: Response) => {
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

  // Receipt browsing reads committed server snapshots without mutating checkout.
  app.get('/api/receipts', (req, res, next) => {
    try { res.json(findReceipts(db, req.query)); } catch (error) { next(error); }
  });
  app.get('/api/receipts/:id', (req, res) => {
    const id = String(req.params.id);
    if (!id || id.length > 200) { res.status(400).json({ error: 'Invalid receipt reference.' }); return; }
    const order = loadOrder(id);
    if (!order || order.status === 'cancelled') { res.status(404).json({ error: 'Saved receipt not found. Search again.' }); return; }
    const receipt = { ...order, createdAt: receiptTimestamp(order.createdAt) };
    res.json((req as any).caller.role === 'cashier' ? stripOrderCostAndProfit(receipt) : receipt);
  });
  // Reconcile keys from this browser's durable outbox. Unsent keys are known only to the browser.
  app.get('/api/orders/pending-status', (req: Request, res: Response) => {
    const caller = userFromToken(req.get('Authorization'));
    const isCashier = caller?.role === 'cashier';
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
      if (row) {
        const loaded = loadOrder(row.id)!;
        savedOrders.push(isCashier ? stripOrderCostAndProfit(loaded) : loaded);
      } else {
        pendingKeys.push(key as string);
      }
    }
    res.json({ savedOrders, pendingKeys, pendingCount: pendingKeys.length });
  });

  const reviewCheckout = db.transaction((input: any, caller: any) => {
    if (typeof input?.idempotencyKey === 'string') {
      const existing = db.prepare('SELECT id FROM orders WHERE idempotency_key=?').get(input.idempotencyKey) as { id: string } | undefined;
      if (existing) {
        const saved = loadOrder(existing.id)!;
        return { ...saved, pricingFingerprint: saved.pricingFingerprint || `saved:${saved.idempotencyKey}` };
      }
    }
    assertSaleGeneration(db, input);
    assertUnreviewedOwner(db, input, input?.idempotencyKey, caller);
    const quote = quoteSale(db, input);
    const origin = checkoutOrigin(db, input, quote.items, input.idempotencyKey, caller, true);
    return { ...quote, databaseGeneration: databaseGeneration(db), cashierId: origin.id, cashierName: origin.name, cashierRole: origin.role };
  });
  app.post('/api/orders/quote', (req, res) => {
    const caller = userFromToken(req.get('Authorization'));
    const isCashier = caller?.role === 'cashier';
    try {
      const quote = reviewCheckout.immediate(req.body, caller);
      res.json(isCashier ? stripOrderCostAndProfit(quote) : quote);
    }
    catch (error: any) { res.status(error.status || 400).json({ error: error.message, code: error.recoveryCode }); }
  });
  const createOrder = db.transaction((input: any, key: string, caller: any) => {
    const existing = db.prepare('SELECT id FROM orders WHERE idempotency_key=?').get(key) as {id: string} | undefined;
    if (existing) return loadOrder(existing.id)!;
    assertSaleGeneration(db, input);
    assertUnreviewedOwner(db, input, key, caller);
    const quote = quoteSale(db, input);
    const origin = checkoutOrigin(db, input, quote.items, key, caller, false);
    if (input.moneySchemaVersion !== 2 || input.pricingFingerprint !== quote.pricingFingerprint) {
      problem('Prices need review. Review the current total and retry this sale.', 409);
    }
    if (typeof input.id !== 'string' || !input.id.trim() || input.id.length > 200) problem('Sale identity is required');
    if (!['cash', 'card', 'scan', 'online'].includes(input.paymentMethod)) problem('Choose one supported payment method');
    const tenderedPaisa = input.paymentMethod === 'cash' ? integer(input.cashTenderedPaisa, 'Cash tender') : null;
    if (tenderedPaisa !== null && tenderedPaisa < quote.totalPaisa) problem('Cash tender must cover the server total');
    if (input.paymentMethod !== 'cash' && input.cashTenderedPaisa != null) problem('Only cash may carry tender');
    const createdAt = new Date().toISOString();
    const numbers = allocateOrderNumbers(db, new Date(createdAt));
    // Original operator comes from the server-owned review record; the current
    // authenticated submitter is recorded separately when another user recovers it.
    const cashierId = origin.id;
    const cashierName = origin.name;
    const cashierRole = origin.role;
    const order = { ...input, ...quote, ...numbers, status: 'completed', cashierId, cashierName, cashierRole,
      recordedById: caller.id, recordedByName: caller.name, recordedByRole: caller.role,
      createdAt, idempotency_key: key, legacyDerived: false, profitIncomplete: false,
      changeDuePaisa: tenderedPaisa === null ? 0 : tenderedPaisa - quote.totalPaisa };
    insertMapped('orders', order);
    for (const item of quote.items) {
      const prod = db.prepare('SELECT stockQuantity FROM products WHERE id=?').get(item.productId) as any;
      insertMapped('order_items', { ...item, orderId: input.id, legacyDerived: false,
        selectedVariations: stringifyJson(item.selectedVariations), bundledProducts: stringifyJson(item.bundledProducts) });
      db.prepare('UPDATE products SET stockQuantity=stockQuantity-? WHERE id=?').run(item.quantity, item.productId);
      db.prepare("INSERT INTO stock_movements (id,product_id,delta,type,ref,user_id,created_at) VALUES (?,?,?,'sale',?,?,?)")
        .run(randomUUID(), item.productId, -item.quantity, input.id, cashierId, createdAt);
      db.prepare(`INSERT INTO inventory_logs (id,productId,productName,previousStock,changeAmount,newStock,type,reason,userId,userName,timestamp)
        VALUES (?,?,?,?,?,?,'sale',?,?,?,?)`).run(randomUUID(), item.productId, item.productName, prod.stockQuantity, -item.quantity,
          prod.stockQuantity - item.quantity, `Order ${order.orderNumber}`, cashierId, cashierName, createdAt);
    }
    insertMapped('payments', { id: randomUUID(), order_id: input.id, method: input.paymentMethod,
      amountPaisa: quote.totalPaisa, tenderedPaisa, created_at: createdAt });
    return loadOrder(input.id)!;
  });
  app.post('/api/orders', requireStrictRole(['admin', 'manager', 'cashier']), (req, res) => {
    const key = req.get('Idempotency-Key') || req.body?.idempotencyKey;
    if (typeof key !== 'string' || !key.trim() || key.length > 200) { res.status(400).json({error: 'An idempotency key is required'}); return; }
    const caller = (req as any).caller;
    try {
      const savedOrder = createOrder.immediate(req.body, key, caller);
      res.status(201).json({ success: true, order: caller?.role === 'cashier' ? stripOrderCostAndProfit(savedOrder) : savedOrder });
    }
    catch (error: any) {
      const status = error.status || (['SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY'].includes(error.code) ? 409 : error.code ? 500 : 400);
      res.status(status).json({ error: error.status ? error.message : 'Sale could not be saved. Review this cart before retrying.', code: error.recoveryCode });
    }
  });

  // PROFIT REPORT (manager and admin only; cashiers get 403 per Spec Section 7 & 16.7)
  app.get('/api/reports/profit', requireStrictRole(['admin', 'manager']), (_req: Request, res: Response) => {
    const orders = (db.prepare('SELECT id FROM orders WHERE profit_incomplete = 0 ORDER BY createdAt DESC').all() as { id: string }[]).map(row => loadOrder(row.id)!);
    const totalRevenuePaisa = orders.reduce((sum, o) => sum + (o.netRevenuePaisa ?? 0), 0);
    const totalCostPaisa = orders.reduce((sum, o) => sum + (o.totalCostPaisa ?? 0), 0);
    const totalProfitPaisa = orders.reduce((sum, o) => sum + (o.profitPaisa ?? 0), 0);
    res.json({ orderCount: orders.length, totalRevenuePaisa, totalCostPaisa, totalProfitPaisa, orders });
  });

  // AUTHENTICATION (Spec Section 7: login, logout, approve — no self-signup or self-reset)
  const insertUser = (b: any, role: string) => {
    const id = `user-${randomUUID()}`;
    const username = String(b.username).trim().toLowerCase();
    const pinHash = hashSecret(b.pin);
    db.prepare(`INSERT INTO users (id, name, username, email, password, pin, role, avatar, active, branch, securityQuestion, securityAnswer)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`).run(
      id, String(b.name).trim(), username, String(b.email || `${username}@maltivacrust.com`).trim(), hashSecret(b.password), pinHash,
      role, b.avatar || '', b.branch || '', 'Registered 4-digit PIN', pinHash);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  };

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const secret = String(req.body?.pin ?? req.body?.password ?? '');
    if (isLocked(username)) { res.status(429).json({ error: 'Account locked for 5 minutes due to failed attempts. Contact an administrator.' }); return; }
    const user = db.prepare('SELECT * FROM users WHERE (lower(username) = ? OR lower(email) = ?) AND active = 1').get(username, username) as any;

    if (user && (verifySecret(user.password, secret) || verifySecret(user.pin, secret))) {
      clearFailures(username);
      if (!isHashed(user.password) || !isHashed(user.pin) || !isHashed(user.securityAnswer)) {
        db.prepare('UPDATE users SET password = ?, pin = ?, securityAnswer = ? WHERE id = ?').run(
          isHashed(user.password) ? user.password : hashSecret(user.password || secret),
          isHashed(user.pin) ? user.pin : hashSecret(user.pin || secret),
          isHashed(user.securityAnswer) ? user.securityAnswer : hashSecret(user.securityAnswer || user.pin || secret), user.id);
      }
      const session = signToken(user.id);
      res.json({ success: true, user: publicUser(user), ...session });
    } else {
      recordFailure(username);
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  app.get('/api/auth/session', (req: Request, res: Response) => {
    const caller = (req as any).caller;
    res.set('Cache-Control', 'no-store').json({ user: publicUser(caller), expiresAt: caller.authExpiresAt });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    db.prepare('DELETE FROM auth_sessions WHERE id=?').run((req as any).caller.authSessionId);
    res.json({ success: true });
  });

  // Manager / Admin PIN override check (Spec Section 3 & 7)
  app.post('/api/auth/approve', (req: Request, res: Response) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const pin = String(req.body?.pin || '');
    const lockKey = `approve:${username}`;
    if (isLocked(lockKey)) { res.status(429).json({ error: 'Too many failed override attempts. Try again in 5 minutes.' }); return; }
    const user = db.prepare('SELECT * FROM users WHERE lower(username) = ? AND active = 1').get(username) as any;
    if (!user || (!verifySecret(user.pin, pin) && !verifySecret(user.password, pin))) {
      recordFailure(lockKey);
      res.status(401).json({ error: 'Invalid manager PIN.' });
      return;
    }
    if (user.role !== 'admin' && user.role !== 'manager') {
      res.status(403).json({ error: 'Manager or administrator PIN required.' });
      return;
    }
    clearFailures(lockKey);
    res.json({
      approved: true,
      approver: publicUser(user),
      approvalToken: signToken(user.id, 5 * 60_000, 'override').token,
    });
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
    db.transaction(() => {
      db.prepare('UPDATE users SET name = ?, role = ?, active = ?, password = ?, pin = ?, securityAnswer = ? WHERE id = ?').run(
        b.name ? String(b.name).trim() : target.name, nextRole, nextActive ? 1 : 0,
        b.password ? hashSecret(b.password) : target.password, nextPin, nextSecurityAnswer, target.id);
      if (b.pin || b.password || nextRole !== target.role || nextActive !== Boolean(target.active)) {
        db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(target.id);
      }
    })();
    if (b.pin || b.password || nextActive) {
      clearFailures(String(target.username).toLowerCase());
      clearFailures(`approve:${String(target.username).toLowerCase()}`);
    }
    res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(target.id)));
  });

  // Reset another user's PIN and unlock account (Spec Section 2.1 & Section 7)
  app.post('/api/users/:id/reset-pin', requireAdmin, (req: Request, res: Response) => {
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    if (!target) { res.status(404).json({ error: 'User not found.' }); return; }
    const b = req.body || {};
    if (typeof b.pin !== 'string' || !/^\d{4}$/.test(b.pin)) {
      res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
      return;
    }
    if (b.password !== undefined && (typeof b.password !== 'string' || b.password.length < 6)) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    const nextPin = hashSecret(b.pin);
    const nextPassword = b.password ? hashSecret(b.password) : target.password;
    db.transaction(() => {
      db.prepare('UPDATE users SET pin = ?, password = ?, securityAnswer = ? WHERE id = ?').run(
        nextPin, nextPassword, nextPin, target.id);
      db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(target.id);
    })();
    clearFailures(String(target.username).toLowerCase());
    clearFailures(`approve:${String(target.username).toLowerCase()}`);
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

  app.put('/api/settings/printer', requireStrictRole(['admin']), (req: Request, res: Response) => {
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

  app.get('/api/maintenance/backups', requireAdmin, (_req, res) => {
    res.json({ backups: backups.list() });
  });
  app.post('/api/maintenance/backups', requireAdmin, async (req, res, next) => {
    try { res.status(201).json(await backups.create((req as any).caller.id)); }
    catch (error) { next(error); }
  });
  app.get('/api/maintenance/backups/:filename', requireAdmin, (req, res, next) => {
    try { res.download(backups.download(String(req.params.filename)), String(req.params.filename)); }
    catch (error) { next(error); }
  });
  app.post('/api/maintenance/restore/preview', requireAdmin, express.raw({ type: 'application/octet-stream', limit: '64mb' }), (req, res, next) => {
    try { res.json(backups.preview(req.body, (req as any).caller.authSessionId)); }
    catch (error) { next(error); }
  });
  app.delete('/api/maintenance/restore/preview/:token', requireAdmin, (req, res, next) => {
    try { backups.discard(String(req.params.token), (req as any).caller.authSessionId); res.json({ success: true }); }
    catch (error) { next(error); }
  });
  app.post('/api/maintenance/restore', requireAdmin, (req, res, next) => {
    const caller = (req as any).caller, key = `restore:${caller.id}`;
    if (isLocked(key)) { res.status(429).json({ error: 'Too many incorrect passwords. Wait five minutes.' }); return; }
    if (!verifySecret(caller.password, req.body?.password)) {
      recordFailure(key); res.status(400).json({ error: 'Enter your current administrator password.' }); return;
    }
    if (req.body?.confirmation !== 'RESTORE') { res.status(400).json({ error: 'Type RESTORE to confirm replacing server data.' }); return; }
    try {
      const result = backups.restore(req.body?.token, caller.authSessionId, caller.id);
      clearFailures(key);
      res.set('X-POS-Database-Generation', result.databaseGeneration);
      res.set('X-POS-Database-Restored', 'true');
      res.json(result);
    } catch (error) { next(error); }
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
