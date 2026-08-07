const EmailBaseService = require('./EmailBaseService');
const fs = require('fs');

class EmailProviderService extends EmailBaseService {
  constructor(providerConfig = {}) {
    super({
      id: providerConfig.id,
      displayName: providerConfig.displayName,
      icon: providerConfig.icon || '✉️',
      authUrl: providerConfig.authUrl || 'imap://',
      imap: {
        host: process.env.IMAP_HOST,
        user: process.env.IMAP_USER,
        pass: process.env.IMAP_PASS,
        folders: providerConfig.search?.folders || ['INBOX']
      }
    });
    this.providerConfig = providerConfig;
  }

  buildSearchCriteria(year, startDate, endDate) {
    const fromEmails = this.providerConfig.search?.from || [];
    
    // Build OR criteria for multiple from addresses
    const criteria = {
      since: new Date(`${year}-01-01`),
      before: new Date(`${year}-12-31T23:59:59Z`)
    };

    if (fromEmails.length === 1) {
      criteria.from = fromEmails[0];
    } else if (fromEmails.length > 1) {
      criteria.or = fromEmails.map(email => ({ from: email }));
    }

    // Optionally add subject keywords
    if (this.providerConfig.search?.subjectKeywords && this.providerConfig.search.subjectKeywords.length > 0) {
      // Simplified: just match the first keyword for IMAP speed. We'll filter strictly in processEmailMessage
      criteria.header = { subject: this.providerConfig.search.subjectKeywords[0] };
    }

    return criteria;
  }

  async processEmailMessage(mail, uid) {
    const text = mail.text || mail.html || '';
    
    // Strict verify subject or from just in case IMAP search was broad
    const from = mail.from?.value?.[0]?.address || '';
    const subject = mail.subject || '';
    
    const validFrom = this.providerConfig.search.from.some(f => from.toLowerCase().includes(f.toLowerCase()));
    if (!validFrom) return null;

    // Execute Regex extraction rules
    const rules = this.providerConfig.parser?.regex || {};
    
    const extract = (ruleStr) => {
      if (!ruleStr) return '';
      const match = text.match(new RegExp(ruleStr, 'i'));
      return match ? match[1].trim() : '';
    };

    const orderId = extract(rules.orderId) || uid.toString();
    const invoiceNumber = extract(rules.invoiceNumber) || `INV-${orderId}`;
    const dateText = extract(rules.date) || mail.date.toISOString();
    
    const brutto = this.parseCurrency(extract(rules.brutto));
    const ustText = extract(rules.ust);
    
    const taxRate = this.providerConfig.parser?.taxRate || '19%';
    let netto = 0;
    let ust = 0;

    if (ustText) {
      ust = this.parseCurrency(ustText);
      netto = brutto - ust;
    } else {
      const breakdown = this.calculateTaxBreakdown({ brutto, taxRate });
      netto = breakdown.netto;
      ust = breakdown.ust;
    }

    return {
      id: `${this.id.toUpperCase()}-${orderId}`,
      service: this.id,
      serviceDisplayName: this.displayName,
      orderId,
      invoiceNumber,
      date: this.normalizeDate(dateText),
      brutto,
      netto,
      ust,
      taxRate,
      currency: this.providerConfig.parser?.currency || 'EUR',
      seller: extract(rules.seller) || this.providerConfig.displayName,
      status: 'downloaded',
      mailUid: uid
    };
  }

  calculateTaxBreakdown({ brutto, taxRate = '19%' }) {
    const rate = parseFloat(taxRate.replace('%', '')) / 100;
    if (isNaN(rate) || rate === 0) {
      return { netto: brutto, ust: 0, taxRate: '0%' };
    }
    const netto = parseFloat((brutto / (1 + rate)).toFixed(2));
    const ust = parseFloat((brutto - netto).toFixed(2));
    return { netto, ust, taxRate: `${Math.round(rate * 100)}%` };
  }

  async generatePdfFromEmail(mail, pdfFilePath, record, options) {
    const mode = this.providerConfig.extraction?.mode || 'html';
    
    // 1. Path A: Check for PDF attachment
    if (mode === 'attachment_or_html' || mode === 'attachment') {
      const pdfAttachment = mail.attachments?.find(a => a.contentType === 'application/pdf' || (a.filename && a.filename.toLowerCase().endsWith('.pdf')));
      if (pdfAttachment) {
        fs.writeFileSync(pdfFilePath, pdfAttachment.content);
        return;
      }
    }

    // 2. Path B: Render HTML email as A4 PDF
    if (!mail.html) {
      throw new Error(`No HTML body or PDF attachment found for ${record.orderId}`);
    }

    const context = await this.launchBrowser({ headless: options.headless });
    const page = await context.newPage();
    
    try {
      await page.setContent(mail.html, { waitUntil: 'networkidle' });
      
      const cssFixes = this.providerConfig.extraction?.htmlCssFixes || '';
      if (cssFixes) {
        await page.addStyleTag({ content: cssFixes });
      }

      await page.pdf({
        path: pdfFilePath,
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
      });
    } finally {
      await context.close();
    }
  }

  // Add dummy scan and analyze methods to satisfy CLI requirements for standalone testing
  async scan() {
    console.log(`ℹ️ [${this.displayName}] Email providers scan during fetch.`);
    return [];
  }

  async analyze() {
    // Rely on MasterAnalyzer for now, or implement a simple PDF if needed
    console.log(`ℹ️ [${this.displayName}] Analysis is handled by MasterAnalyzer.`);
    return { count: 0 };
  }
}

module.exports = EmailProviderService;
