const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const { getAuthDir } = require('../../utils/paths');

const AUTH_DIR = getAuthDir('aliexpress');

async function loginAliExpress() {
  console.log("\n======================================================");
  console.log("       🛍️ AliExpress Session Authenticator 🛍️       ");
  console.log("======================================================\n");
  console.log("Öffne Chrome-Browser...");
  console.log("👉 Bitte logge dich bei AliExpress ein (QR-Code per App, SMS oder Passwort).\n");

  let context;
  try {
    context = await chromium.launchPersistentContext(AUTH_DIR, {
      headless: false,
      channel: 'chrome',
      viewport: { width: 1360, height: 850 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });
  } catch (e) {
    context = await chromium.launchPersistentContext(AUTH_DIR, {
      headless: false,
      viewport: { width: 1360, height: 850 }
    });
  }

  context.setDefaultTimeout(0);

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  // navigator.webdriver = false
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    console.log("Lade AliExpress Bestellseite...");
    await page.goto('https://www.aliexpress.com/p/order/index.html', { waitUntil: 'domcontentloaded' }).catch(() => {});

    console.log("Warte auf erfolgreichen Login in der Bestellübersicht (Du hast alle Zeit der Welt)...");

    let loggedIn = false;
    while (!loggedIn) {
      await new Promise(r => setTimeout(r, 1500));
      
      try {
        const pages = context.pages();
        for (const p of pages) {
          const url = p.url();
          const onOrderPage = (url.includes('/p/order/') || url.includes('/orderList.htm') || url.includes('trade.aliexpress.com')) &&
                              !url.includes('login') && 
                              !url.includes('passport');

          if (onOrderPage) {
            loggedIn = true;
            break;
          }
        }
      } catch (e) {}
    }

    console.log("\n✅ Login erfolgreich erkannt! Warte kurz, um Cookies zu synchronisieren...");
    await new Promise(r => setTimeout(r, 4000));
    console.log(`✅ Session erfolgreich gespeichert in: ${AUTH_DIR}\n`);

  } catch (err) {
    console.log("\n⚠️ Login-Fehler:", err.message);
  } finally {
    if (context) await context.close();
  }
}

if (require.main === module) {
  loginAliExpress();
}

module.exports = { loginAliExpress };
