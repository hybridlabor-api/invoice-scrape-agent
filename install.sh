#!/bin/bash
set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}     🚖 Uber Invoice Agent Installer (macOS/Linux)    ${NC}"
echo -e "${CYAN}======================================================${NC}"
echo ""

# 1. Check Node.js
echo -e "${BLUE}[1/4] Checking Node.js runtime...${NC}"
if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}  ✓ Node.js installed: ${NODE_VERSION}${NC}"
else
    echo -e "${RED}  ✗ Node.js is not installed.${NC}"
    echo -e "${YELLOW}  Please install Node.js (>= 18) from https://nodejs.org/ and re-run.${NC}"
    exit 1
fi

# 2. Check npm
echo -e "${BLUE}[2/4] Checking npm package manager...${NC}"
if command -v npm >/dev/null 2>&1; then
    NPM_VERSION=$(npm -v)
    echo -e "${GREEN}  ✓ npm installed: v${NPM_VERSION}${NC}"
else
    echo -e "${RED}  ✗ npm is not installed.${NC}"
    exit 1
fi

# 3. Install Dependencies
echo -e "${BLUE}[3/4] Installing dependencies...${NC}"
npm install --no-fund --no-audit

# Ensure Playwright browser is ready
if command -v npx >/dev/null 2>&1; then
    echo -e "${BLUE}      Ensuring Chromium browser binary is present...${NC}"
    npx playwright install chromium >/dev/null 2>&1 || true
fi
echo -e "${GREEN}  ✓ Dependencies installed successfully.${NC}"

# 4. Prepare Directories
echo -e "${BLUE}[4/4] Verifying local directories...${NC}"
mkdir -p invoices
echo -e "${GREEN}  ✓ Directory 'invoices/' ready.${NC}"

echo ""
echo -e "${CYAN}======================================================${NC}"
echo -e "${GREEN}  ✓ Installation Completed Successfully!            ${NC}"
echo -e "${CYAN}======================================================${NC}"
echo ""

# Run initial interactive setup
node setup.js
