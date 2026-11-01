import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { businessDate } from './orderNumbering';
import { databaseGeneration } from './databaseGeneration';
type Db = InstanceType<typeof Database>;
function problem(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
export function receiptTimestamp(value: string) {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value) ? value.replace(' ', 'T') + 'Z' : value;
}
export function initReceiptLookup(db: Db) {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_receipts_business_date ON orders(businessDate,julianday(createdAt) DESC,id DESC);
    CREATE INDEX IF NOT EXISTS idx_receipts_legacy_time ON orders(julianday(createdAt) DESC,id DESC) WHERE businessDate IS NULL;`);
}
function day(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) problem('Choose valid receipt dates.');
  return value;
}
function text(value: unknown, label: string, maximum = 200): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > maximum) problem(`Invalid ${label}.`);
  return value.trim();
}
// Find UTC bounds for a store business day, including named zones and DST.
function startOfDay(date: string, zone: string, cutoff: number) {
  const center = Date.parse(date);
  let low = center - 2 * 86400000, high = center + 2 * 86400000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2000) * 1000;
    if (businessDate(new Date(middle), zone, cutoff) < date) low = middle + 1000;
    else high = middle;
  }
  return new Date(low).toISOString();
}
export function findReceipts(db: Db, query: Record<string, unknown>, now = new Date()) {
  const settings = Object.fromEntries((db.prepare("SELECT key,value FROM settings WHERE key IN ('timezone','day_cutoff_hour')").all() as { key: string; value: string }[]).map(row => [row.key, row.value]));
  const zone = settings.timezone || 'Asia/Karachi', cutoff = Number(settings.day_cutoff_hour || 0);
  let today: string;
  try { today = businessDate(now, zone, cutoff); } catch { problem('Review the store time zone and business-day cutoff.', 500); }
  const from = day(query.from ?? today), to = day(query.to ?? from);
  if (to < from || Date.parse(to) - Date.parse(from) >= 31 * 86400000) problem('Choose a date range of up to 31 days.');
  const reference = text(query.reference, 'order reference'), tokenText = text(query.token, 'token', 16);
  if (reference && tokenText) problem('Search by an order reference or a token, not both.');
  const token = tokenText ? Number(tokenText) : null;
  if (tokenText && (!/^\d+$/.test(tokenText) || !Number.isSafeInteger(token) || token! <= 0 || from !== to)) problem('A token needs a positive whole number and one business date.');
  const sizeText = text(query.limit, 'page size', 2), limit = sizeText ? Number(sizeText) : 25;
  if (!/^\d+$/.test(sizeText || '25') || !Number.isInteger(limit) || limit < 1 || limit > 50) problem('Receipt page size must be between 1 and 50.');
  const generation = databaseGeneration(db);
  const signature = createHash('sha256').update(JSON.stringify({ from, to, reference, token, limit, zone, cutoff })).digest('hex');
  let cursor: { time: number; id: string } | null = null;
  const encoded = text(query.cursor, 'receipt page', 2048);
  if (encoded) {
    let decoded: any;
    try { decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString()); } catch { problem('Invalid receipt page. Search again.'); }
    if (!decoded || typeof decoded !== 'object') problem('Invalid receipt page. Search again.');
    if (decoded.generation !== generation) problem('The database changed. Search receipts again.', 409);
    if (decoded.signature !== signature || !Number.isFinite(decoded.time) || typeof decoded.id !== 'string' || !decoded.id || decoded.id.length > 200) problem('Receipt filters changed. Search again.');
    cursor = decoded;
  }
  const parameters: any[] = [];
  let where = "status != 'cancelled'";
  if (reference) { where += ' AND orderNumber=?'; parameters.push(reference); }
  else {
    const nextDate = new Date(Date.parse(to) + 86400000).toISOString().slice(0, 10);
    where += ' AND ((businessDate>=? AND businessDate<=?) OR (businessDate IS NULL AND julianday(createdAt)>=julianday(?) AND julianday(createdAt)<julianday(?)))';
    parameters.push(from, to, startOfDay(from, zone, cutoff), startOfDay(nextDate, zone, cutoff));
    if (token !== null) { where += ' AND tokenNumber=?'; parameters.push(token); }
  }
  if (cursor) { where += ' AND (julianday(createdAt)<? OR (julianday(createdAt)=? AND id<?))'; parameters.push(cursor.time, cursor.time, cursor.id); }
  const rows = db.prepare(`SELECT id,orderNumber,tokenNumber,businessDate,createdAt,total_paisa,paymentMethod,cashierName,julianday(createdAt) AS sortTime
    FROM orders WHERE ${where} ORDER BY julianday(createdAt) DESC,id DESC LIMIT ?`).all(...parameters, limit + 1) as any[];
  const page = rows.slice(0, limit), last = page.at(-1);
  return { from, to, today, timeZone: zone, databaseGeneration: generation,
    receipts: page.map(row => ({ id: row.id, orderNumber: row.orderNumber, tokenNumber: row.tokenNumber,
      businessDate: row.businessDate || businessDate(new Date(receiptTimestamp(row.createdAt)), zone, cutoff),
      createdAt: receiptTimestamp(row.createdAt), totalPaisa: row.total_paisa, paymentMethod: row.paymentMethod, cashierName: row.cashierName })),
    nextCursor: rows.length > limit ? Buffer.from(JSON.stringify({ generation, signature, time: last.sortTime, id: last.id })).toString('base64url') : null };
}
