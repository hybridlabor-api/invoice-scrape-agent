const inquirer = require('inquirer').default || require('inquirer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

(async () => {
  console.log("\n======================================================");
  console.log("       🧾 BDB Invoice Suite - Initial Setup 🧾         ");
  console.log("======================================================\n");

  const INVOICE_DIRS = [
    path.join(__dirname, 'invoices'),
    path.join(__dirname, 'invoices/uber'),
    path.join(__dirname, 'invoices/aliexpress')
  ];

  INVOICE_DIRS.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  console.log("📁 Verzeichnisse 'invoices/uber' und 'invoices/aliexpress' bereit.\n");

  const answers = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'servicesToAuth',
      message: 'Bei welchen Diensten möchtest du dich jetzt im Chrome-Browser einloggen?',
      choices: [
        { name: '🚖 Uber (riders.uber.com)', value: 'uber', checked: true },
        { name: '🛍️ AliExpress (aliexpress.com)', value: 'aliexpress', checked: true }
      ]
    }
  ]);

  if (answers.servicesToAuth.includes('uber')) {
    console.log("\n🌐 Öffne Chrome für den Login auf riders.uber.com...");
    try {
      execSync('node services/uber/auth.js', { stdio: 'inherit' });
    } catch (e) {
      console.log("⚠️ Uber Login abgebrochen.");
    }
  }

  if (answers.servicesToAuth.includes('aliexpress')) {
    console.log("\n🌐 Öffne Chrome für den Login auf aliexpress.com...");
    try {
      execSync('node services/aliexpress/auth.js', { stdio: 'inherit' });
    } catch (e) {
      console.log("⚠️ AliExpress Login abgebrochen.");
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
