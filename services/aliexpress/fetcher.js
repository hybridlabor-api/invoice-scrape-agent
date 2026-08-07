const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { convertPngToA4Pdf } = require('../../utils/pdf-converter');

const rootProfile = path.join(__dirname, '../../.auth-profile/aliexpress');
const localProfile = path.join(__dirname, '.auth-profile');
const AUTH_DIR = fs.existsSync(path.dirname(rootProfile)) ? rootProfile : localProfile;

const rootInvoices = path.join(__dirname, '../../invoices/aliexpress');
const INVOICE_DIR = rootInvoices;
if (!fs.existsSync(INVOICE_DIR)) {
  fs.mkdirSync(INVOICE_DIR, { recursive: true });
}
const LEDGER_FILE = path.join(INVOICE_DIR, 'aliexpress_ledger.json');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    scan: false,
    all: false,
    year: null,
    startDate: null,
    endDate: null,
    maxPages: 50,
    limit: null,
    rescan: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scan') options.scan = true;
    if (args[i] === '--all') options.all = true;
    if (args[i] === '--year' && args[i + 1]) options.year = args[++i];
    if (args[i] === '--start' && args[i + 1]) options.startDate = args[++i];
    if (args[i] === '--end' && args[i + 1]) options.endDate = args[++i];
    if (args[i] === '--pages' && args[i + 1]) options.maxPages = parseInt(args[++i], 10);
    if ((args[i] === '--limit' || args[i] === '-n') && args[i + 1]) options.limit = parseInt(args[++i], 10);
    if (args[i] === '--rescan') options.rescan = true;
  }
  return options;
}

const monthMap = {
  'jan': 0, 'feb': 1, 'mar': 2, 'mär': 2, 'apr': 3, 'may': 4, 'mai': 4,
  'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'okt': 9, 'nov': 10, 'dec': 11, 'dez': 11
};

function normalizeDate(rawDate) {
  if (!rawDate) return new Date().toISOString().slice(0, 10);

  if (typeof rawDate === 'number' || /^\d{10,13}$/.test(String(rawDate).trim())) {
    const num = Number(rawDate);
    const ts = num < 10000000000 ? num * 1000 : num;
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }

  const str = String(rawDate).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  if (/^\d{4}\.\d{2}\.\d{2}/.test(str)) return str.slice(0, 10).replace(/\./g, '-');

  // Format: "Aug 7, 2026" or "7. Aug. 2026" or "14.11.2025"
  const m1 = str.match(/([A-Za-zäöüÄÖÜ]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m1) {
    const mStr = m1[1].toLowerCase().slice(0, 3);
    const mIdx = monthMap[mStr] !== undefined ? monthMap[mStr] : 0;
    const day = m1[2].padStart(2, '0');
    const year = m1[3];
    return `${year}-${String(mIdx + 1).padStart(2, '0')}-${day}`;
  }

  const m2 = str.match(/(\d{1,2})\.?\s*([A-Za-zäöüÄÖÜ]{3,})\.?\s+(\d{4})/);
  if (m2) {
    const day = m2[1].padStart(2, '0');
    const mStr = m2[2].toLowerCase().slice(0, 3);
    const mIdx = monthMap[mStr] !== undefined ? monthMap[mStr] : 0;
    const year = m2[3];
    return `${year}-${String(mIdx + 1).padStart(2, '0')}-${day}`;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return new Date().toISOString().slice(0, 10);
}

async function startAliExpressFetcher() {
  const options = parseArgs();

  if (!fs.existsSync(AUTH_DIR)) {
    console.error("\n❌ FEHLER: Du bist nicht bei AliExpress eingeloggt!");
    console.error("Bitte führe zuerst den Login aus: npm run auth:aliexpress\n");
    process.exit(1);
  }

  console.log("\n======================================================");
  console.log("       🛍️ AliExpress Invoice & Receipt Agent 🛍️       ");
  console.log("======================================================\n");

  const SUMMARY_FILE = path.join(INVOICE_DIR, 'account_scan_summary.json');
  let allOrders = [];

  // 1. Try loading cached orders from account_scan_summary.json
  if (fs.existsSync(SUMMARY_FILE) && !options.rescan) {
    try {
      const summaryData = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8'));
      if (Array.isArray(summaryData.orders) && summaryData.orders.length > 0) {
        allOrders = summaryData.orders;
        console.log(`📦 ${allOrders.length} Bestellungen aus lokalem Scan-Index geladen.`);
      }
    } catch (e) {}
  }

  let context;
  try {
    context = await chromium.launchPersistentContext(AUTH_DIR, {
      headless: false,
      channel: 'chrome',
      viewport: { width: 1360, height: 850 },
      acceptDownloads: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });
  } catch (e) {
    context = await chromium.launchPersistentContext(AUTH_DIR, {
      headless: false,
      viewport: { width: 1360, height: 850 },
      acceptDownloads: true
    });
  }

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {
    // 2. If no cached orders exist or --rescan requested, perform live scan
    if (allOrders.length === 0) {
      console.log("Sammle Bestellungen live von AliExpress...");
      const collectedOrders = new Map();

      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('mtop.aliexpress.trade.buyer.order.list') || url.includes('order.list')) {
          try {
            const text = await response.text();
            const cleanJson = text.replace(/^[a-zA-Z0-9_]+\((.*)\)$/, '$1');
            const data = JSON.parse(cleanJson);

            const orderObj = data?.data?.data || {};
            for (const [key, val] of Object.entries(orderObj)) {
              if (key.startsWith('pc_om_list_order_') && val?.fields) {
                const f = val.fields;
                const orderId = f.orderId || key.replace('pc_om_list_order_', '');
                if (orderId && !collectedOrders.has(String(orderId))) {
                  let price = 0;
                  if (f.formatPriceInfo) {
                    const parts = f.formatPriceInfo.split('|');
                    if (parts.length > 2) price = parseFloat(`${parts[1]}.${parts[2]}`);
                  }

                  const rawDate = f.createTime || f.gmtCreate || f.createDate || f.formatOrderDate || f.orderDate || f.payTime || f.date;
                  collectedOrders.set(String(orderId), {
                    orderId: String(orderId),
                    orderDate: normalizeDate(rawDate),
                    storeName: f.shopName || f.storeName || 'AliExpress Store',
                    totalAmount: price || parseFloat(f.payAmount || 0),
                    currency: f.currencyCode || 'EUR',
                    status: 'Completed'
                  });
                }
              }
            }
          } catch (e) {}
        }
      });

      const initialUrl = 'https://www.aliexpress.com/p/order/index.html';
      await page.goto(initialUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2500);

      if (page.url().includes('login') || page.url().includes('passport')) {
        console.error("\n❌ FEHLER: Login abgelaufen! Bitte führe den Login erneut aus.");
        await context.close();
        process.exit(1);
      }

      let pageNum = 1;
      let keepScanning = true;
      let consecutiveNoNewOrders = 0;

      while (keepScanning && pageNum <= options.maxPages) {
        const viewMoreBtn = page.locator('button, [role="button"], div, span, a').filter({
          hasText: /^View orders|^View more orders|^Mehr anzeigen/i
        }).first();

        if (await viewMoreBtn.count() > 0 && await viewMoreBtn.isVisible().catch(() => false)) {
          try {
            await viewMoreBtn.scrollIntoViewIfNeeded();
            await page.waitForTimeout(400);
            await viewMoreBtn.click();
            await page.waitForTimeout(1800);
          } catch (e) {}
        } else {
          await page.evaluate(() => window.scrollBy(0, 600));
          await page.waitForTimeout(800);
        }

        const domOrders = await page.evaluate(() => {
          const results = [];
          const cards = document.querySelectorAll('[class*="order-item"], [class*="order-card"], [class*="order-main"]');
          cards.forEach(card => {
            const text = card.innerText || '';
            const idMatch = text.match(/(?:Order ID|Bestellnummer|Ref\.\s*Number|Order Number)[:\s]+([0-9]{10,25})/i);
            const orderId = idMatch ? idMatch[1] : null;

            const dateMatch = text.match(/(?:Date|Bestelldatum|Order date)[:\s]+([0-9A-Za-z.,\s-]+)/i);
            const rawDate = dateMatch ? dateMatch[1].trim() : null;

            const priceMatch = text.match(/([0-9]+[.,][0-9]{2})\s*(?:€|\$|EUR|USD)/) ||
                               text.match(/(?:€|\$|EUR|USD)\s*([0-9]+[.,][0-9]{2})/);
            const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : 0;

            const storeEl = card.querySelector('[class*="store"], [class*="seller"], a[href*="/store/"]');
            const storeName = storeEl ? storeEl.innerText.trim() : 'AliExpress Store';

            if (orderId) results.push({ orderId, rawDate, storeName, price });
          });
          return results;
        });

        const beforeCount = collectedOrders.size;
        for (const d of domOrders) {
          if (!collectedOrders.has(d.orderId)) {
            collectedOrders.set(d.orderId, {
              orderId: d.orderId,
              orderDate: normalizeDate(d.rawDate),
              storeName: d.storeName,
              totalAmount: d.price,
              currency: 'EUR',
              status: 'Completed'
            });
          }
        }

        console.log(`  ✓ Scan-Schritt ${pageNum}: ${collectedOrders.size} Bestellungen erfasst.`);

        if (collectedOrders.size === beforeCount) {
          consecutiveNoNewOrders++;
          if (consecutiveNoNewOrders >= 2) keepScanning = false;
        } else {
          consecutiveNoNewOrders = 0;
          pageNum++;
        }
      }

      allOrders = Array.from(collectedOrders.values());
    }

    if (allOrders.length === 0) {
      console.log("\n⚠️ Keine Bestellungen im Konto gefunden.");
      await context.close();
      return;
    }

    // Sort descending by date
    allOrders.sort((a, b) => (b.orderDate || '').localeCompare(a.orderDate || ''));

    console.log(`\n✅ ${allOrders.length} Bestellungen insgesamt im Index erfasst.`);

    if (options.scan) {
      console.log("\n--- SCAN-ERGEBNIS ---");
      console.log(`Gefundene Bestellungen: ${allOrders.length}`);
      console.log(`Zeitspanne: ${allOrders[allOrders.length - 1]?.orderDate} bis ${allOrders[0]?.orderDate}\n`);
      await context.close();
      return;
    }

    // Filter orders by year / date range
    let filteredOrders = allOrders;
    if (options.year) {
      filteredOrders = allOrders.filter(o => o.orderDate && o.orderDate.startsWith(options.year));
      console.log(`🎯 Filter Jahr ${options.year}: ${filteredOrders.length} Bestellungen.`);
    } else if (options.startDate && options.endDate) {
      filteredOrders = allOrders.filter(o => o.orderDate >= options.startDate && o.orderDate <= options.endDate);
      console.log(`🎯 Filter Zeitraum ${options.startDate} bis ${options.endDate}: ${filteredOrders.length} Bestellungen.`);
    }

    // Check which orders are pending (PDF does not exist yet)
    function getPdfFiles(dir) {
      let results = [];
      const list = fs.readdirSync(dir);
      list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getPdfFiles(fullPath));
        } else if (file.endsWith('.pdf')) {
          results.push(path.basename(fullPath)); // Store basenames for easy matching
        }
      });
      return results;
    }

    const existingFiles = new Set(getPdfFiles(INVOICE_DIR));
    const isOrderDownloaded = (o) => {
      if (existingFiles.has(`AliExpress-${o.orderDate}-${o.orderId}.pdf`)) return true;
      for (const f of existingFiles) {
        if (f.includes(o.orderId)) return true;
      }
      return false;
    };

    let pendingOrders = filteredOrders.filter(o => !isOrderDownloaded(o));
    console.log(`📊 Gesamt: ${filteredOrders.length} | Bereits vorhanden: ${filteredOrders.length - pendingOrders.length} | Ausstehend: ${pendingOrders.length}`);

    if (options.limit && options.limit > 0) {
      pendingOrders = pendingOrders.slice(0, options.limit);
      console.log(`🎯 Begrenzung auf die nächsten ${pendingOrders.length} anstehenden Belege aktiviert (--limit ${options.limit}).\n`);
    }

    if (pendingOrders.length === 0) {
      console.log("\n✨ Alle angeforderten Rechnungen sind bereits lokal vorhanden!");
      await context.close();
      return;
    }

    console.log(`⬇️ Starte Download & PDF-Erfassung für ${pendingOrders.length} Belege...\n`);

    const ledger = fs.existsSync(LEDGER_FILE) ? JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')) : {};
    let downloadedCount = 0;

    for (let i = 0; i < pendingOrders.length; i++) {
      const order = pendingOrders[i];
      let orderDate = order.orderDate || new Date().toISOString().slice(0, 10);
      let yearMonth = orderDate.substring(0, 7);
      let targetPdfName = `AliExpress-${orderDate}-${order.orderId}.pdf`;
      let subfolder = path.join(INVOICE_DIR, yearMonth);
      if (!fs.existsSync(subfolder)) fs.mkdirSync(subfolder, { recursive: true });
      let targetPdfPath = path.join(subfolder, targetPdfName);

      process.stdout.write(`[${i + 1}/${pendingOrders.length}] Order #${order.orderId}... `);

      const taxUrl = `https://www.aliexpress.com/p/tax-ui/index.html?isGrayMatch=true&orderId=${order.orderId}`;
      try {
        await page.goto(taxUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForSelector('.container--title--1f37WzH, [class*="container--title"], [class*="summary--left"], [class*="summary"]', { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(500);

        // Extract exact date & total from Tax page DOM
        const pageInfo = await page.evaluate(() => {
          const text = document.body.innerText || '';
          const dateMatch = text.match(/Order time:\s*([A-Za-z0-9,.\s-]+)/i);
          const rawDate = dateMatch ? dateMatch[1].trim() : null;

          const totalMatch = text.match(/Total:\s*([0-9]+[.,][0-9]{2})\s*(?:€|\$|EUR|USD)?/i) ||
                             text.match(/Total:\s*(?:€|\$|EUR|USD)?\s*([0-9]+[.,][0-9]{2})/i);
          const total = totalMatch ? parseFloat(totalMatch[1].replace(',', '.')) : null;

          return { rawDate, total };
        });

        if (pageInfo.rawDate) {
          const trueDate = normalizeDate(pageInfo.rawDate);
          if (trueDate && trueDate !== orderDate) {
            orderDate = trueDate;
            targetPdfName = `AliExpress-${orderDate}-${order.orderId}.pdf`;
            yearMonth = orderDate.substring(0, 7);
            subfolder = path.join(INVOICE_DIR, yearMonth);
            if (!fs.existsSync(subfolder)) fs.mkdirSync(subfolder, { recursive: true });
            targetPdfPath = path.join(subfolder, targetPdfName);
          }
        }

        const exactTotal = pageInfo.total !== null ? pageInfo.total : order.totalAmount;

        // Generate clean A4 PDF
        await page.pdf({
          path: targetPdfPath,
          format: 'A4',
          printBackground: true,
          margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
        });

        existingFiles.add(targetPdfName);
        downloadedCount++;
        console.log(`✅ ${targetPdfName} (${exactTotal ? exactTotal.toFixed(2) : '-'} EUR)`);

        // Save ledger entry
        ledger[order.orderId] = {
          orderId: order.orderId,
          orderDate: orderDate,
          storeName: order.storeName,
          totalAmount: exactTotal,
          currency: order.currency || 'EUR',
          pdfFile: path.posix.join(yearMonth, targetPdfName),
          downloadedAt: new Date().toISOString()
        };
        fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));

      } catch (err) {
        console.log(`⚠️ Fehler: ${err.message}`);
      }

      await page.waitForTimeout(300);
    }

    console.log(`\n🎉 Vorgang abgeschlossen! ${downloadedCount} neue Belege erfolgreich gespeichert in:\n   ${INVOICE_DIR}\n`);

  } finally {
    if (context) await context.close();
  }
}

if (require.main === module) {
  startAliExpressFetcher();
}

module.exports = { startAliExpressFetcher };

