const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const rootProfile = path.join(__dirname, '../../.auth-profile/aliexpress');
const localProfile = path.join(__dirname, '.auth-profile');
const AUTH_DIR = fs.existsSync(path.dirname(rootProfile)) ? rootProfile : localProfile;

const rootInvoices = path.join(__dirname, '../../invoices/aliexpress');
const localInvoices = path.join(__dirname, 'invoices');
const INVOICE_DIR = fs.existsSync(path.dirname(rootInvoices)) ? rootInvoices : localInvoices;
const SCAN_SUMMARY_FILE = path.join(INVOICE_DIR, 'account_scan_summary.json');
const LEDGER_FILE = path.join(INVOICE_DIR, 'aliexpress_ledger.json');

if (!fs.existsSync(INVOICE_DIR)) {
  fs.mkdirSync(INVOICE_DIR, { recursive: true });
}

const monthMap = {
  'jan': 0, 'feb': 1, 'mar': 2, 'mär': 2, 'apr': 3, 'may': 4, 'mai': 4,
  'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'okt': 9, 'nov': 10, 'dec': 11, 'dez': 11
};

function normalizeDate(rawDate) {
  if (!rawDate) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;

  // e.g. "Aug 7, 2026", "7. Aug. 2026"
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

async function scanAliExpressAccount() {
  if (!fs.existsSync(AUTH_DIR)) {
    console.error("\n❌ FEHLER: Du bist nicht bei AliExpress eingeloggt!");
    console.error("Bitte führe zuerst den Login aus: npm run auth:aliexpress\n");
    process.exit(1);
  }

  console.log("\n======================================================");
  console.log("   🔍 AliExpress Account Scan & Order-Analyse 🔍      ");
  console.log("======================================================\n");
  console.log("🌐 Starte Browser und analysiere vollständigen Bestellverlauf...\n");

  let context;
  try {
    context = await chromium.launchPersistentContext(AUTH_DIR, {
      headless: false,
      channel: 'chrome',
      viewport: { width: 1280, height: 900 }
    });
  } catch (e) {
    context = await chromium.launchPersistentContext(AUTH_DIR, {
      headless: false,
      viewport: { width: 1280, height: 900 }
    });
  }

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  const collectedOrders = new Map();

  // Intercept MTOP network responses
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
                currency: f.currencyCode || 'EUR'
              });
            }
          }
        }
      } catch (e) {}
    }
  });

  try {
    const initialUrl = 'https://www.aliexpress.com/p/order/index.html';
    await page.goto(initialUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);

    if (page.url().includes('login') || page.url().includes('passport')) {
      console.error("\n❌ FEHLER: Login abgelaufen! Bitte führe 'npm run auth:aliexpress' erneut aus.");
      await context.close();
      process.exit(1);
    }

    let pass = 1;
    let keepScanning = true;
    let consecutiveUnchanged = 0;
    const maxPasses = 150; // Scan up to 150 clicks

    while (keepScanning && pass <= maxPasses) {
      // 1. Locate the exact 'View orders' button
      const viewMoreBtn = page.locator('button, [role="button"], div, span, a').filter({
        hasText: /^View orders|^View more orders|^Mehr anzeigen/i
      }).first();

      const btnExists = await viewMoreBtn.count() > 0 && await viewMoreBtn.isVisible().catch(() => false);

      if (btnExists) {
        try {
          await viewMoreBtn.scrollIntoViewIfNeeded();
          await page.waitForTimeout(400);
          await viewMoreBtn.click();
          await page.waitForTimeout(2000);
        } catch (e) {}
      } else {
        // Scroll down slightly in case the button is just below the visible fold
        await page.evaluate(() => window.scrollBy(0, 600));
        await page.waitForTimeout(1000);
      }

      // 2. DOM extraction
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
            currency: 'EUR'
          });
        }
      }

      process.stdout.write(`\r🔄 Klick ${pass}: ${collectedOrders.size} Bestellungen erfasst...`);

      if (collectedOrders.size === beforeCount && !btnExists) {
        consecutiveUnchanged++;
        if (consecutiveUnchanged >= 3) {
          keepScanning = false;
        }
      } else {
        consecutiveUnchanged = 0;
      }
      pass++;
    }

    console.log("\n");

    const allOrders = Array.from(collectedOrders.values());

    if (allOrders.length === 0) {
      console.log("⚠️ Keine Bestellungen im AliExpress-Konto gefunden.");
      return;
    }

    // Sort descending by date
    allOrders.sort((a, b) => (b.orderDate || '').localeCompare(a.orderDate || ''));

    // Check existing downloaded PDFs
    const existingPdfs = new Set(
      fs.existsSync(INVOICE_DIR) ? fs.readdirSync(INVOICE_DIR).filter(f => f.endsWith('.pdf')) : []
    );

    // Group by Year
    const yearStats = {};
    let totalSpent = 0;

    for (const order of allOrders) {
      const year = order.orderDate ? order.orderDate.slice(0, 4) : 'Unbekannt';
      if (!yearStats[year]) {
        yearStats[year] = { count: 0, totalAmount: 0, downloaded: 0, pending: 0, orders: [] };
      }
      yearStats[year].count++;
      yearStats[year].totalAmount += order.totalAmount || 0;
      yearStats[year].orders.push(order);
      totalSpent += order.totalAmount || 0;

      const expectedPdf = `AliExpress-${order.orderDate}-${order.orderId}.pdf`;
      if (existingPdfs.has(expectedPdf)) {
        yearStats[year].downloaded++;
      } else {
        yearStats[year].pending++;
      }
    }

    // Output formatted report
    console.log("======================================================");
    console.log("          📊 KONTO-ANALYSE ERGEBNIS 📊                ");
    console.log("======================================================");
    console.log(`📦 Bestellungen gesamt:    ${allOrders.length}`);
    console.log(`📅 Älteste Bestellung:     ${allOrders[allOrders.length - 1].orderDate}`);
    console.log(`📅 Neueste Bestellung:     ${allOrders[0].orderDate}`);
    console.log(`💰 Gesamtausgaben erfasst: ${totalSpent.toFixed(2)} €\n`);

    console.log("--------------------------------------------------------------------------------");
    console.log("  Jahr    Bestellungen    Gesamtsumme    Vorhandene PDFs    Offene Downloads    ");
    console.log("--------------------------------------------------------------------------------");

    const sortedYears = Object.keys(yearStats).sort().reverse();
    for (const yr of sortedYears) {
      const s = yearStats[yr];
      const yrStr = yr.padEnd(8);
      const countStr = `${s.count} Stk.`.padEnd(16);
      const sumStr = `${s.totalAmount.toFixed(2)} €`.padEnd(15);
      const dlStr = `${s.downloaded} PDFs`.padEnd(19);
      const pendStr = s.pending === 0 ? '✅ Komplett' : `⏳ ${s.pending} offen`;
      console.log(`  ${yrStr}${countStr}${sumStr}${dlStr}${pendStr}`);
    }
    console.log("--------------------------------------------------------------------------------\n");

    // Save summary to JSON
    const summaryData = {
      scannedAt: new Date().toISOString(),
      totalOrders: allOrders.length,
      earliestOrderDate: allOrders[allOrders.length - 1].orderDate,
      latestOrderDate: allOrders[0].orderDate,
      totalAmountSpent: parseFloat(totalSpent.toFixed(2)),
      years: yearStats,
      orders: allOrders
    };

    fs.writeFileSync(SCAN_SUMMARY_FILE, JSON.stringify(summaryData, null, 2));
    console.log(`💾 Scan-Zusammenfassung gespeichert in:\n   ${SCAN_SUMMARY_FILE}\n`);

    return summaryData;

  } finally {
    if (context) await context.close();
  }
}

if (require.main === module) {
  scanAliExpressAccount().catch(err => {
    console.error("❌ Fehler beim Scan:", err.message);
    process.exit(1);
  });
}

module.exports = { scanAliExpressAccount };
