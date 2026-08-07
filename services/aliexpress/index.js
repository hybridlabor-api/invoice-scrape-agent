const BaseService = require('../base/BaseService');
const { fork } = require('child_process');
const path = require('path');

class AliExpressService extends BaseService {
  constructor(config = {}) {
    super({
      id: 'aliexpress',
      displayName: 'AliExpress',
      icon: '🛍️',
      authUrl: 'https://www.aliexpress.com',
      ...config
    });
    this.currentChild = null;
  }

  _runForked(scriptPath, args = []) {
    return new Promise((resolve, reject) => {
      const child = fork(scriptPath, args, {
        stdio: ['inherit', 'pipe', 'pipe', 'ipc']
      });
      this.currentChild = child;

      if (child.stdout) {
        child.stdout.on('data', (data) => {
          process.stdout.write(data);
        });
      }
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          process.stderr.write(data);
        });
      }

      child.on('exit', (code) => {
        this.currentChild = null;
        resolve(code);
      });
      child.on('error', (err) => {
        this.currentChild = null;
        reject(err);
      });
    });
  }

  async authenticate({ headless = false } = {}) {
    const authScript = path.join(__dirname, 'auth.js');
    const code = await this._runForked(authScript, []);
    return { success: code === 0, code };
  }

  async scan(options = {}) {
    const args = ['--scan'];
    if (options.year) args.push('--year', String(options.year));
    if (options.startDate) args.push('--start', options.startDate);
    if (options.endDate) args.push('--end', options.endDate);
    if (options.rescan) args.push('--rescan');

    const fetcherScript = path.join(__dirname, 'fetcher.js');
    await this._runForked(fetcherScript, args);
    return this.loadLedger();
  }

  async fetch(options = {}) {
    const args = [];
    if (options.all) args.push('--all');
    if (options.year) args.push('--year', String(options.year));
    if (options.startDate) args.push('--start', options.startDate);
    if (options.endDate) args.push('--end', options.endDate);
    if (options.limit) args.push('--limit', String(options.limit));
    if (options.rescan) args.push('--rescan');
    if (options.includeExpired) args.push('--include-expired');

    const fetcherScript = path.join(__dirname, 'fetcher.js');
    const code = await this._runForked(fetcherScript, args);
    const ledger = this.loadLedger();
    return { downloaded: ledger.length, success: code === 0 };
  }

  async analyze() {
    const analyzerScript = path.join(__dirname, 'analyzer.js');
    const code = await this._runForked(analyzerScript, []);
    const ledger = this.loadLedger();
    const totalBrutto = ledger.reduce((s, i) => s + (i.brutto || 0), 0);
    return { count: ledger.length, totalBrutto, success: code === 0 };
  }
}

module.exports = AliExpressService;
