import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const db = fs.readFileSync(new URL('../src/services/db.ts', import.meta.url), 'utf8');

assert.ok(pkg.devDependencies?.electron, 'electron must be listed as a devDependency');
assert.ok(pkg.devDependencies?.['electron-builder'], 'electron-builder must be listed as a devDependency');

assert.ok(pkg.scripts?.['build:server'], 'package.json must expose a production server build script');
assert.ok(pkg.scripts?.['build:electron'], 'package.json must build both renderer and backend for Electron');
assert.notEqual(pkg.scripts?.start, 'tsx server.ts', 'production start must not depend on tsx');

assert.ok(
  main.includes('dist-server') && main.includes('server.cjs'),
  'Electron must load the compiled backend instead of running npm start'
);
assert.ok(
  main.includes('MALTIVA_POS_DB_DIR'),
  'Electron must pass a stable app data database directory to the backend'
);

assert.ok(
  db.includes('MALTIVA_POS_DB_DIR'),
  'SQLite database path must be configurable for Electron userData'
);
assert.ok(
  db.includes('mkdirSync'),
  'SQLite database directory must be created before opening the database'
);
