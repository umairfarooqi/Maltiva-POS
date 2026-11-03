const { app, BrowserWindow, screen, session, dialog, ipcMain, utilityProcess } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { createLogger } = require('./logging.cjs');

// Keep both the historical app identity and browser origin: recovery data lives here.
const PORT = Number(process.env.PORT || 3000);
const APP_URL = 'http://127.0.0.1:' + PORT;
const SETUP_URL = pathToFileURL(path.join(__dirname, 'setup.html')).href;
let cashierWindow, customerWindow, setupWindow, backend, log = () => {};
let ready = false, quitting = false, shutdownComplete = false, shutdownStarted = false, failing = false;
const pendingSetup = new Map();

function preferences(preload = 'preload.cjs') {
  return { preload: path.join(__dirname, preload), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true };
}
function isAppURL(value) {
  try { const url = new URL(value); return url.origin === APP_URL && !url.username && !url.password; }
  catch { return false; }
}
function protectWindow(window, setup = false) {
  window.webContents.on('will-navigate', (event, url) => {
    if (setup ? url !== SETUP_URL : !isAppURL(url)) event.preventDefault();
  });
  window.webContents.on('will-redirect', (event, url) => {
    if (setup ? url !== SETUP_URL : !isAppURL(url)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!setup && isAppURL(url) && new URL(url).pathname === '/customer-display') {
      openCustomerWindow(true).catch(fail);
    }
    return { action: 'deny' };
  });
  window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) log('page-load-failed', { code, description });
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    log('renderer-exited', details);
    if (!quitting) fail(new Error('The POS screen stopped responding. Restart the application.'));
  });
  window.on('unresponsive', () => log('window-unresponsive'));
}
async function openCashierWindow() {
  if (quitting) return;
  cashierWindow = new BrowserWindow({ width: 1280, height: 800, fullscreen: true, show: false, webPreferences: preferences() });
  const window = cashierWindow;
  protectWindow(window);
  window.on('closed', () => { cashierWindow = null; if (!quitting) app.quit(); });
  await window.loadURL(APP_URL);
  window.show();
}
async function openCustomerWindow(manual = false) {
  if (quitting || !ready) return;
  if (customerWindow && !customerWindow.isDestroyed()) { if (manual) customerWindow.focus(); return; }
  const primary = screen.getPrimaryDisplay();
  const display = screen.getAllDisplays().find(item => item.id !== primary.id);
  if (!display && !manual) return;
  customerWindow = new BrowserWindow({ ...(display ? display.bounds : { width: 1024, height: 768 }),
    fullscreen: !!display, show: false, webPreferences: preferences() });
  const window = customerWindow;
  protectWindow(window);
  window.on('closed', () => { customerWindow = null; });
  await window.loadURL(APP_URL + '/customer-display');
  window.show();
}
async function openTerminal() {
  await openCashierWindow();
  await openCustomerWindow();
}
async function openSetup() {
  if (quitting) return;
  setupWindow = new BrowserWindow({ width: 620, height: 760, minWidth: 480, minHeight: 650, show: false,
    title: 'Set up Maltiva POS', webPreferences: preferences('setup-preload.cjs') });
  const window = setupWindow;
  protectWindow(window, true);
  window.on('closed', () => { setupWindow = null; if (!ready && !quitting) app.quit(); });
  await window.loadURL(SETUP_URL);
  window.show();
}
async function fail(error) {
  if (failing || quitting) return;
  failing = true;
  log('desktop-error', { code: error.code, message: error.message });
  const reason = error.code === 'EADDRINUSE'
    ? 'Port ' + PORT + ' is already in use. Close the other POS or development server, then reopen Maltiva POS.'
    : error.message || 'The POS could not start.';
  await dialog.showMessageBox({ type: 'error', title: 'Maltiva POS could not start',
    message: reason, detail: 'Diagnostic logs: ' + app.getPath('logs'), buttons: ['Exit'], noLink: true });
  app.quit();
}
function startBackend() {
  return new Promise((resolve, reject) => {
    let started = false;
    const timer = setTimeout(() => reject(new Error('The POS server took too long to start.')), 30000);
    backend = utilityProcess.fork(path.join(__dirname, 'backend.cjs'), [], {
      serviceName: 'Maltiva POS backend', stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(PORT),
        MALTIVA_POS_MANAGED: '1', MALTIVA_POS_DB_DIR: app.getPath('userData'),
        MALTIVA_POS_RENDERER_DIR: path.join(app.getAppPath(), 'dist') },
    });
    backend.stdout?.resume();
    backend.stderr?.resume();
    // Never log IPC bodies: owner setup includes credentials.
    backend.on('message', message => {
      if (message.type === 'ready') { clearTimeout(timer); started = true; resolve(message); }
      if (message.type === 'startup-error') {
        clearTimeout(timer); reject(Object.assign(new Error(message.error), { code: message.code }));
      }
      if (message.type === 'setup-result') {
        const request = pendingSetup.get(message.id);
        if (request) { clearTimeout(request.timer); pendingSetup.delete(message.id); request.resolve(message); }
      }
    });
    backend.on('exit', code => {
      clearTimeout(timer);
      backend = null;
      for (const request of pendingSetup.values()) { clearTimeout(request.timer); request.resolve({ ok: false, error: 'The POS server stopped. Restart the application.' }); }
      pendingSetup.clear();
      log('backend-exited', { code });
      if (!started) reject(new Error('The POS server stopped before it was ready.'));
      else if (!quitting) fail(new Error('The POS server stopped. Restart the application.'));
    });
  });
}
function setupOwner(owner) {
  return new Promise(resolve => {
    const id = randomUUID();
    const timer = setTimeout(() => { pendingSetup.delete(id); resolve({ ok: false, error: 'Setup took too long. Close and reopen the application to check its status.' }); }, 15000);
    pendingSetup.set(id, { resolve, timer });
    backend.postMessage({ type: 'setup-owner', id, owner });
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = setupWindow || cashierWindow;
    if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
  });
  app.on('before-quit', event => {
    quitting = true;
    if (shutdownComplete || !backend) return;
    event.preventDefault();
    if (shutdownStarted) return;
    shutdownStarted = true;
    const worker = backend;
    const timer = setTimeout(() => { log('backend-stop-timeout'); worker.kill(); shutdownComplete = true; app.quit(); }, 10000);
    worker.once('exit', () => { clearTimeout(timer); shutdownComplete = true; app.quit(); });
    worker.postMessage({ type: 'stop' });
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(async () => {
    try {
      app.setAppLogsPath();
      log = createLogger(app.getPath('logs'));
      log('starting', { version: app.getVersion(), electron: process.versions.electron, data: app.getPath('userData'), resources: app.getAppPath() });
      if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT must be a number between 1 and 65535.');
      // Receipt copying needs sanitized clipboard writes; clipboard reads stay denied.
      session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
        callback(permission === 'clipboard-sanitized-write' && isAppURL(details.requestingUrl || contents?.getURL() || ''));
      });
      session.defaultSession.setPermissionCheckHandler((_contents, permission, origin) => permission === 'clipboard-sanitized-write' && isAppURL(origin));
      ipcMain.handle('maltiva:setup-owner', async (event, owner) => {
        if (!setupWindow || event.sender !== setupWindow.webContents || event.senderFrame?.url !== SETUP_URL || ready || !backend) throw new Error('Owner setup is unavailable.');
        const result = await setupOwner(owner);
        if (result.ok && !quitting) {
          ready = true;
          // Let the renderer receive success before retiring the setup window.
          setImmediate(async () => {
            try { await openTerminal(); setupWindow?.close(); }
            catch (error) { fail(error); }
          });
        }
        return { ok: result.ok, error: result.error };
      });
      const status = await startBackend();
      if (status.setupRequired) await openSetup();
      else { ready = true; await openTerminal(); }
      screen.on('display-added', () => { if (ready) openCustomerWindow().catch(fail); });
      screen.on('display-removed', () => {
        if (customerWindow) {
          // Recreate against the remaining display inventory, or close if only one remains.
          customerWindow.close();
          openCustomerWindow().catch(fail);
        }
      });
    } catch (error) { await fail(error); }
  });
}
