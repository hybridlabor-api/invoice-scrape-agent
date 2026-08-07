const BaseService = require('../base/BaseService');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');

class __SERVICE_CLASS__ extends BaseService {
  constructor(config = {}) {
    super({
      id: '__SERVICE_ID__',
      displayName: '__DISPLAY_NAME__',
      icon: '__ICON__',
      authUrl: '__AUTH_URL__',
      ...config
    });
  }

  /**
   * Step 1: Interactive Browser Authentication & Session Capturing
   */
  async authenticate({ headless = false } = {}) {
    console.log(`\n🔐 [${this.displayName}] Opening browser for authentication...`);
    const context = await this.launchBrowser({ headless });
    const page = context.pages()[0] || await context.newPage();

    try {
      await page.goto(this.authUrl, { waitUntil: 'domcontentloaded' });
      console.log(`👉 Please complete login in the browser window. Waiting for session...`);
      
      // Wait for authenticated indicator (Customize selector for this service)
      await page.waitForFunction(() => {
        return !window.location.href.includes('/login') && !window.location.href.includes('/signin');
      }, { timeout: 0 });

      console.log(`✅ [${this.displayName}] Authentication successful! Profile cached.`);
      return { success: true };
    } catch (e) {
      console.error(`❌ [${this.displayName}] Authentication failed:`, e.message);
      return { success: false, error: e.message };
    } finally {
      await context.close();
    }
  }

  /**
   * Step 2: Scan orders / invoices without downloading
   */
  async scan({ year = null, startDate = null, endDate = null } = {}) {
    console.log(`\n🔍 [${this.displayName}] Scanning orders...`);
    const context = await this.launchBrowser({ headless: true });
    const page = context.pages()[0] || await context.newPage();
    const orders = [];

    try {
      // TODO: Implement order listing pagination and DOM/API scraping
      return orders;
    } finally {
      await context.close();
    }
  }

  /**
   * Step 3: Fetch & Normalize PDF Invoices
   */
  async fetch({ all = false, year = null, startDate = null, endDate = null, limit = null, headless = true } = {}) {
    console.log(`\n⬇️ [${this.displayName}] Fetching invoices...`);
    const context = await this.launchBrowser({ headless });
    const page = context.pages()[0] || await context.newPage();
    let downloadedCount = 0;

    try {
      // TODO: Loop through orders, verify ledger duplicate, download or generate PDF
      return { downloaded: downloadedCount };
    } finally {
      await context.close();
    }
  }

  /**
   * Step 4: Parse & Generate Service Summary PDF
   */
  async analyze() {
    const files = fs.readdirSync(this.invoicesDir).filter(f => f.endsWith('.pdf') && !f.startsWith('Gesamtauflistung'));
    console.log(`\n📊 [${this.displayName}] Analyzing ${files.length} invoice PDFs...`);
    
    // Parse invoices and aggregate totals
    const ledger = this.loadLedger();
    const totalBrutto = ledger.reduce((sum, item) => sum + (item.brutto || 0), 0);
    const totalNetto = ledger.reduce((sum, item) => sum + (item.netto || 0), 0);
    const totalUst = ledger.reduce((sum, item) => sum + (item.ust || 0), 0);

    return { count: files.length, totalBrutto, totalNetto, totalUst };
  }
}

module.exports = __SERVICE_CLASS__;
