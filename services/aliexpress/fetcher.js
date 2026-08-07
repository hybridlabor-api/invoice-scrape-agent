const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { convertPngToA4Pdf } = require('../../utils/pdf-converter');

const rootProfile = path.join(__dirname, '../../.auth-profile/aliexpress');
const localProfile = path.join(__dirname, '.auth-profile');
const AUTH_DIR = fs.existsSync(path.dirname(rootProfile)) ? rootProfile : localProfile;

const rootInvoices = path.join(__dirname, '../../invoices/aliexpress');
const localInvoices = path.join(__dirname, 'invoices');
const INVOICE_DIR = fs.existsSync(path.dirname(rootInvoices)) ? rootInvoices : localInvoices;
const LEDGER_FILE = path.join(INVOICE_DIR, 'aliexpress_ledger.json');

if (!fs.existsSync(INVOICE_DIR)) {
  fs.mkdirSync(INVOICE_DIR, { recursive: true });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    scan: false,
    all: false,
    year: null,
    startDate: null,
    endDate: null,
    maxPages: 10
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scan') options.scan = true;
    if (args[i] === '--all') options.all = true;
    if (args[i] === '--year' && args[i + 1]) options.year = args[++i];
    if (args[i] === '--start' && args[i + 1]) options.startDate = args[++i];
    if (args[i] === '--end' && args[i + 1]) options.endDate = args[++i];
    if (args[i] === '--pages' && args[i + 1]) options.maxPages = parseInt(args[++i], 10);
  }
  return options;
}

const monthMap = {
  'jan': 0, 'feb': 1, 'mar': 2, 'mär': 2, 'apr': 3, 'may': 4, 'mai': 4,
  'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'okt': 9, 'nov': 10, 'dec': 11, 'dez': 11
};

function normalizeDate(rawDate) {
  if (!rawDate) return new Date().toISOString().slice(0, 10);
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;

  // Format: "Aug 7, 2026" or "7. Aug. 2026" or "14.11.2025"
  const m1 = rawDate.match(/([A-Za-zäöüÄÖÜ]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m1) {
    const mStr = m1[1].toLowerCase().slice(0, 3);
    const mIdx = monthMap[mStr] !== undefined ? monthMap[mStr] : 0;
    const day = m1[2].padStart(2, '0');
    const year = m1[3];
    return `${year}-${String(mIdx + 1).padStart(2, '0')}-${day}`;
  }

  const m2 = rawDate.match(/(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]{3,})\.?\s+(\d{4})/);
  if (m2) {
    const day = m2[1].padStart(2, '0');
    const mStr = m2[2].toLowerCase().slice(0, 3);
    const mIdx = monthMap[mStr] !== undefined ? monthMap[mStr] : 0;
    const year = m2[3];
    return `${year}-${String(mIdx + 1).padStart(2, '0')}-${day}`;
  }

  const d = new Date(rawDate);
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

  const collectedOrders = new Map();

  // Network Interceptor for MTOP / Order APIs
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

              collectedOrders.set(String(orderId), {
                orderId: String(orderId),
                orderDate: normalizeDate(f.createDate || f.date || f.gmtCreate),
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

  try {
    console.log("Sammle Bestellungen von AliExpress...");

    // Navigate to initial order list
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
      // 1. Scroll down to trigger lazy loading / render buttons
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);

      // 2. Check for "View more orders" / "View orders" button
      const viewMoreBtn = page.locator('button, [role="button"], a, div, span').filter({
        hasText: /view (?:more )?orders|view orders|mehr anzeigen|load more|view more/i
      }).first();

      let clickedViewMore = false;
      if (await viewMoreBtn.count() > 0 && await viewMoreBtn.isVisible().catch(() => false)) {
        try {
          await viewMoreBtn.click();
          await page.waitForTimeout(2500);
          clickedViewMore = true;
        } catch (e) {}
      }

      // 3. DOM fallback extraction
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

          if (orderId) {
            results.push({ orderId, rawDate, storeName, price });
          }
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
        if (consecutiveNoNewOrders >= 2 || options.scan) {
          keepScanning = false;
        } else {
          // Try URL pagination as secondary strategy
          pageNum++;
          await page.goto(`https://www.aliexpress.com/p/order/index.html?page=${pageNum}`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
          await page.waitForTimeout(2000);
        }
      } else {
        consecutiveNoNewOrders = 0;
        pageNum++;
      }
    }

    const allOrders = Array.from(collectedOrders.values());

    if (allOrders.length === 0) {
      console.log("\n⚠️ Keine Bestellungen im Konto gefunden.");
      await context.close();
      return;
    }

    // Sort descending by date
    allOrders.sort((a, b) => (b.orderDate || '').localeCompare(a.orderDate || ''));

    console.log(`\n✅ ${allOrders.length} Bestellungen im Konto gefunden.`);
    console.log(`📅 Älteste gefundene Bestellung: ${allOrders[allOrders.length - 1]?.orderDate || 'N/A'}`);
    console.log(`📅 Neueste gefundene Bestellung: ${allOrders[0]?.orderDate || 'N/A'}`);

    if (options.scan) {
      console.log("\n--- SCAN-ERGEBNIS ---");
      console.log(`Gefundene Bestellungen: ${allOrders.length}`);
      console.log(`Zeitspanne: ${allOrders[allOrders.length - 1]?.orderDate} bis ${allOrders[0]?.orderDate}\n`);
      await context.close();
      return;
    }

    // Filter orders
    let filteredOrders = allOrders;
    if (options.year) {
      filteredOrders = allOrders.filter(o => o.orderDate && o.orderDate.startsWith(options.year));
      console.log(`\n🎯 Filter Jahr ${options.year}: ${filteredOrders.length} Bestellungen.`);
    } else if (options.startDate && options.endDate) {
      filteredOrders = allOrders.filter(o => o.orderDate >= options.startDate && o.orderDate <= options.endDate);
      console.log(`\n🎯 Filter Zeitraum ${options.startDate} bis ${options.endDate}: ${filteredOrders.length} Bestellungen.`);
    }

    console.log(`\n⬇️ Starte Download & PDF-Konvertierung für ${filteredOrders.length} Belege...\n`);

    const ledger = fs.existsSync(LEDGER_FILE) ? JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')) : {};

    let downloadedCount = 0;

    for (let i = 0; i < filteredOrders.length; i++) {
      const order = filteredOrders[i];
      const targetPdfName = `AliExpress-${order.orderDate}-${order.orderId}.pdf`;
      const targetPdfPath = path.join(INVOICE_DIR, targetPdfName);

      console.log(`[${i + 1}/${filteredOrders.length}] ${order.orderDate} | Order #${order.orderId} (${order.totalAmount.toFixed(2)} ${order.currency})`);

      if (fs.existsSync(targetPdfPath)) {
        console.log(`  ⏩ Bereits vorhanden: ${targetPdfName}`);
        continue;
      }

      // Open AliExpress Tax Receipt UI directly
      const taxUrl = `https://www.aliexpress.com/p/tax-ui/index.html?isGrayMatch=true&orderId=${order.orderId}`;
      try {
        await page.goto(taxUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1500);

        let pdfSaved = false;

        // Try clicking official Download button (downloads PNG OrderSummary)
        const downloadBtn = page.locator('button, a, div, span').filter({ hasText: /^Download$|^Herunterladen$/i }).first();
        if (await downloadBtn.count() > 0) {
          try {
            const [download] = await Promise.all([
              page.waitForEvent('download', { timeout: 8000 }),
              downloadBtn.click()
            ]);

            if (download) {
              const tempPng = await download.path();
              await convertPngToA4Pdf({
                pngInput: tempPng,
                outputPath: targetPdfPath,
                orderId: order.orderId,
                orderDate: order.orderDate,
                metadata: {
                  storeName: order.storeName,
                  totalAmount: order.totalAmount,
                  currency: order.currency
                }
              });
              try { fs.unlinkSync(tempPng); } catch(e) {}
              console.log(`  ✅ PNG-Beleg in PDF konvertiert: ${targetPdfName}`);
              pdfSaved = true;
              downloadedCount++;
            }
          } catch(e) {}
        }

        // Fallback: Screenshot / Print PDF if Download button did not fire event
        if (!pdfSaved) {
          await page.pdf({
            path: targetPdfPath,
            format: 'A4',
            printBackground: true,
            margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
          });
          console.log(`  ✅ Beleg als A4-PDF erfasst: ${targetPdfName}`);
          downloadedCount++;
        }

        // Save ledger entry
        ledger[order.orderId] = {
          orderId: order.orderId,
          orderDate: order.orderDate,
          storeName: order.storeName,
          totalAmount: order.totalAmount,
          currency: order.currency,
          pdfFile: targetPdfName
        };
        fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));

      } catch (err) {
        console.log(`  ⚠️ Fehler bei Beleg #${order.orderId}: ${err.message}`);
      }
    }

    console.log(`\n🎉 Fertig! ${downloadedCount} Belege heruntergeladen und konvertiert in:\n   ${INVOICE_DIR}\n`);

  } finally {
    if (context) await context.close();
  }
}

if (require.main === module) {
  startAliExpressFetcher();
}

module.exports = { startAliExpressFetcher };
