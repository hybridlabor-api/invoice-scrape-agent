const inquirer = require('inquirer').default || require('inquirer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

(async () => {
  console.log("\n======================================================");
  console.log("       🚖 Uber Invoice Agent - Initial Setup 🚖        ");
  console.log("======================================================\n");

  const INVOICE_DIR = path.join(__dirname, 'invoices');
  if (!fs.existsSync(INVOICE_DIR)) {
    fs.mkdirSync(INVOICE_DIR, { recursive: true });
    console.log("📁 Verzeichnis 'invoices/' erstellt.");
  }

  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'runAuth',
      message: 'Möchtest du dich jetzt einmalig bei Uber im Chrome-Browser einloggen?',
      default: true
    }
  ]);

  if (answers.runAuth) {
    console.log("\n🌐 Öffne Chrome für den Login auf riders.uber.com...");
    try {
      execSync('node auth.js', { stdio: 'inherit' });
      console.log("\n✅ Login erfolgreich in .auth-profile gespeichert!");
    } catch (e) {
      console.log("\n⚠️ Login wurde abgebrochen oder ist fehlgeschlagen.");
      console.log("Du kannst den Login jederzeit mit 'npm run auth' wiederholen.");
    }
  }

  const nextAction = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'startMenu',
      message: 'Möchtest du jetzt direkt das Hauptmenü starten?',
      default: true
    }
  ]);

  if (nextAction.startMenu) {
    try {
      execSync('node index.js', { stdio: 'inherit' });
    } catch (e) {}
  } else {
    console.log("\n✨ Setup abgeschlossen! Starte das Tool jederzeit mit:");
    console.log("   npm start\n");
  }
})();
