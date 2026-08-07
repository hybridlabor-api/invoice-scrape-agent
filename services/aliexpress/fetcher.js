const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { convertPngToA4Pdf } = require('../../utils/pdf-converter');

const AUTH_DIR = path.join(__dirname, '../../.auth-profile/aliexpress');
const INVOICE_DIR = path.join(__dirname, '../../invoices/aliexpress');
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
    maxPages: 20
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

function normalizeDate(rawDate) {
  if (!rawDate) return new Date().toISOString().slice(0, 10);
  
  // Format: "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;
  
  // Format: "14. Nov. 2025" or "14.11.2025" or "Nov 14, 2025"
  const d = new Date(rawDate);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return rawDate.slice(0, 10);
}

async function startAliExpressFetcher() {
  const options = parseArgs();

  if (!fs.existsSync(AUTH_DIR)) {
    console.error("\n❌ FEHLER: Du bist nicht bei AliExpress eingeloggt!");
    console.error("Bitte führe zuerst den Login aus: npm run auth (oder wähle AliExpress Login im Menü).\n");
    process.exit(1);
  }

  console.log("\n======================================================");
  console.log("       🛍️ AliExpress Invoice & Receipt Agent 🛍️       ");
  console.log("======================================================\n");

  const context = await chromium.launchPersistentContext(AUTH_DIR, {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1360, height: 850 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  const collectedOrders = new Map();

  // Network Interceptor for MTOP / Order APIs
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('mtop.aliexpress') || url.includes('order') || url.includes('trade')) {
      try {
        const text = await response.text();
        const cleanJson = text.replace(/^[a-zA-Z0-9_]+\((.*)\)$/, '$1');
        const data = JSON.parse(cleanJson);

        const list = data?.data?.orderList || data?.data?.orders || data?.data?.items;
        if (Array.isArray(list)) {
          for (const item of list) {
            const orderId = item.orderId || item.id || item.bizOrderId;
            if (orderId && !collectedOrders.has(String(orderId))) {
              collectedOrders.set(String(orderId), {
                orderId: String(orderId),
                orderDate: normalizeDate(item.gmtCreate || item.orderDate || item.createTime),
                storeName: item.sellerName || item.storeName || 'AliExpress Seller',
                totalAmount: parseFloat(item.payAmount?.amount || item.totalPrice || item.amount || 0),
                currency: item.payAmount?.currency || item.currency || 'EUR',
                status: item.statusDesc || item.orderStatus || 'Completed'
              });
            }
          }
        }
      } catch (e) {}
    }
  });

  try {
    console.log("Navigiere zur AliExpress Bestellübersicht...");
    await page.goto('https://www.aliexpress.com/p/order/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });

    if (page.url().includes('login') || page.url().includes('passport')) {
      console.error("\n❌ FEHLER: Login abgelaufen! Bitte führe den Login erneut aus.");
      await context.close();
      process.exit(1);
    }

    console.log("Sammle Bestellungen über Seitennavigation...");

    let pageNum = 1;
    let hasNext = true;

    while (hasNext && pageNum <= options.maxPages) {
      await page.waitForTimeout(2500);

      // Extract order IDs and dates from the rendered DOM as well
      const domOrders = await page.evaluate(() => {
        const results = [];
        const orderCards = document.querySelectorAll('[class*="order-item"], [class*="order-card"], tr.order-bd, .order-item');
        
        orderCards.forEach(card => {
          const text = card.innerText || '';
          const idMatch = text.match(/(?:Order ID|Bestellnummer|Order Number)[:\s]+([0-9]{10,20})/i) ||
                          card.getAttribute('data-order-id');
          const orderId = typeof idMatch === 'string' ? idMatch : (idMatch ? idMatch[1] : null);

          const dateMatch = text.match(/(?:Order date|Bestelldatum)[:\s]+([0-9A-Za-z.,\s-]+)/i);
          const rawDate = dateMatch ? dateMatch[1].trim() : null;

          const priceMatch = text.match(/([0-9]+[.,][0-9]{2})\s*(?:€|\$|EUR|USD)/) ||
                             text.match(/(?:€|\$|EUR|USD)\s*([0-9]+[.,][0-9]{2})/);
          const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : 0;

          const storeEl = card.querySelector('[class*="store"], [class*="seller"], a[href*="/store/"]');
          const storeName = storeEl ? storeEl.innerText.trim() : 'AliExpress Seller';

          if (orderId) {
            results.push({ orderId, rawDate, storeName, price });
          }
        });

        // Fallback: search all links pointing to order details
        if (results.length === 0) {
          const detailLinks = Array.from(document.querySelectorAll('a[href*="orderId="], a[href*="detail.html"]'));
          detailLinks.forEach(link => {
            const href = link.getAttribute('href') || '';
            const m = href.match(/orderId=([0-9]+)/);
            if (m) {
              results.push({ orderId: m[1], rawDate: null, storeName: 'AliExpress Seller', price: 0 });
            }
          });
        }

        return results;
      });

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

      console.log(`  ✓ Seite ${pageNum}: ${collectedOrders.size} Bestellungen insgesamt erfasst.`);

      // Check if there is a next page button
      const nextButton = await page.$('.comet-pagination-next:not(.comet-pagination-disabled), button[aria-label="Next page"], a:has-text("Next"), [class*="pagination-next"]');
      if (nextButton && !options.scan) {
        try {
          await nextButton.click();
          pageNum++;
          await page.waitForTimeout(3000);
        } catch (e) {
          hasNext = false;
        }
      } else {
        hasNext = false;
      }
    }

    const allOrders = Array.from(collectedOrders.values());

    if (allOrders.length === 0) {
      console.log("\n⚠️ Keine Bestellungen im Konto gefunden oder Seite noch im Aufbau.");
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

    // Filter orders based on options
    let filteredOrders = allOrders;

    if (options.year) {
      filteredOrders = allOrders.filter(o => o.orderDate && o.orderDate.startsWith(options.year));
      console.log(`\n🎯 Filter Jahr ${options.year}: ${filteredOrders.length} Bestellungen.`);
    } else if (options.startDate && options.endDate) {
      filteredOrders = allOrders.filter(o => o.orderDate >= options.startDate && o.orderDate <= options.endDate);
      console.log(`\n🎯 Filter Zeitraum ${options.startDate} bis ${options.endDate}: ${filteredOrders.length} Bestellungen.`);
    }

    console.log(`\n⬇️ Starte Download & PDF-Konvertierung für ${filteredOrders.length} Bestellungen...\n`);

    const ledger = fs.existsSync(LEDGER_FILE) ? JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')) : {};

    for (let i = 0; i < filteredOrders.length; i++) {
      const order = filteredOrders[i];
      const targetPdfName = `AliExpress-${order.orderDate}-${order.orderId}.pdf`;
      const targetPdfPath = path.join(INVOICE_DIR, targetPdfName);

      console.log(`[${i + 1}/${filteredOrders.length}] ${order.orderDate} | Order #${order.orderId} (${order.totalAmount.toFixed(2)} ${order.currency})`);

      if (fs.existsSync(targetPdfPath)) {
        console.log(`  ⏩ Bereits vorhanden: ${targetPdfName}`);
        continue;
      }

      // Navigate to detail page
      const detailUrl = `https://www.aliexpress.com/p/order/detail.html?orderId=${order.orderId}`;
      try {
        await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        let pdfSaved = false;

        // Check 1: Official PDF download button
        const invoiceBtn = await page.$('button:has-text("Download invoice"), a:has-text("Download invoice"), button:has-text("Rechnung herunterladen"), a:has-text("Rechnung herunterladen"), [data-role="download-invoice"]');
        if (invoiceBtn) {
          try {
            const [download] = await Promise.all([
              page.waitForEvent('download', { timeout: 10000 }),
              invoiceBtn.click()
            ]);
            if (download) {
              await download.saveAs(targetPdfPath);
              console.log(`  ✅ PDF heruntergeladen: ${targetPdfName}`);
              pdfSaved = true;
            }
          } catch (e) {}
        }

        // Check 2: PNG Receipt modal or canvas
        if (!pdfSaved) {
          const receiptBtn = await page.$('button:has-text("Download Receipt"), a:has-text("Download Receipt"), button:has-text("Beleg herunterladen"), a:has-text("Beleg herunterladen"), [class*="receipt-btn"]');
          if (receiptBtn) {
            try {
              await receiptBtn.click();
              await page.waitForTimeout(2500);

              const modalEl = await page.$('.receipt-modal, .receipt-content, .order-receipt, [class*="receipt-dialog"]');
              if (modalEl) {
                const pngBuffer = await modalEl.screenshot({ type: 'png' });
                await convertPngToA4Pdf({
                  pngInput: pngBuffer,
                  outputPath: targetPdfPath,
                  orderId: order.orderId,
                  orderDate: order.orderDate,
                  metadata: {
                    storeName: order.storeName,
                    totalAmount: order.totalAmount,
                    currency: order.currency
                  }
                });
                console.log(`  ✅ PNG-Beleg in PDF konvertiert: ${targetPdfName}`);
                pdfSaved = true;
              }
            } catch (e) {}
          }
        }

        // Check 3: Clean Fallback Print PDF
        if (!pdfSaved) {
          await page.pdf({
            path: targetPdfPath,
            format: 'A4',
            printBackground: true,
            margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
          });
          console.log(`  ✅ Beleg als A4-PDF erfasst: ${targetPdfName}`);
          pdfSaved = true;
        }

        // Update ledger entry
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
        console.log(`  ⚠️ Fehler bei Bestellung ${order.orderId}: ${err.message}`);
      }
    }

    console.log(`\n🎉 Vorgang abgeschlossen! Rechnungen gespeichert in:\n   ${INVOICE_DIR}\n`);

  } finally {
    await context.close();
  }
}

if (require.main === module) {
  startAliExpressFetcher();
}

module.exports = { startAliExpressFetcher };
