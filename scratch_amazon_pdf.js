const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const userDataDir = path.join(__dirname, '.auth-profile/amazon');
  const context = await chromium.launchPersistentContext(userDataDir, { 
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
    acceptDownloads: true
  });

  const page = context.pages()[0] || await context.newPage();
  
  try {
    await page.goto('https://www.amazon.de/your-orders/orders?timeFilter=year-2025', { waitUntil: 'domcontentloaded' });
    console.log('Navigated to Orders 2025.');
    await page.waitForTimeout(3000);

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
          const href = await pdfLink.getAttribute('href');
          const fullUrl = href.startsWith('http') ? href : `https://www.amazon.de${href}`;
          console.log('Found PDF Link:', fullUrl);
          
          console.log('Downloading via page.request.get()...');
          const response = await page.request.get(fullUrl);
          const buffer = await response.body();
          
          const targetPath = path.join(__dirname, 'invoices/amazon/test_invoice.pdf');
          fs.writeFileSync(targetPath, buffer);
          console.log('Downloaded bytes:', buffer.length, 'to', targetPath);
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
