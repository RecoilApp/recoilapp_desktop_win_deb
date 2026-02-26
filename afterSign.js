/**
 * afterSign.js — electron-builder afterSign hook
 *
 * Automatically signs Windows executables after electron-builder
 * creates them. This is invoked by electron-builder's lifecycle hooks.
 *
 * electron-builder calls this with a context object containing:
 *   - appOutDir: path to the unpacked app directory
 *   - packager: the packager instance
 *   - electronPlatformName: 'win32', 'linux', 'darwin'
 *   - targets: build targets
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

module.exports = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only sign Windows builds
  if (electronPlatformName !== "win32") {
    console.log(`  ℹ Skipping code signing for platform: ${electronPlatformName}`);
    return;
  }

  const signingDir = path.join(__dirname, "signing");
  const envFile = path.join(signingDir, ".env");
  const signScript = path.join(signingDir, "sign-windows.sh");

  // Check if signing is configured
  if (!fs.existsSync(envFile)) {
    console.log("  ⚠ No signing/.env found — skipping Windows code signing");
    console.log("    Copy signing/.env.example to signing/.env and configure your certificate");
    return;
  }

  // Find .exe files in the output directory
  const exeFiles = [];

  // The unpacked directory contains the main .exe
  if (fs.existsSync(appOutDir)) {
    const files = fs.readdirSync(appOutDir);
    for (const file of files) {
      if (file.endsWith(".exe")) {
        exeFiles.push(path.join(appOutDir, file));
      }
    }
  }

  if (exeFiles.length === 0) {
    console.log("  ⚠ No .exe files found in output directory");
    return;
  }

  console.log(`\n  ▶ Signing ${exeFiles.length} Windows executable(s)...`);

  for (const exeFile of exeFiles) {
    try {
      console.log(`  ▶ Signing: ${path.basename(exeFile)}`);
      execSync(`bash "${signScript}" "${exeFile}"`, {
        stdio: "inherit",
        env: { ...process.env },
      });
    } catch (error) {
      console.error(`  ✗ Failed to sign ${path.basename(exeFile)}: ${error.message}`);
      // Don't fail the build — unsigned is better than no build
      console.log("  ⚠ Continuing with unsigned executable");
    }
  }
};
