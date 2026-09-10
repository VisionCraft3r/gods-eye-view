import { app, BrowserWindow, Menu, shell, dialog } from 'electron';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, openSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HOST = '127.0.0.1';
// Own IPv4 port so Cursor's Vite on localhost/[::1]:4173 cannot look "ready"
// while Chromium still connects to 127.0.0.1 and paints a blank window.
const PORT = Number(process.env.GEV_PORT || 4174);
const APP_URL = `http://${HOST}:${PORT}/`;
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

function bootLog(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    appendFileSync('/tmp/gev-boot.log', line);
  } catch {
    /* ignore */
  }
}

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

async function waitForUrl(url, timeoutMs = 90000) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok || response.status < 500) return url;
      lastError = new Error(`HTTP ${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
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
  const logPath = path.join(app.getPath('userData'), 'vite.log');
  const logFd = openSync(logPath, 'w');
  bootLog(`spawn vite node=${node} port=${PORT} log=${logPath}`);
  serverProcess = spawn(node, [viteCli, '--host', HOST, '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', logFd, logFd],
  });
  startedServer = true;
  serverProcess.on('error', (error) => {
    bootLog(`vite spawn error ${error.message}`);
  });
  serverProcess.on('exit', (code, signal) => {
    bootLog(`vite exit code=${code} signal=${signal}`);
    if (!app.isQuitting && code && code !== 0) {
      console.error(`[GodsEye] Vite exited (${code || signal}). See ${logPath}`);
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
  bootLog(`failStart ${message}`);
  console.error('[GodsEye] Failed to start:', message);
  dialog.showErrorBox("God's Eye View could not start", message);
  app.quit();
}

function createWindow() {
  bootLog('createWindow');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: true,
    backgroundColor: '#070b10',
    icon: existsSync(APP_ICON) ? APP_ICON : undefined,
    title: "God's Eye View",
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webgl: true,
      backgroundThrottling: false,
    },
  });
  bootLog('BrowserWindow constructed');
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
    bootLog(`loaded ${mainWindow.webContents.getURL()}`);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    if (url.startsWith('data:')) return;
    bootLog(`did-fail-load ${errorCode} ${errorDescription} ${url}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      failStart(`Could not load the globe (${errorDescription}).\n\nTried ${url}\nCode ${errorCode}`);
    }
  });
  mainWindow.loadURL(LOADING_URL).catch((error) => bootLog(`loading url ${error.message}`));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.setName("God's Eye View");
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-webgl');
app.commandLine.appendSwitch('host-resolver-rules', 'MAP localhost 127.0.0.1, MAP ::1 127.0.0.1');
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('use-angle', 'metal');
}
app.setAboutPanelOptions({
  applicationName: "God's Eye View",
  applicationVersion: '0.1.1',
  copyright: 'MIT · upstream bilawalsidhu/gods-eye-view',
});

bootLog(`main module loaded ready=${app.isReady()} root=${ROOT}`);

app.whenReady().then(async () => {
  bootLog('whenReady');
  if (existsSync(APP_ICON) && app.dock) {
    app.dock.setIcon(APP_ICON);
  }
  buildMenu();
  createWindow();

  const node = findNodeBinary();
  bootLog(`node=${node || 'missing'}`);
  let live = false;
  try {
    const response = await fetch(APP_URL, { cache: 'no-store' });
    live = Boolean(response.ok || response.status < 500);
  } catch {
    live = false;
  }
  bootLog(`server live=${live}`);
  if (!live) {
    if (!node) {
      failStart(
        `Node.js was not found, so the globe server could not start.\n\nInstall Node or put it on PATH, then reopen God's Eye View.\nProject: ${ROOT}`,
      );
      return;
    }
    startVite(node);
  }

  try {
    await waitForUrl(APP_URL);
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(APP_URL);
    }
  } catch (error) {
    failStart(`${error.message}\n\nTried ${APP_URL}\nProject: ${ROOT}`);
    return;
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
      try {
        await waitForUrl(APP_URL, 15000);
        if (mainWindow && !mainWindow.isDestroyed()) {
          await mainWindow.loadURL(APP_URL);
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
