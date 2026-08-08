# 🧾 Invoice Scrape Agent - Agent Instructions

This repository contains the autonomous multi-platform tax invoice scraper, batch downloader, composite invoice splitter, and PDF/Excel accounting analyzer for Amazon, Uber, AliExpress, and custom merchants.

## 🌐 Documentation & Living Wiki
- **Agent Skill & API Blueprint:** [agent_skill.md](agent_skill.md)
- **General Code Knowledge:** [general_code_knowlege.md](general_code_knowlege.md)
- **Quickstart Guide:** [.openwiki/quickstart.md](.openwiki/quickstart.md)
- **Architecture & Signal Flow:** [.openwiki/architecture.md](.openwiki/architecture.md)
- **Architecture Decision Records (ADRs):** [.openwiki/decisions.md](.openwiki/decisions.md)
- **Release Notes & Changelog:** [.openwiki/release_notes.md](.openwiki/release_notes.md) / [CHANGELOG.md](CHANGELOG.md)

## ⚡ Non-Interactive Agent CLI Usage

### Amazon (Retail + Digital: Audible, Prime Video, Luna, Kindle)
- **Scan orders:** `npm run scan:amazon`
- **Download by year:** `node services/amazon/fetcher.js --year 2025`
- **Download all:** `node services/amazon/fetcher.js --all`
- **Analyze & export:** `npm run analyze:amazon`

### Uber (Rides & Eats)
- **Scan trips:** `npm run scan:uber`
- **Download by date range:** `node services/uber/fetcher.js --start YYYY-MM-DD --end YYYY-MM-DD`
- **Analyze & export:** `npm run analyze:uber`

### AliExpress
- **Scan orders:** `npm run scan:aliexpress`
- **Download with limit:** `node services/aliexpress/fetcher.js --limit 50`
- **Analyze & export:** `npm run analyze:aliexpress`

### Master Consolidation
- **Consolidate all ledgers & generate PDF/Excel/CSV:** `npm run analyze:master`
