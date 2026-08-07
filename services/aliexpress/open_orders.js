const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const rootProfile = path.join(__dirname, '../../.auth-profile/aliexpress');
const localProfile = path.join(__dirname, '.auth-profile');
const AUTH_DIR = fs.existsSync(path.dirname(rootProfile)) ? rootProfile : localProfile;

async function openOrdersPage() {
  console.log("\n🌐 Öffne AliExpress-Bestellungen in einem einzelnen Tab...");
  
  let context;
  try {
    context = await chromium.launchPersistentContext(AUTH_DIR, {
      headless: false,
      channel: 'chrome',
      viewport: null,
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation']
    });
  } catch (e) {
    context = await chromium.launchPersistentContext(AUTH_DIR, {
      headless: false,
      viewport: null
    });
  }

  // Close extra tabs so only 1 single tab exists
  const pages = context.pages();
  for (let i = 1; i < pages.length; i++) {
    await pages[i].close().catch(() => {});
  }

  const page = pages.length > 0 ? pages[0] : await context.newPage();
  await page.goto('https://www.aliexpress.com/p/order/index.html', { waitUntil: 'domcontentloaded' }).catch(() => {});

  console.log("✅ Tab geöffnet: https://www.aliexpress.com/p/order/index.html");
  console.log("👉 Du kannst nun ganz in Ruhe im Browser navigieren und klicken. Der Agent wartet und macht nichts.");

  // Keep open until the user closes the browser
  await new Promise(resolve => context.on('close', resolve));
}

openOrdersPage().catch(err => {
  console.error("Fehler:", err.message);
});
