# 🚀 Quickstart Guide: Uber Invoice Agent

A cross-platform, automated CLI agent to scan, download, and analyze historical Uber trip tax invoices (`Uber-Bv-*.pdf`) into clean financial summaries.

---

## ⚡ Prerequisites

- **Node.js**: v18.0.0 or higher
- **Google Chrome** or **Chromium** (installed automatically via Playwright)
- **OS**: macOS, Windows (PowerShell / CMD), or Linux

---

## 📦 Installation

### macOS / Linux
```bash
git clone https://github.com/hybridlabor-api/uber-invoice-agent.git
cd uber-invoice-agent
chmod +x install.sh
./install.sh
```

### Windows (PowerShell as Administrator or User)
```powershell
git clone https://github.com/hybridlabor-api/uber-invoice-agent.git
cd uber-invoice-agent
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

### Universal (via NPM)
```bash
npm install
npm run setup
```

---

## 🔑 First-Time Authentication

1. Run the setup or authentication step:
   ```bash
   node auth.js
   ```
2. A persistent Chrome window will open on `https://riders.uber.com`.
3. Log in with your Uber credentials (SMS / 2FA / Password).
4. The authentication session is securely saved in `.auth-profile/` for subsequent automated runs without re-login.

---

## 🎮 Usage & CLI Navigation

Start the interactive terminal dashboard:
```bash
npm start
# or
node index.js
```

### Interactive Menu Options:
1. **🔍 Verfügbaren Datumsbereich scannen**: Non-destructive fast scan of all lifetime trips using GraphQL interception to discover date boundaries and total trip count.
2. **📥 Alle Rechnungen herunterladen**: Downloads all available lifetime invoices into `invoices/`.
3. **📅 Rechnungen für ein Jahr herunterladen**: Downloads all invoices for a specific selected year (e.g. 2026, 2025, 2024...).
4. **📆 Rechnungen für einen bestimmten Zeitraum herunterladen**: Prompts for custom `YYYY-MM-DD` start and end dates.
5. **📊 Heruntergeladene Rechnungen analysieren (PDF-Tabelle)**: Runs the deterministic zero-token PDF parser to generate a financial summary table (`Gesamtauflistung.pdf`).

---

## 🤖 Programmatic Agent Skill Integration

AI agents (Cline, Roo Code, Antigravity, Claude Code) can invoke the CLI non-interactively:

```bash
# Scan lifetime range
node fetcher.js --scan

# Fetch specific date range
node fetcher.js --start 2025-01-01 --end 2025-12-31

# Generate summary table
node analyzer.js
```
