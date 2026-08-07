const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const userDataDir = path.join(__dirname, '.auth-profile/amazon');
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  const page = context.pages()[0] || await context.newPage();
  
  try {
    const orders = [
      'D01-8373547-5928633',
      'D01-8575948-7890240',
      'D01-3656774-0367057',
      'D01-4109198-0850204',
      '303-8774022-8576356',
      '303-1394250-3675522'
    ];
    
    for (const orderId of orders) {
      console.log('Fetching popover for:', orderId);
      const popoverUrl = `https://www.amazon.de/your-orders/invoice/popover?orderId=${orderId}`;
      const response = await page.request.get(popoverUrl);
      const html = await response.text();
      
      const match = html.match(/\/documents\/download\/[a-f0-9-]+\/invoice\.pdf/);
      if (match) {
        console.log('SUCCESS! Found PDF Link:', match[0]);
      } else {
        console.log('Failed:', html.substring(0, 100).replace(/\n/g, ''));
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await context.close();
  }
})();
