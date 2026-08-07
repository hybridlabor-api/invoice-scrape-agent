const BaseService = require('../base/BaseService');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const pdf = require('pdf-parse');

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
   * Helper to extract invoice number and tax/invoice dates from PDF buffer or text
   */
  async extractInvoiceDetails(pdfInput, orderId = '') {
    let invoiceNumber = null;
    let invoiceDate = null;
    let taxDate = null;

    try {
      let text = '';
      if (typeof pdfInput === 'string') {
        text = pdfInput;
      } else if (Buffer.isBuffer(pdfInput)) {
        const data = await pdf(pdfInput);
        text = data.text || '';
      }

      // 1. Amazon EU S.a.r.l. / Marketplace standard label patterns
      const matchInv = text.match(/(?:Rechnungsnummer|Quittungsnummer|Gutschriftsnummer|Rechnungs-Nr\.?|Rechnung\s*Nr\.?|Invoice\s*(?:Number|ID|#)?|Beleg-Nr\.?)[\s:]*([A-Za-z0-9\/-]{4,})/i);
      if (matchInv && !['datum', 'seite', 'bestell', 'kunden', 'rechnungsdatum'].includes(matchInv[1].toLowerCase())) {
        invoiceNumber = matchInv[1].trim();
      }

      // 2. Amazon S.a.r.l direct header format: e.g. "Rechnung LU42MG7O5AEUI" or "Rechnung DE41IAJ12AEUI"
      if (!invoiceNumber) {
        const matchAmzDirect = text.match(/(?:Rechnung|Quittung|Gutschrift|Invoice)\s+([A-Z]{2}[0-9A-Z]{8,}(?:AEUI)?)/i);
        if (matchAmzDirect) {
          invoiceNumber = matchAmzDirect[1].trim();
        }
      }

      // 3. Tabular invoice patterns: e.g. "R2024-1232141 02.06.2024 ... Rechnungs-Nr: Datum:"
      if (!invoiceNumber) {
        const matchTableInv = text.match(/([A-Z0-9-]{5,})\s+\d{2}\.\d{2}\.\d{4}\s+[A-Z0-9-]+\s+[0-9-]+\s+.*Rechnungs-Nr/s);
        if (matchTableInv) {
          invoiceNumber = matchTableInv[1].trim();
        }
      }

      // 4. Look for generic prefix codes
      if (!invoiceNumber) {
        const genericCodeMatch = text.match(/\b((?:INV|DOC|AEU|AUDDE|DS-AEU|REC|RG|RE)-[A-Za-z0-9-]+)\b/i);
        if (genericCodeMatch) {
          invoiceNumber = genericCodeMatch[1].trim();
        }
      }

      // Extract tax / invoice dates if available
      const steuerMatch = text.match(/Steuerdatum[:\s]+(\d{1,2})\.(\d{1,2})\.(\d{4})/i);
      const rechnungMatch = text.match(/(?:Rechnungsdatum|Lieferdatum)[:\s/]+(\d{1,2})\.?\s*([A-Za-zäöüÄÖÜ]+|\d{1,2})\.?\s*(\d{4})/i);
      if (steuerMatch) {
        taxDate = `${steuerMatch[3]}-${steuerMatch[2].padStart(2, '0')}-${steuerMatch[1].padStart(2, '0')}`;
      }
      if (rechnungMatch) {
        invoiceDate = this.normalizeDate(`${rechnungMatch[1]} ${rechnungMatch[2]} ${rechnungMatch[3]}`);
      }
    } catch (err) {
      console.warn(`[Amazon] PDF text extraction warning:`, err.message);
    }

    if (!invoiceNumber || invoiceNumber.length < 3) {
      invoiceNumber = `INV-${orderId}`;
    }

    // Sanitize for filesystem
    invoiceNumber = invoiceNumber.replace(/[\/\\:*?"<>|]/g, '_');

    return { invoiceNumber, invoiceDate, taxDate };
  }

  /**
   * Split a multi-invoice PDF buffer into individual invoices and extract metadata per sub-invoice
   */
  async splitAndExtractInvoices(pdfBuffer, order = {}) {
    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
      return [];
    }

    try {
      // 1. Render page by page to inspect text and page count
      const pageTexts = [];
      await pdf(pdfBuffer, {
        pagerender: (pageData) => {
          return pageData.getTextContent().then(textContent => {
            const text = textContent.items.map(i => i.str).join(' ');
            pageTexts.push(text);
            return text;
          });
        }
      });

      // 2. If single page or empty, extract directly
      if (pageTexts.length <= 1) {
        const details = await this.extractInvoiceDetails(pdfBuffer, order.orderId);
        return [{
          pdfBuffer,
          invoiceNumber: details.invoiceNumber,
          taxDate: details.taxDate,
          invoiceDate: details.invoiceDate,
          brutto: order.brutto,
          netto: order.netto,
          ust: order.ust,
          taxRate: order.taxRate,
          seller: order.seller
        }];
      }

      // 3. Group pages: Check if new invoice starts on each page
      const invoiceGroups = [];
      let currentGroup = [];

      pageTexts.forEach((text, pageIndex) => {
        const isPageOne = /(?:Seite\s*1\s*von|Page\s*1\s*of)/i.test(text);
        if (isPageOne && currentGroup.length > 0) {
          invoiceGroups.push(currentGroup);
          currentGroup = [pageIndex];
        } else {
          currentGroup.push(pageIndex);
        }
      });
      if (currentGroup.length > 0) {
        invoiceGroups.push(currentGroup);
      }

      // If only 1 group found, return the whole PDF
      if (invoiceGroups.length <= 1) {
        const details = await this.extractInvoiceDetails(pdfBuffer, order.orderId);
        return [{
          pdfBuffer,
          invoiceNumber: details.invoiceNumber,
          taxDate: details.taxDate,
          invoiceDate: details.invoiceDate,
          brutto: order.brutto,
          netto: order.netto,
          ust: order.ust,
          taxRate: order.taxRate,
          seller: order.seller
        }];
      }

      // Multiple invoices detected! Split using pdf-lib
      const { PDFDocument: PDFLibDoc } = require('pdf-lib');
      const srcDoc = await PDFLibDoc.load(pdfBuffer);
      const results = [];

      for (let i = 0; i < invoiceGroups.length; i++) {
        const pageIndices = invoiceGroups[i];
        const subDoc = await PDFLibDoc.create();
        const copiedPages = await subDoc.copyPages(srcDoc, pageIndices);
        copiedPages.forEach(p => subDoc.addPage(p));

        const subBytes = await subDoc.save();
        const subBuffer = Buffer.from(subBytes);
        const subData = await pdf(subBuffer);
        const subText = subData.text || '';

        // Extract metadata for sub-invoice
        const details = await this.extractInvoiceDetails(subText, `${order.orderId || 'ORDER'}-${i + 1}`);

        // Extract amounts specifically from subText if present
        const totalMatch = subText.match(/(?:Gesamtpreis|Zahlbetrag|Endbetrag|Gesamtbetrag|Rechnungsbetrag)[\s:]*(\d+[,.]\d{2})\s*€?/i);
        const dateMatch = subText.match(/(?:Rechnungsdatum|Lieferdatum|Bestelldatum)[\s:\/\n]*(\d{1,2}\.\d{1,2}\.\d{4})/i);
        const sellerMatch = subText.match(/Verkauft von\s+([^\n\r]+)/i);
        const ustGesamtMatch = subText.match(/USt\.\s*Gesamt[\s\u00a0]*(\d+[,.]\d{2})\s*€[\s\u00a0]*(\d+[,.]\d{2})\s*€/i);

        let subBrutto = totalMatch ? this.parseCurrency(totalMatch[1]) : order.brutto;
        let subNetto = ustGesamtMatch ? this.parseCurrency(ustGesamtMatch[1]) : null;
        let subUst = ustGesamtMatch ? this.parseCurrency(ustGesamtMatch[2]) : null;
        let subTaxRate = '19%';

        if (subBrutto && (!subNetto || !subUst)) {
          const breakdown = this.calculateTaxBreakdown({ brutto: subBrutto, taxRate: '19%' });
          subNetto = breakdown.netto;
          subUst = breakdown.ust;
        }

        let subDate = dateMatch ? this.normalizeDate(dateMatch[1]) : (details.invoiceDate || order.date);
        let subSeller = sellerMatch ? sellerMatch[1].trim() : (order.seller || 'Amazon EU S.a.r.l.');

        results.push({
          pdfBuffer: subBuffer,
          invoiceNumber: details.invoiceNumber,
          taxDate: details.taxDate || subDate,
          invoiceDate: details.invoiceDate || subDate,
          date: subDate,
          brutto: subBrutto,
          netto: subNetto,
          ust: subUst,
          taxRate: subTaxRate,
          seller: subSeller
        });
      }

      return results;
    } catch (err) {
      console.warn('[Amazon] Error splitting multi-invoice PDF, falling back to single:', err.message);
      const details = await this.extractInvoiceDetails(pdfBuffer, order.orderId);
      return [{
        pdfBuffer,
        invoiceNumber: details.invoiceNumber,
        taxDate: details.taxDate,
        invoiceDate: details.invoiceDate,
        brutto: order.brutto,
        netto: order.netto,
        ust: order.ust,
        taxRate: order.taxRate,
        seller: order.seller
      }];
    }
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
    this.abortRequested = false;
    const context = await this.launchBrowser({ headless: false });
    const page = context.pages()[0] || await context.newPage();
    const orders = [];

    try {
      const targetUrl = `${this.ordersUrl}?timeFilter=year-${year}`;
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

      let currentPage = 1;
      while (currentPage <= maxPages) {
        if (this.abortRequested) {
          console.log('🛑 Amazon Scan abgebrochen.');
          break;
        }
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
      await context.close().catch(() => {});
    }
  }

  /**
   * Helper to resolve a list of calendar years to scan based on inputs
   */
  resolveTargetYears({ year = null, startDate = null, endDate = null, all = false } = {}) {
    const currentYear = new Date().getFullYear();
    
    if (year) {
      const yearStr = String(year).trim();
      const rangeMatch = yearStr.match(/^(\d{4})\s*[-..]+\s*(\d{4})$/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        const minYear = Math.min(start, end);
        const maxYear = Math.max(start, end);
        const years = [];
        for (let y = maxYear; y >= minYear; y--) {
          years.push(String(y));
        }
        return years;
      }
      if (yearStr.includes(',')) {
        return yearStr.split(',').map(y => y.trim()).filter(y => /^\d{4}$/.test(y));
      }
      if (/^\d{4}$/.test(yearStr)) {
        return [yearStr];
      }
    }

    if (startDate || endDate) {
      const startY = startDate ? parseInt(startDate.slice(0, 4), 10) : currentYear;
      const endY = endDate ? parseInt(endDate.slice(0, 4), 10) : currentYear;
      const minYear = isNaN(startY) ? currentYear : Math.min(startY, endY);
      const maxYear = isNaN(endY) ? currentYear : Math.max(startY, endY);
      const years = [];
      for (let y = maxYear; y >= minYear; y--) {
        years.push(String(y));
      }
      return years.length > 0 ? years : [String(currentYear)];
    }

    if (all) {
      const years = [];
      for (let y = currentYear; y >= currentYear - 5; y--) {
        years.push(String(y));
      }
      return years;
    }

    return [String(currentYear)];
  }

  /**
   * Helper to filter orders list by date bounds
   */
  filterOrdersByDate(orders, { startDate = null, endDate = null } = {}) {
    if (!startDate && !endDate) return orders;

    return orders.filter(order => {
      const d = order.date;
      if (!d) return true;
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }

  /**
   * Step 3: Fetch & Normalize PDF Invoices
   */
  async fetch({ all = false, year = null, startDate = null, endDate = null, limit = null, headless = false } = {}) {
    this.abortRequested = false;
    const targetYears = this.resolveTargetYears({ year, startDate, endDate, all });
    console.log(`\n📅 [Amazon] Scan-Zieljahre: ${targetYears.join(', ')}`);

    const allOrdersMap = new Map();

    for (const y of targetYears) {
      if (this.abortRequested) break;
      const yearOrders = await this.scan({ year: y });
      for (const ord of yearOrders) {
        if (ord.orderId && !allOrdersMap.has(ord.orderId)) {
          allOrdersMap.set(ord.orderId, ord);
        }
      }
    }
    
    if (this.abortRequested) {
      return { downloaded: 0, skipped: 0, total: 0, aborted: true };
    }

    let orders = Array.from(allOrdersMap.values());
    const totalFound = orders.length;

    if (startDate || endDate) {
      orders = this.filterOrdersByDate(orders, { startDate, endDate });
      console.log(`🎯 [Amazon] Gefiltert nach Zeitraum (${startDate || 'Start'} bis ${endDate || 'Heute'}): ${orders.length} von ${totalFound} Bestellungen.`);
    }

    orders.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    console.log(`\n⬇️ [Amazon] Processing ${orders.length} invoices...`);
    const context = await this.launchBrowser({ headless });
    const page = context.pages()[0] || await context.newPage();
    let downloaded = 0;
    let skipped = 0;

    try {
      for (const order of orders) {
        if (this.abortRequested) {
          console.log('🛑 Amazon Download abgebrochen.');
          break;
        }
        if (limit && downloaded >= limit) break;

        if (this.isAlreadyDownloaded(order.orderId)) {
          skipped++;
          continue;
        }

        const safeDate = order.date || 'UNKNOWN-DATE';
        const yearMonth = safeDate.substring(0, 7);
        const subfolder = path.join(this.invoicesDir, yearMonth);
        if (!fs.existsSync(subfolder)) fs.mkdirSync(subfolder, { recursive: true });

        console.log(`📥 Downloading: ${order.orderId} (${order.date} | ${order.brutto}€)`);

        try {
          const pdfBuffers = [];
          const popoverUrl = `${this.baseUrl}/your-orders/invoice/popover?orderId=${order.orderId}`;
          const popoverRes = await page.request.get(popoverUrl);
          const popoverHtml = await popoverRes.text();
          
          const nativePdfMatches = Array.from(popoverHtml.matchAll(/\/documents\/download\/[a-f0-9-]+\/invoice\.pdf/g));
          
          if (nativePdfMatches.length > 0) {
            console.log(`   🔗 Found ${nativePdfMatches.length} native PDF invoice link(s)! Downloading...`);
            for (const match of nativePdfMatches) {
              const downloadUrl = `${this.baseUrl}${match[0]}`;
              const pdfRes = await page.request.get(downloadUrl);
              pdfBuffers.push(await pdfRes.body());
            }
          } else {
            console.log(`   🖨️ No native PDF found. Rendering HTML fallback summary...`);
            const printUrl = `${this.baseUrl}/gp/css/summary/print.html?orderID=${order.orderId}`;
            await page.goto(printUrl, { waitUntil: 'networkidle', timeout: 30000 });
            const fallbackBuf = await page.pdf({
              format: 'A4',
              printBackground: true,
              margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
            });
            pdfBuffers.push(fallbackBuf);
          }

          for (const rawPdfBuffer of pdfBuffers) {
            const splitInvoices = await this.splitAndExtractInvoices(rawPdfBuffer, order);
            for (const subInv of splitInvoices) {
              const invDate = subInv.date || subInv.invoiceDate || order.date || 'UNKNOWN-DATE';
              const invYearMonth = invDate.substring(0, 7);
              const invSubfolder = path.join(this.invoicesDir, invYearMonth);
              if (!fs.existsSync(invSubfolder)) fs.mkdirSync(invSubfolder, { recursive: true });

              const safeInvNum = (subInv.invoiceNumber || `INV-${order.orderId}`).replace(/[\/\\:*?"<>|]/g, '_');
              const pdfFileName = `${invDate}_${safeInvNum}.pdf`;
              const pdfFilePath = path.join(invSubfolder, pdfFileName);
              const relPdfPath = path.relative(path.resolve(this.invoicesDir, '..', '..'), pdfFilePath);

              fs.writeFileSync(pdfFilePath, subInv.pdfBuffer);

              const record = {
                ...order,
                id: `AMZ-${order.orderId}-${safeInvNum}`,
                orderId: order.orderId,
                invoiceNumber: subInv.invoiceNumber || `INV-${order.orderId}`,
                date: invDate,
                steuerdatum: subInv.taxDate || invDate,
                rechnungsdatum: subInv.invoiceDate || invDate,
                brutto: subInv.brutto ?? order.brutto,
                netto: subInv.netto ?? order.netto,
                ust: subInv.ust ?? order.ust,
                taxRate: subInv.taxRate || order.taxRate || '19%',
                seller: subInv.seller || order.seller || 'Amazon EU S.a.r.l.',
                pdfPath: relPdfPath
              };

              this.saveLedgerRecord(record);
              console.log(`   📄 Gespeichert als: ${pdfFileName} (${record.brutto}€)`);
              downloaded++;
            }
          }
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

    console.log(`📊 Analysiere ${sorted.length} Amazon-Belege...`);

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
      console.log(`  📄 [${i + 1}/${sorted.length}] Analysiere: ${inv.orderId || inv.id} (${inv.date} | ${inv.brutto}€)`);
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

    // Export CSV (Optimized for German Excel / OpenCalc with comma decimals)
    const csvFile = path.join(this.invoicesDir, 'amazon_ledger.csv');
    const csvHeaders = ['Nr', 'Steuerdatum', 'Rechnungsdatum', 'Bestellnummer', 'Händler', 'Netto (EUR)', 'USt (EUR)', 'Brutto (EUR)', 'Steuersatz', 'PDF-Datei'];
    const csvRows = sorted.map((r, i) => [
      i + 1,
      `"${r.steuerdatum || r.date || '-'}"`,
      `"${r.rechnungsdatum || r.invoiceDate || r.steuerdatum || r.date || '-'}"`,
      `"${r.orderId || '-'}"`,
      `"${(r.seller || 'Amazon EU S.a.r.l.').replace(/"/g, '""')}"`,
      (r.netto || 0).toFixed(2).replace('.', ','),
      (r.ust || 0).toFixed(2).replace('.', ','),
      (r.brutto || 0).toFixed(2).replace('.', ','),
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
        <th>Steuerdatum</th>
        <th>Rechnungsdatum</th>
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
        <td>${r.steuerdatum || r.date || '-'}</td>
        <td>${r.rechnungsdatum || r.invoiceDate || r.steuerdatum || r.date || '-'}</td>
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
        <td colspan="5">GESAMTSUMME</td>
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

    // Export XLS & XLSX
    let excelFiles = null;
    try {
      const { exportServiceExcel } = require('../../utils/excel-exporter');
      const formattedRecords = sorted.map(it => ({
        ...it,
        steuerdatum: it.steuerdatum || it.date || '-',
        rechnungsdatum: it.rechnungsdatum || it.invoiceDate || it.steuerdatum || it.date || '-'
      }));
      excelFiles = await exportServiceExcel({
        serviceName: 'Amazon',
        title: 'Amazon Rechnungsübersicht',
        invoicesDir: this.invoicesDir,
        records: formattedRecords
      });
    } catch (err) {
      console.warn(`[Amazon] Warning generating Excel:`, err.message);
    }

    console.log(`✅ [Amazon] PDF Summary generated:   ${outputFile}`);
    console.log(`✅ [Amazon] Excel XLS generated:     ${excelFiles?.xlsPath || path.join(this.invoicesDir, 'amazon_ledger.xls')}`);
    console.log(`✅ [Amazon] Excel XLSX generated:    ${excelFiles?.xlsxPath || path.join(this.invoicesDir, 'amazon_ledger.xlsx')}`);
    console.log(`✅ [Amazon] CSV Ledger generated:    ${csvFile}`);
    console.log(`✅ [Amazon] HTML Ledger generated:   ${htmlFile}`);

    return { count: sorted.length, totalBrutto, totalNetto, totalUst, pdfFile: outputFile, xlsFile: excelFiles?.xlsPath, xlsxFile: excelFiles?.xlsxPath, csvFile, htmlFile };
  }
}

module.exports = AmazonService;
