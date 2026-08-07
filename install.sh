#!/bin/bash

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}          Uber Invoice Agent Installer                ${NC}"
echo -e "${CYAN}======================================================${NC}"
echo ""

# Check for Node.js
echo -e "${BLUE}[*] Checking for Node.js...${NC}"
if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}[+] Node.js is installed (${NODE_VERSION}).${NC}"
else
    echo -e "${RED}[!] Node.js is not installed. Please install Node.js (>= 18) and try again.${NC}"
    exit 1
fi

# Run npm install
echo ""
echo -e "${BLUE}[*] Installing dependencies...${NC}"
if command -v npm >/dev/null 2>&1; then
    npm install
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[+] Dependencies installed successfully.${NC}"
    else
        echo -e "${RED}[!] Failed to install dependencies. Please check npm output.${NC}"
        exit 1
    fi
else
    echo -e "${RED}[!] npm is not installed. Please install npm and try again.${NC}"
    exit 1
fi

# Prompt for environment variables
# Interactive Setup via node (Inquirer & Auth)
echo -e "${BLUE}[*] Starting Interactive Setup...${NC}"
node setup.js


if [ $? -eq 0 ]; then
    echo -e "${GREEN}[+] Configuration saved to ${ENV_FILE}.${NC}"
else
    echo -e "${RED}[!] Failed to write to ${ENV_FILE}.${NC}"
    exit 1
fi

echo ""
echo -e "${CYAN}======================================================${NC}"
echo -e "${GREEN}          Installation Complete!                      ${NC}"
echo -e "${CYAN}======================================================${NC}"
echo -e "You can now run the agent with:"
echo -e "  ${YELLOW}node fetcher.js${NC}   # To fetch invoices"
echo -e "  ${YELLOW}node analyze.js${NC}   # To analyze invoices"
echo ""
