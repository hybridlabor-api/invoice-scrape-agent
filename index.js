#!/usr/bin/env node

const inquirer = require('inquirer').default || require('inquirer');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ServiceRegistry = require('./services/registry');
const MasterAnalyzer = require('./services/unified/master-analyzer');
const { scaffoldService } = require('./services/generator/scaffold');

// Initialize and discover services
ServiceRegistry.autoDiscover(path.join(__dirname, 'services'));

async function handleServiceMenu(serviceId) {
  const service = ServiceRegistry.get(serviceId);

  while (true) {
    console.clear();
    console.log("======================================================");
    console.log(`       ${service.icon} ${service.displayName} - Menü ${service.icon}       `);
    console.log("======================================================\n");

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Was möchtest du tun?',
        choices: [
          { name: '🔍 Alle Einträge scannen (Zeitraum & Anzahl ermitteln)', value: 'scan' },
          { name: '⬇️  Alle Rechnungen herunterladen (Komplettes Konto)', value: 'download_all' },
          { name: '📅 Bestimmtes Jahr herunterladen (z.B. 2025, 2026)', value: 'download_year' },
          { name: '📆 Benutzerdefinierten Zeitraum herunterladen', value: 'download_range' },
          { name: '📊 PDF-Dienst-Auswertung erstellen', value: 'analyze' },
          { name: '🔑 Login / Re-Authentifizierung', value: 'auth' },
          new inquirer.Separator(),
          { name: '🔙 Zurück zum Hauptmenü', value: 'back' }
        ]
      }
    ]);

    if (action === 'back') break;

    try {
      if (action === 'scan') {
        await service.scan({});
        await waitPrompt();
      } else if (action === 'download_all') {
        await service.fetch({ all: true });
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
        await service.fetch({ year });
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
        await service.fetch({ startDate: answers.startDate, endDate: answers.endDate });
        await waitPrompt();
      } else if (action === 'analyze') {
        await service.analyze();
        await waitPrompt();
      } else if (action === 'auth') {
        await service.authenticate({ headless: false });
        await waitPrompt();
      }
    } catch (err) {
      console.error(`\n❌ Fehler bei der Ausführung:`, err.message);
      await waitPrompt();
    }
  }
}

async function handleScaffoldMenu() {
  console.clear();
  console.log("======================================================");
  console.log("   🤖 Neuer Scraper Plugin Generator & AI Scaffolder   ");
  console.log("======================================================\n");

  const answers = await inquirer.prompt([
    { type: 'input', name: 'name', message: 'Dienst-Kennung (z.B. miro, adobe, digitec):' },
    { type: 'input', name: 'displayName', message: 'Anzeigename (z.B. Adobe Cloud Invoices):' },
    { type: 'input', name: 'icon', message: 'Emoji Icon:', default: '🛍️' },
    { type: 'input', name: 'authUrl', message: 'Login URL:', default: 'https://example.com/login' }
  ]);

  const res = scaffoldService(answers);
  if (res.success) {
    console.log(`\n✨ Erfolgreich erstellt: ${res.serviceDir}`);
    console.log(`📝 Öffne ${path.join(res.serviceDir, 'AGENT_PROMPT.md')} für den Claude/Codex Prompt!`);
  } else {
    console.error(`\n❌ Fehler: ${res.error}`);
  }
  await waitPrompt();
}

async function handleMasterReport() {
  console.clear();
  console.log("======================================================");
  console.log("   🌟 Unified Master Accounting Report Generierung     ");
  console.log("======================================================\n");

  const analyzer = new MasterAnalyzer();
  await analyzer.generateMasterPdf();
  await waitPrompt();
}

async function handleEmailScaffolder() {
  console.clear();
  console.log("======================================================");
  console.log("   📧 Neuer E-Mail Anbieter Generator (z.B. Lime)      ");
  console.log("======================================================\n");

  const answers = await inquirer.prompt([
    { type: 'input', name: 'id', message: 'Dienst-ID (z.B. lime, freenow):' },
    { type: 'input', name: 'displayName', message: 'Anzeigename (z.B. Lime Scooters):' },
    { type: 'input', name: 'from', message: 'Absender E-Mail Adresse (z.B. receipts@li.me):' },
    { type: 'input', name: 'subject', message: 'Betreff-Schlüsselwort (optional):' }
  ]);

  const providerConfig = {
    id: answers.id.toLowerCase().trim(),
    displayName: answers.displayName,
    icon: "✉️",
    authUrl: "imap://",
    search: {
      from: [answers.from.trim()],
      subjectKeywords: answers.subject ? [answers.subject.trim()] : [],
      folders: ["INBOX", "[Gmail]/All Mail"]
    },
    extraction: {
      mode: "attachment_or_html",
      attachmentRegex: "\\.pdf$",
      htmlCssFixes: "@media print { body { font-size: 11pt; } }"
    },
    parser: {
      currency: "EUR",
      regex: {
        orderId: "",
        date: "",
        brutto: "",
        ust: "",
        seller: ""
      },
      taxRate: "19%",
      aiFallback: false
    }
  };

  const emailDir = path.join(__dirname, 'services', 'email', 'providers');
  if (!fs.existsSync(emailDir)) fs.mkdirSync(emailDir, { recursive: true });
  
  fs.writeFileSync(
    path.join(emailDir, `${providerConfig.id}.json`), 
    JSON.stringify(providerConfig, null, 2)
  );

  console.log(`\n✨ Erfolgreich erstellt! Die Datei liegt unter: services/email/providers/${providerConfig.id}.json`);
  console.log(`📝 Öffne die Datei, um bei Bedarf Regex-Regeln für Betrag und Datum hinzuzufügen!`);
  await waitPrompt();
}

async function handleEmailMenu() {
  const emailService = ServiceRegistry.get('email');
  while (true) {
    console.clear();
    console.log("======================================================");
    console.log("       📧 E-Mail Postfach-Scanner (IMAP) 📧           ");
    console.log("======================================================\n");

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Was möchtest du im E-Mail Scraper tun?',
        choices: [
          { name: '⚙️  IMAP Server-Verbindung einrichten (Login)', value: 'auth' },
          { name: '➕ Neuen E-Mail-Dienstleister anlegen (z.B. Lime)', value: 'scaffold_email' },
          new inquirer.Separator(),
          { name: '🔍 Alle konfigurierten E-Mail-Dienstleister scannen', value: 'scan' },
          { name: '⬇️  Rechnungen für ein bestimmtes Jahr herunterladen', value: 'download_year' },
          new inquirer.Separator(),
          { name: '🔙 Zurück zum Hauptmenü', value: 'back' }
        ]
      }
    ]);

    if (action === 'back') break;

    try {
      if (action === 'auth') {
        await emailService.authenticate({ headless: false, force: true });
        await waitPrompt();
      } else if (action === 'scaffold_email') {
        await handleEmailScaffolder();
        emailService.providers = emailService.loadProviders(); // Refresh list
      } else if (action === 'scan') {
        await emailService.scan({});
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
        await emailService.fetch({ year });
        await waitPrompt();
      }
    } catch (err) {
      console.error(`\n❌ Fehler bei der Ausführung:`, err.message);
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
    console.log("       🧾 BDB Multi-Service Invoice & Tax Suite 🧾     ");
    console.log("======================================================\n");

    const services = ServiceRegistry.list();
    const serviceChoices = services
      .filter(s => s.id !== 'email')
      .map(s => ({
        name: `${s.icon} ${s.displayName}`,
        value: s.id
      }));

    const { selected } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selected',
        message: 'Welche Aktion oder welchen Dienst möchtest du wählen?',
        choices: [
          ...serviceChoices,
          new inquirer.Separator(),
          { name: '📧 E-Mail Rechnungs-Scraper (IMAP)', value: 'email_menu' },
          new inquirer.Separator(),
          { name: '🌟 Gesamtabrechnung aller Dienste erstellen (Master PDF)', value: 'master_report' },
          { name: '🤖 Neuen Web-Scraper generieren (Dojo AI)', value: 'scaffold' },
          { name: '📁 Rechnungsordner öffnen (invoices/)', value: 'open_folder' },
          new inquirer.Separator(),
          { name: '🚪 Beenden', value: 'exit' }
        ]
      }
    ]);

    if (selected === 'exit') {
      console.log("\n👋 Bis zum nächsten Mal!\n");
      process.exit(0);
    }

    if (selected === 'master_report') {
      await handleMasterReport();
    } else if (selected === 'email_menu') {
      await handleEmailMenu();
    } else if (selected === 'scaffold') {
      await handleScaffoldMenu();
      ServiceRegistry.autoDiscover(path.join(__dirname, 'services'));
    } else if (selected === 'open_folder') {
      const invDir = path.join(__dirname, 'invoices');
      if (!fs.existsSync(invDir)) fs.mkdirSync(invDir, { recursive: true });
      const isMac = process.platform === 'darwin';
      const isWin = process.platform === 'win32';
      try {
        if (isMac) execSync(`open "${invDir}"`);
        else if (isWin) execSync(`explorer "${invDir}"`);
        else execSync(`xdg-open "${invDir}"`);
      } catch (e) {}
    } else {
      await handleServiceMenu(selected);
    }
  }
}

if (require.main === module) {
  main();
}
