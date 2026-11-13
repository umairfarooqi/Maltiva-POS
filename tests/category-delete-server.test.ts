// @vitest-environment node
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INITIAL_PRODUCTS } from '../src/data/initialData';
import { isolatedServer } from './helpers/isolated-server';

describe('category deletion and local images (server)', () => {
  let server: Awaited<ReturnType<typeof isolatedServer>>, db: InstanceType<typeof Database>;
  const request = (route: string, method: string, body?: unknown) => fetch(`${server.url}${route}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${server.token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  beforeAll(async () => { server = await isolatedServer(); db = new Database(server.dbPath); });
  afterAll(async () => { db.close(); await server.cleanup(); });

  it('deletes the category and its dishes without creating Uncategorized', async () => {
    const created = await request('/api/categories', 'POST', { id: 'cat-temp', name: 'Temp', icon: '🍔' });
    expect(created.status).toBe(201);
    const template = { ...INITIAL_PRODUCTS[0], moneySchemaVersion: 2, pricePaisa: 1000, costPricePaisa: 500,
      variations: [], bundledProducts: [], categoryId: 'cat-temp', categoryName: 'Temp' };
    expect((await request('/api/products', 'POST', { ...template, id: 'prod-temp-1', name: 'Temp One' })).status).toBe(201);
    const before = (db.prepare('SELECT count(*) n FROM products').get() as any).n;

    const res = await request('/api/categories/cat-temp', 'DELETE');
    expect(res.status).toBe(200);

    expect(db.prepare("SELECT count(*) n FROM products WHERE categoryId='cat-temp'").get()).toMatchObject({ n: 0 });
    expect(db.prepare("SELECT count(*) n FROM categories WHERE id='cat-temp'").get()).toMatchObject({ n: 0 });
    expect((db.prepare('SELECT count(*) n FROM products').get() as any).n).toBe(before - 1);
    expect(db.prepare("SELECT count(*) n FROM categories WHERE id='cat-uncategorized'").get()).toMatchObject({ n: 0 });
  });

  it('accepts a category with an embedded image icon larger than 100 KB', async () => {
    const icon = `data:image/webp;base64,${'A'.repeat(150_000)}`;
    const res = await request('/api/categories', 'POST', { id: 'cat-img', name: 'With Image', icon });
    expect(res.status).toBe(201);
    expect((db.prepare("SELECT icon FROM categories WHERE id='cat-img'").get() as any).icon).toBe(icon);
  });
});
