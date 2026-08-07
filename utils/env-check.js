const { execSync } = require('child_process');

function checkDependencies() {
  console.log(`\n======================================================`);
  console.log(`🔍 Checking System Dependencies for BDB Invoice Suite`);
  console.log(`======================================================\n`);

  let hasErrors = false;

  // 1. Check Node Version
  const nodeVersion = process.versions.node;
  const majorNode = parseInt(nodeVersion.split('.')[0], 10);
  if (majorNode < 18) {
    console.error(`❌ [ERROR] Node.js version 18 or higher is required. You have ${nodeVersion}.`);
    hasErrors = true;
  } else {
    console.log(`✅ Node.js: v${nodeVersion} (Satisfies >= 18)`);
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
