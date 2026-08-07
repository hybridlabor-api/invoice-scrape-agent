const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const AUTH_DIR = path.join(__dirname, '../../.auth-profile/aliexpress');
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

async function loginAliExpress() {
  console.log("\n======================================================");
  console.log("       🛍️ AliExpress Session Authenticator 🛍️       ");
  console.log("======================================================\n");
  console.log("Öffne Chrome-Browser...");
  console.log("👉 Bitte logge dich bei AliExpress ein (per QR-Code in der App, SMS oder Passwort).\n");

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

  try {
    await page.goto('https://www.aliexpress.com/p/order/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log("Warte auf erfolgreichen Login in der Bestellübersicht...");

    // Wait until user lands on the order list page
    await page.waitForFunction(() => {
      const url = window.location.href;
      return (url.includes('/p/order/') || url.includes('/orderList.htm')) && !url.includes('login') && !url.includes('passport');
    }, { timeout: 300000 });

    // Extra brief wait to ensure session cookies write to disk
    await page.waitForTimeout(3000);

    console.log("\n✅ Erfolgreich eingeloggt! Session wurde dauerhaft gespeichert in .auth-profile/aliexpress/");
  } catch (err) {
    console.log("\n⚠️ Login-Vorgang abgebrochen oder Timeout erreicht.");
  } finally {
    await context.close();
  }
}

if (require.main === module) {
  loginAliExpress();
}

module.exports = { loginAliExpress };
