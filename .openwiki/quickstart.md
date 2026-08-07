# 🚀 Quickstart Guide: BDB Invoice & Receipt Suite

A cross-platform, automated CLI & GUI suite to scan, download, and analyze historical tax invoices and receipts from Uber, AliExpress, Amazon, and IMAP Emails. Generates clean financial summaries.

---

## ⚡ Prerequisites

- **Node.js**: v18.0.0 or higher
- **Google Chrome** or **Chromium** (installed automatically via Playwright)
- **OS**: macOS, Windows (PowerShell / CMD), or Linux

---

## 📦 Installation & Execution
 
### Global NPM Install (Recommended)
```bash
npm install -g invoice-scrape-agent@latest
```
*(Automatically creates Desktop Shortcuts for the GUI and CLI on Mac & Windows!)*

### Start the GUI:
```bash
invoice-scrape-agent-gui
```

### Start the CLI:
```bash
invoice-scrape-agent
```

### Local Git Repository
```bash
# macOS / Linux:
./install.sh

# Windows PowerShell:
powershell -ExecutionPolicy Bypass -File .\install.ps1

# Start:
npm start
```

---

## 🔑 First-Time Authentication

Authentication is handled securely per service. Run the CLI dashboard and select the desired service. If you are not logged in, it will prompt you:

1. **Uber**: `npm run auth:uber` or via CLI menu.
2. **AliExpress**: `npm run auth:aliexpress` or via CLI menu.
3. **Amazon**: `npm run auth:amazon` or via CLI menu.
4. **Email/IMAP**: Set credentials via CLI prompt (saved to `.env`).

A persistent Chrome window will open. Log in normally. The session is saved in `.auth-profile/<service>/` for all subsequent background runs.

---

## 🎮 Usage & CLI Navigation

Start the interactive terminal dashboard:
```bash
npm start
# or
invoice-scrape-agent
```

### Interactive Menu Options:
- **🚖 Uber Invoices**: Scan, fetch, or analyze Uber trips.
- **🛍️ AliExpress Invoices**: Fast DOM scanning, pagination fetching, and PNG-to-PDF rendering.
- **📦 Amazon Invoices**: Popover automation for native Amazon PDF extraction.
- **📧 E-Mail Rechnungs-Scraper (IMAP)**: Search emails by sender and render HTML emails to PDFs.
- **🌟 Gesamtabrechnung aller Dienste**: Generates a Master PDF report merging all services.
- **💻 GUI Modus starten (Electron)**: Launch the visual UI.

---

## 🤖 Programmatic Agent Skill Integration

AI agents can invoke the services non-interactively via npm scripts:

```bash
# Scan a service
npm run scan:aliexpress
npm run scan:uber

# Fetch invoices (add --all or --year YYYY)
npm run fetch:aliexpress
npm run fetch:uber

# Generate summary table for a specific service or master
npm run analyze:aliexpress
npm run analyze:master
```
