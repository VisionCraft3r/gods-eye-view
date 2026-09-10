import { app, BrowserWindow, Menu, shell } from 'electron';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const APP_URL = `http://${HOST}:${PORT}/`;
const APP_ICON = path.join(ROOT, 'public/app-icon.png');

let serverProcess = null;
let startedServer = false;
let mainWindow = null;

function findNodeBinary() {
  const candidates = [
    process.env.npm_node_execpath,
    process.env.NODE_BINARY,
    path.join(process.env.HOME || '', '.local/bin/node'),
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return 'node';
}

function canListen(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, HOST);
  });
}

async function waitForUrl(url, timeoutMs = 90000) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok || response.status < 500) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function startVite() {
  const viteCli = path.join(ROOT, 'node_modules/vite/bin/vite.js');
  const node = findNodeBinary();
  const env = { ...process.env, HOST, PORT: String(PORT) };
  delete env.ELECTRON_RUN_AS_NODE;
  serverProcess = spawn(node, [viteCli, '--host', HOST, '--port', String(PORT)], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  startedServer = true;
  serverProcess.stdout?.on('data', (chunk) => process.stdout.write(chunk));
  serverProcess.stderr?.on('data', (chunk) => process.stderr.write(chunk));
  serverProcess.on('exit', (code, signal) => {
    if (!app.isQuitting && code && code !== 0) {
      console.error(`[GodsEye] Vite exited (${code || signal})`);
    }
  });
}

function buildMenu() {
  const template = [
    {
      label: "God's Eye View",
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#070b10',
    icon: existsSync(APP_ICON) ? APP_ICON : undefined,
    title: "God's Eye View",
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Pinch must zoom the globe, not Chromium's page scale.
  await mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  await mainWindow.loadURL(APP_URL);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.setName("God's Eye View");
app.setAboutPanelOptions({
  applicationName: "God's Eye View",
  applicationVersion: '0.1.1',
  copyright: 'MIT · upstream bilawalsidhu/gods-eye-view',
});

app.whenReady().then(async () => {
  if (existsSync(APP_ICON) && app.dock) {
    app.dock.setIcon(APP_ICON);
  }
  buildMenu();
  const free = await canListen(PORT);
  if (free) startVite();
  await waitForUrl(APP_URL);
  await createWindow();
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
}).catch((error) => {
  console.error('[GodsEye] Failed to start:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (startedServer && serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM');
  }
});
