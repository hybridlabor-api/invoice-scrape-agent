const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const userDataDir = path.join(__dirname, '.auth-profile/amazon');
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true });
  const page = context.pages()[0] || await context.newPage();
  
  try {
    await page.goto('https://www.amazon.de/your-orders/orders?timeFilter=year-2025', { waitUntil: 'domcontentloaded' });
    
    const cardTexts = await page.evaluate(() => {
      const cards = document.querySelectorAll('.order-card, .yo-card-manage, [data-component-type="orderCard"]');
      return Array.from(cards).slice(0, 3).map(c => c.innerText);
    });
    
    console.log('--- Card 1 ---');
    console.log(cardTexts[0]);
  } catch (err) {
    console.error(err);
  } finally {
    await context.close();
  }
})();
