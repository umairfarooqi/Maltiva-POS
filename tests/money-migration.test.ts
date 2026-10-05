// @vitest-environment node
import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrateMoney } from '../src/services/moneyMigration';
function legacy(db: any) {
  db.exec(`CREATE TABLE products (id TEXT PRIMARY KEY, price REAL NOT NULL, costPrice REAL, variations TEXT, bundledProducts TEXT);
    CREATE TABLE orders (id TEXT PRIMARY KEY, subtotal REAL, tax REAL, discount REAL, total REAL, totalCost REAL, profit REAL, changeDue REAL, profitMarginPercent REAL);
    CREATE TABLE order_items (id TEXT PRIMARY KEY, orderId TEXT, unitPrice REAL, unitCost REAL, totalPrice REAL, totalCost REAL, selectedVariations TEXT, bundledProducts TEXT);
    CREATE TABLE payments (id TEXT PRIMARY KEY, order_id TEXT, amount REAL, tendered REAL);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO products VALUES ('p',333.005,0,'[{"id":"g","options":[{"priceDelta":0.25,"costDelta":0}]}]','[]');
    INSERT INTO orders VALUES ('o',333,33.3,0,366.3,200,166.3,0,45.4);
    INSERT INTO order_items VALUES ('i','o',333,200,333,200,'[]','[]');
    INSERT INTO payments VALUES ('pay','o',366.3,400);
    INSERT INTO settings VALUES ('taxRatePercent','10');`);
}
describe('versioned SQLite paisa migration', () => {
  it('preserves charged history and original audit values, corrects profit and runs once', async () => {
    const db = new Database(':memory:'); legacy(db);
    try {
      await migrateMoney(db); await migrateMoney(db);
      expect(db.prepare('SELECT price_paisa,cost_price_paisa FROM products').get()).toEqual({ price_paisa: 33301, cost_price_paisa: 0 });
      expect(db.prepare('SELECT total_paisa,net_revenue_paisa,profit_paisa FROM orders').get()).toEqual({ total_paisa: 36630, net_revenue_paisa: 33300, profit_paisa: 13300 });
      expect(db.prepare('SELECT amount_paisa,tendered_paisa FROM payments').get()).toEqual({ amount_paisa: 36630, tendered_paisa: 40000 });
      expect(JSON.parse(db.prepare("SELECT original_json FROM legacy_money_audit WHERE table_name='orders'").get().original_json).profit).toBe(166.3);
      expect(JSON.parse(db.prepare('SELECT variations FROM products').get().variations)[0].options[0]).toMatchObject({ priceDeltaPaisa: 25, costDeltaPaisa: 0 });
      expect(db.prepare('SELECT count(*) AS n FROM schema_migrations').get().n).toBe(1);
      expect(() => db.exec('UPDATE products SET price_paisa=0.1')).toThrow();
    } finally { db.close(); }
  });
  it('rolls back all table conversion when a legacy money row is invalid', async () => {
    const db = new Database(':memory:'); legacy(db);
    try {
      db.exec("UPDATE payments SET amount='invalid'");
      await expect(migrateMoney(db)).rejects.toThrow('payments pay');
      expect(db.prepare('SELECT price FROM products').get().price).toBe(333.005);
      expect(db.prepare('SELECT count(*) AS n FROM schema_migrations').get().n).toBe(0);
    } finally { db.close(); }
  });
  it('keeps missing costs unknown and valid zero costs unchanged', async () => {
    const db = new Database(':memory:'); legacy(db);
    try {
      db.exec('UPDATE order_items SET unitCost=NULL,totalCost=NULL');
      await migrateMoney(db);
      expect(db.prepare('SELECT profit_paisa,profit_incomplete FROM orders').get()).toEqual({ profit_paisa: null, profit_incomplete: 1 });
      expect(db.prepare('SELECT cost_price_paisa FROM products').get().cost_price_paisa).toBe(0);
    } finally { db.close(); }
  });
  it('creates a readable safety copy including WAL before altering data', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'maltiva-money-migration-'));
    const file = path.join(dir, 'history.db'); const db = new Database(file); db.pragma('journal_mode=WAL'); legacy(db);
    try {
      await migrateMoney(db);
      const backup = new Database(`${file}.before-money-v2.db`, { readonly: true });
      try { expect(backup.prepare('SELECT total FROM orders').get().total).toBe(366.3); } finally { backup.close(); }
    } finally { db.close(); await rm(dir, { recursive: true, force: true }); }
  });
});
