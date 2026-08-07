const fs = require('fs');
const path = require('path');
const ServiceRegistry = require('../registry');

async function runScheduledSync({ services = [], headless = true, year = new Date().getFullYear().toString() } = {}) {
  const logDir = path.resolve(__dirname, '../../storage');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const logFile = path.join(logDir, 'scheduler.log');
  const runsFile = path.join(logDir, 'runs.json');

  const log = (msg) => {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    process.stdout.write(entry);
    fs.appendFileSync(logFile, entry, 'utf8');
  };

  log(`🚀 Starting scheduled synchronization run for year ${year}...`);
  ServiceRegistry.autoDiscover(path.resolve(__dirname, '..'));

  const availableServices = ServiceRegistry.list().map(s => s.id);
  const targetServices = services.length > 0 ? services.filter(s => availableServices.includes(s)) : availableServices;

  const runSummary = {
    startedAt: new Date().toISOString(),
    year,
    results: {}
  };

  for (const serviceId of targetServices) {
    log(`⏳ Syncing service: ${serviceId}...`);
    try {
      const serviceInstance = ServiceRegistry.get(serviceId);
      const fetchResult = await serviceInstance.fetch({ year, all: false, headless });
      const analyzeResult = await serviceInstance.analyze();
      
      runSummary.results[serviceId] = {
        status: 'success',
        downloaded: fetchResult?.downloaded || 0,
        totalInvoices: analyzeResult?.count || 0,
        totalBrutto: analyzeResult?.totalBrutto || 0
      };
      log(`✅ [${serviceId}] Synced: ${fetchResult?.downloaded || 0} downloaded.`);
    } catch (err) {
      log(`❌ [${serviceId}] Error: ${err.message}`);
      runSummary.results[serviceId] = {
        status: 'error',
        error: err.message
      };
    }
  }

  runSummary.completedAt = new Date().toISOString();

  let history = [];
  try {
    if (fs.existsSync(runsFile)) history = JSON.parse(fs.readFileSync(runsFile, 'utf8'));
  } catch (e) {}
  history.unshift(runSummary);
  fs.writeFileSync(runsFile, JSON.stringify(history.slice(0, 50), null, 2), 'utf8');

  log(`🏁 Scheduled synchronization completed.`);
  return runSummary;
}

module.exports = { runScheduledSync };
