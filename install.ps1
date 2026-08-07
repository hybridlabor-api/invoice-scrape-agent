# Uber Invoice Agent - Windows PowerShell Installer
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "          Uber Invoice Agent Installer (Windows)      " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Write-Host "[*] Checking for Node.js..." -ForegroundColor Blue
try {
    $nodeVersion = node -v
    Write-Host "[+] Node.js is installed ($nodeVersion)." -ForegroundColor Green
} catch {
    Write-Host "[!] Node.js is not installed. Please install Node.js (>= 18) from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host ""
Write-Host "[*] Installing dependencies via npm..." -ForegroundColor Blue
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] npm install failed." -ForegroundColor Red
    exit 1
}
Write-Host "[+] Dependencies installed successfully." -ForegroundColor Green

# Create invoices directory if not present
if (-not (Test-Path "invoices")) {
    New-Item -ItemType Directory -Path "invoices" | Out-Null
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host " [OK] Installation completed successfully!" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "To start the interactive CLI dashboard, run:" -ForegroundColor Yellow
Write-Host "  npm start" -ForegroundColor Cyan
Write-Host "  (or: node index.js)" -ForegroundColor Cyan
Write-Host ""
