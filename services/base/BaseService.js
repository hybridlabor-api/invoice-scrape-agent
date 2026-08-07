const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const MONTH_MAP = {
  'jan': 0, 'feb': 1, 'mar': 2, 'mär': 2, 'apr': 3, 'may': 4, 'mai': 4,
  'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'okt': 9, 'nov': 10, 'dec': 11, 'dez': 11
};

class BaseService {
  /**
   * @param {Object} config
   * @param {string} config.id - Service unique ID (e.g. 'amazon', 'uber')
   * @param {string} config.displayName - Display name (e.g. 'Amazon.de')
   * @param {string} config.icon - Emoji icon (e.g. '📦')
   * @param {string} [config.authUrl] - Direct login URL
   * @param {string} [config.baseDir] - Project root directory override
   */
  constructor({ id, displayName, icon, authUrl = '', baseDir = null }) {
    if (!id) throw new Error('BaseService requires a valid "id"');
    this.id = id;
    this.displayName = displayName || id;
    this.icon = icon || '🧾';
    this.authUrl = authUrl;

    const root = baseDir || path.resolve(__dirname, '../../');
    this.invoicesDir = path.join(root, 'invoices', this.id);
    this.profileDir = path.join(root, '.auth-profile', this.id);
    this.ledgerFile = path.join(this.invoicesDir, `${this.id}_ledger.json`);

    this.ensureDirectories();
  }

  ensureDirectories() {
    if (!fs.existsSync(this.invoicesDir)) fs.mkdirSync(this.invoicesDir, { recursive: true });
    if (!fs.existsSync(this.profileDir)) fs.mkdirSync(this.profileDir, { recursive: true });
  }

  /**
   * Load JSON ledger for this service.
   * @returns {Array<Object>}
   */
  loadLedger() {
    try {
      if (fs.existsSync(this.ledgerFile)) {
        const raw = fs.readFileSync(this.ledgerFile, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn(`[${this.id}] Warning loading ledger:`, e.message);
    }
    return [];
  }

  /**
   * Save full ledger atomically.
   * @param {Array<Object>} ledger
   */
  saveLedger(ledger) {
    this.ensureDirectories();
    const tempFile = `${this.ledgerFile}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(ledger, null, 2), 'utf8');
    fs.renameSync(tempFile, this.ledgerFile);
  }

  /**
   * Add or update an invoice record in the ledger.
   * @param {Object} record
   */
  saveLedgerRecord(record) {
    const ledger = this.loadLedger();
    const recordId = record.id || record.orderId || record.invoiceNumber;
    const idx = ledger.findIndex(item => (item.id || item.orderId || item.invoiceNumber) === recordId);

    const completeRecord = {
      service: this.id,
      serviceDisplayName: this.displayName,
      updatedAt: new Date().toISOString(),
      ...record
    };

    if (idx >= 0) {
      ledger[idx] = { ...ledger[idx], ...completeRecord };
    } else {
      ledger.push(completeRecord);
    }
    this.saveLedger(ledger);
  }

  /**
   * Check if invoice/order is already saved on disk.
   * @param {string} orderId
   * @returns {boolean}
   */
  isAlreadyDownloaded(orderId) {
    if (!orderId) return false;
    const ledger = this.loadLedger();
    return ledger.some(item => {
      const match = (item.id === orderId || item.orderId === orderId);
      if (!match || !item.pdfPath) return false;
      const fullPath = path.isAbsolute(item.pdfPath) ? item.pdfPath : path.resolve(this.invoicesDir, '..', '..', item.pdfPath);
      return fs.existsSync(fullPath);
    });
  }

  /**
   * Normalize arbitrary date strings into YYYY-MM-DD.
   * @param {string|number|Date} rawDate
   * @returns {string}
   */
  normalizeDate(rawDate) {
    if (!rawDate) return new Date().toISOString().slice(0, 10);

    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
      return rawDate.toISOString().slice(0, 10);
    }

    if (typeof rawDate === 'number' || /^\d{10,13}$/.test(String(rawDate).trim())) {
      const num = Number(rawDate);
      const ts = num < 10000000000 ? num * 1000 : num;
      const d = new Date(ts);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }

    const str = String(rawDate).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
    if (/^\d{4}\.\d{2}\.\d{2}/.test(str)) return str.slice(0, 10).replace(/\./g, '-');

    // German format: DD.MM.YYYY
    const dmy = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }

    // English format: "Month DD, YYYY" or "DD. Month YYYY"
    const m1 = str.match(/([A-Za-zäöüÄÖÜ]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/);
    if (m1) {
      const mStr = m1[1].toLowerCase().slice(0, 3);
      const mIdx = MONTH_MAP[mStr] !== undefined ? MONTH_MAP[mStr] : 0;
      return `${m1[3]}-${String(mIdx + 1).padStart(2, '0')}-${m1[2].padStart(2, '0')}`;
    }

    const m2 = str.match(/(\d{1,2})\.?\s*([A-Za-zäöüÄÖÜ]{3,})\.?\s+(\d{4})/);
    if (m2) {
      const mStr = m2[2].toLowerCase().slice(0, 3);
      const mIdx = MONTH_MAP[mStr] !== undefined ? MONTH_MAP[mStr] : 0;
      return `${m2[3]}-${String(mIdx + 1).padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
    }

    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Parse localized currency string into a float number.
   * @param {string|number} rawAmount
   * @returns {number}
   */
  parseCurrency(rawAmount) {
    if (typeof rawAmount === 'number') return rawAmount;
    if (!rawAmount) return 0;
    const str = String(rawAmount).replace(/[^0-9.,-]/g, '').trim();
    if (!str) return 0;

    // Detect format: 1.234,56 vs 1,234.56 vs 24.99 vs 24,99
    if (str.includes(',') && str.includes('.')) {
      if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
        // European: 1.234,56 -> 1234.56
        return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
      } else {
        // US: 1,234.56 -> 1234.56
        return parseFloat(str.replace(/,/g, '')) || 0;
      }
    } else if (str.includes(',')) {
      // European decimal comma: 24,99 -> 24.99
      return parseFloat(str.replace(',', '.')) || 0;
    }
    return parseFloat(str) || 0;
  }

  /**
   * Launch stealth browser with persistent authentication context.
   * @param {Object} [options]
   * @param {boolean} [options.headless=false]
   * @param {number} [options.slowMo=0]
   * @returns {Promise<import('playwright').BrowserContext>}
   */
  async launchBrowser({ headless = false, slowMo = 0 } = {}) {
    this.ensureDirectories();
    const args = [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--window-position=0,0',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list'
    ];

    let context;
    try {
      context = await chromium.launchPersistentContext(this.profileDir, {
        headless,
        slowMo,
        channel: 'chrome',
        viewport: { width: 1440, height: 900 },
        acceptDownloads: true,
        args,
        ignoreDefaultArgs: ['--enable-automation']
      });
    } catch (e) {
      context = await chromium.launchPersistentContext(this.profileDir, {
        headless,
        slowMo,
        viewport: { width: 1440, height: 900 },
        acceptDownloads: true,
        args
      });
    }

    // Bypass navigator.webdriver detection
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    return context;
  }

  /* Abstract lifecycle methods to be overridden by subclasses */
  async authenticate(options = {}) { throw new Error(`${this.displayName} must implement authenticate()`); }
  async scan(options = {}) { throw new Error(`${this.displayName} must implement scan()`); }
  async fetch(options = {}) { throw new Error(`${this.displayName} must implement fetch()`); }
  async analyze(options = {}) { throw new Error(`${this.displayName} must implement analyze()`); }
}

module.exports = BaseService;
