const BaseService = require('./BaseService');
const ImapService = require('./ImapService');
const path = require('path');
const fs = require('fs');

class EmailBaseService extends BaseService {
  constructor(config = {}) {
    super(config);
    this.imapConfig = config.imap || {};
    this.imapService = null;
  }

  async authenticate({ headless = false } = {}) {
    console.log(`\n======================================================`);
    console.log(`✉️ [${this.displayName}] Verifying IMAP Authentication...`);
    console.log(`======================================================\n`);

    try {
      this.imapService = new ImapService(this.imapConfig);
      await this.imapService.connect();
      console.log(`✅ [${this.displayName}] IMAP authentication successful!`);
      await this.imapService.close();
      return { success: true };
    } catch (e) {
      console.error(`❌ [${this.displayName}] IMAP Authentication error:`, e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Helper to ensure IMAP is connected
   */
  async ensureImapConnected() {
    if (!this.imapService) {
      this.imapService = new ImapService(this.imapConfig);
    }
    if (!this.imapService.client.usable) {
      await this.imapService.connect();
    }
  }

  /**
   * Scans and downloads email invoices.
   * Email scrapers combine scan and fetch because fetching from IMAP is fast.
   */
  async fetch({ all = false, year = null, startDate = null, endDate = null, limit = null, headless = true } = {}) {
    const currentYear = year || new Date().getFullYear().toString();
    console.log(`\n🔍 [${this.displayName}] Scanning & Fetching emails for year ${currentYear}...`);
    
    await this.ensureImapConnected();
    
    let downloaded = 0;
    let skipped = 0;
    
    try {
      // Build IMAP search criteria based on config
      const criteria = this.buildSearchCriteria(currentYear, startDate, endDate);
      const folders = this.imapConfig.folders || ['INBOX'];

      for (const folder of folders) {
        for await (const message of this.imapService.searchAndFetch(criteria, folder)) {
          if (limit && downloaded >= limit) break;
          
          const record = await this.processEmailMessage(message.parsed, message.uid);
          if (!record) continue; // Not a matching invoice

          if (this.isAlreadyDownloaded(record.orderId)) {
            skipped++;
            continue;
          }

          console.log(`📥 Downloading Invoice: ${record.orderId} (${record.date} | ${record.brutto}€)`);
          
          const yearMonth = record.date.substring(0, 7);
          const subfolder = path.join(this.invoicesDir, yearMonth);
          if (!fs.existsSync(subfolder)) fs.mkdirSync(subfolder, { recursive: true });
          
          const pdfFileName = `${record.date}_Order_${record.orderId}.pdf`;
          const pdfFilePath = path.join(subfolder, pdfFileName);
          
          // Generate or save PDF
          await this.generatePdfFromEmail(message.parsed, pdfFilePath, record, { headless });
          
          record.pdfPath = path.relative(path.resolve(this.invoicesDir, '..', '..'), pdfFilePath);
          this.saveLedgerRecord(record);
          downloaded++;
        }
      }

      console.log(`\n✨ [${this.displayName}] Completed: ${downloaded} downloaded, ${skipped} skipped (already cached).`);
      return { downloaded, skipped };
    } finally {
      await this.imapService.close();
    }
  }

  // To be implemented by subclasses
  buildSearchCriteria(year, startDate, endDate) {
    throw new Error('buildSearchCriteria() must be implemented');
  }

  async processEmailMessage(mail, uid) {
    throw new Error('processEmailMessage() must be implemented');
  }

  async generatePdfFromEmail(mail, pdfFilePath, record, options) {
    throw new Error('generatePdfFromEmail() must be implemented');
  }
}

module.exports = EmailBaseService;
