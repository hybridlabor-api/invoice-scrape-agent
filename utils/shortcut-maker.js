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
    // Use PowerShell to get the real Desktop path (handles OneDrive redirection)
    let realDesktop;
    try {
      realDesktop = execSync('powershell -NoProfile -Command "[Environment]::GetFolderPath(\'Desktop\')"', { encoding: 'utf8' }).trim();
    } catch (e) {
      realDesktop = desktop;
    }

    if (!fs.existsSync(realDesktop)) {
      console.log(`❌ Desktop folder not found at ${realDesktop}. Skipping shortcuts.`);
      return;
    }

    // Resolve absolute paths for the shortcut targets
    const installRoot = path.resolve(__dirname, '..');
    let electronExe;
    try {
      electronExe = require('electron');
    } catch (e) {
      electronExe = path.join(installRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
    }
    const electronMain = path.join(installRoot, 'electron', 'main.js');
    const nodeExe = process.execPath;

    // Create GUI .lnk shortcut
    try {
      const guiLnk = path.join(realDesktop, 'BDB Invoice GUI.lnk');
      const psGui = `
        $shell = New-Object -ComObject WScript.Shell;
        $link = $shell.CreateShortcut('${guiLnk.replace(/'/g, "''")}');
        $link.TargetPath = '${String(electronExe).replace(/'/g, "''")}';
        $link.Arguments = '"${electronMain.replace(/'/g, "''")}"';
        $link.WorkingDirectory = '${installRoot.replace(/'/g, "''")}';
        $link.Description = 'BDB Invoice Suite Electron GUI';
        $link.Save()
      `.replace(/\n/g, ' ');
      execSync(`powershell -NoProfile -Command "${psGui}"`, { encoding: 'utf8' });
      console.log(`✅ GUI shortcut created: ${guiLnk}`);
    } catch (e) {
      console.warn(`⚠️ Could not create GUI .lnk shortcut: ${e.message}`);
      // Fallback to .bat
      const guiBat = path.join(realDesktop, 'BDB_Invoice_GUI.bat');
      fs.writeFileSync(guiBat, `@echo off\nstart "" "${String(electronExe)}" "${electronMain}"\n`);
      console.log(`✅ Windows GUI shortcut created (bat fallback): ${guiBat}`);
    }

    // Create CLI .lnk shortcut
    try {
      const cliLnk = path.join(realDesktop, 'BDB Invoice CLI.lnk');
      const indexJs = path.join(installRoot, 'index.js');
      const psCli = `
        $shell = New-Object -ComObject WScript.Shell;
        $link = $shell.CreateShortcut('${cliLnk.replace(/'/g, "''")}');
        $link.TargetPath = '${nodeExe.replace(/'/g, "''")}';
        $link.Arguments = '"${indexJs.replace(/'/g, "''")}"';
        $link.WorkingDirectory = '${installRoot.replace(/'/g, "''")}';
        $link.Description = 'BDB Invoice Suite CLI';
        $link.Save()
      `.replace(/\n/g, ' ');
      execSync(`powershell -NoProfile -Command "${psCli}"`, { encoding: 'utf8' });
      console.log(`✅ CLI shortcut created: ${cliLnk}`);
    } catch (e) {
      console.warn(`⚠️ Could not create CLI .lnk shortcut: ${e.message}`);
      const cliBat = path.join(realDesktop, 'BDB_Invoice_CLI.bat');
      fs.writeFileSync(cliBat, `@echo off\nstart cmd /k "${nodeExe}" "${path.join(installRoot, 'index.js')}"\n`);
      console.log(`✅ Windows CLI shortcut created (bat fallback): ${cliBat}`);
    }
  } else {
    console.log(`⚠️ Unsupported OS for automatic shortcuts. Please run 'invoice-scrape-agent' or 'invoice-scrape-agent-gui' manually.`);
  }
}

if (require.main === module) {
  createShortcuts();
}

module.exports = { createShortcuts };
