/**
 * Resource Monitor Module for RecoilApp Desktop
 *
 * Tracks detailed memory, CPU, and process metrics over time.
 * Generates periodic reports saved to the user's app data directory.
 *
 * Reports are saved to:
 *   - Linux:   ~/.config/RecoilApp/resource-reports/
 *   - Windows: %APPDATA%/RecoilApp/resource-reports/
 *   - macOS:   ~/Library/Application Support/RecoilApp/resource-reports/
 *
 * Each report is a JSON file with timestamped snapshots.
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const v8 = require('v8');

// ── Configuration ──────────────────────────────────────────
const SNAPSHOT_INTERVAL_MS = 60 * 1000;       // Capture snapshot every 60 seconds
const REPORT_FLUSH_INTERVAL_MS = 5 * 60 * 1000; // Write report to disk every 5 minutes
const MAX_SNAPSHOTS_IN_MEMORY = 120;           // Keep last 2 hours of 60s snapshots in memory
const MAX_REPORT_FILES = 48;                   // Keep ~2 days of 1-hour reports on disk
const REPORT_ROTATION_MS = 60 * 60 * 1000;    // Start a new report file every hour

// ── State ──────────────────────────────────────────────────
let reportDir = null;
let currentReportFile = null;
let currentReportStartTime = 0;
let snapshotBuffer = [];
let snapshotInterval = null;
let flushInterval = null;
let previousCpuUsage = null;
let previousCpuTime = null;
let sessionStartTime = null;
let peakMemory = { main: 0, renderer: 0, gpu: 0, total: 0 };

// ── Initialization ─────────────────────────────────────────

/**
 * Initialize the resource monitor. Call after app.whenReady().
 */
function init() {
  reportDir = path.join(app.getPath('userData'), 'resource-reports');
  sessionStartTime = Date.now();

  // Ensure report directory exists
  try {
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
  } catch (err) {
    console.error('[ResourceMonitor] Failed to create report directory:', err.message);
    return;
  }

  // Rotate old report files
  rotateReportFiles();

  // Start a new report file
  startNewReportFile();

  // Begin capturing snapshots
  snapshotInterval = setInterval(() => captureSnapshot(), SNAPSHOT_INTERVAL_MS);
  flushInterval = setInterval(() => flushToDisk(), REPORT_FLUSH_INTERVAL_MS);

  // Capture an initial snapshot immediately
  captureSnapshot();

  console.log('[ResourceMonitor] Initialized. Reports saved to:', reportDir);
}

/**
 * Clean up intervals. Call on app quit.
 */
function shutdown() {
  if (snapshotInterval) clearInterval(snapshotInterval);
  if (flushInterval) clearInterval(flushInterval);
  snapshotInterval = null;
  flushInterval = null;

  // Final flush
  flushToDisk();
  console.log('[ResourceMonitor] Shut down.');
}

// ── Report File Management ─────────────────────────────────

function startNewReportFile() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  currentReportFile = path.join(reportDir, `report-${timestamp}.json`);
  currentReportStartTime = Date.now();
  snapshotBuffer = [];
}

function rotateReportFiles() {
  try {
    const files = fs.readdirSync(reportDir)
      .filter(f => f.startsWith('report-') && f.endsWith('.json'))
      .sort();

    // Remove oldest files if exceeding max
    while (files.length > MAX_REPORT_FILES) {
      const oldest = files.shift();
      try {
        fs.unlinkSync(path.join(reportDir, oldest));
      } catch {}
    }
  } catch (err) {
    console.error('[ResourceMonitor] Failed to rotate report files:', err.message);
  }
}

function flushToDisk() {
  if (!currentReportFile || snapshotBuffer.length === 0) return;

  // Check if we need to rotate to a new file
  if (Date.now() - currentReportStartTime > REPORT_ROTATION_MS) {
    // Write out current buffer first, then start new file
    writeReportFile();
    rotateReportFiles();
    startNewReportFile();
    return;
  }

  writeReportFile();
}

function writeReportFile() {
  if (!currentReportFile || snapshotBuffer.length === 0) return;

  try {
    const report = {
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      sessionStart: new Date(sessionStartTime).toISOString(),
      reportStart: new Date(currentReportStartTime).toISOString(),
      reportEnd: new Date().toISOString(),
      snapshotCount: snapshotBuffer.length,
      snapshotIntervalMs: SNAPSHOT_INTERVAL_MS,
      peakMemory: { ...peakMemory },
      systemInfo: getSystemInfo(),
      snapshots: snapshotBuffer,
    };

    fs.writeFileSync(currentReportFile, JSON.stringify(report, null, 2), 'utf-8');
  } catch (err) {
    console.error('[ResourceMonitor] Failed to write report:', err.message);
  }
}

// ── Snapshot Capture ───────────────────────────────────────

function captureSnapshot() {
  try {
    const now = Date.now();
    const snapshot = {
      timestamp: new Date(now).toISOString(),
      uptimeSeconds: Math.round((now - sessionStartTime) / 1000),
      memory: getMemorySnapshot(),
      cpu: getCpuSnapshot(),
      v8Heap: getV8HeapSnapshot(),
      processMetrics: getProcessMetrics(),
      system: getSystemResourceSnapshot(),
      windows: getWindowSnapshot(),
    };

    // Track peak memory
    if (snapshot.memory.totalRSS > peakMemory.total) {
      peakMemory.total = snapshot.memory.totalRSS;
    }
    if (snapshot.memory.main.residentSetSize > peakMemory.main) {
      peakMemory.main = snapshot.memory.main.residentSetSize;
    }

    snapshotBuffer.push(snapshot);

    // Trim buffer to max size
    if (snapshotBuffer.length > MAX_SNAPSHOTS_IN_MEMORY) {
      snapshotBuffer = snapshotBuffer.slice(-MAX_SNAPSHOTS_IN_MEMORY);
    }
  } catch (err) {
    console.error('[ResourceMonitor] Snapshot failed:', err.message);
  }
}

// ── Memory Metrics ─────────────────────────────────────────

function getMemorySnapshot() {
  const mainMemory = process.memoryUsage();

  // Get all process metrics from Electron's app.getAppMetrics()
  const appMetrics = app.getAppMetrics();
  let totalRSS = 0;
  let totalPrivateBytes = 0;
  const processes = [];

  for (const metric of appMetrics) {
    const memInfo = metric.memory;
    const rss = memInfo ? memInfo.workingSetSize * 1024 : 0;
    const privateBytes = memInfo ? (memInfo.privateBytes || 0) * 1024 : 0;
    totalRSS += rss;
    totalPrivateBytes += privateBytes;

    processes.push({
      pid: metric.pid,
      type: metric.type,
      name: metric.name || metric.type,
      // All sizes in bytes
      workingSetSizeKB: memInfo ? memInfo.workingSetSize : 0,
      peakWorkingSetSizeKB: memInfo ? (memInfo.peakWorkingSetSize || 0) : 0,
      privateBytesKB: memInfo ? (memInfo.privateBytes || 0) : 0,
      cpu: metric.cpu ? {
        percentCPUUsage: Math.round(metric.cpu.percentCPUUsage * 100) / 100,
        idleWakeupsPerSecond: metric.cpu.idleWakeupsPerSecond || 0,
      } : null,
      sandboxed: metric.sandboxed !== undefined ? metric.sandboxed : null,
      integrityLevel: metric.integrityLevel || null,
    });
  }

  return {
    main: {
      residentSetSize: mainMemory.rss,
      heapTotal: mainMemory.heapTotal,
      heapUsed: mainMemory.heapUsed,
      external: mainMemory.external,
      arrayBuffers: mainMemory.arrayBuffers,
      // Human-readable
      residentSetSizeMB: round(mainMemory.rss / 1024 / 1024),
      heapTotalMB: round(mainMemory.heapTotal / 1024 / 1024),
      heapUsedMB: round(mainMemory.heapUsed / 1024 / 1024),
      externalMB: round(mainMemory.external / 1024 / 1024),
      arrayBuffersMB: round(mainMemory.arrayBuffers / 1024 / 1024),
    },
    totalRSS,
    totalRSSMB: round(totalRSS / 1024 / 1024),
    totalPrivateBytes,
    totalPrivateBytesMB: round(totalPrivateBytes / 1024 / 1024),
    processCount: appMetrics.length,
    processes,
  };
}

// ── CPU Metrics ────────────────────────────────────────────

function getCpuSnapshot() {
  const currentCpuUsage = process.cpuUsage(previousCpuUsage || undefined);
  const currentTime = process.hrtime.bigint();

  let percentUser = 0;
  let percentSystem = 0;

  if (previousCpuUsage && previousCpuTime) {
    const elapsedMicros = Number(currentTime - previousCpuTime) / 1000;
    if (elapsedMicros > 0) {
      percentUser = round((currentCpuUsage.user / elapsedMicros) * 100);
      percentSystem = round((currentCpuUsage.system / elapsedMicros) * 100);
    }
  }

  previousCpuUsage = process.cpuUsage();
  previousCpuTime = process.hrtime.bigint();

  return {
    userMicroseconds: currentCpuUsage.user,
    systemMicroseconds: currentCpuUsage.system,
    percentUser,
    percentSystem,
    percentTotal: round(percentUser + percentSystem),
  };
}

// ── V8 Heap Statistics ─────────────────────────────────────

function getV8HeapSnapshot() {
  const heapStats = v8.getHeapStatistics();
  const heapSpaces = v8.getHeapSpaceStatistics();

  return {
    totalHeapSize: heapStats.total_heap_size,
    totalHeapSizeExecutable: heapStats.total_heap_size_executable,
    totalPhysicalSize: heapStats.total_physical_size,
    totalAvailableSize: heapStats.total_available_size,
    usedHeapSize: heapStats.used_heap_size,
    heapSizeLimit: heapStats.heap_size_limit,
    mallocedMemory: heapStats.malloced_memory,
    peakMallocedMemory: heapStats.peak_malloced_memory,
    externalMemory: heapStats.external_memory,
    numberOfNativeContexts: heapStats.number_of_native_contexts,
    numberOfDetachedContexts: heapStats.number_of_detached_contexts,
    doesZapGarbage: heapStats.does_zap_garbage,
    // Human-readable
    totalHeapSizeMB: round(heapStats.total_heap_size / 1024 / 1024),
    usedHeapSizeMB: round(heapStats.used_heap_size / 1024 / 1024),
    heapSizeLimitMB: round(heapStats.heap_size_limit / 1024 / 1024),
    heapUsagePercent: round((heapStats.used_heap_size / heapStats.total_heap_size) * 100),
    // Heap space breakdown
    spaces: heapSpaces.map(space => ({
      name: space.space_name,
      sizeMB: round(space.space_size / 1024 / 1024),
      usedSizeMB: round(space.space_used_size / 1024 / 1024),
      availableSizeMB: round(space.space_available_size / 1024 / 1024),
      physicalSizeMB: round(space.physical_space_size / 1024 / 1024),
    })),
  };
}

// ── Electron Process Metrics ───────────────────────────────

function getProcessMetrics() {
  try {
    const metrics = app.getAppMetrics();
    return {
      totalProcesses: metrics.length,
      breakdown: metrics.map(m => ({
        pid: m.pid,
        type: m.type,
        name: m.name || null,
        cpuPercent: m.cpu ? round(m.cpu.percentCPUUsage) : 0,
        memoryWorkingSetKB: m.memory ? m.memory.workingSetSize : 0,
        memoryWorkingSetMB: m.memory ? round(m.memory.workingSetSize / 1024) : 0,
        creationTime: m.creationTime || null,
        sandboxed: m.sandboxed || null,
        integrityLevel: m.integrityLevel || null,
      })),
    };
  } catch {
    return { totalProcesses: 0, breakdown: [] };
  }
}

// ── System Resource Snapshot ───────────────────────────────

function getSystemResourceSnapshot() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();
  const loadAvg = os.loadavg();

  // Calculate average CPU usage across all cores
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }

  return {
    memory: {
      totalBytes: totalMem,
      freeBytes: freeMem,
      usedBytes: usedMem,
      totalMB: round(totalMem / 1024 / 1024),
      freeMB: round(freeMem / 1024 / 1024),
      usedMB: round(usedMem / 1024 / 1024),
      usedPercent: round((usedMem / totalMem) * 100),
    },
    cpu: {
      cores: cpus.length,
      model: cpus.length > 0 ? cpus[0].model : 'unknown',
      speedMHz: cpus.length > 0 ? cpus[0].speed : 0,
      loadAverage: {
        '1min': round(loadAvg[0]),
        '5min': round(loadAvg[1]),
        '15min': round(loadAvg[2]),
      },
      systemIdlePercent: totalTick > 0 ? round((totalIdle / totalTick) * 100) : 0,
    },
    uptime: {
      systemSeconds: os.uptime(),
      appSeconds: Math.round((Date.now() - sessionStartTime) / 1000),
    },
  };
}

// ── Window Snapshot ────────────────────────────────────────

function getWindowSnapshot() {
  try {
    const windows = BrowserWindow.getAllWindows();
    return windows.map(win => {
      const bounds = win.getBounds();
      const contentBounds = win.getContentBounds();
      return {
        id: win.id,
        title: win.getTitle(),
        visible: win.isVisible(),
        focused: win.isFocused(),
        minimized: win.isMinimized(),
        maximized: win.isMaximized(),
        fullScreen: win.isFullScreen(),
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        contentSize: { width: contentBounds.width, height: contentBounds.height },
        devToolsOpen: win.webContents.isDevToolsOpened(),
        url: win.webContents.getURL().substring(0, 100), // Truncate for privacy
        backgroundThrottling: win.webContents.backgroundThrottling,
      };
    });
  } catch {
    return [];
  }
}

// ── System Info (static, captured once) ────────────────────

function getSystemInfo() {
  const cpus = os.cpus();
  return {
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    osType: os.type(),
    hostname: os.hostname(),
    totalMemoryMB: round(os.totalmem() / 1024 / 1024),
    totalMemoryGB: round(os.totalmem() / 1024 / 1024 / 1024),
    cpuModel: cpus.length > 0 ? cpus[0].model : 'unknown',
    cpuCores: cpus.length,
    cpuSpeedMHz: cpus.length > 0 ? cpus[0].speed : 0,
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    v8Version: process.versions.v8,
  };
}

// ── Public API for IPC ─────────────────────────────────────

/**
 * Get the current live snapshot (on-demand).
 */
function getCurrentSnapshot() {
  return {
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round((Date.now() - sessionStartTime) / 1000),
    memory: getMemorySnapshot(),
    cpu: getCpuSnapshot(),
    v8Heap: getV8HeapSnapshot(),
    processMetrics: getProcessMetrics(),
    system: getSystemResourceSnapshot(),
    windows: getWindowSnapshot(),
    peakMemory: { ...peakMemory },
  };
}

/**
 * Get the full current report (all buffered snapshots + metadata).
 */
function getCurrentReport() {
  return {
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    sessionStart: new Date(sessionStartTime).toISOString(),
    reportStart: new Date(currentReportStartTime).toISOString(),
    reportEnd: new Date().toISOString(),
    snapshotCount: snapshotBuffer.length,
    snapshotIntervalMs: SNAPSHOT_INTERVAL_MS,
    peakMemory: { ...peakMemory },
    systemInfo: getSystemInfo(),
    snapshots: snapshotBuffer,
  };
}

/**
 * Get a summary of recent resource usage for quick display.
 */
function getUsageSummary() {
  const current = getCurrentSnapshot();
  const recentSnapshots = snapshotBuffer.slice(-10);

  // Calculate averages from recent snapshots
  let avgCpu = 0;
  let avgMemMB = 0;
  let maxMemMB = 0;
  let minMemMB = Infinity;

  for (const snap of recentSnapshots) {
    if (snap.cpu) avgCpu += snap.cpu.percentTotal || 0;
    if (snap.memory) {
      const rss = snap.memory.totalRSSMB || 0;
      avgMemMB += rss;
      if (rss > maxMemMB) maxMemMB = rss;
      if (rss < minMemMB) minMemMB = rss;
    }
  }

  if (recentSnapshots.length > 0) {
    avgCpu = round(avgCpu / recentSnapshots.length);
    avgMemMB = round(avgMemMB / recentSnapshots.length);
  }
  if (minMemMB === Infinity) minMemMB = 0;

  return {
    timestamp: new Date().toISOString(),
    uptimeFormatted: formatUptime(Date.now() - sessionStartTime),
    current: {
      totalMemoryMB: current.memory.totalRSSMB,
      mainProcessMemoryMB: current.memory.main.residentSetSizeMB,
      heapUsedMB: current.memory.main.heapUsedMB,
      heapTotalMB: current.memory.main.heapTotalMB,
      cpuPercent: current.cpu.percentTotal,
      processCount: current.memory.processCount,
      v8HeapUsagePercent: current.v8Heap.heapUsagePercent,
      detachedContexts: current.v8Heap.numberOfDetachedContexts,
    },
    recent10min: {
      avgCpuPercent: avgCpu,
      avgMemoryMB: avgMemMB,
      maxMemoryMB: round(maxMemMB),
      minMemoryMB: round(minMemMB),
    },
    peak: {
      totalMB: round(peakMemory.total / 1024 / 1024),
      mainMB: round(peakMemory.main / 1024 / 1024),
    },
    system: {
      totalMemoryMB: current.system.memory.totalMB,
      usedMemoryMB: current.system.memory.usedMB,
      usedMemoryPercent: current.system.memory.usedPercent,
      cpuCores: current.system.cpu.cores,
      loadAvg1min: current.system.cpu.loadAverage['1min'],
    },
    reportDir: reportDir,
    currentReportFile: currentReportFile,
  };
}

/**
 * List all saved report files with metadata.
 */
function listReportFiles() {
  if (!reportDir) return [];

  try {
    const files = fs.readdirSync(reportDir)
      .filter(f => f.startsWith('report-') && f.endsWith('.json'))
      .sort()
      .reverse(); // Most recent first

    return files.map(f => {
      const filePath = path.join(reportDir, f);
      const stat = fs.statSync(filePath);
      return {
        filename: f,
        path: filePath,
        sizeBytes: stat.size,
        sizeKB: round(stat.size / 1024),
        created: stat.birthtime.toISOString(),
        modified: stat.mtime.toISOString(),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Read a specific report file by filename.
 */
function readReportFile(filename) {
  if (!reportDir) return null;

  // Security: prevent path traversal
  const safeName = path.basename(filename);
  if (!safeName.startsWith('report-') || !safeName.endsWith('.json')) {
    return null;
  }

  const filePath = path.join(reportDir, safeName);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {}
  return null;
}

/**
 * Force a garbage collection hint (if --expose-gc is enabled).
 * Returns before/after memory for comparison.
 */
function forceGC() {
  const before = process.memoryUsage();
  if (global.gc) {
    global.gc();
  }
  const after = process.memoryUsage();

  return {
    gcAvailable: !!global.gc,
    before: {
      heapUsedMB: round(before.heapUsed / 1024 / 1024),
      rssMB: round(before.rss / 1024 / 1024),
    },
    after: {
      heapUsedMB: round(after.heapUsed / 1024 / 1024),
      rssMB: round(after.rss / 1024 / 1024),
    },
    freedMB: round((before.heapUsed - after.heapUsed) / 1024 / 1024),
  };
}

/**
 * Get the directory where reports are stored.
 */
function getReportDir() {
  return reportDir;
}

// ── Utilities ──────────────────────────────────────────────

function round(val) {
  return Math.round(val * 100) / 100;
}

function formatUptime(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

module.exports = {
  init,
  shutdown,
  getCurrentSnapshot,
  getCurrentReport,
  getUsageSummary,
  listReportFiles,
  readReportFile,
  forceGC,
  getReportDir,
};
