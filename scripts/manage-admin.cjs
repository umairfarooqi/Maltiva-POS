// Out-of-band administrator provisioning and credential reset tool.
// Usage:
//   npm run admin:setup -- --username admin --name "Ibrahim Kadri" --pin 1234 --password admin123
//   npm run admin:setup   (uses defaults or environment variables MALTIVA_ADMIN_*)
const Database = require('better-sqlite3');
const path = require('path');
const { randomUUID, randomBytes, scryptSync } = require('crypto');

const HASH_PREFIX = 's1$';
function hashSecret(secret) {
  const salt = randomBytes(16);
  return `${HASH_PREFIX}${salt.toString('hex')}$${scryptSync(secret, salt, 32).toString('hex')}`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const username = String(args.username || process.env.MALTIVA_ADMIN_USERNAME || 'admin').trim().toLowerCase();
const name = String(args.name || process.env.MALTIVA_ADMIN_NAME || 'System Administrator').trim();
const pin = String(args.pin || process.env.MALTIVA_ADMIN_PIN || '1234').trim();
const password = String(args.password || process.env.MALTIVA_ADMIN_PASSWORD || 'admin123').trim();
const branch = String(args.branch || process.env.MALTIVA_ADMIN_BRANCH || 'Phase 3 DHA Lahore').trim();
const email = String(args.email || `${username}@maltivacrust.com`).trim();

if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
  console.error('Error: --username must be 3-32 characters (letters, numbers, . _ -).');
  process.exit(1);
}
if (!/^\d{4}$/.test(pin)) {
  console.error('Error: --pin must be dispelled as exactly 4 digits.');
  process.exit(1);
}
if (password.length < 6) {
  console.error('Error: --password must be at least 6 characters.');
  process.exit(1);
}

const dbDir = process.env.MALTIVA_POS_DB_DIR || process.cwd();
const dbPath = path.join(dbDir, 'maltiva_pos.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    password TEXT,
    pin TEXT,
    role TEXT CHECK(role IN ('admin', 'cashier', 'manager')) NOT NULL,
    avatar TEXT,
    active INTEGER DEFAULT 1,
    branch TEXT,
    securityQuestion TEXT,
    securityAnswer TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

const pinHash = hashSecret(pin);
const passwordHash = hashSecret(password);
const existing = db.prepare('SELECT id, username FROM users WHERE lower(username) = ?').get(username);

if (existing) {
  db.prepare(`
    UPDATE users
    SET name = ?, email = ?, password = ?, pin = ?, role = 'admin', active = 1, branch = ?, securityAnswer = ?
    WHERE id = ?
  `).run(name, email, passwordHash, pinHash, branch, pinHash, existing.id);
  console.log(`Updated existing administrator account "${username}" (active=1, PIN and password reset).`);
} else {
  const id = `user-${randomUUID()}`;
  db.prepare(`
    INSERT INTO users (id, name, username, email, password, pin, role, avatar, active, branch, securityQuestion, securityAnswer)
    VALUES (?, ?, ?, ?, ?, ?, 'admin', '', 1, ?, 'Registered 4-digit PIN', ?)
  `).run(id, name, username, email, passwordHash, pinHash, branch, pinHash);
  console.log(`Created administrator account "${username}" (${name}).`);
}

db.pragma('wal_checkpoint(TRUNCATE)');
db.close();

