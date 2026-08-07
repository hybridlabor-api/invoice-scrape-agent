const BaseService = require('../base/BaseService');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

class AmazonService extends BaseService {
  constructor(config = {}) {
    const domain = config.domain || process.env.AMAZON_DOMAIN || 'amazon.de';
    super({
      id: 'amazon',
      displayName: domain.includes('.de') ? 'Amazon.de' : 'Amazon',
      icon: '📦',
      authUrl: `https://www.${domain}/ap/signin`,
      ...config
    });

    this.domain = domain;
    this.baseUrl = `https://www.${domain}`;
    this.ordersUrl = `${this.baseUrl}/your-orders/orders`;
  }

  /**
   * Helper to parse order card text extracted from DOM
   */
  parseOrderCardData({ orderId, dateText, totalText, sellerText = 'Amazon EU S.a.r.l.' }) {
    const date = this.normalizeDate(dateText);
    const brutto = this.parseCurrency(totalText);
    const taxBreakdown = this.calculateTaxBreakdown({ brutto, taxRate: '19%' });

    return {
      id: `AMZ-${orderId}`,
      service: this.id,
      serviceDisplayName: this.displayName,
      orderId,
      invoiceNumber: `INV-${orderId}`,
      date,
      brutto,
      netto: taxBreakdown.netto,
      ust: taxBreakdown.ust,
      taxRate: taxBreakdown.taxRate,
      currency: 'EUR',
      seller: sellerText,
      status: 'downloaded'
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

  /**
   * Step 1: Authentication & OTP handling
   */
  async authenticate({ headless = false } = {}) {
    console.log(`\n======================================================`);
    console.log(`🔐 [Amazon] Starting Authentication for ${this.domain}`);
    console.log(`======================================================\n`);

    const context = await this.launchBrowser({ headless });
    const page = context.pages()[0] || await context.newPage();

    try {
      await page.goto(this.ordersUrl, { waitUntil: 'domcontentloaded' });
      console.log(`🌐 Waiting for login completion (including 2FA/Passkey)...`);

      // Wait until user reaches your-orders or account page
      await page.waitForFunction(() => {
        return window.location.href.includes('/your-orders') || 
               window.location.href.includes('/order-history') ||
               document.querySelector('#nav-orders') ||
               document.querySelector('.your-orders');
      }, { timeout: 0 });

      console.log(`✅ [Amazon] Successfully authenticated and profile persisted!\n`);
      return { success: true };
    } catch (e) {
      console.error(`❌ [Amazon] Authentication error:`, e.message);
      return { success: false, error: e.message };
    } finally {
      await context.close();
    }
  }

  /**
   * Step 2: Scan orders list
   */
  async scan({ year = new Date().getFullYear().toString(), maxPages = 20 } = {}) {
    console.log(`\n🔍 [Amazon] Scanning orders for year ${year}...`);
    const context = await this.launchBrowser({ headless: false });
    const page = context.pages()[0] || await context.newPage();
    const orders = [];

    try {
      const targetUrl = `${this.ordersUrl}?timeFilter=year-${year}`;
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

      let currentPage = 1;
      while (currentPage <= maxPages) {
        console.log(`📄 Scanning page ${currentPage}...`);
        await page.waitForTimeout(1500);

        const pageOrders = await page.evaluate(() => {
          const cards = document.querySelectorAll('.order-card, .yo-card-manage, [data-component-type="orderCard"]');
          const results = [];

          cards.forEach(card => {
            const text = card.innerText || '';
            const orderIdMatch = text.match(/(?:BESTELLNR\.|Order #)\s*([A-Z0-9-]+)/i) || text.match(/([0-9]{3}-[0-9]{7}-[0-9]{7})/);
            const dateMatch = text.match(/(?:BESTELLUNG AUFGEGEBEN|ORDER PLACED)\n([^\n]+)/i);
            const totalMatch = text.match(/(?:SUMME|TOTAL)\n([0-9,.]+)\s*€/i) || text.match(/([0-9,.]+)\s*€/i);
            
            const orderId = orderIdMatch ? orderIdMatch[1].trim() : '';
            const dateText = dateMatch ? dateMatch[1].trim() : '';
            const totalText = totalMatch ? totalMatch[1].trim() : '';
            
            if (orderId) {
              results.push({ orderId, dateText, totalText });
            }
          });
          return results;
        });

        for (const raw of pageOrders) {
          const record = this.parseOrderCardData(raw);
          orders.push(record);
        }

        // Check next page pagination
        const nextBtn = await page.$('ul.a-pagination li.a-last:not(.a-disabled) a');
        if (nextBtn) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            nextBtn.click()
          ]);
          currentPage++;
        } else {
          break;
        }
      }

      const oldest = orders.length > 0 ? orders[orders.length - 1].date : '-';
      const newest = orders.length > 0 ? orders[0].date : '-';
      const totalAmount = orders.reduce((sum, o) => sum + (parseFloat(o.brutto) || 0), 0);

      console.log("\n    ======================================================");
      console.log("              📊 KONTO-ANALYSE ERGEBNIS 📊              ");
      console.log("    ======================================================");
      console.log(`    📦 Bestellungen gesamt:    ${orders.length}`);
      console.log(`    📅 Älteste Bestellung:     ${oldest}`);
      console.log(`    📅 Neueste Bestellung:     ${newest}`);
      console.log(`    💰 Gesamtausgaben erfasst: ${totalAmount.toFixed(2)} €\n`);

      return orders;
    } finally {
      await context.close();
    }
  }

  /**
   * Step 3: Fetch & Normalize PDF Invoices
   */
  async fetch({ all = false, year = null, startDate = null, endDate = null, limit = null, headless = false } = {}) {
    const currentYear = year || new Date().getFullYear().toString();
    const orders = await this.scan({ year: currentYear });
    
    console.log(`\n⬇️ [Amazon] Processing ${orders.length} invoices...`);
    const context = await this.launchBrowser({ headless });
    const page = context.pages()[0] || await context.newPage();
    let downloaded = 0;
    let skipped = 0;

    try {
      for (const order of orders) {
        if (limit && downloaded >= limit) break;

        if (this.isAlreadyDownloaded(order.orderId)) {
          skipped++;
          continue;
        }

        const safeDate = order.date || 'UNKNOWN-DATE';
        const yearMonth = safeDate.substring(0, 7);
        const subfolder = path.join(this.invoicesDir, yearMonth);
        if (!fs.existsSync(subfolder)) fs.mkdirSync(subfolder, { recursive: true });

        const pdfFileName = `${safeDate}_Order_${order.orderId}.pdf`;
        const pdfFilePath = path.join(subfolder, pdfFileName);
        const relPdfPath = path.relative(path.resolve(this.invoicesDir, '..', '..'), pdfFilePath);

        console.log(`📥 Downloading: ${order.orderId} (${order.date} | ${order.brutto}€)`);

        try {
          const popoverUrl = `${this.baseUrl}/your-orders/invoice/popover?orderId=${order.orderId}`;
          const popoverRes = await page.request.get(popoverUrl);
          const popoverHtml = await popoverRes.text();
          
          const nativePdfMatch = popoverHtml.match(/\/documents\/download\/[a-f0-9-]+\/invoice\.pdf/);
          
          if (nativePdfMatch) {
            console.log(`   🔗 Found native PDF invoice! Downloading...`);
            const downloadUrl = `${this.baseUrl}${nativePdfMatch[0]}`;
            const pdfRes = await page.request.get(downloadUrl);
            const pdfBuffer = await pdfRes.body();
            fs.writeFileSync(pdfFilePath, pdfBuffer);
          } else {
            console.log(`   🖨️ No native PDF found. Rendering HTML fallback summary...`);
            const printUrl = `${this.baseUrl}/gp/css/summary/print.html?orderID=${order.orderId}`;
            await page.goto(printUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await page.pdf({
              path: pdfFilePath,
              format: 'A4',
              printBackground: true,
              margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
            });
          }

          order.pdfPath = relPdfPath;
          this.saveLedgerRecord(order);
          downloaded++;
          await page.waitForTimeout(1000);
        } catch (err) {
          console.warn(`⚠️ Failed to download invoice for ${order.orderId}:`, err.message);
        }
      }

      console.log(`\n✨ [Amazon] Completed: ${downloaded} downloaded, ${skipped} skipped (already cached).`);
      return { downloaded, skipped, total: orders.length };
    } finally {
      await context.close();
    }
  }

  /**
   * Step 4: Accounting PDF Table Summary Generation
   */
  async analyze() {
    const ledger = this.loadLedger();
    if (!ledger || ledger.length === 0) {
      console.log(`ℹ️ No Amazon ledger entries found to analyze.`);
      return { count: 0, totalBrutto: 0, totalNetto: 0, totalUst: 0 };
    }

    const outputFile = path.join(this.invoicesDir, 'Gesamtauflistung_Amazon.pdf');
    const sorted = [...ledger].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const totalBrutto = sorted.reduce((sum, item) => sum + (item.brutto || 0), 0);
    const totalNetto = sorted.reduce((sum, item) => sum + (item.netto || 0), 0);
    const totalUst = sorted.reduce((sum, item) => sum + (item.ust || 0), 0);

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    const stream = fs.createWriteStream(outputFile);
    doc.pipe(stream);

    // Title & Header
    doc.fontSize(18).font('Helvetica-Bold').text('Amazon Rechnungsübersicht', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').text(
      `Erstellt am ${new Date().toLocaleDateString('de-DE')} | ${sorted.length} Rechnungen | Brutto Gesamt: ${totalBrutto.toFixed(2)} €`,
      { align: 'center' }
    );
    doc.moveDown(1);

    const cols = [
      { label: 'Nr.', width: 30 },
      { label: 'Datum', width: 75 },
      { label: 'Bestellnummer', width: 170 },
      { label: 'Netto (€)', width: 75 },
      { label: 'USt (€)', width: 70 },
      { label: 'Brutto (€)', width: 75 },
      { label: 'USt%', width: 45 },
      { label: 'Händler', width: 210 }
    ];

    let x = 30;
    let y = doc.y;
    const rowHeight = 18;

    // Table Header
    doc.fontSize(8).font('Helvetica-Bold');
    doc.rect(x, y, cols.reduce((s, c) => s + c.width, 0), rowHeight).fill('#232f3e');
    let cx = x;
    for (const col of cols) {
      doc.fillColor('#fff').text(col.label, cx + 3, y + 4, { width: col.width - 6 });
      cx += col.width;
    }
    y += rowHeight;

    // Rows
    doc.font('Helvetica').fontSize(7);
    for (let i = 0; i < sorted.length; i++) {
      if (y > 540) {
        doc.addPage();
        y = 30;
      }

      const inv = sorted[i];
      const bg = i % 2 === 0 ? '#f8f9fa' : '#fff';
      doc.rect(x, y, cols.reduce((s, c) => s + c.width, 0), rowHeight).fill(bg);
      doc.fillColor('#000');

      const values = [
        (i + 1).toString(),
        inv.date || '-',
        inv.orderId || '-',
        (inv.netto || 0).toFixed(2),
        (inv.ust || 0).toFixed(2),
        (inv.brutto || 0).toFixed(2),
        inv.taxRate || '19%',
        inv.seller || 'Amazon EU S.a.r.l.'
      ];

      cx = x;
      for (let j = 0; j < cols.length; j++) {
        doc.text(values[j], cx + 3, y + 4, { width: cols[j].width - 6 });
        cx += cols[j].width;
      }
      y += rowHeight;
    }

    // Totals Row
    y += 5;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.rect(x, y, cols.reduce((s, c) => s + c.width, 0), rowHeight + 2).fill('#ff9900');
    doc.fillColor('#000');
    cx = x;
    doc.text('GESAMT', cx + 3, y + 5, { width: cols[0].width + cols[1].width + cols[2].width - 6 });
    cx += cols[0].width + cols[1].width + cols[2].width;
    doc.text(totalNetto.toFixed(2), cx + 3, y + 5, { width: cols[3].width - 6 });
    cx += cols[3].width;
    doc.text(totalUst.toFixed(2), cx + 3, y + 5, { width: cols[4].width - 6 });
    cx += cols[4].width;
    doc.text(totalBrutto.toFixed(2), cx + 3, y + 5, { width: cols[5].width - 6 });

    doc.end();
    await new Promise(resolve => stream.on('finish', resolve));

    // Export CSV
    const csvFile = path.join(this.invoicesDir, 'amazon_ledger.csv');
    const csvHeaders = ['Nr', 'Datum', 'Bestellnummer', 'Händler', 'Netto (EUR)', 'USt (EUR)', 'Brutto (EUR)', 'Steuersatz', 'PDF-Datei'];
    const csvRows = sorted.map((r, i) => [
      i + 1,
      `"${r.date || '-'}"`,
      `"${r.orderId || '-'}"`,
      `"${(r.seller || 'Amazon EU S.a.r.l.').replace(/"/g, '""')}"`,
      (r.netto || 0).toFixed(2),
      (r.ust || 0).toFixed(2),
      (r.brutto || 0).toFixed(2),
      `"${r.taxRate || '19%'}"`,
      `"${r.pdfPath || ''}"`
    ]);
    fs.writeFileSync(csvFile, '\ufeff' + [csvHeaders.join(';'), ...csvRows.map(row => row.join(';'))].join('\n'), 'utf8');

    // Export HTML (Formatted table for Excel copy/paste)
    const htmlFile = path.join(this.invoicesDir, 'amazon_ledger.html');
    let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Amazon Rechnungsübersicht</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1e293b; background-color: #f8fafc; }
  .card { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
  h2 { color: #0f172a; margin-top: 0; }
  table { border-collapse: collapse; width: 100%; margin-top: 16px; font-size: 13px; }
  th, td { border: 1px solid #e2e8f0; padding: 10px 14px; text-align: left; }
  th { background-color: #232f3e; color: white; font-weight: 600; }
  tr:nth-child(even) { background-color: #f1f5f9; }
  .totals { font-weight: bold; background-color: #ff9900; color: #111; }
  .text-right { text-align: right; }
</style>
</head>
<body>
<div class="card">
  <h2>📦 Amazon Rechnungsübersicht</h2>
  <p><strong>Erstellt am:</strong> ${new Date().toLocaleDateString('de-DE')} | <strong>Rechnungen:</strong> ${sorted.length}</p>
  <table>
    <thead>
      <tr>
        <th>Nr.</th>
        <th>Datum</th>
        <th>Bestellnummer</th>
        <th>Händler</th>
        <th class="text-right">Netto (€)</th>
        <th class="text-right">USt (€)</th>
        <th class="text-right">Brutto (€)</th>
        <th>Steuersatz</th>
      </tr>
    </thead>
    <tbody>`;

    sorted.forEach((r, i) => {
      html += `
      <tr>
        <td>${i + 1}</td>
        <td>${r.date || '-'}</td>
        <td>${r.orderId || '-'}</td>
        <td>${r.seller || 'Amazon EU S.a.r.l.'}</td>
        <td class="text-right">${(r.netto || 0).toFixed(2).replace('.', ',')}</td>
        <td class="text-right">${(r.ust || 0).toFixed(2).replace('.', ',')}</td>
        <td class="text-right">${(r.brutto || 0).toFixed(2).replace('.', ',')}</td>
        <td>${r.taxRate || '19%'}</td>
      </tr>`;
    });

    html += `
      <tr class="totals">
        <td colspan="4">GESAMTSUMME</td>
        <td class="text-right">${totalNetto.toFixed(2).replace('.', ',')}</td>
        <td class="text-right">${totalUst.toFixed(2).replace('.', ',')}</td>
        <td class="text-right">${totalBrutto.toFixed(2).replace('.', ',')}</td>
        <td>-</td>
      </tr>
    </tbody>
  </table>
</div>
</body>
</html>`;
    fs.writeFileSync(htmlFile, html, 'utf8');

    console.log(`✅ [Amazon] PDF Summary generated: ${outputFile}`);
    console.log(`✅ [Amazon] CSV Ledger generated:  ${csvFile}`);
    console.log(`✅ [Amazon] HTML Ledger generated: ${htmlFile}`);

    return { count: sorted.length, totalBrutto, totalNetto, totalUst, pdfFile: outputFile, csvFile, htmlFile };
  }
}

module.exports = AmazonService;
