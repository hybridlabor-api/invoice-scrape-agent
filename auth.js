const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');

(async () => {
  console.log("==================================================================");
  console.log("🔐 AUTO-LOGIN STARTER");
  console.log("Es öffnet sich gleich ein Browser-Fenster.");
  console.log("Bitte logge dich bei Uber ein. Das Skript wartet auf den Erfolg...");
  console.log("==================================================================");

  const browser = await chromium.launch({ headless: false });
  // Persistent Context, falls der User Cookies behalten will, aber wir machen es frisch:
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://riders.uber.com/', { waitUntil: 'networkidle' });

  // Wir warten, bis der User sich eingeloggt hat und weitergeleitet wurde.
  // Meist landet man nach dem Login auf /trips oder das Profil-Icon (Activity) taucht auf.
  try {
    // Warten wir bis zu 3 Minuten (180 Sekunden) auf den erfolgreichen Login.
    await page.waitForFunction(() => {
      // Erkennungsmerkmal: Ist der User eingeloggt? 
      // Z.B. Activity Link ist vorhanden oder URL ist /trips
      return window.location.href.includes('/trips') || document.querySelector('[data-baseweb="avatar"]');
    }, { timeout: 180000 });

    console.log("\n✅ Login erkannt! Extrahiere Session-Cookies...");
    
    const cookies = await context.cookies();
    // Konvertiere das Playwright Cookie-Format in einen HTTP Cookie-String
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    // Lese alte .env Datei
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Update oder setze COOKIE=...
    if (envContent.includes('COOKIE=')) {
      envContent = envContent.replace(/COOKIE=.*/g, `COOKIE="${cookieString}"`);
    } else {
      envContent += `\nCOOKIE="${cookieString}"\n`;
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n');
    console.log("✅ Cookie erfolgreich extrahiert und in .env gespeichert!");

  } catch (error) {
    console.log("❌ Zeitüberschreitung oder Fehler beim automatischen Login:");
    console.log(error.message);
  } finally {
    await browser.close();
  }
})();
