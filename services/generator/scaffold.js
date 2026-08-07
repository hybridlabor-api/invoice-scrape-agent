const fs = require('fs');
const path = require('path');

function scaffoldService({ name, displayName, icon = '📦', authUrl = '' }) {
  if (!name) throw new Error('Service name is required');
  const serviceId = name.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const className = serviceId.charAt(0).toUpperCase() + serviceId.slice(1) + 'Service';
  const serviceDir = path.resolve(__dirname, '..', serviceId);

  if (fs.existsSync(serviceDir)) {
    return { success: false, error: `Directory ${serviceDir} already exists.` };
  }

  fs.mkdirSync(serviceDir, { recursive: true });

  const templatePath = path.join(__dirname, 'templates', 'ServiceTemplate.js');
  let serviceCode = fs.readFileSync(templatePath, 'utf8');
  serviceCode = serviceCode
    .replace(/__SERVICE_CLASS__/g, className)
    .replace(/__SERVICE_ID__/g, serviceId)
    .replace(/__DISPLAY_NAME__/g, displayName || serviceId)
    .replace(/__ICON__/g, icon)
    .replace(/__AUTH_URL__/g, authUrl);

  fs.writeFileSync(path.join(serviceDir, 'index.js'), serviceCode, 'utf8');

  // Auth helper
  fs.writeFileSync(path.join(serviceDir, 'auth.js'), `
const ${className} = require('./index');
(async () => {
  const service = new ${className}();
  await service.authenticate({ headless: false });
})();
`.trim(), 'utf8');

  // Fetcher helper
  fs.writeFileSync(path.join(serviceDir, 'fetcher.js'), `
const ${className} = require('./index');
(async () => {
  const service = new ${className}();
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  await service.fetch({ all });
})();
`.trim(), 'utf8');

  // Analyzer helper
  fs.writeFileSync(path.join(serviceDir, 'analyzer.js'), `
const ${className} = require('./index');
(async () => {
  const service = new ${className}();
  await service.analyze();
})();
`.trim(), 'utf8');

  // AI Prompt artifact
  const promptTemplatePath = path.join(__dirname, 'templates', 'agent_prompt.md');
  let promptContent = fs.readFileSync(promptTemplatePath, 'utf8');
  promptContent = promptContent
    .replace(/__SERVICE_ID__/g, serviceId)
    .replace(/__DISPLAY_NAME__/g, displayName || serviceId)
    .replace(/__ICON__/g, icon)
    .replace(/__AUTH_URL__/g, authUrl);

  fs.writeFileSync(path.join(serviceDir, 'AGENT_PROMPT.md'), promptContent, 'utf8');

  return { success: true, serviceId, className, serviceDir };
}

// CLI Execution support
if (require.main === module) {
  const inquirer = require('inquirer').default || require('inquirer');
  (async () => {
    console.log("\n🚀 BDB Scraper Plugin Scaffolder\n");
    const answers = await inquirer.prompt([
      { type: 'input', name: 'name', message: 'Service ID (e.g. miro, adobe, digitec):' },
      { type: 'input', name: 'displayName', message: 'Display Name (e.g. Miro Invoices):' },
      { type: 'input', name: 'icon', message: 'Emoji Icon:', default: '🛍️' },
      { type: 'input', name: 'authUrl', message: 'Login URL:', default: 'https://example.com/login' }
    ]);

    const res = scaffoldService(answers);
    if (res.success) {
      console.log(`\n✨ Successfully scaffolded ${res.className} at ${res.serviceDir}`);
      console.log(`📝 Read ${path.join(res.serviceDir, 'AGENT_PROMPT.md')} for AI instructions.\n`);
    } else {
      console.error(`\n❌ Error: ${res.error}\n`);
    }
  })();
}

module.exports = { scaffoldService };
