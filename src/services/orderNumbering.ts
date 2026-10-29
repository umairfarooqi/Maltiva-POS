import type Database from 'better-sqlite3';

type Db = InstanceType<typeof Database>;

export function businessDate(now: Date, timeZone = 'Asia/Karachi', cutoffHour = 0): string {
  if (!Number.isInteger(cutoffHour) || cutoffHour < 0 || cutoffHour > 23) throw new Error('Invalid business-day cutoff');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  if (Number(values.hour) < cutoffHour) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function initOrderNumbering(db: Db) {
  db.transaction(() => {
    const columns = db.prepare('PRAGMA table_info(orders)').all() as { name: string }[];
    if (!columns.some(column => column.name === 'businessDate')) db.exec('ALTER TABLE orders ADD COLUMN businessDate TEXT');
    db.exec(`CREATE TABLE IF NOT EXISTS order_counters (
      business_date TEXT NOT NULL, name TEXT NOT NULL,
      value INTEGER NOT NULL CHECK(typeof(value)='integer' AND value >= 0),
      PRIMARY KEY(business_date, name)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_business_token
      ON orders(businessDate, tokenNumber) WHERE businessDate IS NOT NULL;`);
  }).immediate();
}

/** Called only within the sale's write transaction; allocation rolls back with it. */
export function allocateOrderNumbers(db: Db, now: Date) {
  if (!db.inTransaction) throw new Error('Order numbering requires a sale transaction');
  const settings = Object.fromEntries((db.prepare("SELECT key,value FROM settings WHERE key IN ('timezone','day_cutoff_hour')").all() as { key: string; value: string }[])
    .map(row => [row.key, row.value]));
  const timeZone = settings.timezone ?? 'Asia/Karachi';
  const cutoff = Number(settings.day_cutoff_hour ?? 0);
  let date: string;
  try { date = businessDate(now, timeZone, cutoff); }
  catch { throw Object.assign(new Error('Review the store time zone and business-day cutoff before saving sales.'), { status: 500 }); }
  const prefix = `#F${date.replaceAll('-', '')}-`;
  const counters = db.prepare('SELECT name FROM order_counters WHERE business_date=?').all(date) as { name: string }[];
  const existing = new Set(counters.map(counter => counter.name));
  if (!existing.has('order')) {
    let seed = 0;
    const rows = db.prepare('SELECT orderNumber FROM orders WHERE orderNumber LIKE ?').all(`${prefix}%`) as { orderNumber: string }[];
    for (const row of rows) {
      const suffix = row.orderNumber.slice(prefix.length);
      if (/^\d+$/.test(suffix) && Number.isSafeInteger(Number(suffix))) seed = Math.max(seed, Number(suffix));
    }
    db.prepare('INSERT INTO order_counters VALUES (?,?,?)').run(date, 'order', seed);
  }
  if (!existing.has('token')) {
    let seed = (db.prepare('SELECT MAX(tokenNumber) AS value FROM orders WHERE businessDate=?').get(date) as { value: number | null }).value ?? 0;
    // An initialization-only scan covers all UTC offsets and cutoff hours,
    // without rewriting legacy timestamps or trusting their browser order count.
    const legacy = db.prepare(`SELECT tokenNumber,createdAt FROM orders WHERE businessDate IS NULL
      AND julianday(createdAt) BETWEEN julianday(?)-2 AND julianday(?)+3`).all(date, date) as { tokenNumber: number; createdAt: string }[];
    for (const row of legacy) {
      if (!Number.isSafeInteger(row.tokenNumber) || row.tokenNumber <= 0) continue;
      const timestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.createdAt)
        ? row.createdAt.replace(' ', 'T') + 'Z' : row.createdAt;
      const created = new Date(timestamp);
      if (Number.isFinite(created.getTime()) && businessDate(created, timeZone, cutoff) === date) seed = Math.max(seed, row.tokenNumber);
    }
    db.prepare('INSERT INTO order_counters VALUES (?,?,?)').run(date, 'token', seed);
  }
  const next = (name: string) => {
    const row = db.prepare('SELECT value FROM order_counters WHERE business_date=? AND name=?').get(date, name) as { value: number };
    if (!Number.isSafeInteger(row.value + 1)) throw new Error('Order numbering limit reached');
    db.prepare('UPDATE order_counters SET value=value+1 WHERE business_date=? AND name=?').run(date, name);
    return row.value + 1;
  };
  const orderSequence = next('order');
  return { businessDate: date, orderNumber: `${prefix}${String(orderSequence).padStart(4, '0')}`, tokenNumber: next('token') };
}
