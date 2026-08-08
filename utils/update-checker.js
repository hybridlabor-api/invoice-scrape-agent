const https = require('https');
const fs = require('fs');
const path = require('path');
const { getUserDataDir } = require('./paths');

/**
 * Compare two semver strings (e.g. "1.6.1" vs "1.7.0")
 * Returns:
 *   1 if v2 > v1 (update available)
 *   0 if v1 === v2
 *  -1 if v1 > v2
 */
function compareSemver(v1, v2) {
  const parse = (v) => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const p1 = parse(v1);
  const p2 = parse(v2);

  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num2 > num1) return 1;
    if (num1 > num2) return -1;
  }
  return 0;
}

/**
 * Fetch latest version from NPM registry with short timeout.
 * @param {string} [packageName='invoice-scrape-agent']
 * @param {number} [timeoutMs=2000]
 * @returns {Promise<string|null>}
 */
function fetchLatestNpmVersion(packageName = 'invoice-scrape-agent', timeoutMs = 2000) {
  return new Promise((resolve) => {
    const url = `https://registry.npmjs.org/${packageName}/latest`;
    const req = https.get(url, { headers: { 'User-Agent': 'invoice-scrape-agent' } }, (res) => {
      if (res.statusCode !== 200) {
        return resolve(null);
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.version || null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Check if a newer version is available.
 * @param {Object} [options]
 * @param {boolean} [options.force=false]
 * @returns {Promise<{ updateAvailable: boolean, currentVersion: string, latestVersion: string, releaseUrl: string }>}
 */
async function checkUpdateAvailable({ force = false } = {}) {
  let currentVersion = '1.6.1';
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      currentVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || currentVersion;
    }
  } catch {}

  const latestVersion = await fetchLatestNpmVersion('invoice-scrape-agent');
  if (!latestVersion) {
    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseUrl: 'https://github.com/hybridlabor-api/invoice-scrape-agent/releases'
    };
  }

  const updateAvailable = compareSemver(currentVersion, latestVersion) === 1;

  return {
    updateAvailable,
    currentVersion,
    latestVersion,
    releaseUrl: `https://github.com/hybridlabor-api/invoice-scrape-agent/releases/tag/v${latestVersion}`
  };
}

/**
 * Print terminal banner if update is available.
 */
async function printCliUpdateBanner() {
  try {
    const result = await checkUpdateAvailable();
    if (result.updateAvailable) {
      console.log('\n' + '─'.repeat(60));
      console.log(`  🚀 Update verfügbar: v${result.currentVersion} → v${result.latestVersion}`);
      console.log(`  Führe 'npm run update' oder 'npm install -g invoice-scrape-agent' aus.`);
      console.log('─'.repeat(60) + '\n');
    }
  } catch {}
}

module.exports = {
  compareSemver,
  fetchLatestNpmVersion,
  checkUpdateAvailable,
  printCliUpdateBanner
};
