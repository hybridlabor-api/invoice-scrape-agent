const inquirer = require('inquirer').default || require('inquirer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ServiceRegistry = require('./services/registry');

(async () => {
  console.log("\n======================================================");
  console.log("       🧾 BDB Invoice Suite - Initial Setup 🧾         ");
  console.log("======================================================\n");

  ServiceRegistry.autoDiscover(path.join(__dirname, 'services'));
  const services = ServiceRegistry.list();

  const answers = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'servicesToAuth',
      message: 'Bei welchen Diensten möchtest du dich jetzt im Chrome-Browser einloggen?',
      choices: services.map(s => ({
        name: `${s.icon} ${s.displayName}`,
        value: s.id,
        checked: true
      }))
    }
  ]);

  for (const serviceId of answers.servicesToAuth) {
    console.log(`\n🌐 Öffne Chrome für den Login auf ${serviceId}...`);
    try {
      const service = ServiceRegistry.get(serviceId);
      await service.authenticate({ headless: false });
    } catch (e) {
      console.log(`⚠️ ${serviceId} Login abgebrochen oder fehlgeschlagen.`);
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
