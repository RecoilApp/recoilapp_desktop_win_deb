const { autoUpdater } = require('electron-updater');
const { BrowserWindow } = require('electron');
const updaterUI = require('./updater-ui');
const path = require('path');
const fs = require('fs');

// ── Auto-Updater Module ────────────────────────────────────
// Checks for updates from the generic server at /updates/
// Uses custom Recoil-themed UI instead of native OS dialogs.

let isCheckingManually = false;

/**
 * Read changelog entries for a specific version from changelog.json
 */
function getChangelogForVersion(version) {
  try {
    const changelogPath = path.join(__dirname, 'changelog.json');
    if (fs.existsSync(changelogPath)) {
      const data = JSON.parse(fs.readFileSync(changelogPath, 'utf-8'));
      return data[version] || [];
    }
  } catch (err) {
    console.error('Failed to read changelog:', err.message);
  }
  return [];
}

/**
 * Initialize the auto-updater with event handlers.
 * Call this once after the app is ready.
 */
function initAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.allowDowngrade = true;
  autoUpdater.logger = null;

  // Helper to send update-status to all renderer windows
  function sendUpdateStatus(status) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('update-status', { status });
      }
    }
  }

  // ── Update Available ──
  autoUpdater.on('update-available', async (info) => {
    sendUpdateStatus('available');
    const currentVersion = require('./package.json').version;
    const newVersion = info.version;
    const changes = getChangelogForVersion(newVersion);

    const shouldUpdate = await updaterUI.showUpdateAvailable(currentVersion, newVersion, changes);
    if (shouldUpdate) {
      sendUpdateStatus('downloading');
      updaterUI.showDownloadProgress();
      autoUpdater.downloadUpdate();
    } else {
      sendUpdateStatus(null);
    }
  });

  // ── No Update Available ──
  autoUpdater.on('update-not-available', async () => {
    sendUpdateStatus('upToDate');
    if (isCheckingManually) {
      const currentVersion = require('./package.json').version;
      await updaterUI.showNoUpdates(currentVersion);
      isCheckingManually = false;
    }
    // Reset status after a brief display so the button goes back to normal
    setTimeout(() => sendUpdateStatus(null), 3000);
  });

  // ── Download Progress ──
  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent);
    const transferred = progress.transferred;
    const total = progress.total;
    const speed = progress.bytesPerSecond;

    // Update custom progress dialog
    updaterUI.updateDownloadProgress(percent, transferred, total, speed);

    // Also update taskbar progress bar
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].setProgressBar(progress.percent / 100);
    }
  });

  // ── Update Downloaded ──
  autoUpdater.on('update-downloaded', async (info) => {
    sendUpdateStatus('ready');
    // Reset taskbar progress
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].setTitle('RecoilApp');
      windows[0].setProgressBar(-1);
    }

    // Close the progress dialog and show the "ready" dialog
    updaterUI.closeDialog();
    const shouldRestart = await updaterUI.showUpdateReady(info.version);
    if (shouldRestart) {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  // ── Error Handling ──
  autoUpdater.on('error', async (error) => {
    sendUpdateStatus('error');
    // Reset taskbar
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].setTitle('RecoilApp');
      windows[0].setProgressBar(-1);
    }

    // Close any open progress dialog
    updaterUI.closeDialog();

    if (isCheckingManually) {
      await updaterUI.showUpdateError(error?.message || 'An unknown error occurred.');
      isCheckingManually = false;
    }
    // Silent fail for automatic checks
    // Reset status after brief display
    setTimeout(() => sendUpdateStatus(null), 3000);
  });
}

/**
 * Check for updates silently (automatic check on startup).
 */
function checkForUpdates() {
  isCheckingManually = false;
  autoUpdater.checkForUpdates().catch(() => {});
}

/**
 * Check for updates manually (user-triggered).
 * Shows "no updates" or error dialog.
 */
function checkForUpdatesManual() {
  isCheckingManually = true;
  autoUpdater.checkForUpdates().catch(async (error) => {
    isCheckingManually = false;
    await updaterUI.showUpdateError(error?.message || 'Please check your internet connection.');
  });
}

module.exports = { initAutoUpdater, checkForUpdates, checkForUpdatesManual };
