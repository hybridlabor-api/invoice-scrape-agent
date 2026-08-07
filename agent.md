# 🚖 Uber Invoice Agent - Agent Instructions

This repository contains the autonomous Uber tax invoice scraper, batch downloader, and PDF accounting analyzer.

## 🌐 Documentation & Living Wiki
- **Entrypoint:** [.openwiki/quickstart.md](.openwiki/quickstart.md)
- **Architecture & Signal Flow:** [.openwiki/architecture.md](.openwiki/architecture.md)
- **Decisions (ADRs):** [.openwiki/decisions.md](.openwiki/decisions.md)
- **Release Notes:** [.openwiki/release_notes.md](.openwiki/release_notes.md)
- **Agent Skill API:** [agent_skill.md](agent_skill.md)

## ⚡ Non-Interactive Agent CLI Usage
- **Scan lifetime trips:** `node fetcher.js --scan`
- **Download invoices by date range:** `node fetcher.js --start YYYY-MM-DD --end YYYY-MM-DD`
- **Analyze invoices & generate summary table:** `node analyzer.js`
