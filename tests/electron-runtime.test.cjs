const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

async function boot({ error, setupRequired = false, locked = true } = {}) {
  const windows = [], messages = [], app = new EventEmitter(), worker = new EventEmitter();
  const handlers = new Map();
  const permissions = {};
  let quit = 0, forks = 0, startup;
  Object.assign(app, {
    requestSingleInstanceLock: () => locked, quit: () => { quit++; }, whenReady: () => ({ then: fn => { startup = fn(); } }),
    getPath: name => `/fixture/${name}`, getAppPath: () => '/fixture/app.asar', setAppLogsPath() {}, getVersion: () => 'fixture',
  });
  worker.postMessage = data => { messages.push(data); };
  worker.kill = () => worker.emit('exit', 0);
  class Window extends EventEmitter {
    constructor(options) { super(); this.options = options; this.webContents = new EventEmitter(); this.webContents.setWindowOpenHandler = fn => { this.openHandler = fn; }; windows.push(this); }
    async loadURL(url) { this.url = url; }
    show() { this.shown = true; }
    focus() { this.focused = true; }
    isMinimized() { return false; }
    isDestroyed() { return false; }
    close() { this.emit('closed'); }
  }
  const screen = new EventEmitter();
  screen.getPrimaryDisplay = () => ({ id: 1 });
  screen.getAllDisplays = () => [{ id: 1, bounds: { x: 0, y: 0 } }, { id: 2, bounds: { x: 1280, y: 0, width: 1280, height: 800 } }];
  const electron = { app, BrowserWindow: Window, screen,
    session: { defaultSession: { setPermissionRequestHandler(fn) { permissions.request = fn; }, setPermissionCheckHandler(fn) { permissions.check = fn; } } },
    dialog: { showMessageBox: async data => { messages.push(data); } },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    utilityProcess: { fork: (_file, _args, options) => {
      forks++; worker.options = options;
      setImmediate(() => worker.emit('message', error ? { type: 'startup-error', code: error, error: 'Fixture failed' } : { type: 'ready', setupRequired }));
      return worker;
    } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8'), {
    require: id => id === 'electron' ? electron : id === './logging.cjs' ? { createLogger: () => () => {} } : require(id),
    __dirname: '/fixture/electron', process: { env: { PORT: '54321' }, versions: { electron: 'fixture' } },
    setTimeout, clearTimeout, setImmediate, URL,
  });
  await startup;
  return { windows, messages, worker, app, handlers, permissions, get quit() { return quit; }, get forks() { return forks; } };
}
test('loads terminal and dedicated customer route only after owned backend readiness', async () => {
  const run = await boot();
  assert.deepEqual(run.windows.map(w => w.url), ['http://127.0.0.1:54321', 'http://127.0.0.1:54321/customer-display']);
  assert.equal(run.worker.options.env.HOST, '127.0.0.1');
  assert.equal(run.worker.options.env.MALTIVA_POS_RENDERER_DIR, path.join('/fixture/app.asar', 'dist'));
  assert.equal(run.windows[1].options.x, 1280);
  assert.equal(run.windows[0].options.webPreferences.sandbox, true);
  const event = { preventDefault() { this.prevented = true; } };
  run.windows[0].webContents.emit('will-navigate', event, 'https://untrusted.example');
  assert.equal(event.prevented, true);
  assert.equal(run.windows[0].openHandler({ url: 'https://untrusted.example' }).action, 'deny');
  run.app.emit('second-instance'); assert.equal(run.windows[0].focused, true);
  assert.equal(run.permissions.check(null, 'clipboard-sanitized-write', 'http://127.0.0.1:54321'), true);
  assert.equal(run.permissions.check(null, 'clipboard-read', 'http://127.0.0.1:54321'), false);
  assert.equal(run.permissions.check(null, 'clipboard-sanitized-write', 'https://untrusted.example'), false);
});
test('bind/startup errors show a useful error and never open the POS', async () => {
  const run = await boot({ error: 'EADDRINUSE' });
  assert.equal(run.windows.length, 0);
  assert.match(run.messages[0].message, /Port 54321 is already in use/);
  assert.equal(run.quit, 1);
});
test('second application instance does not start another backend', async () => {
  const run = await boot({ locked: false });
  assert.equal(run.forks, 0); assert.equal(run.windows.length, 0); assert.equal(run.quit, 1);
});
test('empty database opens local owner setup and rejects an unrelated IPC sender', async () => {
  const run = await boot({ setupRequired: true });
  assert.equal(run.windows.length, 1); assert.match(run.windows[0].url, /setup\.html$/);
  await assert.rejects(run.handlers.get('maltiva:setup-owner')({ sender: {}, senderFrame: { url: run.windows[0].url } }, {}), /unavailable/);
  assert.equal(run.worker.listenerCount('message'), 1);
});
