import { app, BrowserWindow, Menu, shell, dialog } from 'electron';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const APP_URLS = [`http://${HOST}:${PORT}/`, `http://localhost:${PORT}/`];
const APP_ICON = path.join(ROOT, 'public/app-icon.png');
const LOADING_URL =
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(`<!doctype html>
<html><head><meta charset="utf-8"><title>God's Eye View</title></head>
<body style="margin:0;background:#070b10;color:#9ca6b0;font:15px/1.4 ui-sans-serif,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh">
  Opening God's Eye View…
</body></html>`);

let serverProcess = null;
let startedServer = false;
let mainWindow = null;

function findNodeBinary() {
  const home = process.env.HOME || '';
  const candidates = [
    process.env.npm_node_execpath,
    process.env.NODE_BINARY,
    path.join(home, '.local/bin/node'),
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  const login = spawnSync('/bin/bash', ['-lc', 'command -v node'], { encoding: 'utf8' });
  const found = login.stdout?.trim();
  if (found && existsSync(found)) return found;
  return null;
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

async function waitForAnyUrl(urls, timeoutMs = 90000) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    for (const url of urls) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (response.ok || response.status < 500) return url;
        lastError = new Error(`HTTP ${response.status} from ${url}`);
      } catch (error) {
        lastError = error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw lastError || new Error(`Timed out waiting for ${urls.join(' or ')}`);
}

function startVite(node) {
  const viteCli = path.join(ROOT, 'node_modules/vite/bin/vite.js');
  const env = {
    ...process.env,
    HOST,
    PORT: String(PORT),
    BROWSER: 'none',
    PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || '/usr/bin:/bin'}`,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  serverProcess = spawn(node, [viteCli, '--host', HOST, '--port', String(PORT), '--strictPort'], {
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

function failStart(message) {
  console.error('[GodsEye] Failed to start:', message);
  dialog.showErrorBox("God's Eye View could not start", message);
  app.quit();
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
  await mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  await mainWindow.loadURL(LOADING_URL);
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
  await createWindow();

  const node = findNodeBinary();
  const free = await canListen(PORT);
  if (free) {
    if (!node) {
      failStart(
        `Node.js was not found, so the globe server could not start.\n\nInstall Node or put it on PATH, then reopen God's Eye View.\nProject: ${ROOT}`,
      );
      return;
    }
    startVite(node);
  }

  try {
    const readyUrl = await waitForAnyUrl(APP_URLS);
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(readyUrl);
    }
  } catch (error) {
    failStart(`${error.message}\n\nProject: ${ROOT}`);
    return;
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
      try {
        const readyUrl = await waitForAnyUrl(APP_URLS, 15000);
        if (mainWindow && !mainWindow.isDestroyed()) {
          await mainWindow.loadURL(readyUrl);
        }
      } catch (error) {
        failStart(error.message);
      }
    }
  });
}).catch((error) => {
  failStart(error.stack || String(error));
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
