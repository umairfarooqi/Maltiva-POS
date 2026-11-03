const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const name of ['dist', 'dist-server', 'server.js']) {
  const target = path.resolve(root, name);
  if (path.dirname(target) !== root) throw new Error('Invalid clean target');
  fs.rmSync(target, { recursive: true, force: true });
}
