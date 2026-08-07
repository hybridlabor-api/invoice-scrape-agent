const inquirer = require('inquirer').default || require('inquirer');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function startCLI() {
  console.log("\n======================================================");
  console.log("       🚖 Uber Invoice Agent - Hauptmenü 🚖        ");
  console.log("======================================================\n");

  const action = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: 'Was möchtest du tun?',
      choices: [
        '🔍 Verfügbaren Datumsbereich scannen (ohne Download)',
        '📥 Rechnungen für einen bestimmten Zeitraum herunterladen',
        '📊 Heruntergeladene Rechnungen mit KI analysieren',
        '🚪 Beenden'
      ]
    }
  ]);

  if (action.choice.includes('Beenden')) {
    console.log("Auf Wiedersehen!");
    process.exit(0);
  }

  if (action.choice.includes('scannen')) {
    console.log("\nStarte Scan...");
    try {
      execSync('node fetcher.js --scan', { stdio: 'inherit' });
    } catch(e) {}
    
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Drücke Enter um fortzufahren...' }]);
    return startCLI(); // Zurück ins Menü
  }

  if (action.choice.includes('herunterladen')) {
    const dates = await inquirer.prompt([
      {
        type: 'input',
        name: 'start',
        message: 'Startdatum (YYYY-MM-DD):',
        default: '2023-01-01'
      },
      {
        type: 'input',
        name: 'end',
        message: 'Enddatum (YYYY-MM-DD):',
        default: '2023-12-31'
      }
    ]);
    
    console.log(`\nStarte Download von ${dates.start} bis ${dates.end}...`);
    try {
      execSync(`node fetcher.js --start ${dates.start} --end ${dates.end}`, { stdio: 'inherit' });
    } catch(e) {}
    
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Drücke Enter um fortzufahren...' }]);
    return startCLI();
  }

  if (action.choice.includes('analysieren')) {
    console.log("\nStarte KI-Analyse...");
    try {
      execSync('node analyzer.js', { stdio: 'inherit' });
    } catch(e) {}
    
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Drücke Enter um fortzufahren...' }]);
    return startCLI();
  }
}

startCLI();
