const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, globalShortcut, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');

const isDev = process.env.DAILYNOTE_ELECTRON_DEV === '1' || !app.isPackaged;
const PORT = Number(process.env.DAILYNOTE_PORT || 3487);
const APP_URL = `http://127.0.0.1:${PORT}`;

let mainWindow = null;
let quickWindow = null;
let tray = null;
let nextApp = null;
let httpServer = null;

function defaultConfig() {
  return {
    dataDir: path.join(os.homedir(), 'Documents', 'DailyNote'),
    openaiApiKey: '',
    httpsProxy: '',
    hasCompletedOnboarding: false,
    globalShortcut: 'Alt+Space',
  };
}

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return { ...defaultConfig(), ...parsed };
  } catch {
    return defaultConfig();
  }
}

function writeConfig(next) {
  const config = { ...defaultConfig(), ...next };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  return config;
}

function applyServerEnv() {
  const config = readConfig();
  process.env.PORT = String(PORT);
  process.env.DATA_DIR = config.dataDir;
  process.env.OPENAI_API_KEY = config.openaiApiKey || '';
  process.env.DAILYNOTE_DESKTOP = '1';
  process.env.DAILYNOTE_CONFIG_PATH = configPath();
  if (config.httpsProxy) process.env.HTTPS_PROXY = config.httpsProxy;
  else delete process.env.HTTPS_PROXY;
}

async function startNextServer() {
  if (httpServer) return;
  applyServerEnv();
  const next = require('next');
  const appDir = app.getAppPath();
  nextApp = next({ dev: isDev, dir: appDir, hostname: '127.0.0.1', port: PORT });
  const handler = nextApp.getRequestHandler();
  await nextApp.prepare();
  httpServer = http.createServer((req, res) => handler(req, res));
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(PORT, '127.0.0.1', resolve);
  });
}

async function waitForServer() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(APP_URL);
      if (res.status < 500) return;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('DailyNote local server did not start.');
}

async function restartServer() {
  applyServerEnv();
  if (httpServer) {
    const server = httpServer;
    httpServer = null;
    await new Promise((resolve) => server.close(resolve));
  }
  nextApp = null;
  await startNextServer();
  await waitForServer();
}

function createMainWindow() {
  if (mainWindow) return mainWindow;
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 860,
    minHeight: 640,
    title: 'DailyNote',
    backgroundColor: '#FEFDFA',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  return mainWindow;
}

function createQuickWindow() {
  if (quickWindow) {
    quickWindow.show();
    quickWindow.focus();
    return quickWindow;
  }
  quickWindow = new BrowserWindow({
    width: 720,
    height: 520,
    minWidth: 620,
    minHeight: 460,
    resizable: true,
    title: 'Quick Note',
    backgroundColor: '#FEFDFA',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  quickWindow.on('closed', () => {
    quickWindow = null;
  });
  quickWindow.loadURL(`${APP_URL}/quick-capture`);
  return quickWindow;
}

function showMainWindow(targetPath) {
  const win = createMainWindow();
  const config = readConfig();
  const nextPath = targetPath || (config.hasCompletedOnboarding ? '/' : '/onboarding');
  win.loadURL(`${APP_URL}${nextPath}`);
  win.show();
  win.focus();
}

function createTray() {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <rect x="3" y="2" width="12" height="14" rx="3" fill="black"/>
      <path d="M6 6h6M6 9h6M6 12h4" stroke="white" stroke-width="1.4" stroke-linecap="round"/>
    </svg>
  `);
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${svg}`);
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('DailyNote');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '快速记录', click: () => createQuickWindow() },
    { label: '打开 DailyNote', click: () => showMainWindow('/') },
    { label: 'AI 状态', click: () => showMainWindow('/settings') },
    { label: '打开数据文件夹', click: () => openDataDir() },
    { type: 'separator' },
    { label: '退出', click: () => quitApp() },
  ]));
}

function registerShortcut() {
  const config = readConfig();
  globalShortcut.unregisterAll();
  globalShortcut.register(config.globalShortcut || 'Alt+Space', () => createQuickWindow());
}

function openDataDir() {
  const config = readConfig();
  fs.mkdirSync(config.dataDir, { recursive: true });
  shell.openPath(config.dataDir);
}

function quitApp() {
  app.isQuitting = true;
  if (httpServer) httpServer.close();
  app.quit();
}

ipcMain.handle('config:get', () => {
  const config = readConfig();
  return {
    ...config,
    hasOpenAIKey: Boolean(config.openaiApiKey),
    openaiApiKey: config.openaiApiKey ? '********' : '',
  };
});

ipcMain.handle('config:save', async (_event, incoming) => {
  const current = readConfig();
  const openaiApiKey =
    incoming.openaiApiKey && incoming.openaiApiKey !== '********'
      ? incoming.openaiApiKey
      : current.openaiApiKey;
  const config = writeConfig({
    ...current,
    ...incoming,
    openaiApiKey,
    hasCompletedOnboarding: Boolean(incoming.hasCompletedOnboarding ?? current.hasCompletedOnboarding),
  });
  fs.mkdirSync(config.dataDir, { recursive: true });
  applyServerEnv();
  registerShortcut();
  return { ok: true, config: { ...config, openaiApiKey: config.openaiApiKey ? '********' : '' } };
});

ipcMain.handle('data-dir:choose', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: '选择 DailyNote 数据目录',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('data-dir:open', () => openDataDir());
ipcMain.handle('server:restart', () => restartServer().then(() => ({ ok: true })));
ipcMain.handle('window:show-main', () => showMainWindow('/'));
ipcMain.handle('window:close-quick-capture', () => {
  if (quickWindow) quickWindow.close();
});
ipcMain.handle('note:saved', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('note:saved');
    if (mainWindow.isVisible()) mainWindow.webContents.reload();
  }
});

app.whenReady().then(async () => {
  await startNextServer();
  await waitForServer();
  createTray();
  registerShortcut();
  showMainWindow();
});

app.on('activate', () => showMainWindow('/'));
app.on('before-quit', () => {
  app.isQuitting = true;
  if (httpServer) httpServer.close();
});
app.on('will-quit', () => globalShortcut.unregisterAll());
