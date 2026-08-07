import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';

const PROD_URL = 'http://localhost:8080';

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

app.whenReady().then(start);

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
