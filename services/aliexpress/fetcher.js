const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { convertPngToA4Pdf } = require('../../utils/pdf-converter');

const { getInvoicesDir, getAuthDir, getLedgerFile } = require('../../utils/paths');

const AUTH_DIR = getAuthDir('aliexpress');
const INVOICE_DIR = getInvoicesDir('aliexpress');
const LEDGER_FILE = getLedgerFile('aliexpress');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    scan: false,
    all: false,
    year: null,
    startDate: null,
    endDate: null,
    maxPages: 150,
    limit: null,
    rescan: false,
    includeExpired: false
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
    if (args[i] === '--include-expired') options.includeExpired = true;
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

/**
 * Robust date range parser supporting single years, year ranges (2026-2025, 2025-2026), and dates
 */
function parseDateFilter(options) {
  let minDate = null;
  let maxDate = null;
  const allowedYears = new Set();

  if (options.year) {
    const rawYear = String(options.year).trim();
    const yearMatches = rawYear.match(/\b(20\d{2})\b/g);
    if (yearMatches && yearMatches.length > 0) {
      const yearNums = yearMatches.map(y => parseInt(y, 10));
      const minY = Math.min(...yearNums);
      const maxY = Math.max(...yearNums);
      for (let y = minY; y <= maxY; y++) allowedYears.add(String(y));
      minDate = `${minY}-01-01`;
      maxDate = `${maxY}-12-31`;
    }
  }

  if (options.startDate || options.endDate) {
    let s = options.startDate ? String(options.startDate).trim() : null;
    let e = options.endDate ? String(options.endDate).trim() : null;

    if (s && /^\d{4}$/.test(s)) s = `${s}-01-01`;
    if (s && /^\d{4}-\d{2}$/.test(s)) s = `${s}-01`;
    if (e && /^\d{4}$/.test(e)) e = `${e}-12-31`;
    if (e && /^\d{4}-\d{2}$/.test(e)) e = `${e}-31`;

    if (s && e && s > e) {
      const tmp = s;
      s = e;
      e = tmp;
    }

    if (s) minDate = minDate ? (s < minDate ? s : minDate) : s;
    if (e) maxDate = maxDate ? (e > maxDate ? e : maxDate) : e;
  }

  return { minDate, maxDate, allowedYears };
}

async function startAliExpressFetcher() {
  const options = parseArgs();
  const filter = parseDateFilter(options);

  if (!fs.existsSync(AUTH_DIR)) {
    console.error("\n❌ FEHLER: Du bist nicht bei AliExpress eingeloggt!");
    console.error("Bitte führe zuerst den Login aus: npm run auth:aliexpress\n");
    process.exit(1);
  }

  console.log("\n======================================================");
  console.log("       🛍️ AliExpress Invoice & Receipt Agent 🛍️       ");
  console.log("======================================================\n");

  if (filter.minDate || filter.maxDate) {
    console.log(`🎯 Aktiver Datumsfilter: ${filter.minDate || 'Beginn'} bis ${filter.maxDate || 'Heute'}`);
  }

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
      await page.waitForTimeout(2500).catch(() => {});

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
            await page.waitForTimeout(2500);
          } catch (e) {}
        } else {
          await page.evaluate(() => window.scrollBy(0, 1500));
          await page.waitForTimeout(1500);
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

        // Check if we passed the minimum requested date (early exit optimization)
        if (filter.minDate && collectedOrders.size > 0) {
          const ordersList = Array.from(collectedOrders.values());
          const oldestFound = ordersList[ordersList.length - 1]?.orderDate;
          if (oldestFound && oldestFound < filter.minDate) {
            console.log(`🎯 Mindestdatum ${filter.minDate} erreicht (Älteste gefundene Bestellung: ${oldestFound}). Beende Scan frühzeitig.`);
            keepScanning = false;
            break;
          }
        }

        const btnExists = await viewMoreBtn.count() > 0 && await viewMoreBtn.isVisible().catch(() => false);

        if (collectedOrders.size === beforeCount && !btnExists) {
          consecutiveNoNewOrders++;
          if (consecutiveNoNewOrders >= 3) keepScanning = false;
        } else {
          consecutiveNoNewOrders = 0;
        }
        pageNum++;
      }

      allOrders = Array.from(collectedOrders.values());

      // Save summary cache
      if (allOrders.length > 0) {
        try {
          const cacheData = {
            scannedAt: new Date().toISOString(),
            totalOrders: allOrders.length,
            orders: allOrders
          };
          fs.writeFileSync(SUMMARY_FILE, JSON.stringify(cacheData, null, 2));
        } catch (e) {}
      }
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
      const oldest = allOrders[allOrders.length - 1]?.orderDate || '-';
      const newest = allOrders[0]?.orderDate || '-';
      const totalAmount = allOrders.reduce((sum, o) => sum + (parseFloat(o.totalAmount) || parseFloat(o.price) || 0), 0);

      console.log("\n    ======================================================");
      console.log("              📊 KONTO-ANALYSE ERGEBNIS 📊              ");
      console.log("    ======================================================");
      console.log(`    📦 Bestellungen gesamt:    ${allOrders.length}`);
      console.log(`    📅 Älteste Bestellung:     ${oldest}`);
      console.log(`    📅 Neueste Bestellung:     ${newest}`);
      console.log(`    💰 Gesamtausgaben erfasst: ${totalAmount.toFixed(2)} €\n`);
      await context.close();
      return;
    }

    // Filter orders by parsed date filter
    let filteredOrders = allOrders;
    if (filter.minDate || filter.maxDate) {
      filteredOrders = allOrders.filter(o => {
        const d = o.orderDate;
        if (!d) return false;
        if (filter.minDate && d < filter.minDate) return false;
        if (filter.maxDate && d > filter.maxDate) return false;
        return true;
      });
      console.log(`🎯 Datumsfilter aktiv: ${filteredOrders.length} von ${allOrders.length} Bestellungen im Zeitraum (${filter.minDate || 'Beginn'} bis ${filter.maxDate || 'Heute'}).`);
    }

    // Load ledger to identify downloaded or expired orders
    let ledger = {};
    if (fs.existsSync(LEDGER_FILE)) {
      try {
        const raw = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
        if (Array.isArray(raw)) {
          raw.forEach(item => { if (item.orderId || item.id) ledger[String(item.orderId || item.id)] = item; });
        } else if (raw && typeof raw === 'object') {
          ledger = raw;
        }
      } catch (e) {}
    }

    // Collect expired order IDs so we don't retry dead orders repeatedly
    const expiredOrderIds = new Set();
    Object.values(ledger).forEach(item => {
      if (item && (item.status === 'expired' || item.status === 'unavailable')) {
        expiredOrderIds.add(String(item.orderId || item.id));
      }
    });

    // Check which orders are pending (PDF does not exist yet)
    function getPdfFiles(dir) {
      let results = [];
      if (!fs.existsSync(dir)) return results;
      const list = fs.readdirSync(dir);
      list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getPdfFiles(fullPath));
        } else if (file.endsWith('.pdf')) {
          results.push(path.basename(fullPath));
        }
      });
      return results;
    }

    const existingFiles = new Set(getPdfFiles(INVOICE_DIR));
    const isOrderDownloaded = (o) => {
      const idStr = String(o.orderId);
      // If order is known to be expired and user didn't ask to retry expired orders
      if (!options.includeExpired && expiredOrderIds.has(idStr)) {
        return true;
      }
      if (existingFiles.has(`AliExpress-${o.orderDate}-${o.orderId}.pdf`)) return true;
      for (const f of existingFiles) {
        if (f.includes(idStr)) return true;
      }
      return false;
    };

    let pendingOrders = filteredOrders.filter(o => !isOrderDownloaded(o));
    console.log(`📊 Ausgewählt: ${filteredOrders.length} | Bereits vorhanden/geprüft: ${filteredOrders.length - pendingOrders.length} | Ausstehend: ${pendingOrders.length}`);

    if (options.limit && options.limit > 0) {
      pendingOrders = pendingOrders.slice(0, options.limit);
      console.log(`🎯 Begrenzung auf die nächsten ${pendingOrders.length} anstehenden Belege aktiviert (--limit ${options.limit}).\n`);
    }

    if (pendingOrders.length === 0) {
      console.log("\n✨ Alle angeforderten Rechnungen sind bereits lokal vorhanden oder abgelaufene Altbelege wurden übersprungen!");
      await context.close();
      return;
    }

    console.log(`⬇️ Starte Download & PDF-Erfassung für ${pendingOrders.length} Belege...\n`);

    let downloadedCount = 0;
    let expiredCount = 0;

    for (let i = 0; i < pendingOrders.length; i++) {
      const order = pendingOrders[i];
      let orderDate = order.orderDate || new Date().toISOString().slice(0, 10);
      let yearMonth = orderDate.substring(0, 7);
      let targetPdfName = `AliExpress-${orderDate}-${order.orderId}.pdf`;
      let subfolder = path.join(INVOICE_DIR, yearMonth);
      if (!fs.existsSync(subfolder)) fs.mkdirSync(subfolder, { recursive: true });
      let targetPdfPath = path.join(subfolder, targetPdfName);

      process.stdout.write(`[${i + 1}/${pendingOrders.length}] Order #${order.orderId} (${orderDate})... `);

      const taxUrl = `https://www.aliexpress.com/p/tax-ui/index.html?isGrayMatch=true&orderId=${order.orderId}`;
      try {
        await page.goto(taxUrl, { waitUntil: 'networkidle', timeout: 12000 }).catch(() => {});
        await page.waitForSelector('.container--title--1f37WzH, [class*="container--title"], [class*="summary--left"], [class*="summary"]', { timeout: 3500 }).catch(() => {});
        await page.waitForTimeout(300);

        // Check if page is 404 / lost / expired
        const pageStatus = await page.evaluate(() => {
          const text = document.body.innerText || '';
          const isLost = text.includes('Oops, the page seems to be lost') || 
                         text.includes('Page Not Found') ||
                         text.includes('404');
          const isExpired = text.includes('Order expired') || 
                            text.includes('order has expired') ||
                            text.includes('Bestellung abgelaufen') ||
                            text.includes('Keine Rechnung verfügbar');
          const hasTaxInvoice = document.querySelector('.container--title--1f37WzH, [class*="container--title"], [class*="summary--left"]') !== null;
          return { isLost, isExpired, hasTaxInvoice, textLength: text.length };
        });

        let fallbackUsed = false;

        if (pageStatus.isLost || !pageStatus.hasTaxInvoice || pageStatus.isExpired) {
          const fallbackUrl = `https://www.aliexpress.com/p/order/detail.html?orderId=${order.orderId}`;
          await page.goto(fallbackUrl, { waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => {});
          await page.waitForTimeout(1500);

          const fallbackStatus = await page.evaluate(() => {
            const text = document.body.innerText || '';
            const isDead = text.includes('Oops, the page seems to be lost') ||
                           text.includes('This order has expired') ||
                           text.includes('Order does not exist') ||
                           text.includes('Bestellung nicht gefunden') ||
                           text.length < 150;
            return { isDead, textLength: text.length };
          });

          if (fallbackStatus.isDead) {
            console.log(`⚠️ Beleg auf AliExpress nicht mehr verfügbar (abgelaufene Altbestellung).`);
            ledger[order.orderId] = {
              orderId: order.orderId,
              orderDate: orderDate,
              storeName: order.storeName,
              totalAmount: order.totalAmount || 0,
              currency: order.currency || 'EUR',
              status: 'expired',
              note: 'Rechnung auf AliExpress abgelaufen/nicht mehr verfügbar',
              checkedAt: new Date().toISOString()
            };
            expiredOrderIds.add(String(order.orderId));
            fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));
            expiredCount++;
            continue;
          }

          fallbackUsed = true;

          // Hide floating elements before printing fallback
          await page.evaluate(() => {
            document.querySelectorAll('[class*="float"], [class*="fixed"], [class*="sticky"]').forEach(el => el.style.display = 'none');
          }).catch(() => {});
        }

        // Extract exact date & total from DOM (if available)
        const pageInfo = await page.evaluate(() => {
          const text = document.body.innerText || '';
          const dateMatch = text.match(/Order time:\s*([A-Za-z0-9,.\s-]+)/i) || text.match(/(?:Order time|Bestellzeit)[:\s]+([0-9A-Za-z.,\s-]+)/i);
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

        if (fallbackUsed) {
          console.log(`✅ ${targetPdfName} (Ersatz-Beleg gespeichert)`);
        } else {
          console.log(`✅ ${targetPdfName} (${exactTotal ? exactTotal.toFixed(2) : '-'} EUR)`);
        }

        // Save ledger entry
        ledger[order.orderId] = {
          orderId: order.orderId,
          orderDate: orderDate,
          storeName: order.storeName,
          totalAmount: exactTotal,
          currency: order.currency || 'EUR',
          pdfFile: path.posix.join(yearMonth, targetPdfName),
          status: 'downloaded',
          downloadedAt: new Date().toISOString()
        };
        fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));

      } catch (err) {
        console.log(`⚠️ Fehler: ${err.message}`);
      }

      await page.waitForTimeout(200).catch(() => {});
    }

    console.log(`\n🎉 Vorgang abgeschlossen! ${downloadedCount} Belege gespeichert, ${expiredCount} abgelaufene Altbelege übersprungen.`);

  } finally {
    if (context) await context.close();
  }
}

if (require.main === module) {
  startAliExpressFetcher();
}

module.exports = { startAliExpressFetcher, parseDateFilter };
