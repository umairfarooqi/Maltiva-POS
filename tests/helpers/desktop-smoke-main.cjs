// Run under real Electron with disposable userData. This fixture is never packaged.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = process.env.MALTIVA_SMOKE_ROOT;
const mode = process.env.MALTIVA_SMOKE_MODE;
const output = process.env.MALTIVA_SMOKE_OUTPUT;
const result = { mode, electron: process.versions.electron, windows: [], errors: [], checks: {} };
app.setPath('userData', process.env.MALTIVA_SMOKE_DATA);
app.getAppPath = () => mode === 'missing-assets' ? path.join(root, 'missing') : root;
let finished = false, finalTimer;
function save() { fs.writeFileSync(output, JSON.stringify(result, null, 2)); }
function finish(error) {
  if (finished) return;
  finished = true;
  if (error) result.failure = error.stack || String(error);
  save(); clearTimeout(finalTimer); app.quit();
}
app.on('will-quit', save);
const originalLoad = Module._load;
const assert = require('node:assert/strict');
class HiddenWindow extends BrowserWindow {
  show() {} // Main-process show() remains exercised without covering the user's screen.
  constructor(options) {
    super({ ...options, fullscreen: false, show: false, webPreferences: { ...options.webPreferences, offscreen: true } });
    const window = this, item = { errors: [] };
    result.windows.push(item);
    window.webContents.on('console-message', details => {
      if (details.level === 'error' || details.level === 3) item.errors.push(details.message);
    });
    window.webContents.on('did-finish-load', async () => {
      try {
        item.url = window.webContents.getURL();
        item.sandbox = window.webContents.getLastWebPreferences().sandbox;
        if (item.url.endsWith('/setup.html')) {
          assert.equal(mode, 'fresh');
          // Allow the deferred local setup script to finish.
          await window.webContents.executeJavaScript('new Promise(r => setTimeout(r, 100))');
          fs.writeFileSync(path.join(path.dirname(output), 'owner-setup.png'), (await window.webContents.capturePage()).toPNG());
          const invalid = await window.webContents.executeJavaScript('window.ownerSetup.submit({name:"Fixture",username:"owner",password:"short",pin:"1234"})');
          assert.equal(invalid.ok, false); result.checks.rejectsWeakSetup = true;
          const valid = await window.webContents.executeJavaScript('window.ownerSetup.submit({name:"Smoke Owner",username:"smoke-owner",password:"disposable-owner-secret",pin:"4827"})');
          assert.equal(valid.ok, true); result.checks.createsOwner = true;
          return;
        }
        if (item.url.includes('/customer-display')) return;
        await window.webContents.executeJavaScript('new Promise(r => setTimeout(r, 500))');
        item.page = await window.webContents.executeJavaScript('({hasRoot:!!document.getElementById("root"),title:document.title,text:document.body.innerText.slice(-500)})');
        assert.equal(item.page.hasRoot, true);
        const login = await fetch('http://127.0.0.1:' + process.env.PORT + '/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'smoke-owner', password: 'disposable-owner-secret' }),
        });
        assert.equal(login.status, 200); const { token } = await login.json();
        const response = await fetch('http://127.0.0.1:' + process.env.PORT + '/');
        assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
        result.checks.csp = true; result.checks.ownerLogin = true;
        const data = await fetch('http://127.0.0.1:' + process.env.PORT + '/api/data', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
        assert.ok(data.products.length); result.checks.catalog = true;
        const url = 'http://127.0.0.1:' + process.env.PORT;
        const request = (route, body) => fetch(url + route, { method: body ? 'POST' : 'GET',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
        if (mode === 'fresh') {
          const product = data.products.find(product => product.stockQuantity > 0 && product.isAvailable && !product.isDeal && !product.variations?.length);
          assert.ok(product, 'A plain stocked fixture product is required');
          const ownerId = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()).sub;
          const sale = { id: 'desktop-smoke-sale', idempotencyKey: 'desktop-smoke-key', moneySchemaVersion: 2,
            cashierId: ownerId, status: 'in_kitchen', orderType: 'take_away', customerName: 'Disposable fixture',
            paymentMethod: 'cash', discountPaisa: 0, databaseGeneration: data.databaseGeneration,
            items: [{ id: 'desktop-smoke-item', productId: product.id, quantity: 1, selectedVariations: [], notes: '' }] };
          const quoteResponse = await request('/api/orders/quote', sale);
          assert.equal(quoteResponse.status, 200, await quoteResponse.clone().text());
          const quote = await quoteResponse.json();
          const saved = await request('/api/orders', { ...sale, ...quote, cashTenderedPaisa: quote.totalPaisa, changeDuePaisa: 0 });
          assert.equal(saved.status, 201, await saved.clone().text());
          result.checks.savesSale = true;
          const backup = await request('/api/maintenance/backups', {});
          assert.equal(backup.status, 201, await backup.clone().text());
          result.checks.backup = true;
          await window.webContents.executeJavaScript('localStorage.setItem("desktop-smoke-origin","preserved")');
        } else {
          const receipt = await request('/api/receipts/desktop-smoke-sale');
          assert.equal(receipt.status, 200); result.checks.savedSaleSurvivesRestart = true;
          assert.equal(await window.webContents.executeJavaScript('localStorage.getItem("desktop-smoke-origin")'), 'preserved');
          result.checks.stableOriginStorage = true;
        }
        const forbiddenSetup = await fetch('http://127.0.0.1:' + process.env.PORT + '/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        assert.equal(forbiddenSetup.status, 401); result.checks.noPublicSetup = true;
        fs.writeFileSync(path.join(path.dirname(output), 'terminal-login.png'), (await window.webContents.capturePage()).toPNG());
        finish();
      } catch (error) { finish(error); }
    });
  }
}
Module._load = function(id, parent, isMain) {
  const value = originalLoad.call(this, id, parent, isMain);
  if (id !== 'electron') return value;
  return { ...value, BrowserWindow: HiddenWindow, dialog: { ...value.dialog, showMessageBox: async details => {
    result.errors.push(details);
    if (['occupied-port', 'missing-assets'].includes(mode)) {
      try {
        assert.equal(result.windows.length, 0);
        assert.match(details.message, mode === 'occupied-port' ? /already in use/ : /interface is missing/);
        result.checks.expectedFailure = true; save();
      } catch (error) { result.failure = error.stack; save(); }
    } else { result.failure = details.message; save(); }
    return { response: 0 };
  } } };
};
finalTimer = setTimeout(() => finish(new Error('Desktop smoke probe timed out')), 35000);
try { require(path.join(root, 'electron/main.cjs')); } catch (error) { finish(error); }
