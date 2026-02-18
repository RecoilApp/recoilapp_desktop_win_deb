# RecoilApp — Desktop (Windows & Linux)

Electron desktop application for **RecoilApp**. Wraps the web app in a native window with platform-specific features for Windows and Linux.

## Features

- **Auto-Updates** — electron-updater with custom Recoil-themed download dialogs, progress bars, and version comparison
- **System Tray** — Minimize to tray, close to tray, single-instance lock
- **App Lock** — PIN (4-8 digits) or password protection with SHA-256 hashing
- **Custom Keybinds** — Configurable keyboard shortcuts (Ctrl+L lock, Ctrl+Shift+M mute, Ctrl+Shift+D deafen)
- **Image Lightbox** — In-app fullscreen image viewer with zoom, rotate, and download
- **Native Notifications** — System notifications for messages and mentions
- **External Links** — Opens URLs in the default browser instead of new Electron windows
- **Error Recovery** — Styled error page with retry on load failure, 15s show timeout fallback

## Build Targets

| Platform | Format | Notes |
|----------|--------|-------|
| Linux | AppImage | Portable, no install required |
| Linux | .deb | Debian/Ubuntu package |
| Windows | NSIS Installer | Custom sidebar, license agreement, desktop/start menu shortcuts |
| Windows | Portable .exe | No install required |

## Development

```bash
npm install
npm start            # Launch app
npm run dev          # Launch with DevTools
npm run build:linux  # Build Linux targets
npm run build:windows # Build Windows targets (cross-compile with Wine)
npm run build:all    # Build all platforms
```

## Project Structure

```
├── main.js          # Main process — window, tray, IPC, keybinds, app lock
├── preload.js       # Context bridge — secure API exposure to renderer
├── updater.js       # Auto-update logic with electron-updater
├── updater-ui.js    # Custom glassmorphic update dialogs
├── changelog.json   # Version changelog shown in update dialogs
├── LICENSE.txt      # Terms of Service + Privacy Policy (shown in installer)
└── assets/          # Icons (16-1024px PNG + .ico), NSIS installer images
```

## Current Version

**v0.1.16** — See [changelog.json](changelog.json) for release notes.

## License

MIT
