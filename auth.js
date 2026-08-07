const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');

(async () => {
  console.log("==================================================================");
  console.log("🔐 AUTO-LOGIN STARTER");
  console.log("Es öffnet sich gleich ein lokales Chrome-Fenster.");
  console.log("Bitte logge dich bei Uber ein. Das Skript wartet auf den Erfolg...");
  console.log("==================================================================");

  const userDataDir = path.join(__dirname, '.auth-profile');
  let context;
  try {
    // Stealth-Modus für Cloudflare + Permanentes Profil
    context = await chromium.launchPersistentContext(userDataDir, { 
      headless: false, 
      channel: 'chrome',
      viewport: null,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--start-maximized'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });
  } catch (e) {
    console.log("⚠️ Chrome konnte nicht gefunden werden. Fallback auf Standard-Chromium...");
    context = await chromium.launchPersistentContext(userDataDir, { headless: false });
  }
  
  // Timeout auf unendlich setzen
  context.setDefaultTimeout(0);
  
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  // navigator.webdriver = false setzen, um Bot-Protection zu umgehen
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  try {
    await page.goto('https://riders.uber.com/', { waitUntil: 'domcontentloaded' });

    console.log("Warte auf erfolgreichen Login (Du hast alle Zeit der Welt)...");
    
    // Warten auf Erfolg - unendlicher Timeout, bis der User den Login abschließt
    await page.waitForFunction(() => {
      return window.location.href.includes('/trips') || document.querySelector('[data-baseweb="avatar"]');
    }, { timeout: 0 });

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
    // Kein process.exit(0) hier, damit der finally-Block erreicht wird und Chrome das Profil speichert!
  } catch (error) {
    console.log("\n❌ Fehler beim automatischen Login:");
    console.log(error.message);
    process.exit(1);
  } finally {
    if (context) await context.close();
  }
})();
