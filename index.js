#!/usr/bin/env node

const inquirer = require('inquirer').default || require('inquirer');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function handleUberMenu() {
  while (true) {
    console.clear();
    console.log("======================================================");
    console.log("       🚖 Uber Invoice Agent - Menü 🚖                ");
    console.log("======================================================\n");

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Was möchtest du tun?',
        choices: [
          { name: '🔍 Alle Fahrten scannen (Zeitraum & Anzahl ermitteln)', value: 'scan' },
          { name: '⬇️  Alle Rechnungen herunterladen (Komplettes Konto)', value: 'download_all' },
          { name: '📅 Bestimmtes Jahr herunterladen (z.B. 2025, 2026)', value: 'download_year' },
          { name: '📆 Benutzerdefinierten Zeitraum herunterladen', value: 'download_range' },
          { name: '📊 PDF-Gesamtauflistung erstellen (Tabelle aller Rechnungen)', value: 'analyze' },
          { name: '🔑 Uber Login / Re-Authentifizierung', value: 'auth' },
          new inquirer.Separator(),
          { name: '🔙 Zurück zum Hauptmenü', value: 'back' }
        ]
      }
    ]);

    if (action === 'back') break;

    if (action === 'scan') {
      console.log("\n🔍 Scanne alle Fahrten im Uber-Konto...\n");
      try {
        execSync('node services/uber/fetcher.js --scan', { stdio: 'inherit' });
      } catch (e) {}
      await waitPrompt();
    } else if (action === 'download_all') {
      console.log("\n⬇️  Starte Download aller Rechnungen...\n");
      try {
        execSync('node services/uber/fetcher.js --all', { stdio: 'inherit' });
      } catch (e) {}
      await waitPrompt();
    } else if (action === 'download_year') {
      const { year } = await inquirer.prompt([
        {
          type: 'input',
          name: 'year',
          message: 'Welches Jahr möchtest du herunterladen? (z.B. 2025):',
          default: new Date().getFullYear().toString(),
          validate: (input) => /^\d{4}$/.test(input) || 'Bitte ein 4-stelliges Jahr eingeben!'
        }
      ]);
      console.log(`\n⬇️  Lade alle Rechnungen für das Jahr ${year} herunter...\n`);
      try {
        execSync(`node services/uber/fetcher.js --start ${year}-01-01 --end ${year}-12-31`, { stdio: 'inherit' });
      } catch (e) {}
      await waitPrompt();
    } else if (action === 'download_range') {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'startDate',
          message: 'Startdatum (YYYY-MM-DD):',
          default: `${new Date().getFullYear()}-01-01`,
          validate: (input) => /^\d{4}-\d{2}-\d{2}$/.test(input) || 'Format muss YYYY-MM-DD sein!'
        },
        {
          type: 'input',
          name: 'endDate',
          message: 'Enddatum (YYYY-MM-DD):',
          default: new Date().toISOString().slice(0, 10),
          validate: (input) => /^\d{4}-\d{2}-\d{2}$/.test(input) || 'Format muss YYYY-MM-DD sein!'
        }
      ]);
      console.log(`\n⬇️  Lade Rechnungen von ${answers.startDate} bis ${answers.endDate} herunter...\n`);
      try {
        execSync(`node services/uber/fetcher.js --start ${answers.startDate} --end ${answers.endDate}`, { stdio: 'inherit' });
      } catch (e) {}
      await waitPrompt();
    } else if (action === 'analyze') {
      console.log("\n📊 Generiere PDF-Gesamtauflistung...\n");
      try {
        execSync('node services/uber/analyzer.js', { stdio: 'inherit' });
      } catch (e) {}
      await waitPrompt();
    } else if (action === 'auth') {
      console.log("\n🔑 Starte Uber Login...\n");
      try {
        execSync('node services/uber/auth.js', { stdio: 'inherit' });
      } catch (e) {}
      await waitPrompt();
    }
  }
}

async function handleAliExpressMenu() {
  while (true) {
    console.clear();
    console.log("======================================================");
    console.log("       🛍️ AliExpress Invoice Agent - Menü 🛍️         ");
    console.log("======================================================\n");

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Was möchtest du tun?',
        choices: [
          { name: '🔍 Alle Bestellungen scannen (Zeitraum & Anzahl ermitteln)', value: 'scan' },
          { name: '⬇️  Alle Belege/Rechnungen herunterladen & in PDF umwandeln', value: 'download_all' },
          { name: '📅 Bestimmtes Jahr herunterladen (z.B. 2025, 2026)', value: 'download_year' },
          { name: '📆 Benutzerdefinierten Zeitraum herunterladen', value: 'download_range' },
          { name: '📊 PDF-Gesamtauflistung erstellen (Tabelle aller Belege)', value: 'analyze' },
          { name: '🔑 AliExpress Login / Re-Authentifizierung', value: 'auth' },
          new inquirer.Separator(),
          { name: '🔙 Zurück zum Hauptmenü', value: 'back' }
        ]
      }
    ]);

    if (action === 'back') break;

    if (action === 'scan') {
      try {
        execSync('node services/aliexpress/scanner.js', { stdio: 'inherit' });
      } catch (e) {}
      await waitPrompt();
    } else if (action === 'download_all') {
      console.log("\n⬇️  Starte Download aller AliExpress-Belege...\n");
      try {
        execSync('node services/aliexpress/fetcher.js --all', { stdio: 'inherit' });
      } catch (e) {}
      await waitPrompt();
    } else if (action === 'download_year') {
      const { year } = await inquirer.prompt([
        {
          type: 'input',
          name: 'year',
          message: 'Welches Jahr möchtest du herunterladen? (z.B. 2025):',
          default: new Date().getFullYear().toString(),
          validate: (input) => /^\d{4}$/.test(input) || 'Bitte ein 4-stelliges Jahr eingeben!'
        }
      ]);
      console.log(`\n⬇️  Lade alle AliExpress-Belege für das Jahr ${year} herunter...\n`);
      try {
        execSync(`node services/aliexpress/fetcher.js --year ${year}`, { stdio: 'inherit' });
      } catch (e) {}
      await waitPrompt();
    } else if (action === 'download_range') {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'startDate',
          message: 'Startdatum (YYYY-MM-DD):',
          default: `${new Date().getFullYear()}-01-01`,
          validate: (input) => /^\d{4}-\d{2}-\d{2}$/.test(input) || 'Format muss YYYY-MM-DD sein!'
        },
        {
          type: 'input',
          name: 'endDate',
          message: 'Enddatum (YYYY-MM-DD):',
          default: new Date().toISOString().slice(0, 10),
          validate: (input) => /^\d{4}-\d{2}-\d{2}$/.test(input) || 'Format muss YYYY-MM-DD sein!'
        }
      ]);
      console.log(`\n⬇️  Lade AliExpress-Belege von ${answers.startDate} bis ${answers.endDate} herunter...\n`);
      try {
        execSync(`node services/aliexpress/fetcher.js --start ${answers.startDate} --end ${answers.endDate}`, { stdio: 'inherit' });
      } catch (e) {}
      await waitPrompt();
    } else if (action === 'analyze') {
      console.log("\n📊 Generiere AliExpress PDF-Gesamtauflistung...\n");
      try {
        execSync('node services/aliexpress/analyzer.js', { stdio: 'inherit' });
      } catch (e) {}
      await waitPrompt();
    } else if (action === 'auth') {
      console.log("\n🔑 Starte AliExpress Login...\n");
      try {
        execSync('node services/aliexpress/auth.js', { stdio: 'inherit' });
      } catch (e) {}
      await waitPrompt();
    }
  }
}

async function waitPrompt() {
  console.log("");
  await inquirer.prompt([
    {
      type: 'input',
      name: 'continue',
      message: 'Drücke ENTER um fortzufahren...'
    }
  ]);
}

async function main() {
  while (true) {
    console.clear();
    console.log("======================================================");
    console.log("       🧾 BDB Invoice & Recipe Suite 🧾               ");
    console.log("======================================================\n");

    const { service } = await inquirer.prompt([
      {
        type: 'list',
        name: 'service',
        message: 'Welchen Dienst möchtest du verwalten?',
        choices: [
          { name: '🚖 Uber Invoices (Fahrten & Tax Invoices)', value: 'uber' },
          { name: '🛍️ AliExpress Invoices & Receipts (Belege & Rechnungen)', value: 'aliexpress' },
          { name: '📁 Rechnungsordner öffnen (invoices/)', value: 'open_folder' },
          new inquirer.Separator(),
          { name: '🚪 Beenden', value: 'exit' }
        ]
      }
    ]);

    if (service === 'exit') {
      console.log("\n👋 Bis zum nächsten Mal!\n");
      process.exit(0);
    }

    if (service === 'uber') {
      await handleUberMenu();
    } else if (service === 'aliexpress') {
      await handleAliExpressMenu();
    } else if (service === 'open_folder') {
      const invDir = path.join(__dirname, 'invoices');
      if (!fs.existsSync(invDir)) fs.mkdirSync(invDir, { recursive: true });
      
      const isMac = process.platform === 'darwin';
      const isWin = process.platform === 'win32';
      
      try {
        if (isMac) execSync(`open "${invDir}"`);
        else if (isWin) execSync(`explorer "${invDir}"`);
        else execSync(`xdg-open "${invDir}"`);
      } catch (e) {}
    }
  }
}

if (require.main === module) {
  main();
}
