const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const userDataDir = path.join(__dirname, '.auth-profile/amazon');
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  const page = context.pages()[0] || await context.newPage();
  
  try {
    const orderId = '303-3435358-5901943'; // Take an order ID from the ledger
    await page.goto(`https://www.amazon.de/gp/your-account/order-details?orderID=${orderId}`, { waitUntil: 'domcontentloaded' });
    console.log('Navigated to Order Details.');
    await page.waitForTimeout(2000);

    const invoiceTriggers = await page.$$('a[id^="a-autoid-"][href*="invoice"], a:has-text("Rechnung"), a:has-text("Invoice")');
    console.log(`Found ${invoiceTriggers.length} potential invoice triggers.`);

    for (let trigger of invoiceTriggers) {
      const text = await trigger.innerText();
      if (text.toLowerCase().includes('rechnung') || text.toLowerCase().includes('invoice')) {
        console.log('Clicking trigger:', text);
        await trigger.click();
        await page.waitForTimeout(2000);
        
        const pdfLink = await page.$('a[href*="/documents/download/"]');
        if (pdfLink) {
          console.log('Found PDF Link:', await pdfLink.getAttribute('href'));
          break;
        }
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await context.close();
  }
})();
