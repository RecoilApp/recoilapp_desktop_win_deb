const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, safe API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isDesktop: true,

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // App info
  getVersion: () => ipcRenderer.invoke('get-version'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getChangelog: () => ipcRenderer.invoke('get-changelog'),

  // Desktop Settings
  getDesktopSettings: () => ipcRenderer.invoke('get-desktop-settings'),
  setDesktopSetting: (key, value) => ipcRenderer.invoke('set-desktop-setting', key, value),

  // App Lock
  getLockStatus: () => ipcRenderer.invoke('get-lock-status'),
  setAppLock: (type, secret) => ipcRenderer.invoke('set-app-lock', type, secret),
  removeAppLock: (secret) => ipcRenderer.invoke('remove-app-lock', secret),
  verifyAppLock: (secret) => ipcRenderer.invoke('verify-app-lock', secret),

  // Keybinds
  getKeybinds: () => ipcRenderer.invoke('get-keybinds'),
  setKeybind: (action, accelerator) => ipcRenderer.invoke('set-keybind', action, accelerator),
  resetKeybinds: () => ipcRenderer.invoke('reset-keybinds'),
  onKeybind: (callback) => {
    ipcRenderer.on('keybind', (event, action) => callback(action));
    return () => ipcRenderer.removeAllListeners('keybind');
  },

  // Update
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  // Notifications
  onNotification: (callback) => {
    ipcRenderer.on('notification', (event, data) => callback(data));
  },

  // Update progress events
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('update-status');
  },

  // Game Detection
  getGameList: () => ipcRenderer.invoke('get-game-list'),
  getDetectedGame: () => ipcRenderer.invoke('get-detected-game'),
  startGameDetection: () => ipcRenderer.invoke('start-game-detection'),
  stopGameDetection: () => ipcRenderer.invoke('stop-game-detection'),
  setGameDetectionEnabled: (enabled) => ipcRenderer.invoke('set-game-detection-enabled', enabled),
  onGameDetected: (callback) => {
    ipcRenderer.on('game-detected', (event, game) => callback(game));
    return () => ipcRenderer.removeAllListeners('game-detected');
  },
  onGameExited: (callback) => {
    ipcRenderer.on('game-exited', () => callback());
    return () => ipcRenderer.removeAllListeners('game-exited');
  },

  // Spellcheck
  onContextMenuParams: (callback) => {
    ipcRenderer.on('context-menu-params', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('context-menu-params');
  },
  replaceMisspelling: (word) => ipcRenderer.invoke('replace-misspelling', word),
  addToDictionary: (word) => ipcRenderer.invoke('add-to-dictionary', word),

  // Clipboard
  copyImageToClipboard: (imageUrl) => ipcRenderer.invoke('copy-image-to-clipboard', imageUrl),

  // Resource Monitor
  getResourceSnapshot: () => ipcRenderer.invoke('get-resource-snapshot'),
  getResourceReport: () => ipcRenderer.invoke('get-resource-report'),
  getResourceSummary: () => ipcRenderer.invoke('get-resource-summary'),
  listResourceReports: () => ipcRenderer.invoke('list-resource-reports'),
  readResourceReport: (filename) => ipcRenderer.invoke('read-resource-report', filename),
  getResourceReportDir: () => ipcRenderer.invoke('get-resource-report-dir'),
  forceGC: () => ipcRenderer.invoke('force-gc'),
});
