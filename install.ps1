# Invoice Scrape Agent - Windows PowerShell Installer
$ErrorActionPreference = "Stop"

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "    🧾 Invoice Scrape Agent Installer (Windows)       " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js
Write-Host "[1/4] Checking Node.js runtime..." -ForegroundColor Blue
try {
    $nodeVersion = node -v
    Write-Host "  ✓ Node.js installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Node.js is not installed." -ForegroundColor Red
    Write-Host "  Please install Node.js (>= 18) from https://nodejs.org/ and re-run." -ForegroundColor Yellow
    exit 1
}

# 2. Check npm
Write-Host "[2/4] Checking npm package manager..." -ForegroundColor Blue
try {
    $npmVersion = npm -v
    Write-Host "  ✓ npm installed: v$npmVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ npm is not installed." -ForegroundColor Red
    exit 1
}

# 3. Install Dependencies
Write-Host "[3/4] Installing dependencies..." -ForegroundColor Blue
npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ npm install failed." -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Dependencies installed successfully." -ForegroundColor Green

# Ensure Chromium browser is ready
try {
    Write-Host "      Ensuring Chromium browser binary is present..." -ForegroundColor Blue
    npx playwright install chromium | Out-Null
} catch {}

# 4. Prepare Directories
Write-Host "[4/4] Verifying local directories..." -ForegroundColor Blue
if (-not (Test-Path "invoices")) {
    New-Item -ItemType Directory -Path "invoices" | Out-Null
}
Write-Host "  ✓ Directory 'invoices/' ready." -ForegroundColor Green

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  ✓ Installation Completed Successfully!              " -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# Run initial interactive setup
node setup.js
