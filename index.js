#!/usr/bin/env node

const inquirer = require('inquirer').default || require('inquirer');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const currentYear = new Date().getFullYear();

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
        '🔍 Verfügbaren Datumsbereich scannen',
        `📥 Alle Rechnungen herunterladen`,
        `📅 Rechnungen für ein Jahr herunterladen`,
        '📆 Rechnungen für einen bestimmten Zeitraum herunterladen',
        '📊 Heruntergeladene Rechnungen analysieren (PDF-Tabelle)',
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
    return startCLI();
  }

  if (action.choice.includes('Alle Rechnungen')) {
    console.log("\nLade ALLE verfügbaren Rechnungen herunter...");
    try {
      execSync(`node fetcher.js --start 2000-01-01 --end ${currentYear + 1}-12-31`, { stdio: 'inherit' });
    } catch(e) {}
    
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Drücke Enter um fortzufahren...' }]);
    return startCLI();
  }

  if (action.choice.includes('ein Jahr')) {
    const yearChoice = await inquirer.prompt([
      {
        type: 'list',
        name: 'year',
        message: 'Welches Jahr?',
        choices: Array.from({ length: 5 }, (_, i) => (currentYear - i).toString())
      }
    ]);
    
    const y = yearChoice.year;
    console.log(`\nLade Rechnungen für ${y}...`);
    try {
      execSync(`node fetcher.js --start ${y}-01-01 --end ${y}-12-31`, { stdio: 'inherit' });
    } catch(e) {}
    
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Drücke Enter um fortzufahren...' }]);
    return startCLI();
  }

  if (action.choice.includes('bestimmten Zeitraum')) {
    const dates = await inquirer.prompt([
      {
        type: 'input',
        name: 'start',
        message: 'Startdatum (YYYY-MM-DD):',
        default: `${currentYear}-01-01`
      },
      {
        type: 'input',
        name: 'end',
        message: 'Enddatum (YYYY-MM-DD):',
        default: `${currentYear}-12-31`
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
    console.log("\nStarte Analyse...");
    try {
      execSync('node analyzer.js', { stdio: 'inherit' });
    } catch(e) {}
    
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Drücke Enter um fortzufahren...' }]);
    return startCLI();
  }
}

startCLI();
