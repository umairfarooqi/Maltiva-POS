import type Database from 'better-sqlite3';
import type { Order } from '../types/pos';
import { fromMoneyRow } from './moneyMigration';
import { databaseGeneration } from './databaseGeneration';
type Db = InstanceType<typeof Database>;
export function orderSnapshot(raw: any, itemRows: any[], tendered: number | null | undefined, generation: string): Order {
  const row = fromMoneyRow('orders', raw);
  return { ...row, databaseGeneration: generation, idempotencyKey: row.idempotency_key,
    items: itemRows.map(rawItem => {
      const item = fromMoneyRow('order_items', rawItem);
      return { ...item, selectedVariations: JSON.parse(item.selectedVariations || '[]'), bundledProducts: JSON.parse(item.bundledProducts || '[]') };
    }), cashTenderedPaisa: tendered,
    taxInclusive: Boolean(row.taxInclusive), profitIncomplete: Boolean(row.profitIncomplete), synced: true, persistenceState: 'saved' };
}
/** Four SELECTs, independent of history size. One read snapshot keeps all ledgers consistent. */
export function loadOrderHistory(db: Db): Order[] {
  return db.transaction(() => {
    const orders = db.prepare('SELECT * FROM orders ORDER BY createdAt DESC,rowid DESC').all() as any[];
    const items = new Map<string, any[]>();
    for (const item of db.prepare('SELECT * FROM order_items ORDER BY rowid').all() as any[]) {
      const group = items.get(item.orderId) || []; group.push(item); items.set(item.orderId, group);
    }
    const cash = new Map<string, number | null>();
    for (const payment of db.prepare("SELECT order_id,tendered_paisa FROM payments WHERE method='cash' ORDER BY rowid").all() as any[]) {
      if (!cash.has(payment.order_id)) cash.set(payment.order_id, payment.tendered_paisa);
    }
    const generation = databaseGeneration(db);
    return orders.map(row => orderSnapshot(row, items.get(row.id) || [], cash.get(row.id), generation));
  }).deferred();
}
