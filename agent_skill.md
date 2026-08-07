---
name: invoice-scrape-agent
description: Autonomous multi-platform workflow for fetching, normalizing, and analyzing Uber and AliExpress receipts and tax invoices.
---

# 🧾 Invoice Scrape Agent Skill (Uber & AliExpress)

This skill provides the standard operating procedure for extracting, downloading, normalizing, and analyzing receipts and tax invoices using `invoice-scrape-agent`.

## Workflow Instructions

### 🚖 Uber Invoices
1. **Scan**: `npm run scan:uber`
2. **Download**: `npm run fetch:uber` (or `node services/uber/fetcher.js --start YYYY-MM-DD --end YYYY-MM-DD`)
3. **Analyze**: `npm run analyze:uber` -> Generates `invoices/uber/Gesamtauflistung.pdf`

### 🛍️ AliExpress Invoices & Receipts
1. **Scan**: `npm run scan:aliexpress`
2. **Download**: `npm run fetch:aliexpress` (or `node services/aliexpress/fetcher.js --limit 50` / `--year 2026`)
3. **Analyze**: `npm run analyze:aliexpress` -> Generates `invoices/aliexpress/Gesamtauflistung.pdf`

### 🎮 Interactive Dashboard
Run the interactive CLI suite:
```bash
npm start
```

