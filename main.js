const { app, BrowserWindow, Menu, Tray, shell, nativeImage, session, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Windows notification identity ──────────────────────────
app.setAppUserModelId('com.recoilapp.desktop');

// ── Configuration ──────────────────────────────────────────
const APP_URL = 'https://chat.recoilapp.com';
const APP_DOMAIN = 'recoilapp.com';
const APP_NAME = 'RecoilApp';
const IS_DEV = process.argv.includes('--dev');
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000;
const WINDOW_SHOW_TIMEOUT = 15000;

// ── Lazy-load auto-updater ─────────────────────────────────
let updater = null;
try {
  updater = require('./updater');
} catch (err) {
  console.error('Failed to load updater module:', err.message);
}

let mainWindow = null;
let tray = null;

// ── Game Detection ─────────────────────────────────────────
let gameDetector = null;
try {
  const { GameDetector } = require('./game-detector');
  gameDetector = new GameDetector();
} catch (err) {
  console.error('Failed to load game-detector module:', err.message);
}

// ── Settings Persistence ───────────────────────────────────
const SETTINGS_FILE = path.join(app.getPath('userData'), 'desktop-settings.json');
const DEFAULT_KEYBINDS = {
  lockApp: 'CmdOrCtrl+L',
  toggleMute: 'CmdOrCtrl+Shift+M',
  toggleDeafen: 'CmdOrCtrl+Shift+D',
};

const KEYBIND_DEFINITIONS = {
  lockApp: { label: 'Lock App', description: 'Lock the app and require PIN/password to unlock' },
  toggleMute: { label: 'Toggle Mute', description: 'Mute or unmute your microphone' },
  toggleDeafen: { label: 'Toggle Deafen', description: 'Deafen or undeafen your audio' },
};

const RESERVED_ACCELERATORS = [
  'CmdOrCtrl+R', 'CmdOrCtrl+Shift+I', 'CmdOrCtrl+Q',
  'CmdOrCtrl+X', 'CmdOrCtrl+C', 'CmdOrCtrl+V', 'CmdOrCtrl+A',
  'CmdOrCtrl+Z', 'CmdOrCtrl+Shift+Z', 'CmdOrCtrl+Y',
  'CmdOrCtrl+=', 'CmdOrCtrl+-', 'CmdOrCtrl+0',
  'F11', 'Alt+F4',
];

const DEFAULT_SETTINGS = {
  runOnStartup: false,
  minimizeToTray: true,
  closeToTray: true,
  hardwareAcceleration: true,
  autoCheckUpdates: true,
  openLinksExternal: true,
  startMinimized: false,
  keybinds: { ...DEFAULT_KEYBINDS },
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const saved = JSON.parse(raw);
      return {
        ...DEFAULT_SETTINGS,
        ...saved,
        keybinds: { ...DEFAULT_KEYBINDS, ...(saved.keybinds || {}) },
      };
    }
  } catch (err) {
    console.error('Failed to load settings:', err.message);
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save settings:', err.message);
  }
}

let desktopSettings = loadSettings();

// ── App Lock Persistence ───────────────────────────────────
const crypto = require('crypto');
const LOCK_FILE = path.join(app.getPath('userData'), 'app-lock.json');

function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function loadLockConfig() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const raw = fs.readFileSync(LOCK_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to load lock config:', err.message);
  }
  return null;
}

function saveLockConfig(config) {
  try {
    fs.writeFileSync(LOCK_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save lock config:', err.message);
  }
}

function removeLockConfig() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (err) {
    console.error('Failed to remove lock config:', err.message);
  }
}

// Apply hardware acceleration setting (must be before app.ready)
if (!desktopSettings.hardwareAcceleration) {
  app.disableHardwareAcceleration();
}

// ── Auto-Launch Helper ─────────────────────────────────────
function setAutoLaunch(enabled) {
  if (IS_DEV) return;
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: desktopSettings.startMinimized ? ['--start-minimized'] : [],
    });
  } catch (err) {
    console.error('Failed to set auto-launch:', err.message);
  }
}

// ── Global Error Handlers ──────────────────────────────────
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  try {
    dialog.showErrorBox('RecoilApp Error', `An unexpected error occurred:\n\n${error.message}\n\nThe app will continue running.`);
  } catch {}
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

// ── Single Instance Lock ───────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── IPC Handlers ───────────────────────────────────────────
function registerIPC() {
  ipcMain.handle('get-version', () => app.getVersion());

  ipcMain.handle('get-app-info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    appPath: app.getPath('userData'),
  }));

  ipcMain.handle('get-changelog', () => {
    try {
      const changelogPath = path.join(__dirname, 'changelog.json');
      if (fs.existsSync(changelogPath)) {
        return JSON.parse(fs.readFileSync(changelogPath, 'utf-8'));
      }
    } catch (err) {
      console.error('Failed to read changelog:', err.message);
    }
    return {};
  });

  ipcMain.handle('get-desktop-settings', () => desktopSettings);

  ipcMain.handle('set-desktop-setting', (event, key, value) => {
    if (!(key in DEFAULT_SETTINGS)) return { success: false, error: 'Unknown setting' };

    desktopSettings[key] = value;
    saveSettings(desktopSettings);

    // Apply side-effects immediately
    switch (key) {
      case 'runOnStartup':
        setAutoLaunch(value);
        break;
      case 'startMinimized':
        // Update the login item args if auto-launch is on
        if (desktopSettings.runOnStartup) {
          setAutoLaunch(true);
        }
        break;
      case 'hardwareAcceleration':
        // Requires restart to take effect
        break;
    }

    return { success: true, settings: desktopSettings };
  });

  ipcMain.handle('check-for-updates', () => {
    if (updater) {
      updater.checkForUpdatesManual();
      return { success: true };
    }
    return { success: false, error: 'Updater not available' };
  });

  // Window controls
  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('window-close', () => mainWindow?.close());

  // ── App Lock IPC ───────────────────────────────────────
  ipcMain.handle('get-lock-status', () => {
    const config = loadLockConfig();
    return config
      ? { enabled: true, type: config.type }
      : { enabled: false };
  });

  ipcMain.handle('set-app-lock', (event, type, secret) => {
    try {
      const config = {
        type, // 'pin' or 'password'
        hash: hashSecret(secret),
        createdAt: new Date().toISOString(),
      };
      saveLockConfig(config);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('remove-app-lock', (event, secret) => {
    const config = loadLockConfig();
    if (!config) return { success: false, error: 'No lock configured' };
    if (hashSecret(secret) !== config.hash) {
      return { success: false, error: 'Incorrect PIN/Password' };
    }
    removeLockConfig();
    return { success: true };
  });

  ipcMain.handle('verify-app-lock', (event, secret) => {
    const config = loadLockConfig();
    if (!config) return { success: true }; // No lock set
    if (hashSecret(secret) !== config.hash) {
      return { success: false, error: 'Incorrect PIN/Password' };
    }
    return { success: true };
  });

  // ── Keybinds IPC ─────────────────────────────────────
  ipcMain.handle('get-keybinds', () => ({
    current: desktopSettings.keybinds || { ...DEFAULT_KEYBINDS },
    defaults: { ...DEFAULT_KEYBINDS },
    definitions: KEYBIND_DEFINITIONS,
  }));

  ipcMain.handle('set-keybind', (event, action, accelerator) => {
    if (!KEYBIND_DEFINITIONS.hasOwnProperty(action)) {
      return { success: false, error: 'Unknown keybind action' };
    }

    // Allow clearing (null or empty string)
    if (!accelerator) {
      if (!desktopSettings.keybinds) desktopSettings.keybinds = { ...DEFAULT_KEYBINDS };
      desktopSettings.keybinds[action] = null;
      saveSettings(desktopSettings);
      Menu.setApplicationMenu(buildAppMenu());
      return { success: true, keybinds: desktopSettings.keybinds };
    }

    // Check for reserved accelerators
    if (RESERVED_ACCELERATORS.some(r => r.toLowerCase() === accelerator.toLowerCase())) {
      return { success: false, error: 'This shortcut is reserved by the system' };
    }

    // Check for conflicts with other keybinds
    const currentBinds = desktopSettings.keybinds || { ...DEFAULT_KEYBINDS };
    for (const [otherAction, otherAccel] of Object.entries(currentBinds)) {
      if (otherAction !== action && otherAccel && otherAccel.toLowerCase() === accelerator.toLowerCase()) {
        const otherLabel = KEYBIND_DEFINITIONS[otherAction]?.label || otherAction;
        return { success: false, error: `Already assigned to "${otherLabel}"` };
      }
    }

    if (!desktopSettings.keybinds) desktopSettings.keybinds = { ...DEFAULT_KEYBINDS };
    desktopSettings.keybinds[action] = accelerator;
    saveSettings(desktopSettings);
    Menu.setApplicationMenu(buildAppMenu());
    return { success: true, keybinds: desktopSettings.keybinds };
  });

  ipcMain.handle('reset-keybinds', () => {
    desktopSettings.keybinds = { ...DEFAULT_KEYBINDS };
    saveSettings(desktopSettings);
    Menu.setApplicationMenu(buildAppMenu());
    return { success: true, keybinds: desktopSettings.keybinds };
  });

  // ── Game Detection IPC ─────────────────────────────────
  ipcMain.handle('get-game-list', () => gameDetector ? gameDetector.getGameList() : []);

  ipcMain.handle('get-detected-game', () => gameDetector ? gameDetector.getCurrentGame() : null);

  ipcMain.handle('start-game-detection', () => {
    if (!gameDetector) return { success: false, error: 'Game detection unavailable' };
    gameDetector.start(
      (game) => {
        // Send game detected event to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('game-detected', game);
        }
      },
      () => {
        // Send game exited event to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('game-exited');
        }
      }
    );
    return { success: true };
  });

  ipcMain.handle('stop-game-detection', () => {
    if (gameDetector) gameDetector.stop();
    return { success: true };
  });

  ipcMain.handle('set-game-detection-enabled', (event, enabled) => {
    if (gameDetector) gameDetector.setEnabled(enabled);
    return { success: true };
  });
}

// ── Create Main Window ─────────────────────────────────────
function createWindow() {
  const iconPath = getIconPath();
  const startMinimized = process.argv.includes('--start-minimized') || desktopSettings.startMinimized && process.argv.includes('--autostart');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: APP_NAME,
    icon: iconPath,
    frame: true,
    autoHideMenuBar: false,
    backgroundColor: '#090C10',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  // Hide the menu bar entirely — no ALT toggle, no visible gray bar
  // Keep the menu registered at the application level for keyboard shortcuts
  mainWindow.setMenuBarVisibility(false);

  // Intercept Alt key presses to prevent the menu bar from appearing
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Alt' && !input.control && !input.meta && !input.shift) {
      // Prevent Alt from toggling the menu bar visibility
      mainWindow.setMenuBarVisibility(false);
    }
  });
  Menu.setApplicationMenu(buildAppMenu());
  mainWindow.loadURL(APP_URL);

  let windowShown = false;
  const showWindow = () => {
    if (!windowShown && mainWindow) {
      windowShown = true;
      if (startMinimized) {
        // Don't show the window, just mark it as ready
        return;
      }
      mainWindow.show();
      if (IS_DEV) {
        mainWindow.webContents.openDevTools();
      }
    }
  };

  mainWindow.once('ready-to-show', showWindow);
  setTimeout(showWindow, WINDOW_SHOW_TIMEOUT);

  // Handle page load failures
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load: ' + validatedURL + ' (' + errorCode + ': ' + errorDescription + ')');
    showWindow();
    mainWindow.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
      '<html>' +
        '<head><title>RecoilApp</title></head>' +
        '<body style="background:#090C10;color:#E2E8F0;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;">' +
          '<div style="text-align:center;max-width:400px;">' +
            '<h1 style="color:#00bfbf;font-size:24px;margin-bottom:8px;">Connection Error</h1>' +
            '<p style="color:#94A3B8;line-height:1.6;">Could not connect to RecoilApp servers.</p>' +
            '<p style="color:#64748B;font-size:14px;margin-top:8px;">' + (errorDescription || 'Network error') + '</p>' +
            '<button onclick="window.location.href=\'' + APP_URL + '\'"' +
              ' style="margin-top:24px;padding:10px 24px;background:#00bfbf;color:#090C10;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">' +
              'Retry' +
            '</button>' +
          '</div>' +
        '</body>' +
      '</html>'
    ));
  });

  // External links & popup windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);

      // Block all new-window popups for same-domain URLs (images, etc.)
      // The web app now uses in-app lightbox instead of window.open for images
      if (parsed.hostname.endsWith(APP_DOMAIN)) {
        return { action: 'deny' };
      }

      // External links → open in default browser
      if (desktopSettings.openLinksExternal) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    } catch {}
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsed = new URL(url);
      // Allow downloads and same-domain navigation
      if (parsed.pathname.startsWith('/downloads/') || parsed.pathname.startsWith('/uploads/')) {
        return; // Let these through for proper download handling
      }
      if (!parsed.hostname.endsWith(APP_DOMAIN) && !url.startsWith('about:') && !url.startsWith('data:')) {
        if (desktopSettings.openLinksExternal) {
          event.preventDefault();
          shell.openExternal(url);
        }
      }
    } catch {}
  });

  // Close/minimize to tray
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      if (desktopSettings.closeToTray) {
        event.preventDefault();
        mainWindow.hide();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('page-title-updated', (event, title) => {
    // Let the web app control the title
  });
}

// ── System Tray ────────────────────────────────────────────
function createTray() {
  try {
    const iconPath = getIconPath();
    const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 24, height: 24 });

    if (trayIcon.isEmpty()) {
      console.error('Tray icon is empty, skipping tray creation');
      return;
    }

    tray = new Tray(trayIcon);
    tray.setToolTip(APP_NAME);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open RecoilApp',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Check for Updates',
        click: () => {
          if (updater) updater.checkForUpdatesManual();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
        }
      }
    });
  } catch (err) {
    console.error('Failed to create tray:', err.message);
  }
}

// ── App Menu ───────────────────────────────────────────────
function buildAppMenu() {
  const keybinds = desktopSettings.keybinds || { ...DEFAULT_KEYBINDS };

  // Build hidden keybind menu items (accelerators work even when invisible)
  const keybindItems = [];
  if (keybinds.lockApp) {
    keybindItems.push({
      label: 'Lock App',
      accelerator: keybinds.lockApp,
      visible: false,
      click: () => {
        const config = loadLockConfig();
        if (config) {
          mainWindow?.webContents.send('keybind', 'lockApp');
        }
      },
    });
  }
  if (keybinds.toggleMute) {
    keybindItems.push({
      label: 'Toggle Mute',
      accelerator: keybinds.toggleMute,
      visible: false,
      click: () => mainWindow?.webContents.send('keybind', 'toggleMute'),
    });
  }
  if (keybinds.toggleDeafen) {
    keybindItems.push({
      label: 'Toggle Deafen',
      accelerator: keybinds.toggleDeafen,
      visible: false,
      click: () => mainWindow?.webContents.send('keybind', 'toggleDeafen'),
    });
  }

  const template = [
    {
      label: APP_NAME,
      submenu: [
        {
          label: 'About RecoilApp',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About RecoilApp',
              message: 'RecoilApp',
              detail: `Version ${app.getVersion()}\nElectron ${process.versions.electron}\nChromium ${process.versions.chrome}\nNode.js ${process.versions.node}\nPlatform: ${process.platform} ${process.arch}\n\nA real-time messaging platform for communities and teams.\n\n© 2025-2026 RecoilApp. All rights reserved.`,
              buttons: ['OK'],
              icon: nativeImage.createFromPath(getIconPath()),
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Check for Updates\u2026',
          click: () => {
            if (updater) {
              updater.checkForUpdatesManual();
            } else {
              dialog.showMessageBox({ type: 'error', title: 'Update Error', message: 'Auto-updater is not available.', buttons: ['OK'] });
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.webContents.reload(),
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => mainWindow && mainWindow.webContents.toggleDevTools(),
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => { app.isQuitting = true; app.quit(); },
        },
        // Registered keybind accelerators (hidden from menu)
        ...keybindItems,
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'close' },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

// ── Icon Helper ────────────────────────────────────────────
function getIconPath() {
  if (process.platform === 'win32') {
    return path.join(__dirname, 'assets', 'icons', 'icon.ico');
  }
  return path.join(__dirname, 'assets', 'icons', '256x256.png');
}

// ── App Lifecycle ──────────────────────────────────────────
app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: details.responseHeaders });
  });

  // ── File Download Handling ────────────────────────────────
  session.defaultSession.on('will-download', (event, item, webContents) => {
    const fileName = item.getFilename() || 'download';
    const defaultPath = path.join(app.getPath('downloads'), fileName);

    // Show native "Save As" dialog so the user can pick where to save
    const savePath = dialog.showSaveDialogSync(mainWindow, {
      defaultPath,
      title: 'Save File',
    });

    if (savePath) {
      item.setSavePath(savePath);

      item.on('done', (event, state) => {
        if (state === 'completed') {
          // Show the file in the downloads folder or notify success
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-complete', {
              filename: fileName,
              path: savePath,
            });
          }
          // Flash the taskbar to indicate download finished
          if (mainWindow && !mainWindow.isFocused()) {
            mainWindow.flashFrame(true);
          }
        } else if (state === 'cancelled') {
          console.log('Download cancelled:', fileName);
        } else {
          console.error('Download failed:', fileName, state);
        }
      });
    } else {
      // User cancelled the save dialog
      item.cancel();
    }
  });

  registerIPC();
  createWindow();
  createTray();

  // Apply saved auto-launch state
  setAutoLaunch(desktopSettings.runOnStartup);

  // Auto-Update
  if (!IS_DEV && updater && desktopSettings.autoCheckUpdates) {
    try {
      updater.initAutoUpdater();
      setTimeout(() => updater.checkForUpdates(), 10 * 1000);
      setInterval(() => {
        if (desktopSettings.autoCheckUpdates) updater.checkForUpdates();
      }, UPDATE_CHECK_INTERVAL);
    } catch (err) {
      console.error('Failed to initialize auto-updater:', err.message);
    }
  } else if (!IS_DEV && updater) {
    // Init updater even if auto-check is off, for manual checks
    try {
      updater.initAutoUpdater();
    } catch (err) {
      console.error('Failed to initialize auto-updater:', err.message);
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'linux') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
