const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const installed = require('electron/package.json');
if (installed.version !== pkg.devDependencies.electron || installed.version !== pkg.build.electronVersion) {
  throw new Error('Electron versions do not match. Run npm ci before building.');
}
const directory = path.dirname(require.resolve('electron/package.json'));
const versionFile = path.join(directory, 'dist/version');
if (!fs.existsSync(versionFile) || fs.readFileSync(versionFile, 'utf8').trim().replace(/^v/, '') !== installed.version) {
  const result = spawnSync(process.execPath, [path.join(directory, 'install.js')], { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!fs.existsSync(path.join(directory, 'dist/electron.exe'))) throw new Error('The Windows Electron runtime is missing.');
