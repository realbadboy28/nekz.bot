const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { loadEnv } = require('../src/env');

const envFile = path.join(app.getPath('userData'), '.env');
const dataDir = path.join(app.getPath('userData'), 'data');
const authDir = path.join(app.getPath('userData'), 'auth_info');
let dashboardWindow;
let setupWindow;
let localServer;

app.setName('Nekz WhatsApp AI');
app.setAppUserModelId('com.nekz.whatsapp-ai');
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else app.on('second-instance', () => dashboardWindow?.show());

function readEnv() {
  const values = {};
  try {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
      if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {}
  return values;
}

function openSetup() {
  if (setupWindow && !setupWindow.isDestroyed()) { setupWindow.focus(); return; }
  setupWindow = new BrowserWindow({ width: 560, height: 700, minWidth: 460, minHeight: 600, title: 'Nekz setup', backgroundColor: '#09110d', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  setupWindow.loadFile(path.join(__dirname, 'setup.html'));
  setupWindow.on('closed', () => { setupWindow = null; });
}

function openDashboard() {
  dashboardWindow = new BrowserWindow({ width: 1120, height: 820, minWidth: 720, minHeight: 600, title: 'Nekz WhatsApp AI', backgroundColor: '#09110d', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  dashboardWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  dashboardWindow.loadURL(`http://127.0.0.1:${process.env.PORT || '3000'}/`);
  dashboardWindow.on('closed', () => { dashboardWindow = null; });
}

ipcMain.handle('get-setup', () => {
  const env = readEnv();
  return { provider: env.AI_PROVIDER || 'gemini', ownerName: env.OWNER_NAME || 'Nekz', model: env.AI_PROVIDER === 'openai' ? env.OPENAI_MODEL || 'gpt-4o-mini' : env.GEMINI_MODEL || 'gemini-3.5-flash-lite', hasKey: Boolean(env.AI_PROVIDER === 'openai' ? env.OPENAI_API_KEY : env.GEMINI_API_KEY) };
});
ipcMain.handle('get-admin-token', () => process.env.ADMIN_TOKEN || readEnv().ADMIN_TOKEN || '');
ipcMain.handle('save-setup', (_event, input) => {
  const current = readEnv();
  const provider = input?.provider === 'openai' ? 'openai' : 'gemini';
  const key = String(input?.apiKey || '').trim() || (provider === 'openai' ? current.OPENAI_API_KEY : current.GEMINI_API_KEY) || '';
  if (!key) throw new Error(`Enter an ${provider === 'openai' ? 'OpenAI' : 'Gemini'} API key to continue.`);
  const adminToken = current.ADMIN_TOKEN && !/^(replace-with|change-me|your[-_])/i.test(current.ADMIN_TOKEN) ? current.ADMIN_TOKEN : crypto.randomBytes(32).toString('hex');
  const values = {
    PORT: current.PORT || '3000', HOST: '127.0.0.1', ADMIN_TOKEN: adminToken,
    AI_PROVIDER: provider, GEMINI_API_KEY: provider === 'gemini' ? key : current.GEMINI_API_KEY || '',
    GEMINI_MODEL: provider === 'gemini' ? String(input.model || 'gemini-3.5-flash-lite').trim() : current.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    OPENAI_API_KEY: provider === 'openai' ? key : current.OPENAI_API_KEY || '',
    OPENAI_MODEL: provider === 'openai' ? String(input.model || 'gpt-4o-mini').trim() : current.OPENAI_MODEL || 'gpt-4o-mini',
    OPENAI_BASE_URL: current.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    OWNER_NAME: String(input.ownerName || 'Nekz').trim().slice(0, 80) || 'Nekz',
    DEBOUNCE_DELAY_MS: current.DEBOUNCE_DELAY_MS || '2500', ENABLE_TYPING_INDICATOR: current.ENABLE_TYPING_INDICATOR || 'true',
    AUTO_REPLY_GROUPS: current.AUTO_REPLY_GROUPS || 'false', ALLOWED_NUMBERS: current.ALLOWED_NUMBERS || '',
    BLOCKED_NUMBERS: current.BLOCKED_NUMBERS || '', CONTROL_NUMBERS: current.CONTROL_NUMBERS || ''
  };
  fs.mkdirSync(path.dirname(envFile), { recursive: true });
  fs.writeFileSync(envFile, `${Object.entries(values).map(([name, value]) => `${name}=${String(value).replace(/[\r\n]/g, '')}`).join('\n')}\n`, { mode: 0o600 });
  app.relaunch();
  app.exit(0);
  return { ok: true };
});
ipcMain.on('open-setup', openSetup);

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  process.env.NEKZ_ENV_FILE = envFile;
  process.env.NEKZ_DATA_DIR = dataDir;
  process.env.NEKZ_AUTH_DIR = authDir;
  process.env.HOST = '127.0.0.1';
  Object.assign(process.env, readEnv());
  process.env.HOST = '127.0.0.1';
  loadEnv(envFile);
  const env = readEnv();
  const provider = env.AI_PROVIDER || 'gemini';
  const configured = env.ADMIN_TOKEN && (provider === 'openai' ? env.OPENAI_API_KEY : env.GEMINI_API_KEY);
  if (!configured) { openSetup(); return; }
  try {
    localServer = require('../src/server').start();
    localServer.once('listening', openDashboard);
    localServer.on('error', error => dialog.showErrorBox('Nekz could not start', error.message));
  } catch (error) {
    dialog.showErrorBox('Nekz could not start', error.message);
    openSetup();
  }
});

app.on('before-quit', () => { if (localServer) localServer.close(); });
