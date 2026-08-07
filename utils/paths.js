const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Single source of truth for all storage paths (invoices, auth profiles, ledgers).
 * 
 * Rules:
 * 1. If running in a local cloned git repository -> uses project root directory.
 * 2. If installed globally via npm (in node_modules) -> uses persistent OS user directory:
 *    - Windows: %LOCALAPPDATA%\InvoiceScrapeAgent
 *    - macOS: ~/Documents/InvoiceScrapeAgent
 *    - Linux: ~/.invoice-scrape-agent
 */

let cachedUserDataDir = null;

function getUserDataDir() {
  if (cachedUserDataDir) return cachedUserDataDir;

  const pkgRoot = path.resolve(__dirname, '..');

  // If .git exists or running locally from source repo, use pkgRoot
  if (fs.existsSync(path.join(pkgRoot, '.git'))) {
    cachedUserDataDir = pkgRoot;
    return cachedUserDataDir;
  }

  // Check if running from a global npm install (path contains node_modules)
  const isGlobal = pkgRoot.includes('node_modules');
  if (!isGlobal) {
    cachedUserDataDir = pkgRoot;
    return cachedUserDataDir;
  }

  // Global install: persistent OS-level directory
  let userDataDir;
  if (process.platform === 'win32') {
    userDataDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'InvoiceScrapeAgent');
  } else if (process.platform === 'darwin') {
    userDataDir = path.join(os.homedir(), 'Documents', 'InvoiceScrapeAgent');
  } else {
    userDataDir = path.join(os.homedir(), '.invoice-scrape-agent');
  }

  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  // One-time automatic migration from old pkg directory
  migrateOldPackageData(pkgRoot, userDataDir);

  cachedUserDataDir = userDataDir;
  return cachedUserDataDir;
}

function migrateOldPackageData(oldRoot, newRoot) {
  const markerFile = path.join(newRoot, '.migrated');
  if (fs.existsSync(markerFile)) return;

  const dirsToMigrate = ['invoices', '.auth-profile'];
  for (const dir of dirsToMigrate) {
    const oldDir = path.join(oldRoot, dir);
    const newDir = path.join(newRoot, dir);
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
      try {
        copyDirRecursive(oldDir, newDir);
      } catch (e) {}
    }
  }

  try {
    fs.writeFileSync(markerFile, new Date().toISOString());
  } catch (e) {}
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getInvoicesDir(serviceId = '') {
  const base = path.join(getUserDataDir(), 'invoices');
  const dir = serviceId ? path.join(base, serviceId) : base;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getAuthDir(serviceId = '') {
  const base = path.join(getUserDataDir(), '.auth-profile');
  const dir = serviceId ? path.join(base, serviceId) : base;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getLedgerFile(serviceId) {
  return path.join(getInvoicesDir(serviceId), `${serviceId}_ledger.json`);
}

function getMasterLedgerFile() {
  return path.join(getInvoicesDir(), 'master_ledger.json');
}

module.exports = {
  getUserDataDir,
  getInvoicesDir,
  getAuthDir,
  getLedgerFile,
  getMasterLedgerFile
};
