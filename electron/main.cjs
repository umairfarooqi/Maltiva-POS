const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

let cashierWindow;
let customerWindow;
let backendStarted = false;

const PORT = process.env.PORT || '3000';
const APP_URL = `http://127.0.0.1:${PORT}`;

function startBackend() {
  if (backendStarted) return;

  process.env.NODE_ENV = 'production';
  process.env.PORT = PORT;
  process.env.MALTIVA_POS_DB_DIR = app.getPath('userData');

  const serverPath = path.join(__dirname, '..', 'dist-server', 'server.cjs');
  require(serverPath);
  backendStarted = true;
}

async function waitForBackend(timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${APP_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // Backend is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Backend did not become ready at ${APP_URL}`);
}

function createCashierWindow() {
  cashierWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  cashierWindow.loadURL(APP_URL);
  
  cashierWindow.on('closed', () => {
    cashierWindow = null;
  });
}

function createCustomerWindow() {
  const displays = screen.getAllDisplays();
  
  // Only create a second window if a second monitor is actually connected
  if (displays.length > 1) {
    const externalDisplay = displays.find((display) => {
      return display.bounds.x !== 0 || display.bounds.y !== 0;
    });

    if (externalDisplay) {
      customerWindow = new BrowserWindow({
        x: externalDisplay.bounds.x,
        y: externalDisplay.bounds.y,
        width: externalDisplay.bounds.width,
        height: externalDisplay.bounds.height,
        fullscreen: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      // MIRROR MODE: Load the same main page as the cashier
      customerWindow.loadURL(APP_URL);
    }
  }
}

app.whenReady().then(async () => {
  try {
    startBackend();
    await waitForBackend();
  } catch (err) {
    console.error('Failed to start backend server:', err);
  }

  createCashierWindow();
  createCustomerWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createCashierWindow();
      createCustomerWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
