import Database from 'better-sqlite3';
import { allocate, integer, legacyPaisa, roundRatio, safe } from '../shared/money';
import { upgradeMoney } from '../shared/moneyUpgrade';

export const moneyColumns: Record<string, Record<string, string>> = {
  products: { price: 'price_paisa', costPrice: 'cost_price_paisa' },
  orders: { subtotal: 'subtotal_paisa', tax: 'tax_paisa', discount: 'discount_paisa', total: 'total_paisa', totalCost: 'total_cost_paisa', profit: 'profit_paisa', changeDue: 'change_due_paisa', profitMarginPercent: 'margin_bp' },
  order_items: { unitPrice: 'unit_price_paisa', unitCost: 'unit_cost_paisa', totalPrice: 'total_price_paisa', totalCost: 'total_cost_paisa' },
  payments: { amount: 'amount_paisa', tendered: 'tendered_paisa' },
};
const apiNames: Record<string, string> = { costPrice: 'costPricePaisa', totalCost: 'totalCostPaisa', changeDue: 'changeDuePaisa', profitMarginPercent: 'marginBp', amount: 'amountPaisa', tendered: 'tenderedPaisa' };
export function fromMoneyRow(table: string, row: any): any {
  if (!row) return row;
  const out = { ...row, moneySchemaVersion: 2 };
  for (const [old, col] of Object.entries(moneyColumns[table] || {})) {
    out[apiNames[old] || `${old}Paisa`] = out[col]; delete out[col];
  }
  for (const [col, key] of Object.entries({ net_revenue_paisa: 'netRevenuePaisa', line_discount_paisa: 'lineDiscountPaisa', tax_bp: 'taxBp', tax_inclusive: 'taxInclusive', profit_incomplete: 'profitIncomplete', legacy_derived: 'legacyDerived' })) {
    if (out[col] !== undefined) { out[key] = out[col]; delete out[col]; }
  }
  if (out.marginBp !== undefined) out.profitMarginPercent = out.marginBp / 100;
  return out;
}
export function toMoneyRow(table: string, input: any): any {
  const row = { ...input };
  for (const [old, col] of Object.entries(moneyColumns[table] || {})) {
    const key = apiNames[old] || `${old}Paisa`;
    if (input[key] !== undefined) { row[col] = input[key]; delete row[key]; }
  }
  for (const [key, col] of Object.entries({ netRevenuePaisa: 'net_revenue_paisa', lineDiscountPaisa: 'line_discount_paisa', taxBp: 'tax_bp', taxInclusive: 'tax_inclusive', profitIncomplete: 'profit_incomplete', legacyDerived: 'legacy_derived' })) {
    if (row[key] !== undefined) { row[col] = row[key]; delete row[key]; }
  }
  return row;
}

export async function migrateMoney(db: InstanceType<typeof Database>) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE version=2').get()) return;
  // The SQLite backup API includes committed WAL contents and never copies a live .db blindly.
  if (db.name !== ':memory:') {
    const backup = `${db.name}.before-money-v2.db`;
    await db.backup(backup);
    const check = new Database(backup, { readonly: true });
    try { if (check.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Migration safety copy failed integrity check'); }
    finally { check.close(); }
  }
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec('CREATE TABLE IF NOT EXISTS legacy_money_audit (table_name TEXT, row_id TEXT, original_json TEXT NOT NULL, converted_at TEXT NOT NULL)');
      for (const [table, mapping] of Object.entries(moneyColumns)) {
        const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as any;
        if (!schema) throw new Error(`Missing money table: ${table}`);
        let sql = schema.sql.replace(new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? ["\x60]?${table}["\x60]?`, 'i'), `CREATE TABLE ${table}_money_new`);
        for (const [old, col] of Object.entries(mapping)) {
          sql = sql.replace(new RegExp(`\\b${old}\\s+REAL`, 'g'), `${col} INTEGER CHECK (${col} IS NULL OR typeof(${col}) = 'integer')`);
        }
        const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL").all(table) as any[];
        db.exec(sql);
        const rows = db.prepare(`SELECT * FROM ${table}`).all() as any[];
        for (const row of rows) {
          db.prepare('INSERT INTO legacy_money_audit VALUES (?,?,?,?)').run(table, row.id, JSON.stringify(row), new Date().toISOString());
          const converted: any = { ...row };
          for (const [old, col] of Object.entries(mapping)) {
            const nullable = ['costPrice', 'unitCost', 'totalCost', 'profit', 'profitMarginPercent', 'tendered'].includes(old);
            if (row[old] == null && !nullable) throw new Error(`Cannot migrate ${table} ${row.id}: missing ${old}`);
            try {
              converted[col] = row[old] == null ? null : integer(legacyPaisa(row[old]), old, ['profit', 'profitMarginPercent'].includes(old));
            }
            catch { throw new Error(`Cannot migrate ${table} ${row.id}: invalid ${old}`); }
            delete converted[old];
          }
          for (const key of ['variations', 'bundledProducts', 'selectedVariations']) {
            if (converted[key]) converted[key] = JSON.stringify(upgradeMoney(JSON.parse(converted[key])));
          }
          const columns = Object.keys(converted);
          db.prepare(`INSERT INTO ${table}_money_new (${columns.map(c => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...Object.values(converted));
        }
        db.exec(`DROP TABLE ${table}; ALTER TABLE ${table}_money_new RENAME TO ${table}`);
        for (const index of indexes) {
          let statement = index.sql;
          for (const [old, col] of Object.entries(mapping)) statement = statement.replace(new RegExp(`\\b${old}\\b`, 'g'), col);
          db.exec(statement);
        }
      }
      db.exec(`ALTER TABLE orders ADD COLUMN net_revenue_paisa INTEGER CHECK (net_revenue_paisa IS NULL OR typeof(net_revenue_paisa)='integer');
        ALTER TABLE orders ADD COLUMN tax_bp INTEGER;
        ALTER TABLE orders ADD COLUMN tax_inclusive INTEGER;
        ALTER TABLE orders ADD COLUMN profit_incomplete INTEGER DEFAULT 0;
        ALTER TABLE orders ADD COLUMN legacy_derived INTEGER DEFAULT 1;
        ALTER TABLE order_items ADD COLUMN net_revenue_paisa INTEGER CHECK (net_revenue_paisa IS NULL OR typeof(net_revenue_paisa)='integer');
        ALTER TABLE order_items ADD COLUMN line_discount_paisa INTEGER DEFAULT 0 CHECK (typeof(line_discount_paisa)='integer');
        ALTER TABLE order_items ADD COLUMN legacy_derived INTEGER DEFAULT 1;
        ALTER TABLE order_items ADD COLUMN categoryId TEXT;`);
      for (const order of db.prepare('SELECT * FROM orders').all() as any[]) {
        const items = db.prepare('SELECT * FROM order_items WHERE orderId=? ORDER BY rowid').all(order.id) as any[];
        const revenue = order.total_paisa - order.tax_paisa;
        const incomplete = order.total_cost_paisa == null || !items.length || items.some(i => i.total_cost_paisa == null) ||
          items.reduce((sum, i) => sum + i.total_cost_paisa, 0) !== order.total_cost_paisa;
        const profit = incomplete ? null : revenue - order.total_cost_paisa;
        db.prepare('UPDATE orders SET net_revenue_paisa=?,profit_paisa=?,margin_bp=?,profit_incomplete=? WHERE id=?')
          .run(revenue, profit, profit !== null && revenue > 0 ? safe(roundRatio(BigInt(profit) * 10000n, BigInt(revenue))) : 0, incomplete ? 1 : 0, order.id);
        if (items.length) {
          const weights = items.map(i => i.total_price_paisa);
          const revenues = allocate(revenue, weights);
          const discounts = allocate(order.discount_paisa ?? 0, weights);
          items.forEach((i, n) => db.prepare('UPDATE order_items SET net_revenue_paisa=?,line_discount_paisa=? WHERE id=?').run(revenues[n], discounts[n], i.id));
        }
      }
      const rate = db.prepare("SELECT value FROM settings WHERE key='taxRatePercent'").get() as any;
      if (rate) db.prepare('INSERT INTO legacy_money_audit VALUES (?,?,?,?)').run('settings', 'taxRatePercent', JSON.stringify(rate), new Date().toISOString());
      db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('taxBp', String(rate ? legacyPaisa(Number(rate.value)) : 0));
      db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('taxInclusive', 'false');
      db.prepare("DELETE FROM settings WHERE key='taxRatePercent'").run();
      if (db.pragma('foreign_key_check').length) throw new Error('Money migration found invalid database relationships');
      db.prepare('INSERT INTO schema_migrations VALUES (2,?)').run(new Date().toISOString());
    })();
  } finally { db.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`); }
}
