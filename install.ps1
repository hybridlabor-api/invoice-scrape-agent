# Invoice Scrape Agent - Windows PowerShell Installer
$ErrorActionPreference = "Stop"

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "    🧾 Invoice Scrape Agent Installer (Windows)       " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js
Write-Host "[1/5] Checking Node.js runtime..." -ForegroundColor Blue
try {
    $nodeVersion = node -v
    $versionParts = ($nodeVersion -replace '^v','') -split '\.'
    $major = [int]$versionParts[0]
    $minor = [int]$versionParts[1]
    if ($major -lt 22 -or ($major -eq 22 -and $minor -lt 12)) {
        Write-Host "  ✗ Node.js >= 22.12 is required (Electron 43 dependency). You have $nodeVersion." -ForegroundColor Red
        Write-Host "  Please install Node.js from https://nodejs.org/ and re-run." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "  ✓ Node.js installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Node.js is not installed." -ForegroundColor Red
    Write-Host "  Please install Node.js (>= 22.12) from https://nodejs.org/ and re-run." -ForegroundColor Yellow
    exit 1
}

# 2. Check npm
Write-Host "[2/5] Checking npm package manager..." -ForegroundColor Blue
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

# 3b. Verify Electron binary
Write-Host "[3/5] Verifying Electron binary..." -ForegroundColor Blue
$electronPackage = Join-Path $PSScriptRoot 'node_modules\electron'
$electronExe = Join-Path $electronPackage 'dist\electron.exe'

if (-not (Test-Path -LiteralPath $electronExe)) {
    Write-Host "  ⚠ Electron binary missing. Running install.js..." -ForegroundColor Yellow
    try {
        & node (Join-Path $electronPackage 'install.js')
    } catch {
        Write-Host "  ✗ Electron binary installation failed." -ForegroundColor Red
        Write-Host "  Check network/proxy settings and retry." -ForegroundColor Yellow
    }
}

if (Test-Path -LiteralPath $electronExe) {
    Write-Host "  ✓ Electron binary verified: $electronExe" -ForegroundColor Green
} else {
    Write-Host "  ✗ Electron binary still missing. GUI will not work." -ForegroundColor Red
}

# Ensure Chromium browser is ready
try {
    Write-Host "      Ensuring Chromium browser binary is present..." -ForegroundColor Blue
    npx playwright install chromium | Out-Null
} catch {}

# 4. Prepare Directories
Write-Host "[4/5] Verifying local directories..." -ForegroundColor Blue
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
