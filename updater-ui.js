const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// ── Custom Themed Update Dialog Windows ────────────────────
// Replaces native OS dialogs with Recoil-branded glassmorphic windows

let activeDialog = null;

/**
 * Base HTML shell with Recoil dark theme
 */
function buildHTML(body, width = 440, height = 280) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
    @keyframes progress { from { background-position: 0 0; } to { background-position: 40px 0; } }
    @keyframes spin { to { transform: rotate(360deg); } }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(145deg, #090C10 0%, #0D1117 40%, #111820 100%);
      color: #E2E8F0;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      -webkit-app-region: drag;
      user-select: none;
    }

    .container {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 36px 24px;
      animation: fadeIn 0.3s ease-out;
      position: relative;
    }

    /* Subtle ambient glow */
    .container::before {
      content: '';
      position: absolute;
      top: -60px;
      left: 50%;
      transform: translateX(-50%);
      width: 200px;
      height: 200px;
      background: radial-gradient(circle, rgba(0,212,212,0.08) 0%, transparent 70%);
      pointer-events: none;
    }

    .icon {
      width: 52px;
      height: 52px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
      position: relative;
    }
    .icon.info {
      background: linear-gradient(135deg, rgba(0,212,212,0.15), rgba(0,212,212,0.05));
      border: 1px solid rgba(0,212,212,0.2);
    }
    .icon.success {
      background: linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05));
      border: 1px solid rgba(34,197,94,0.2);
    }
    .icon.error {
      background: linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05));
      border: 1px solid rgba(239,68,68,0.2);
    }
    .icon svg { width: 24px; height: 24px; }

    .title {
      font-size: 17px;
      font-weight: 700;
      color: #E2E8F0;
      margin-bottom: 8px;
      text-align: center;
      letter-spacing: -0.01em;
    }

    .detail {
      font-size: 13px;
      color: #94A3B8;
      text-align: center;
      line-height: 1.6;
      max-width: 340px;
    }

    .version-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin: 12px 0 4px;
      padding: 8px 16px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      font-size: 12.5px;
      color: #94A3B8;
    }
    .version-badge .arrow {
      color: #00d4d4;
      font-size: 14px;
    }
    .version-badge .new {
      color: #00d4d4;
      font-weight: 600;
    }

    .buttons {
      display: flex;
      gap: 10px;
      margin-top: 20px;
      -webkit-app-region: no-drag;
    }

    button {
      padding: 9px 22px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
      letter-spacing: 0.01em;
    }
    button:active { transform: scale(0.97); }

    .btn-primary {
      background: linear-gradient(135deg, #00d4d4, #00b8b8);
      color: #090C10;
      box-shadow: 0 2px 12px rgba(0,212,212,0.25);
    }
    .btn-primary:hover {
      background: linear-gradient(135deg, #00e0e0, #00c8c8);
      box-shadow: 0 4px 20px rgba(0,212,212,0.35);
    }

    .btn-secondary {
      background: rgba(255,255,255,0.05);
      color: #94A3B8;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .btn-secondary:hover {
      background: rgba(255,255,255,0.08);
      color: #E2E8F0;
      border-color: rgba(255,255,255,0.12);
    }

    .btn-danger {
      background: rgba(239,68,68,0.1);
      color: #f87171;
      border: 1px solid rgba(239,68,68,0.2);
    }
    .btn-danger:hover {
      background: rgba(239,68,68,0.15);
    }

    /* ── Progress Bar ── */
    .progress-section {
      width: 100%;
      max-width: 340px;
      margin-top: 16px;
    }
    .progress-bar-bg {
      width: 100%;
      height: 6px;
      background: rgba(255,255,255,0.06);
      border-radius: 100px;
      overflow: hidden;
    }
    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #00b8b8, #00d4d4, #00e8e8);
      border-radius: 100px;
      transition: width 0.3s ease;
      box-shadow: 0 0 12px rgba(0,212,212,0.4);
    }
    .progress-label {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      font-size: 11.5px;
      color: #64748B;
    }
    .progress-label .percent {
      color: #00d4d4;
      font-weight: 600;
    }
    .progress-label .speed {
      color: #64748B;
    }

    /* ── Spinner ── */
    .spinner {
      width: 20px;
      height: 20px;
      border: 2.5px solid rgba(0,212,212,0.15);
      border-top-color: #00d4d4;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 12px;
    }

    /* ── Close button (top right) ── */
    .close-btn {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: transparent;
      border: none;
      color: #64748B;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
      -webkit-app-region: no-drag;
      padding: 0;
    }
    .close-btn:hover { background: rgba(255,255,255,0.06); color: #94A3B8; }
    .close-btn svg { width: 14px; height: 14px; }

    /* ── Changelog list ── */
    .changelog {
      width: 100%;
      max-width: 360px;
      margin-top: 12px;
      text-align: left;
    }
    .changelog-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748B;
      margin-bottom: 6px;
    }
    .changelog-list {
      list-style: none;
      padding: 0;
      margin: 0;
      max-height: 110px;
      overflow-y: auto;
      -webkit-app-region: no-drag;
    }
    .changelog-list::-webkit-scrollbar { width: 4px; }
    .changelog-list::-webkit-scrollbar-track { background: transparent; }
    .changelog-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
    .changelog-list li {
      font-size: 12px;
      color: #94A3B8;
      padding: 3px 0 3px 16px;
      position: relative;
      line-height: 1.5;
    }
    .changelog-list li::before {
      content: '';
      position: absolute;
      left: 4px;
      top: 10px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #00d4d4;
    }

    /* ── Bottom brand line ── */
    .brand-line {
      height: 2px;
      background: linear-gradient(90deg, transparent, rgba(0,212,212,0.3), transparent);
    }
  </style>
</head>
<body>${body}
  <div class="brand-line"></div>
  <script>
    const { ipcRenderer } = require('electron');
    function respond(action) { ipcRenderer.send('updater-dialog-response', action); }
  </script>
</body>
</html>`;
}

// ── SVG Icons ──────────────────────────────────────────────
const ICONS = {
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="#00d4d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  checkSmall: '<svg viewBox="0 0 24 24" fill="none" stroke="#00d4d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="#00d4d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
};

/**
 * Show a custom themed dialog window
 */
function showDialog(html, options = {}) {
  if (activeDialog && !activeDialog.isDestroyed()) {
    activeDialog.close();
  }

  const width = options.width || 440;
  const height = options.height || 300;
  const parent = options.parent || BrowserWindow.getFocusedWindow();
  
  activeDialog = new BrowserWindow({
    width,
    height,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    modal: !!parent,
    parent: parent || undefined,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  activeDialog.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildHTML(html)));

  activeDialog.on('closed', () => { activeDialog = null; });
  return activeDialog;
}

function closeDialog() {
  if (activeDialog && !activeDialog.isDestroyed()) {
    activeDialog.close();
    activeDialog = null;
  }
}

// ── Public Dialog Functions ────────────────────────────────

function showUpdateAvailable(currentVersion, newVersion, changes = []) {
  return new Promise((resolve) => {
    const changelogHtml = changes.length > 0
      ? `<div class="changelog">
          <div class="changelog-title">What's New</div>
          <ul class="changelog-list">
            ${changes.map(c => `<li>${c}</li>`).join('\n            ')}
          </ul>
        </div>`
      : '';

    const html = `
    <div class="container">
      <button class="close-btn" onclick="respond('later')">${ICONS.close}</button>
      <div class="icon info">${ICONS.rocket}</div>
      <div class="title">Update Available</div>
      <div class="detail">A new version of RecoilApp is ready to download.</div>
      <div class="version-badge">
        <span>v${currentVersion}</span>
        <span class="arrow">→</span>
        <span class="new">v${newVersion}</span>
      </div>
      ${changelogHtml}
      <div class="buttons">
        <button class="btn-secondary" onclick="respond('later')">Later</button>
        <button class="btn-primary" onclick="respond('update')">Update Now</button>
      </div>
    </div>`;

    const dialogHeight = changes.length > 0 ? 340 + Math.min(changes.length * 22, 110) : 310;
    const win = showDialog(html, { height: dialogHeight });
    
    const handler = (event, action) => {
      ipcMain.removeListener('updater-dialog-response', handler);
      closeDialog();
      resolve(action === 'update');
    };
    ipcMain.on('updater-dialog-response', handler);
    win.on('closed', () => {
      ipcMain.removeListener('updater-dialog-response', handler);
      resolve(false);
    });
  });
}

function showDownloadProgress() {
  const html = `
    <div class="container" id="progress-container">
      <div class="icon info">${ICONS.download}</div>
      <div class="title">Downloading Update</div>
      <div class="detail" id="status-text">Preparing download…</div>
      <div class="progress-section">
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" id="progress-fill" style="width: 0%"></div>
        </div>
        <div class="progress-label">
          <span class="percent" id="percent-text">0%</span>
          <span class="speed" id="speed-text"></span>
        </div>
      </div>
    </div>
    <script>
      const { ipcRenderer } = require('electron');
      ipcRenderer.on('download-progress', (event, data) => {
        document.getElementById('progress-fill').style.width = data.percent + '%';
        document.getElementById('percent-text').textContent = data.percent + '%';
        document.getElementById('speed-text').textContent = data.speed;
        document.getElementById('status-text').textContent = data.detail;
      });
    </script>`;

  return showDialog(html, { height: 260 });
}

function updateDownloadProgress(percent, transferred, total, bytesPerSecond) {
  if (!activeDialog || activeDialog.isDestroyed()) return;
  
  const mbDown = (transferred / (1024 * 1024)).toFixed(1);
  const mbTotal = (total / (1024 * 1024)).toFixed(1);
  const speedMB = (bytesPerSecond / (1024 * 1024)).toFixed(1);
  
  activeDialog.webContents.send('download-progress', {
    percent: Math.round(percent),
    speed: `${speedMB} MB/s`,
    detail: `${mbDown} / ${mbTotal} MB`,
  });
}

function showUpdateReady(version) {
  return new Promise((resolve) => {
    const html = `
    <div class="container">
      <button class="close-btn" onclick="respond('later')">${ICONS.close}</button>
      <div class="icon success">${ICONS.check}</div>
      <div class="title">Update Ready</div>
      <div class="detail">
        Version <strong style="color:#00d4d4">v${version}</strong> has been downloaded.<br>
        Restart the app to apply the update.
      </div>
      <div class="buttons">
        <button class="btn-secondary" onclick="respond('later')">Later</button>
        <button class="btn-primary" onclick="respond('restart')">Restart Now</button>
      </div>
    </div>`;

    const win = showDialog(html, { height: 290 });
    
    const handler = (event, action) => {
      ipcMain.removeListener('updater-dialog-response', handler);
      closeDialog();
      resolve(action === 'restart');
    };
    ipcMain.on('updater-dialog-response', handler);
    win.on('closed', () => {
      ipcMain.removeListener('updater-dialog-response', handler);
      resolve(false);
    });
  });
}

function showNoUpdates(currentVersion) {
  return new Promise((resolve) => {
    const html = `
    <div class="container">
      <button class="close-btn" onclick="respond('ok')">${ICONS.close}</button>
      <div class="icon info">${ICONS.checkSmall}</div>
      <div class="title">You're Up to Date</div>
      <div class="detail">
        RecoilApp <strong style="color:#00d4d4">v${currentVersion}</strong> is the latest version.<br>
        No updates available right now.
      </div>
      <div class="buttons">
        <button class="btn-primary" onclick="respond('ok')">Got it</button>
      </div>
    </div>`;

    const win = showDialog(html, { height: 270 });
    
    const handler = () => {
      ipcMain.removeListener('updater-dialog-response', handler);
      closeDialog();
      resolve();
    };
    ipcMain.on('updater-dialog-response', handler);
    win.on('closed', () => {
      ipcMain.removeListener('updater-dialog-response', handler);
      resolve();
    });
  });
}

function showUpdateError(errorMessage) {
  return new Promise((resolve) => {
    const html = `
    <div class="container">
      <button class="close-btn" onclick="respond('ok')">${ICONS.close}</button>
      <div class="icon error">${ICONS.error}</div>
      <div class="title">Update Failed</div>
      <div class="detail">
        Could not check for updates.<br>
        <span style="color:#64748B;font-size:12px;margin-top:4px;display:inline-block;">${errorMessage || 'Please check your internet connection.'}</span>
      </div>
      <div class="buttons">
        <button class="btn-secondary" onclick="respond('ok')">Dismiss</button>
      </div>
    </div>`;

    const win = showDialog(html, { height: 280 });
    
    const handler = () => {
      ipcMain.removeListener('updater-dialog-response', handler);
      closeDialog();
      resolve();
    };
    ipcMain.on('updater-dialog-response', handler);
    win.on('closed', () => {
      ipcMain.removeListener('updater-dialog-response', handler);
      resolve();
    });
  });
}

module.exports = {
  showUpdateAvailable,
  showDownloadProgress,
  updateDownloadProgress,
  showUpdateReady,
  showNoUpdates,
  showUpdateError,
  closeDialog,
};
