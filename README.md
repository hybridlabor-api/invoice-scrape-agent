```text
██████╗ ██████╗ ██████╗     ██╗███╗   ██╗██╗   ██╗ ██████╗ ██╗ ██████╗███████╗
██╔══██╗██╔══██╗██╔══██╗    ██║████╗  ██║██║   ██║██╔═══██╗██║██╔════╝██╔════╝
██████╔╝██║  ██║██████╔╝    ██║██╔██╗ ██║██║   ██║██║   ██║██║██║     █████╗  
██╔══██╗██║  ██║██╔══██╗    ██║██║╚██╗██║╚██╗ ██╔╝██║   ██║██║██║     ██╔══╝  
██████╔╝██████╔╝██████╔╝    ██║██║ ╚████║ ╚████╔╝ ╚██████╔╝██║╚██████╗███████╗
╚═════╝ ╚═════╝ ╚═════╝     ╚═╝╚═╝  ╚═══╝  ╚═══╝   ╚═════╝ ╚═╝ ╚═════╝╚══════╝

        A U T O N O M O U S   I N V O I C E   &   R E C E I P T   S U I T E
```

# 🧾 BDB Invoice & Receipt Suite (Uber & AliExpress)

![Architecture Sketch](assets/invoice_scrape_agent_sketch.jpg)

[![Node.js Version](https://img.shields.io/badge/node-18+-blue.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-brightgreen.svg)](#-installation--quick-start)
[![Services](https://img.shields.io/badge/services-Uber%20%2B%20AliExpress-purple.svg)](#-supported-services)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Zero-Token](https://img.shields.io/badge/parser-Zero--Token%20Deterministic-green.svg)](#-zero-token-accounting-analyzers)

> **Unified, autonomous, cross-platform CLI suite to discover, batch download, normalize PNG receipts to vector PDFs, and generate consolidated accounting tables (`Gesamtauflistung.pdf`) for Uber and AliExpress.**

---

## 🌟 Key Highlights

### 🚖 Uber Invoices
- **⚡ GraphQL Network Interception**: Captures 100% of trips via `https://riders.uber.com/graphql` without virtual scrolling glitches.
- **📅 Chronological Year Tracking**: Resolves Uber's year-omission in relative date strings (`"31. Juli • 9:56"`).
- **📑 Automatic Re-naming**: Extracts official invoice numbers from PDF text: `invoices/Uber-Bv-YYYY-MM-DD-<INVOICE_NO>.pdf`.

### 🛍️ AliExpress Invoices & Receipts
- **🌐 Alibaba MTOP Interceptor**: Intercepts `mtop.aliexpress.buyer.order.list` endpoints for 100% accurate financial metadata.
- **🖼️ Lossless PNG-to-A4 PDF Pipeline**: Automatically captures PNG receipts / Canvas renders and converts them to standardized, accounting-grade A4 PDFs (`invoices/aliexpress/AliExpress-YYYY-MM-DD-<ORDER_ID>.pdf`).
- **📊 Consolidated Financial Table**: Generates structured accounting summaries (`Gesamtauflistung.pdf` and `Gesamtauflistung.json`).

### 🛡️ Core Platform
- **🔑 Persistent Chrome Sessions**: Stores logins safely in `.auth-profile/` (no recurring 2FA or Captcha sliders on subsequent runs).
- **💻 100% Cross-Platform**: Runs natively on **macOS**, **Windows (PowerShell / CMD)**, and **Linux**.

---

## 🌐 OpenWiki Living Documentation

- **🚀 Quickstart & Onboarding:** [.openwiki/quickstart.md](.openwiki/quickstart.md)
- **🏗️ Architecture & Signal Flow:** [.openwiki/architecture.md](.openwiki/architecture.md)
- **🏛️ Architecture Decision Records (ADRs):** [.openwiki/decisions.md](.openwiki/decisions.md)
- **📝 Release Notes & Changelog:** [.openwiki/release_notes.md](.openwiki/release_notes.md)

---

## 🔄 Multi-Service Architecture

```mermaid
flowchart TD
    subgraph UI ["🖥️ Interfaces"]
        CLI["index.js (Multi-Service Inquirer CLI)"]
        AGENT["agent_skill.md (AI Agent Wrapper)"]
    end

    subgraph Uber ["🚖 Uber Service"]
        U_AUTH["services/uber/auth.js"]
        U_FETCH["services/uber/fetcher.js (GraphQL)"]
        U_PARSE["services/uber/analyzer.js"]
    end

    subgraph AliExpress ["🛍️ AliExpress Service"]
        A_AUTH["services/aliexpress/auth.js"]
        A_FETCH["services/aliexpress/fetcher.js (MTOP)"]
        A_CONV["utils/pdf-converter.js (PNG to A4 PDF)"]
        A_PARSE["services/aliexpress/analyzer.js"]
    end

    subgraph Storage ["💾 Storage & Output"]
        PROFILE[".auth-profile/"]
        U_INV["invoices/Uber-Bv-*.pdf"]
        A_INV["invoices/aliexpress/AliExpress-*.pdf"]
        SUMMARY["Gesamtauflistung.pdf"]
    end

    CLI --> Uber
    CLI --> AliExpress
    U_AUTH --> PROFILE
    A_AUTH --> PROFILE
    U_FETCH --> U_INV
    A_FETCH --> A_CONV --> A_INV
    U_INV --> U_PARSE --> SUMMARY
    A_INV --> A_PARSE --> SUMMARY
```

---

## 🛠️ Installation & Quick Start

### ⚡ Option 1: Run Instantly via NPX (Zero-Install)
```bash
npx -y bdb-dev-uber-recipe-wrapper
```

### 📦 Option 2: Global NPM Installation
```bash
npm install -g invoice-scrape-agent

# Start anytime with:
invoice-scrape-agent
# or
uber-invoice-agent
# or
aliexpress-invoice-agent
```

### 💻 Option 3: Local Git Repository Clone

#### 🍎 macOS / 🐧 Linux
```bash
git clone https://github.com/hybridlabor-api/invoice-scrape-agent.git
cd invoice-scrape-agent
chmod +x install.sh
./install.sh
```

#### 🪟 Windows (PowerShell / CMD)
```powershell
git clone https://github.com/hybridlabor-api/invoice-scrape-agent.git
cd invoice-scrape-agent
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

---

### 🔄 How to Update / Aktualisierung

#### Option A: Local Repository Update
Um die neueste Version von GitHub zu laden und Abhängigkeiten zu aktualisieren:
```bash
npm run update
# oder manuell:
git pull origin main && npm install
```

#### Option B: Global NPM Package Update
```bash
npm install -g invoice-scrape-agent@latest
```

---

## 🎮 Interactive CLI Dashboard

Launch the interactive dashboard:

```bash
npm start
```

```text
======================================================
       🧾 BDB Invoice & Recipe Suite 🧾               
======================================================

? Welchen Dienst möchtest du verwalten?
❯ 🚖 Uber Invoices (Fahrten & Tax Invoices)
  🛍️ AliExpress Invoices & Receipts (Belege & Rechnungen)
  📁 Rechnungsordner öffnen (invoices/)
  🚪 Beenden
```

---

## 📄 License & Attribution

Distributed under the **MIT License**. Part of the BDB Developer Toolchain.
