const { runScheduledSync } = require('./service-runner');
const path = require('path');

function parseIntervalToMs(str) {
  if (!str) return 86400000; // 24h default
  const match = String(str).trim().match(/^(\d+)([smhd])$/i);
  if (!match) return 86400000;

  const val = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 3600 * 1000;
    case 'd': return val * 86400 * 1000;
    default: return 86400000;
  }
}

function generateLaunchdPlist({ nodePath = process.execPath, scriptPath = path.resolve(__dirname, 'cron-runner.js'), intervalSeconds = 86400 } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.bdb.invoicescrape.scheduler</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${scriptPath}</string>
        <string>--once</string>
    </array>
    <key>StartInterval</key>
    <integer>${intervalSeconds}</integer>
    <key>StandardOutPath</key>
    <string>${path.resolve(__dirname, '../../storage/launchd_stdout.log')}</string>
    <key>StandardErrorPath</key>
    <string>${path.resolve(__dirname, '../../storage/launchd_stderr.log')}</string>
</dict>
</plist>`.trim();
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const intervalArg = args.find(a => a.startsWith('--interval='))?.split('=')[1] || '24h';
  const servicesArg = args.find(a => a.startsWith('--services='))?.split('=')[1]?.split(',') || [];

  if (once) {
    runScheduledSync({ services: servicesArg, headless: true });
  } else {
    const ms = parseIntervalToMs(intervalArg);
    console.log(`⏰ Scheduler running in daemon mode (Interval: ${intervalArg} / ${ms}ms)...`);
    runScheduledSync({ services: servicesArg, headless: true });
    setInterval(() => {
      runScheduledSync({ services: servicesArg, headless: true });
    }, ms);
  }
}

module.exports = { parseIntervalToMs, generateLaunchdPlist, runScheduledSync };
