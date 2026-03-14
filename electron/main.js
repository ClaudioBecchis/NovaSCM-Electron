// ============================================================================
// NovaSCM - Electron Main Process
// GPU workarounds MUST come before anything else (AMD compatibility)
// ============================================================================

const { app } = require('electron');

// --- GPU workarounds (AMD RX 7900 XTX compatibility) ---
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

// --- Now load the rest ---
const {
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  clipboard,
  Notification,
  globalShortcut,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const net = require('net');

// ============================================================================
// Single instance lock
// ============================================================================
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ============================================================================
// Constants
// ============================================================================
const isDev = !app.isPackaged;
const WINDOW_STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
const ICON_PATH = path.join(__dirname, '..', 'assets', 'icon.ico');

// ============================================================================
// Window state persistence
// ============================================================================
function loadWindowState() {
  try {
    if (fs.existsSync(WINDOW_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(WINDOW_STATE_FILE, 'utf-8'));
    }
  } catch {
    // Ignore corrupt state file
  }
  return null;
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const state = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: win.isMaximized(),
  };
  try {
    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Silently fail
  }
}

// ============================================================================
// Create main window
// ============================================================================
let mainWindow = null;

function createWindow() {
  const savedState = loadWindowState();

  const windowOptions = {
    width: savedState?.width || 1440,
    height: savedState?.height || 900,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    backgroundColor: '#0a0f1a',
    show: false,
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };

  if (savedState?.x !== undefined && savedState?.y !== undefined) {
    windowOptions.x = savedState.x;
    windowOptions.y = savedState.y;
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Restore maximized state
  if (savedState?.isMaximized) {
    mainWindow.maximize();
  }

  // Show when ready to prevent white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Save state on move/resize
  mainWindow.on('resize', () => saveWindowState(mainWindow));
  mainWindow.on('move', () => saveWindowState(mainWindow));
  mainWindow.on('close', () => saveWindowState(mainWindow));

  // Load content
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================================================
// App lifecycle
// ============================================================================
app.whenReady().then(() => {
  createWindow();

  // Global keyboard shortcuts
  globalShortcut.register('F5', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload();
    }
  });
  globalShortcut.register('F12', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  app.quit();
});

// ============================================================================
// IPC Handlers — Window Controls
// ============================================================================
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

// ============================================================================
// IPC Handlers — Dialogs
// ============================================================================
ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_event, options = {}) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: options.title || 'Save File',
    defaultPath: options.defaultPath || '',
    filters: options.filters || [{ name: 'All Files', extensions: ['*'] }],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('dialog:openFile', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || 'Open File',
    filters: options.filters || [{ name: 'All Files', extensions: ['*'] }],
    properties: ['openFile'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// ============================================================================
// IPC Handlers — Shell
// ============================================================================
ipcMain.handle('shell:openExternal', async (_event, url) => {
  await shell.openExternal(url);
});

// ============================================================================
// IPC Handlers — File System
// ============================================================================
ipcMain.handle('fs:readFile', async (_event, filePath, encoding = 'utf-8') => {
  try {
    const data = fs.readFileSync(filePath, encoding);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('fs:writeFile', async (_event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('fs:exists', async (_event, filePath) => {
  return fs.existsSync(filePath);
});

ipcMain.handle('fs:mkdir', async (_event, dirPath) => {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ============================================================================
// IPC Handlers — Network
// ============================================================================
ipcMain.handle('net:ping', (_event, host, timeout = 3000) => {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32'
      ? `ping -n 1 -w ${timeout} ${host}`
      : `ping -c 1 -W ${Math.ceil(timeout / 1000)} ${host}`;

    exec(cmd, { timeout: timeout + 2000 }, (error, stdout) => {
      if (error) {
        resolve({ alive: false, output: error.message });
      } else {
        const timeMatch = stdout.match(/time[=<](\d+\.?\d*)\s*ms/i);
        resolve({
          alive: true,
          time: timeMatch ? parseFloat(timeMatch[1]) : null,
          output: stdout.trim(),
        });
      }
    });
  });
});

ipcMain.handle('net:portScan', (_event, host, port, timeout = 2000) => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const finish = (open) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve({ host, port, open });
    };

    socket.setTimeout(timeout);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
    socket.connect(port, host);
  });
});

ipcMain.handle('net:arpTable', () => {
  return new Promise((resolve) => {
    exec('arp -a', { timeout: 10000 }, (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message, entries: [] });
        return;
      }
      const entries = [];
      const lines = stdout.split('\n');
      for (const line of lines) {
        const match = line.match(
          /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+([\da-fA-F]{2}[:-][\da-fA-F]{2}[:-][\da-fA-F]{2}[:-][\da-fA-F]{2}[:-][\da-fA-F]{2}[:-][\da-fA-F]{2})\s+(\w+)/
        );
        if (match) {
          entries.push({
            ip: match[1],
            mac: match[2].replace(/-/g, ':').toUpperCase(),
            type: match[3],
          });
        }
      }
      resolve({ success: true, entries });
    });
  });
});

// ============================================================================
// IPC Handlers — Network: Wake-on-LAN
// ============================================================================
ipcMain.handle('net:wol', (_event, macAddress) => {
  return new Promise((resolve, reject) => {
    const dgram = require('dgram');

    // Normalize MAC: remove separators
    const mac = macAddress.replace(/[:\-]/g, '');
    if (mac.length !== 12 || !/^[0-9a-fA-F]{12}$/.test(mac)) {
      return reject(new Error(`MAC address non valido: ${macAddress}`));
    }

    // Build magic packet: 6x 0xFF + 16x MAC bytes
    const macBytes = Buffer.from(mac, 'hex');
    const magicPacket = Buffer.alloc(6 + 16 * 6);
    // Fill first 6 bytes with 0xFF
    for (let i = 0; i < 6; i++) magicPacket[i] = 0xff;
    // Repeat MAC 16 times
    for (let i = 0; i < 16; i++) {
      macBytes.copy(magicPacket, 6 + i * 6);
    }

    const client = dgram.createSocket('udp4');
    client.bind(() => {
      client.setBroadcast(true);
      client.send(magicPacket, 0, magicPacket.length, 9, '255.255.255.255', (err) => {
        client.close();
        if (err) {
          reject(err);
        } else {
          resolve({ success: true, mac: macAddress });
        }
      });
    });
  });
});

// ============================================================================
// IPC Handlers — Network: Traceroute
// ============================================================================
ipcMain.handle('net:traceroute', (_event, host) => {
  return new Promise((resolve) => {
    // Validate host (basic IP/hostname check)
    if (!/^[\w.\-:]+$/.test(host)) {
      resolve({ success: false, error: 'Host non valido', hops: [] });
      return;
    }

    const cmd = process.platform === 'win32'
      ? `tracert -d -w 1000 -h 30 ${host}`
      : `traceroute -n -w 1 -m 30 ${host}`;

    exec(cmd, { timeout: 60000 }, (error, stdout, stderr) => {
      const hops = [];
      const lines = stdout ? stdout.split('\n') : [];

      for (const line of lines) {
        // Windows tracert format: "  1    <1 ms    <1 ms    <1 ms  192.168.10.1"
        // or "  1     2 ms     1 ms     1 ms  192.168.10.1"
        // or "  2     *        *        *     Request timed out."
        const hopMatch = line.match(
          /^\s*(\d+)\s+([\d<*]+\s*ms|[*])\s+([\d<*]+\s*ms|[*])\s+([\d<*]+\s*ms|[*])\s+([\d.]+|Request timed out\.?|\*)/
        );
        if (hopMatch) {
          const parseMs = (s) => {
            if (!s || s === '*') return null;
            const num = s.replace(/[<\s]|ms/g, '');
            const val = parseInt(num, 10);
            return isNaN(val) ? null : val;
          };
          hops.push({
            hop: parseInt(hopMatch[1], 10),
            ip: hopMatch[5].startsWith('Request') ? '*' : hopMatch[5],
            rtt1: parseMs(hopMatch[2]),
            rtt2: parseMs(hopMatch[3]),
            rtt3: parseMs(hopMatch[4]),
          });
        }
      }

      resolve({ success: true, hops, raw: stdout || '' });
    });
  });
});

// ============================================================================
// IPC Handlers — Clipboard
// ============================================================================
ipcMain.handle('clipboard:copy', (_event, text) => {
  clipboard.writeText(text);
});

// ============================================================================
// IPC Handlers — App Info
// ============================================================================
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getPlatform', () => process.platform);
ipcMain.handle('app:getArch', () => process.arch);
ipcMain.handle('app:getUserDataPath', () => app.getPath('userData'));
ipcMain.handle('app:getInfo', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
}));

// ============================================================================
// IPC Handlers — Notifications
// ============================================================================
ipcMain.handle('notification:show', (_event, title, body) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
      icon: ICON_PATH,
    });
    notification.show();
    return true;
  }
  return false;
});
