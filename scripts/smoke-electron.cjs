const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
async function reserve() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}
(async () => {
  const appRoot = process.argv[2] ? path.resolve(process.argv[2]) : root;
  const evidence = path.join(root, 'docs/audits/electron-fixes-2026-11-02'); fs.mkdirSync(evidence, { recursive: true });
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'maltiva desktop smoke '));
  const initialPort = await reserve(); const stablePort = initialPort.port;
  await new Promise(resolve => initialPort.server.close(resolve));
  for (const mode of ['fresh', 'restart', 'occupied-port', 'missing-assets']) {
    const port = stablePort;
    const server = net.createServer();
    if (mode === 'occupied-port') await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
    const output = path.join(evidence, mode + '.json');
    if (fs.existsSync(output)) fs.unlinkSync(output);
    const env = { ...process.env, PORT: String(port), MALTIVA_SMOKE_ROOT: appRoot,
      MALTIVA_SMOKE_MODE: mode, MALTIVA_SMOKE_OUTPUT: output, MALTIVA_SMOKE_DATA: data };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(path.join(root, 'node_modules/electron/dist/electron.exe'), [path.join(root, 'tests/helpers/desktop-smoke-main.cjs')], {
      cwd: data, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = ''; child.stdout.on('data', d => { log += d; }); child.stderr.on('data', d => { log += d; });
    const timeout = setTimeout(() => child.kill(), 50000);
    const code = await new Promise(resolve => child.on('exit', resolve)); clearTimeout(timeout);
    if (mode === 'occupied-port') await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(path.join(evidence, mode + '-console.txt'), log);
    assert.equal(code, 0, log);
    const result = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(result.failure, undefined, JSON.stringify(result));
    if (['fresh', 'restart'].includes(mode)) assert.equal(result.checks.ownerLogin, true);
    else assert.equal(result.checks.expectedFailure, true);
    console.log(mode, 'PASS', result.electron);
  }
  fs.writeFileSync(path.join(evidence, 'profile.json'), JSON.stringify({ data, appRoot }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
