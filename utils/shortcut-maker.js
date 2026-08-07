const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function createShortcuts() {
  const desktop = path.join(os.homedir(), 'Desktop');
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  if (!fs.existsSync(desktop)) {
    console.log(`❌ Desktop folder not found at ${desktop}. Skipping shortcuts.`);
    return;
  }

  console.log(`\n======================================================`);
  console.log(`🪄 Creating Desktop Shortcuts for BDB Invoice Suite...`);
  console.log(`======================================================\n`);

  if (isMac) {
    const guiScript = path.join(desktop, 'BDB_Invoice_GUI.command');
    const cliScript = path.join(desktop, 'BDB_Invoice_CLI.command');
    
    fs.writeFileSync(guiScript, `#!/bin/bash\ninvoice-scrape-agent-gui\n`);
    fs.writeFileSync(cliScript, `#!/bin/bash\ninvoice-scrape-agent\n`);
    
    execSync(`chmod +x "${guiScript}"`);
    execSync(`chmod +x "${cliScript}"`);
    
    console.log(`✅ Mac shortcuts created on Desktop (.command files).`);
  } else if (isWin) {
    const guiBat = path.join(desktop, 'BDB_Invoice_GUI.bat');
    const cliBat = path.join(desktop, 'BDB_Invoice_CLI.bat');
    
    fs.writeFileSync(guiBat, `@echo off\nstart cmd /k "invoice-scrape-agent-gui"\n`);
    fs.writeFileSync(cliBat, `@echo off\nstart cmd /k "invoice-scrape-agent"\n`);
    
    console.log(`✅ Windows shortcuts created on Desktop (.bat files).`);
  } else {
    console.log(`⚠️ Unsupported OS for automatic shortcuts. Please run 'invoice-scrape-agent' or 'invoice-scrape-agent-gui' manually.`);
  }
}

if (require.main === module) {
  createShortcuts();
}

module.exports = { createShortcuts };
