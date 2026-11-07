const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.LUMACUT_PORT || 4320);
const URL = `http://127.0.0.1:${PORT}`;
const isDev = process.argv.includes('--dev');
let mainWindow = null;
let serverImported = false;

app.setName('LumaCut');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function resolveDataRoot() {
  try {
    return path.join(app.getPath('videos'), 'LumaCut');
  } catch {
    return path.join(app.getPath('userData'), 'LumaCut');
  }
}

function checkServer() {
  return new Promise((resolve) => {
    const request = http.get(`${URL}/api/health`, { timeout: 800 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('error', () => resolve(false));
    request.on('timeout', () => { request.destroy(); resolve(false); });
  });
}

async function waitForServer(timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await checkServer()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function startEmbeddedServer() {
  process.env.PORT = String(PORT);
  process.env.LUMACUT_PROD = '1';
  process.env.LUMACUT_DATA_DIR = process.env.LUMACUT_DATA_DIR || resolveDataRoot();
  const serverUrl = pathToFileURL(path.join(PROJECT_ROOT, 'server', 'index.mjs')).href;
  // The server is bundled with the app; importing it runs Express inside the
  // Electron main process, so users do not need Node installed separately.
  await import(serverUrl);
  serverImported = true;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#07090b',
    show: false,
    autoHideMenuBar: true,
    title: 'LumaCut',
    icon: path.join(PROJECT_ROOT, 'public', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(URL) && !url.startsWith('http://127.0.0.1:5173')) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  const target = isDev ? 'http://127.0.0.1:5173' : URL;
  try {
    await mainWindow.loadURL(target);
  } catch (error) {
    dialog.showErrorBox('LumaCut could not start', `Could not load ${target}.\n\n${String(error)}`);
  }
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  if (!isDev) {
    if (!(await checkServer())) {
      try {
        await startEmbeddedServer();
      } catch (error) {
        dialog.showErrorBox('LumaCut server did not start', String(error));
        app.quit();
        return;
      }
    }
    const ready = await waitForServer();
    if (!ready) {
      dialog.showErrorBox('LumaCut server did not start', 'The local media server could not be reached.');
      app.quit();
      return;
    }
  }
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  // The embedded Express server shares this process and shuts down with it.
  serverImported = false;
});
