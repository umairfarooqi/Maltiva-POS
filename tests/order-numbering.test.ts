// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allocateOrderNumbers, businessDate, initOrderNumbering } from '../src/services/orderNumbering';

describe('daily transactional order numbering', () => {
  let db: InstanceType<typeof Database>;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE orders (id TEXT PRIMARY KEY,orderNumber TEXT UNIQUE NOT NULL,tokenNumber INTEGER,createdAt TEXT);
      CREATE TABLE settings (key TEXT PRIMARY KEY,value TEXT);`);
    initOrderNumbering(db);
  });
  afterEach(() => db.close());
  const save = (timestamp: string, id = timestamp) => db.transaction(() => {
    const numbers = allocateOrderNumbers(db, new Date(timestamp));
    db.prepare('INSERT INTO orders (id,orderNumber,tokenNumber,createdAt,businessDate) VALUES (?,?,?,?,?)')
      .run(id, numbers.orderNumber, numbers.tokenNumber, timestamp, numbers.businessDate);
    return numbers;
  }).immediate();

  it('uses Karachi midnight and configured cutoffs independently of the host timezone', () => {
    expect(businessDate(new Date('2026-10-29T18:59:59Z'))).toBe('2026-10-29');
    expect(businessDate(new Date('2026-10-29T19:00:00Z'))).toBe('2026-10-30');
    expect(businessDate(new Date('2026-10-29T22:59:59Z'), 'Asia/Karachi', 4)).toBe('2026-10-29');
    expect(businessDate(new Date('2026-10-29T23:00:00Z'), 'Asia/Karachi', 4)).toBe('2026-10-30');
    expect(businessDate(new Date('2028-03-01T22:00:00Z'), 'Asia/Karachi', 4)).toBe('2028-03-01');
    expect(businessDate(new Date('2026-11-01T05:30:00Z'), 'America/New_York', 4)).toBe('2026-10-31');
    expect(businessDate(new Date('2026-11-01T09:00:00Z'), 'America/New_York', 4)).toBe('2026-11-01');
  });

  it('resets tokens on a new business day while order references remain globally unique', () => {
    expect(save('2026-10-29T18:59:59Z')).toEqual({ businessDate: '2026-10-29', orderNumber: '#F20261029-0001', tokenNumber: 1 });
    expect(save('2026-10-29T19:00:00Z')).toEqual({ businessDate: '2026-10-30', orderNumber: '#F20261030-0001', tokenNumber: 1 });
    expect(save('2026-10-29T19:00:01Z')).toEqual({ businessDate: '2026-10-30', orderNumber: '#F20261030-0002', tokenNumber: 2 });
  });

  it('preserves legacy snapshots and seeds beyond existing numbers for the transition day', () => {
    db.prepare('INSERT INTO orders VALUES (?,?,?,?,NULL)').run('old', '#F0031', 31, '2026-10-30 10:00:00');
    db.prepare('INSERT INTO orders VALUES (?,?,?,?,NULL)').run('existing-format', '#F20261030-0042', 88, '2026-10-30T10:00:00Z');
    db.prepare('INSERT INTO orders VALUES (?,?,?,?,NULL)').run('previous-day', '#F00099', 999, '2026-10-29T10:00:00Z');
    const legacy = db.prepare('SELECT * FROM orders ORDER BY id').all();
    initOrderNumbering(db);
    expect(db.prepare('SELECT * FROM orders ORDER BY id').all()).toEqual(legacy);
    expect(save('2026-10-30T11:00:00Z')).toEqual({ businessDate: '2026-10-30', orderNumber: '#F20261030-0043', tokenNumber: 89 });
    expect(save('2026-10-31T11:00:00Z')).toEqual({ businessDate: '2026-10-31', orderNumber: '#F20261031-0001', tokenNumber: 1 });
    expect(db.prepare('SELECT * FROM orders WHERE id=?').get('old')).toEqual(legacy.find((row: any) => row.id === 'old'));
  });

  it('rolls back counter initialization and increments when the sale transaction fails', () => {
    expect(() => db.transaction(() => {
      allocateOrderNumbers(db, new Date('2026-10-30T10:00:00Z'));
      throw new Error('Forced ledger failure');
    }).immediate()).toThrow('Forced ledger failure');
    expect(db.prepare('SELECT * FROM order_counters').all()).toEqual([]);
    expect(save('2026-10-30T10:00:01Z').tokenNumber).toBe(1);
    expect(() => db.transaction(() => {
      allocateOrderNumbers(db, new Date('2026-10-30T10:00:02Z'));
      throw new Error('Forced ledger failure');
    }).immediate()).toThrow();
    expect(save('2026-10-30T10:00:03Z').tokenNumber).toBe(2);
  });

  it('enforces token uniqueness for new orders without rejecting historical duplicates', () => {
    db.prepare('INSERT INTO orders VALUES (?,?,?,?,NULL)').run('old-a', '#OLD-A', 1, '2026-10-01T10:00:00Z');
    db.prepare('INSERT INTO orders VALUES (?,?,?,?,NULL)').run('old-b', '#OLD-B', 1, '2026-10-01T10:00:00Z');
    const first = save('2026-10-30T10:00:00Z');
    expect(() => db.prepare('INSERT INTO orders VALUES (?,?,?,?,?)').run('duplicate', '#OTHER', first.tokenNumber, '2026-10-30T10:00:01Z', first.businessDate)).toThrow();
  });

  it('fails safely on invalid configuration and allocation outside a transaction', () => {
    expect(() => allocateOrderNumbers(db, new Date())).toThrow('transaction');
    for (const [key, value] of [['timezone', 'Invalid/Zone'], ['day_cutoff_hour', '24']]) {
      db.prepare('DELETE FROM settings').run();
      db.prepare('INSERT INTO settings VALUES (?,?)').run(key, value);
      expect(() => save('2026-10-30T10:00:00Z')).toThrow('time zone');
      expect(db.prepare('SELECT * FROM order_counters').all()).toEqual([]);
    }
  });
});
