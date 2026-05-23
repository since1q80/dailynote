const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, globalShortcut, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');

const isDev = process.env.DAILYNOTE_ELECTRON_DEV === '1' || !app.isPackaged;
const PORT = Number(process.env.DAILYNOTE_PORT || 3487);
const APP_URL = `http://127.0.0.1:${PORT}`;
const APP_ICON_PATH = path.join(__dirname, '..', 'dn.iconset', 'icon_512x512_2x.png');
const TRAY_ICON_PATH = path.join(__dirname, '..', 'dn.iconset', 'icon_32x32.png');

let mainWindow = null;
let quickWindow = null;
let tray = null;
let nextApp = null;
let httpServer = null;

function defaultConfig() {
  return {
    dataDir: path.join(os.homedir(), 'Documents', 'DailyNote'),
    openaiApiKey: '',            // legacy, kept for compat
    llmProvider: 'openai',       // 'openai' | 'anthropic' | 'openai_compatible'
    providerApiKey: '',           // provider-agnostic API key
    providerBaseUrl: '',          // for Ollama/vLLM
    modelFastOverride: '',
    modelSmartOverride: '',
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
  process.env.DAILYNOTE_DESKTOP = '1';
  process.env.DAILYNOTE_CONFIG_PATH = configPath();

  for (const key of [
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_BASE_URL',
    'PROVIDER_API_KEY',
    'PROVIDER_BASE_URL',
    'MODEL_FAST_OVERRIDE',
    'MODEL_SMART_OVERRIDE',
  ]) {
    delete process.env[key];
  }

  const hasLegacyKey = Boolean(config.openaiApiKey);

  if (config.llmProvider === 'anthropic') {
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = config.providerApiKey || config.openaiApiKey || '';
    process.env.ANTHROPIC_BASE_URL = config.providerBaseUrl || '';
  } else if (config.llmProvider === 'qwen' || config.llmProvider === 'zhipu' || config.llmProvider === 'minimax') {
    process.env.LLM_PROVIDER = config.llmProvider;
    process.env.PROVIDER_API_KEY = config.providerApiKey || '';
    process.env.PROVIDER_BASE_URL = config.providerBaseUrl || '';
  } else if (config.llmProvider === 'openai_compatible') {
    process.env.LLM_PROVIDER = 'openai_compatible';
    process.env.PROVIDER_API_KEY = config.providerApiKey || (hasLegacyKey ? 'NOT_NEEDED' : 'sk-');
    process.env.PROVIDER_BASE_URL = config.providerBaseUrl || '';
  } else {
    // Default: openai
    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = config.providerApiKey || config.openaiApiKey || '';
    if (config.providerBaseUrl) process.env.OPENAI_BASE_URL = config.providerBaseUrl;
  }

  if (config.modelFastOverride) process.env.MODEL_FAST_OVERRIDE = config.modelFastOverride;
  if (config.modelSmartOverride) process.env.MODEL_SMART_OVERRIDE = config.modelSmartOverride;
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
    icon: APP_ICON_PATH,
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
    icon: APP_ICON_PATH,
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
  const icon = nativeImage.createFromPath(TRAY_ICON_PATH).resize({ width: 18, height: 18 });
  icon.setTemplateImage(false);
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
    llmProvider: config.llmProvider || 'openai',
    hasOpenAIKey: Boolean(config.openaiApiKey),
    hasProviderKey: Boolean(config.providerApiKey),
    providerApiKey: config.providerApiKey ? '********' : '',
    providerBaseUrl: config.providerBaseUrl || '',
    modelFastOverride: config.modelFastOverride || '',
    modelSmartOverride: config.modelSmartOverride || '',
    openaiApiKey: config.openaiApiKey ? '********' : '',
    openaiApiKeyDisplay: config.openaiApiKey ? '********' : '',
  };
});

ipcMain.handle('config:save', async (_event, incoming) => {
  const current = readConfig();
  const openaiApiKey =
    incoming.openaiApiKey && incoming.openaiApiKey !== '********'
      ? incoming.openaiApiKey
      : current.openaiApiKey;
  const llmProvider = incoming.llmProvider || current.llmProvider || 'openai';
  const providerApiKey =
    incoming.providerApiKey && incoming.providerApiKey !== '********'
      ? incoming.providerApiKey
      : current.providerApiKey;
  const providerBaseUrl = incoming.providerBaseUrl !== undefined
    ? incoming.providerBaseUrl
    : current.providerBaseUrl;
  const modelFastOverride = incoming.modelFastOverride !== undefined
    ? incoming.modelFastOverride
    : current.modelFastOverride;
  const modelSmartOverride = incoming.modelSmartOverride !== undefined
    ? incoming.modelSmartOverride
    : current.modelSmartOverride;
  const config = writeConfig({
    ...current,
    ...incoming,
    openaiApiKey,
    llmProvider,
    providerApiKey,
    providerBaseUrl,
    modelFastOverride,
    modelSmartOverride,
    hasCompletedOnboarding: Boolean(incoming.hasCompletedOnboarding ?? current.hasCompletedOnboarding),
  });
  fs.mkdirSync(config.dataDir, { recursive: true });
  applyServerEnv();
  registerShortcut();
  return {
    ok: true,
    config: {
      ...config,
      openaiApiKey: config.openaiApiKey ? '********' : '',
      providerApiKey: config.providerApiKey ? '********' : '',
    },
  };
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
  }
});

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(APP_ICON_PATH);
  }
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
