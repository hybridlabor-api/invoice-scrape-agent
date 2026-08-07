const { execSync } = require('child_process');

function checkDependencies() {
  console.log(`\n======================================================`);
  console.log(`🔍 Checking System Dependencies for BDB Invoice Suite`);
  console.log(`======================================================\n`);

  let hasErrors = false;

  // 1. Check Node Version (Electron 43 requires >= 22.12)
  const nodeVersion = process.versions.node;
  const [majorNode, minorNode] = nodeVersion.split('.').map(Number);
  if (majorNode < 22 || (majorNode === 22 && minorNode < 12)) {
    console.error(`❌ [ERROR] Node.js >= 22.12 is required (Electron 43 dependency). You have ${nodeVersion}.`);
    hasErrors = true;
  } else {
    console.log(`✅ Node.js: v${nodeVersion} (Satisfies >= 22.12)`);
  }

  // 2. Check Electron binary
  try {
    const electronPath = require('electron');
    const fs = require('fs');
    if (typeof electronPath === 'string' && fs.existsSync(electronPath)) {
      console.log(`✅ Electron: Binary found at ${electronPath}`);
    } else {
      console.warn(`⚠️ [WARNING] Electron package found but binary missing. Run: node node_modules/electron/install.js`);
    }
  } catch (e) {
    console.warn(`⚠️ [WARNING] Electron not installed. GUI will not work until 'npm install' is run.`);
  }

  // 2. Check Python (Optional but recommended for some internal utils)
  try {
    const pythonVersion = execSync('python3 --version || python --version', { stdio: 'pipe' }).toString().trim();
    console.log(`✅ Python: ${pythonVersion}`);
  } catch (err) {
    console.warn(`⚠️ [WARNING] Python 3 not found. The core Node.js app will work, but some Python utilities might fail.`);
  }

  console.log(`\n======================================================`);
  if (hasErrors) {
    console.error(`🚨 Environment check failed! Please install missing dependencies and try again.\n`);
    process.exit(1);
  } else {
    console.log(`🚀 All core dependencies are met! Proceeding with installation...\n`);
    process.exit(0);
  }
}

checkDependencies();
