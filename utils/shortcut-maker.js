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
    
    try {
      const iconPath = path.join(__dirname, '..', 'assets', 'icon_black.png');
      const setIconSrc = path.join(__dirname, '..', 'assets', 'set_icon.m');
      const setIconBin = path.join(__dirname, '..', 'assets', 'set_icon');
      if (fs.existsSync(iconPath)) {
        fs.writeFileSync(setIconSrc, `
#import <Cocoa/Cocoa.h>
int main(int argc, const char * argv[]) {
    @autoreleasepool {
        NSString *iconPath = [NSString stringWithUTF8String:argv[1]];
        NSString *filePath = [NSString stringWithUTF8String:argv[2]];
        NSImage *icon = [[NSImage alloc] initWithContentsOfFile:iconPath];
        BOOL result = [[NSWorkspace sharedWorkspace] setIcon:icon forFile:filePath options:0];
        return result ? 0 : 1;
    }
}
        `.trim());
        execSync(`clang -framework Cocoa "${setIconSrc}" -o "${setIconBin}"`);
        execSync(`"${setIconBin}" "${iconPath}" "${guiScript}"`);
        execSync(`"${setIconBin}" "${iconPath}" "${cliScript}"`);
        console.log(`✅ Applied custom icon to Desktop shortcuts.`);
      }
    } catch (e) {
      console.log(`⚠️ Could not set custom icon: ${e.message}`);
    }
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
