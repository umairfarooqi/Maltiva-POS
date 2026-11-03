// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(tmpdir(), 'maltiva-owner-test-'));
const previousDirectory = process.env.MALTIVA_POS_DB_DIR;
const previousManaged = process.env.MALTIVA_POS_MANAGED;
let api: typeof import('../server'), database: typeof import('../src/services/db');
beforeAll(async () => {
  process.env.MALTIVA_POS_DB_DIR = directory;
  process.env.MALTIVA_POS_MANAGED = '1';
  database = await import('../src/services/db');
  await database.initDb();
  api = await import('../server');
});
beforeEach(() => database.default.prepare('DELETE FROM users').run());
afterAll(() => {
  database?.default.close();
  if (previousDirectory === undefined) delete process.env.MALTIVA_POS_DB_DIR; else process.env.MALTIVA_POS_DB_DIR = previousDirectory;
  if (previousManaged === undefined) delete process.env.MALTIVA_POS_MANAGED; else process.env.MALTIVA_POS_MANAGED = previousManaged;
  rmSync(directory, { recursive: true, force: true });
});
const owner = { name: 'Owner Fixture', username: 'owner-fixture', password: 'chosen-secret-fixture', pin: '4827' };
it('creates exactly one administrator with hashed credentials in an empty database', () => {
  expect(api.needsInitialOwner()).toBe(true);
  api.provisionInitialOwner(owner);
  const row: any = database.default.prepare('SELECT * FROM users').get();
  expect(row).toMatchObject({ role: 'admin', active: 1, username: owner.username });
  expect(row.password).toMatch(/^s1\$/); expect(row.pin).toMatch(/^s1\$/);
  expect(row.password).not.toContain(owner.password);
  expect(api.needsInitialOwner()).toBe(false);
  expect(() => api.provisionInitialOwner({ ...owner, username: 'other-owner' })).toThrow(/already complete/);
  expect(database.default.prepare('SELECT count(*) n FROM users').get()).toEqual({ n: 1 });
});
it('does not recreate an owner when an existing installation contains only inactive staff', () => {
  api.provisionInitialOwner(owner);
  database.default.prepare('UPDATE users SET active=0').run();
  expect(api.needsInitialOwner()).toBe(false);
  expect(() => api.provisionInitialOwner(owner)).toThrow(/already complete/);
});
it.each([
  { ...owner, password: 'short' }, { ...owner, pin: '12345' }, { ...owner, username: '<invalid>' },
  { ...owner, name: '' }, { ...owner, password: 'x'.repeat(129) }, { ...owner, pin: 1234 },
])('rejects invalid initial-owner credentials without creating an account', input => {
  expect(() => api.provisionInitialOwner(input)).toThrow(/Enter your name/);
  expect(api.needsInitialOwner()).toBe(true);
});
