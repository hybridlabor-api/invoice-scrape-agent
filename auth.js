const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');

(async () => {
  console.log("==================================================================");
  console.log("🔐 AUTO-LOGIN STARTER");
  console.log("Es öffnet sich gleich ein lokales Chrome-Fenster (Bot-Schutz umgehen).");
  console.log("Bitte logge dich bei Uber ein. Das Skript wartet auf den Erfolg...");
  console.log("==================================================================");

  let browser;
  try {
    // channel: 'chrome' benutzt den echten, installierten Google Chrome statt der Playwright-Version
    // Dies umgeht in 99% der Fälle den "Browser nicht sicher" Fehler bei Uber/Cloudflare.
    browser = await chromium.launch({ headless: false, channel: 'chrome' });
  } catch (e) {
    console.log("⚠️ Chrome konnte nicht gefunden werden. Fallback auf Standard-Chromium...");
    browser = await chromium.launch({ headless: false });
  }
  
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // waitUntil: 'domcontentloaded' statt 'networkidle', um Timeouts bei SPAs zu verhindern
    await page.goto('https://riders.uber.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log("Warte auf erfolgreichen Login (bis zu 3 Minuten)...");
    
    await page.waitForFunction(() => {
      return window.location.href.includes('/trips') || document.querySelector('[data-baseweb="avatar"]');
    }, { timeout: 180000 });

    console.log("\n✅ Login erkannt! Extrahiere Session-Cookies...");
    
    const cookies = await context.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    if (envContent.includes('COOKIE=')) {
      envContent = envContent.replace(/COOKIE=.*/g, `COOKIE="${cookieString}"`);
    } else {
      envContent += `\nCOOKIE="${cookieString}"\n`;
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n');
    console.log("✅ Cookie erfolgreich extrahiert und in .env gespeichert!");
    process.exit(0);
  } catch (error) {
    console.log("\n❌ Zeitüberschreitung oder Fehler beim automatischen Login:");
    console.log(error.message);
    console.log("\nTipp: Falls der Auto-Login weiterhin fehlschlägt, füge den Cookie manuell in die .env Datei ein.");
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
