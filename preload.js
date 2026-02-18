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
});
