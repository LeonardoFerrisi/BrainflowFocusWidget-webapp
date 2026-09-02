import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';

const PROD_URL = 'http://localhost:8081';

let win: BrowserWindow | null = null;
let quitting = false;
let shutdown: (() => Promise<void>) | null = null;

function createWindow(url: string): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.loadURL(url);
}

async function start(): Promise<void> {
  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) {
    createWindow(devUrl);
    return;
  }

  // Packaged layout: this file is dist-electron/main.cjs, the built frontend is
  // dist-electron/../dist. Hand the server an explicit path so it never guesses.
  process.env.NODE_ENV = 'production';
  process.env.FOCUS_DIST = path.join(__dirname, '..', 'dist');

  const serverEntry = pathToFileURL(path.join(__dirname, 'server', 'index.mjs')).href;
  const mod = await import(serverEntry);
  shutdown = mod.shutdown;
  const { server } = mod;

  server.once('error', (err: Error) => {
    dialog.showErrorBox('Server failed to start', String(err));
    app.quit();
  });

  if (server.listening) {
    createWindow(PROD_URL);
  } else {
    server.once('listening', () => createWindow(PROD_URL));
  }
}

app.whenReady().then(start).catch((err) => {
  // Most likely a native library failing to load (missing VC++ runtime, etc.).
  // Surface it instead of the window silently never appearing.
  dialog.showErrorBox('BrainFlow Focus Widget failed to start', String(err?.stack || err));
  app.quit();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', (e) => {
  if (quitting) return;
  e.preventDefault();
  quitting = true;
  (async () => {
    if (shutdown) {
      try { await shutdown(); } catch { /* ignore */ }
    }
    app.quit();
  })();
});
