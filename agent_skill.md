---
name: invoice-scrape-agent
description: Autonomous multi-platform workflow for fetching, normalizing, splitting composite invoices, and generating tax-compliant accounting ledgers for Uber, AliExpress, Amazon, and custom e-commerce scrapers.
---

# 🧾 Invoice Scrape Agent (BDB Multi-Service Tax Suite)

This skill documents how AI agents can operate `invoice-scrape-agent` non-interactively in **Agent Mode**, as well as the standard engineering pattern for building new scrapers for any e-commerce platform, digital service, or merchant.

---

## 📑 Table of Contents
1. [Agent Mode: Non-Interactive CLI Operation](#1-agent-mode-non-interactive-cli-operation)
2. [Data Architecture & Ledger Contracts](#2-data-architecture--ledger-contracts)
3. [Blueprint: Creating New Scrapers (BaseService Architecture)](#3-blueprint-creating-new-scrapers-baseservice-architecture)
4. [Composite PDF Splitting Pattern](#4-composite-pdf-splitting-pattern)
5. [Sub-Service Detection & Tax Categorization](#5-sub-service-detection--tax-categorization)
6. [Testing & Verification Protocol](#6-testing--verification-protocol)

---

## 1. Agent Mode: Non-Interactive CLI Operation

AI agents can execute all scraping, downloading, and financial reporting workflows purely via headless CLI commands.

### 🚀 Core Commands by Service

| Service | Scan (Discovery) | Fetch & Download Invoices | Analyze & Export Reports |
| :--- | :--- | :--- | :--- |
| **Amazon** | `npm run scan:amazon` | `node services/amazon/fetcher.js --all` | `npm run analyze:amazon` |
| **Uber** | `npm run scan:uber` | `node services/uber/fetcher.js --all` | `npm run analyze:uber` |
| **AliExpress**| `npm run scan:aliexpress` | `node services/aliexpress/fetcher.js --all`| `npm run analyze:aliexpress` |
| **Master (All)**| N/A | `node index.js --fetch-all` | `npm run analyze:master` |

### 🎯 CLI Flags for Targeted Execution
Agents should pass date and limit flags to avoid full account downloads when only specific periods are needed:

```bash
# Download by specific year
node services/amazon/fetcher.js --year 2025

# Download by multi-year range
node services/aliexpress/fetcher.js --year 2024-2026

# Download by precise ISO date range
node services/uber/fetcher.js --start 2026-01-01 --end 2026-06-30

# Download with batch limit (e.g. latest 20 invoices)
node services/amazon/fetcher.js --limit 20

# Run completely headless (for CI/CD or background agents)
node services/amazon/fetcher.js --all --headless
```

### 📊 Master Consolidation Output Files
After running `npm run analyze:master`, the agent can inspect the following machine-readable and human-ready artifacts in `invoices/`:
- `invoices/master_ledger.json` — Consolidated JSON array of all downloaded records across all services.
- `invoices/master_ledger.xlsx` — Modern Excel workbook with auto-filter, per-service tabs, and category summaries.
- `invoices/master_ledger.xls` — Classic binary BIFF8 workbook compatible with OpenCalc and DATEV.
- `invoices/master_ledger.csv` — German format (semicolon-delimited with `,` decimal commas).
- `invoices/Gesamtauflistung.pdf` — Landscape PDF table with page numbers and grand totals.

---

## 2. Data Architecture & Ledger Contracts

Every service maintains an atomic JSON ledger at `invoices/<service_id>/<service_id>_ledger.json`.

### Standard Ledger Record Schema:
```json
{
  "id": "AMZ-304-8397662-8408358-INV-DE-2025-598381416",
  "service": "amazon",
  "serviceDisplayName": "Amazon.de",
  "subService": "Audible",
  "category": "Verbrauchsmaterial",
  "orderId": "304-8397662-8408358",
  "invoiceNumber": "INV-DE-2025-598381416",
  "date": "2025-11-28",
  "steuerdatum": "2025-11-28",
  "rechnungsdatum": "2025-11-28",
  "brutto": 16.99,
  "netto": 14.28,
  "ust": 2.71,
  "taxRate": "19%",
  "currency": "EUR",
  "seller": "Audible GmbH",
  "isDigital": true,
  "status": "downloaded",
  "pdfPath": "invoices/amazon/2025-11/2025-11-28_INV-DE-2025-598381416.pdf",
  "updatedAt": "2026-08-08T22:00:00.000Z"
}
```

### Key Accounting Rules:
1. **Dual Date Model:**
   - `steuerdatum` (Tax date / service fulfillment date) is used for sorting and tax recognition.
   - `rechnungsdatum` (Document date) tracks when the invoice was formally issued.
2. **Deterministic Tax Breakdown:**
   $$\text{Netto} = \text{round}\left(\frac{\text{Brutto}}{1 + \text{rate}}, 2\right), \quad \text{USt} = \text{round}(\text{Brutto} - \text{Netto}, 2)$$
3. **Storage Grouping:** Invoices are stored in `invoices/<service>/YYYY-MM/<Date>_<SanitizedInvoiceNumber>.pdf`.

---

## 3. Blueprint: Creating New Scrapers (BaseService Architecture)

To add a new store or provider (e.g. `otto`, `mediamarkt`, `cyberport`, `apple`, `digitec`, `paypal`):

### Step 1: Scaffold Directory Structure
Run the automated scaffolder:
```bash
node services/generator/scaffold.js
```
Or manually create `services/<service_id>/` with:
- `index.js` (The core scraper class extending `BaseService`)
- `auth.js` (Authentication script)
- `fetcher.js` (CLI entry point)
- `analyzer.js` (Reporting script)

### Step 2: Implement the `BaseService` Lifecycle Contract
Every scraper class **must** extend `BaseService` (`services/base/BaseService.js`) and implement 4 standard methods:

```javascript
const BaseService = require('../base/BaseService');
const path = require('path');
const fs = require('fs');

class MediaMarktService extends BaseService {
  constructor(config = {}) {
    super({
      id: 'mediamarkt',
      displayName: 'MediaMarkt',
      icon: '🔴',
      authUrl: 'https://www.mediamarkt.de/de/login',
      ...config
    });
    this.ordersUrl = 'https://www.mediamarkt.de/de/myaccount/orders';
  }

  /**
   * 1. Interactive Authentication & Session Persistence
   */
  async authenticate({ headless = false } = {}) {
    const context = await this.launchBrowser({ headless });
    const page = context.pages()[0] || await context.newPage();
    try {
      await page.goto(this.ordersUrl, { waitUntil: 'domcontentloaded' });
      // Wait until user completes login & 2FA
      await page.waitForFunction(() => window.location.href.includes('/orders') || document.querySelector('.user-profile'), { timeout: 0 });
      return { success: true };
    } finally {
      await context.close();
    }
  }

  /**
   * 2. Scan Orders List
   */
  async scan({ year = new Date().getFullYear().toString(), maxPages = 10 } = {}) {
    const context = await this.launchBrowser({ headless: false });
    const page = context.pages()[0] || await context.newPage();
    const orders = [];
    try {
      await page.goto(this.ordersUrl, { waitUntil: 'domcontentloaded' });
      // Extract order cards from DOM or intercept internal API
      const cards = await page.$$eval('.order-card', elements => elements.map(el => ({
        orderId: el.querySelector('.order-id')?.innerText?.trim(),
        dateText: el.querySelector('.order-date')?.innerText?.trim(),
        totalText: el.querySelector('.order-total')?.innerText?.trim(),
        invoiceLink: el.querySelector('a[href*="invoice"]')?.href
      })));

      for (const card of cards) {
        const date = this.normalizeDate(card.dateText);
        const brutto = this.parseCurrency(card.totalText);
        const tax = this.calculateTaxBreakdown({ brutto, taxRate: '19%' });
        orders.push({
          id: `MM-${card.orderId}`,
          orderId: card.orderId,
          date,
          steuerdatum: date,
          rechnungsdatum: date,
          brutto,
          netto: tax.netto,
          ust: tax.ust,
          taxRate: tax.taxRate,
          invoiceLink: card.invoiceLink
        });
      }
      return orders;
    } finally {
      await context.close();
    }
  }

  /**
   * 3. Fetch Invoices (PDF Download or HTML Print Rendering)
   */
  async fetch({ all = false, year = null, startDate = null, endDate = null, limit = null, headless = false } = {}) {
    const orders = await this.scan({ year });
    const context = await this.launchBrowser({ headless });
    const page = context.pages()[0] || await context.newPage();
    let downloaded = 0;

    try {
      for (const order of orders) {
        if (this.isCancelled) break;
        if (this.isAlreadyDownloaded(order.orderId)) continue;

        const subfolder = path.join(this.invoicesDir, order.date.substring(0, 7));
        if (!fs.existsSync(subfolder)) fs.mkdirSync(subfolder, { recursive: true });

        const fileName = `${order.date}_INV-${order.orderId}.pdf`;
        const filePath = path.join(subfolder, fileName);

        if (order.invoiceLink?.endsWith('.pdf')) {
          const res = await page.request.get(order.invoiceLink);
          fs.writeFileSync(filePath, await res.body());
        } else {
          // Render print HTML to A4 PDF
          await page.goto(order.invoiceLink, { waitUntil: 'networkidle' });
          await page.pdf({ path: filePath, format: 'A4', printBackground: true });
        }

        this.saveLedgerRecord({
          ...order,
          pdfPath: path.relative(path.resolve(this.invoicesDir, '..', '..'), filePath),
          status: 'downloaded'
        });
        downloaded++;
      }
      return { downloaded, total: orders.length };
    } finally {
      await context.close();
    }
  }

  /**
   * 4. Generate Reports (PDF, Excel, CSV, HTML)
   */
  async analyze() {
    const ledger = this.loadLedger();
    const { exportServiceExcel } = require('../../utils/excel-exporter');
    await exportServiceExcel({
      serviceName: this.displayName,
      title: `${this.displayName} Rechnungsübersicht`,
      invoicesDir: this.invoicesDir,
      records: ledger
    });
  }
}

module.exports = MediaMarktService;
```

---

## 4. Composite PDF Splitting Pattern

When online stores group multiple items or sellers into a single multi-page PDF with separate invoices on individual pages, use this `pdf-lib` + `pdf-parse` splitting pattern:

```javascript
const { PDFDocument } = require('pdf-lib');
const pdf = require('pdf-parse');

async function splitCompositePdf(pdfBuffer) {
  const pageTexts = [];
  await pdf(pdfBuffer, {
    pagerender: (pageData) => pageData.getTextContent().then(tc => {
      const txt = tc.items.map(i => i.str).join(' ');
      pageTexts.push(txt);
      return txt;
    })
  });

  // Group pages where a new invoice starts (e.g. "Seite 1 von" or distinct invoice ID)
  const invoiceGroups = [];
  let currentGroup = [];
  pageTexts.forEach((text, idx) => {
    const isPageOne = /(?:Seite\s*1\s*von|Page\s*1\s*of)/i.test(text);
    if (isPageOne && currentGroup.length > 0) {
      invoiceGroups.push(currentGroup);
      currentGroup = [idx];
    } else {
      currentGroup.push(idx);
    }
  });
  if (currentGroup.length > 0) invoiceGroups.push(currentGroup);

  // Extract individual PDF documents
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const subInvoices = [];
  for (const pageIndices of invoiceGroups) {
    const subDoc = await PDFDocument.create();
    const pages = await subDoc.copyPages(srcDoc, pageIndices);
    pages.forEach(p => subDoc.addPage(p));
    const subBytes = await subDoc.save();
    subInvoices.push(Buffer.from(subBytes));
  }
  return subInvoices;
}
```

---

## 5. Sub-Service Detection & Tax Categorization

When a single platform serves multiple business units (e.g. Amazon Retail vs. Audible vs. Prime Video, or Uber Rides vs. Uber Eats), implement a `detectSubService` routine:

```javascript
detectSubService(text = '', seller = '', orderId = '') {
  const combined = `${text} ${seller} ${orderId}`.toLowerCase();
  
  if (/audible/i.test(combined)) {
    return { subService: 'Audible', category: 'Verbrauchsmaterial' };
  }
  if (/prime\s*video|instant\s*video/i.test(combined)) {
    return { subService: 'Prime Video', category: 'Verbrauchsmaterial' };
  }
  if (/luna/i.test(combined)) {
    return { subService: 'Amazon Luna', category: 'Verbrauchsmaterial' };
  }
  if (/kindle|ebook/i.test(combined)) {
    return { subService: 'Amazon Kindle', category: 'Verbrauchsmaterial' };
  }
  if (/eats|restaurant|food/i.test(combined)) {
    return { subService: 'Uber Eats', category: 'Kost & Logis' };
  }
  return { subService: 'Standard', category: 'Anschaffung' };
}
```

### Standard Accounting Categories:
- **Anschaffung** (Hardware, Electronics, Permanent Assets)
- **Verbrauchsmaterial** (Supplies, Digital Subscriptions, Books, Cloud Credits)
- **Kost & Logis** (Meals, Food Delivery, Hotels)
- **Reise** (Rides, Trains, Flights, Parking)
- **Sonstiges** (General services, uncategorized expenses)

---

## 6. Testing & Verification Protocol

When creating or modifying a scraper, always add unit tests under `tests/services/<service>.test.js` covering:
1. `parseOrderCardData` & amounts normalization.
2. `calculateTaxBreakdown` with standard VAT rates (19%, 7%, 0%).
3. Date filtering (`filterOrdersByDate`) & multi-year expansion.
4. Invoice number regex extraction from sample text/PDFs.
5. Composite invoice splitting (if applicable).

Execute the full suite offline with:
```bash
npm test
```
All tests must pass cleanly before deploying or releasing.
