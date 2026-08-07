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
  }

  async authenticate({ headless = false } = {}) {
    return new Promise((resolve, reject) => {
      const authScript = path.join(__dirname, 'auth.js');
      const child = fork(authScript, [], { stdio: 'inherit' });
      child.on('exit', (code) => {
        if (code === 0) resolve({ success: true });
        else resolve({ success: false, code });
      });
      child.on('error', reject);
    });
  }

  async scan(options = {}) {
    return new Promise((resolve, reject) => {
      const fetcherScript = path.join(__dirname, 'fetcher.js');
      const child = fork(fetcherScript, ['--scan'], { stdio: 'inherit' });
      child.on('exit', () => resolve(this.loadLedger()));
      child.on('error', reject);
    });
  }

  async fetch(options = {}) {
    const args = [];
    if (options.all) args.push('--all');
    if (options.year) args.push('--year', String(options.year));
    if (options.startDate) args.push('--start', options.startDate);
    if (options.endDate) args.push('--end', options.endDate);
    if (options.limit) args.push('--limit', String(options.limit));

    return new Promise((resolve, reject) => {
      const fetcherScript = path.join(__dirname, 'fetcher.js');
      const child = fork(fetcherScript, args, { stdio: 'inherit' });
      child.on('exit', (code) => {
        const ledger = this.loadLedger();
        resolve({ downloaded: ledger.length, success: code === 0 });
      });
      child.on('error', reject);
    });
  }

  async analyze() {
    return new Promise((resolve, reject) => {
      const analyzerScript = path.join(__dirname, 'analyzer.js');
      const child = fork(analyzerScript, [], { stdio: 'inherit' });
      child.on('exit', (code) => {
        const ledger = this.loadLedger();
        const totalBrutto = ledger.reduce((s, i) => s + (i.brutto || 0), 0);
        resolve({ count: ledger.length, totalBrutto, success: code === 0 });
      });
      child.on('error', reject);
    });
  }
}

module.exports = AliExpressService;
