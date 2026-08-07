# 🧠 General Code Knowledge & Architecture Reference
> **Project:** `invoice-scrape-agent` (BDB Multi-Service Invoice & Tax Suite)  
> **Version:** 1.5.9+  
> **Target Platforms:** macOS, Linux, Windows  
> **Primary Tech Stack:** Node.js, Playwright, Electron, SheetJS (`xlsx`), PDFKit, `pdf-parse`, IMAPFlow

---

## 📑 Table of Contents
1. [Core Architecture & Philosophy](#1-core-architecture--philosophy)
2. [Service Registry & Scraper Engines](#2-service-registry--scraper-engines)
   - [Uber Service](#uber-service)
   - [AliExpress Service](#aliexpress-service)
   - [Amazon.de Service](#amazonde-service)
   - [Generic Email / IMAP Pipeline](#generic-email--imap-pipeline)
   - [Unified Master Analyzer](#unified-master-analyzer)
3. [Tax & Accounting Rules (German Buchhaltung Standards)](#3-tax--accounting-rules-german-buchhaltung-standards)
4. [Spreadsheet Exports & Multi-Platform Compatibility](#4-spreadsheet-exports--multi-platform-compatibility)
   - [Binary `.xls` (BIFF8) vs `.xlsx` (OpenXML)](#binary-xls-biff8-vs-xlsx-openxml)
   - [Pre-calculated Formula Values (`v` + `f`)](#pre-calculated-formula-values-v--f)
   - [German CSV Delimiter & Number Formatting](#german-csv-delimiter--number-formatting)
5. [Browser Automation, Anti-Bot & Auth Management](#5-browser-automation-anti-bot--auth-management)
6. [Desktop GUI & Process Isolation](#6-desktop-gui--process-isolation)
7. [Cron Scheduling & OS Integration](#7-cron-scheduling--os-integration)
8. [Historical Bugs & Post-Mortem Solutions](#8-historical-bugs--post-mortem-solutions)
9. [Configuration, CLI Arguments & Environment Variables](#9-configuration-cli-arguments--environment-variables)

---

## 1. Core Architecture & Philosophy

```
                                  ┌───────────────────────────────┐
                                  │      Entry Points (CLI/GUI)   │
                                  │   index.js / electron/main.js │
                                  └───────────────┬───────────────┘
                                                  │
                                   ┌──────────────┴──────────────┐
                                   ▼                             ▼
                          ┌─────────────────┐           ┌─────────────────┐
                          │ Service Registry│           │  Utils & Paths  │
                          │   registry.js   │           │ paths.js, etc.  │
                          └────────┬────────┘           └─────────────────┘
                                   │
         ┌─────────────────────────┼──────────────────────────┐
         ▼                         ▼                          ▼
┌─────────────────┐       ┌─────────────────┐        ┌─────────────────┐
│  Uber Service   │       │AliExpress Service│       │ Amazon Service  │
│(GraphQL Interc.)│       │ (MTOP + Tax-UI) │        │ (DOM Pagination)│
└────────┬────────┘       └────────┬────────┘        └────────┬────────┘
         │                         │                          │
         └─────────────────────────┼──────────────────────────┘
                                   ▼
                   ┌───────────────────────────────┐
                   │   invoices/<service>/YYYY-MM/ │
                   │   <service>_ledger.json       │
                   └───────────────┬───────────────┘
                                   ▼
                   ┌───────────────────────────────┐
                   │    Unified Master Analyzer    │
                   │    (PDF, XLS, XLSX, CSV, HTML)│
                   └───────────────────────────────┘
```

* **Zero-Cloud-Dependency Accounting:** PDF invoice parsing and data consolidation are performed entirely locally using deterministic regex/token parsers (`pdf-parse`, `pdfkit`), eliminating cloud LLM costs and data privacy concerns.
* **Process Isolation via `child_process.fork()`:** Each browser-driven operation (Auth, Scan, Fetch, Analyze) runs in a separate child process. This prevents Playwright memory leaks, avoids blocking the Electron UI event loop, and ensures clean resource reclamation.
* **Hierarchical Storage Architecture:**
  - `invoices/<service>/YYYY-MM/`: PDF invoices grouped chronologically.
  - `invoices/<service>/<service>_ledger.json`: Persistent state machine of all discovered orders and download statuses.
  - `.auth-profile/<service>/`: Persistent Chromium user profile holding session cookies, local storage, and authentication tokens.

---

## 2. Service Registry & Scraper Engines

### Uber Service
* **Mechanism:** Intercepts GraphQL network responses on `https://riders.uber.com/graphql` (`data.activities.past.activities`).
* **Why GraphQL?** Uber's React frontend destroys/hydrates DOM nodes dynamically on infinite scroll. Direct DOM scraping missed historical trips.
* **Tax PDF Retrieval:** Direct navigation to `https://riders.uber.com/trips/{tripId}` or querying the trip PDF endpoint directly.
* **Date Handling:** Distinguishes trip execution date (`orderDate` / *Steuerdatum*) from billing invoice date (`invoiceDate` / *Rechnungsdatum*).

### AliExpress Service
* **Mechanism:** Dual-layer scraping:
  1. Intercepts MTOP backend responses (`mtop.aliexpress.trade.buyer.order.list`).
  2. DOM fallback parser looking for `order-item`, `order-card`, and `View more orders` pagination triggers.
* **Invoice Fetching Flow:**
  - Primary: `https://www.aliexpress.com/p/tax-ui/index.html?isGrayMatch=true&orderId={orderId}`
  - Fallback: `https://www.aliexpress.com/p/order/detail.html?orderId={orderId}` (with floating element removal and A4 print rendering).
* **Expired & 404 Protection:** Old orders (2018–2020) without available tax invoices are permanently marked as `status: 'expired'` in `ledger.json` and skipped in subsequent runs.
* **PNG-to-A4 Normalizer (`utils/pdf-converter.js`):** Standardizes captured receipt images into vector A4 PDF documents.

### Amazon.de Service
* **Mechanism:** Iterates order history pages (`/your-orders/orders?timeFilter=year-{YEAR}&startIndex={INDEX}`).
* **Popover Receipt Extraction:** Inspects inline order invoice popovers, retrieves VAT invoices (`/gp/shared-cs/ajax/invoice/invoice.html`), and converts HTML receipts into standardized A4 PDFs.

### Generic Email / IMAP Pipeline
* **Mechanism:** Connects via `imapflow` and parses MIME messages using `mailparser`.
* **Declarative JSON Providers:** Service rules are defined in regex JSON files (e.g. `services/email/providers/bolt.json`). Playwright renders the sanitized email HTML into an A4 PDF with clean margins.

### Unified Master Analyzer
* **Location:** `services/unified/master-analyzer.js`
* **Outputs:**
  - `Gesamtauflistung.pdf`: PDF accounting ledger with summary header and page numbers.
  - `Gesamtauflistung.xls`: Multi-sheet binary BIFF8 spreadsheet.
  - `Gesamtauflistung.xlsx`: Modern OpenXML spreadsheet.
  - `Gesamtauflistung.csv`: German semicolon-delimited CSV with decimal commas.
  - `Gesamtauflistung.html`: Responsive HTML dashboard with interactive search.
  - `Gesamtauflistung.json`: Complete aggregated machine-readable ledger.

---

## 3. Tax & Accounting Rules (German Buchhaltung Standards)

### Dual Date Model: Steuerdatum vs. Rechnungsdatum
In German tax law (§ 13 UStG), input tax deduction (*Vorsteuerabzug*) and revenue recognition are based on the **date of service performance** (*Leistungsdatum* / *Steuerdatum*), while invoice bookkeeping requires tracking the **invoice issue date** (*Rechnungsdatum*):

| Field | Definition | Example Scenario |
| :--- | :--- | :--- |
| **Steuerdatum** (`orderDate`) | Date when trip or purchase occurred. | Uber ride taken on `2025-12-31`. |
| **Rechnungsdatum** (`invoiceDate`) | Date printed on the formal tax invoice. | Uber invoice generated on `2026-01-02`. |

* All ledgers, CSVs, Excel exports, and PDF reports explicitly provide both columns and sort records chronologically by **Steuerdatum**.

### Tax Breakdown
* **Netto (19% / 7% / 0%)**, **USt / VAT Amount**, and **Brutto (Total)** are calculated with deterministic precision (`Math.round((val + Number.EPSILON) * 100) / 100`).
* Cross-border EU / Reverse Charge purchases (e.g., AliExpress international) default to 0% VAT with the full amount allocated to Netto.

---

## 4. Spreadsheet Exports & Multi-Platform Compatibility

### Binary `.xls` (BIFF8) vs `.xlsx` (OpenXML)
* Some accounting software (DATEV, older SAP instances, OpenOffice / LibreOffice Calc) struggles with specific OpenXML (`.xlsx`) XML schemas or strict security sandboxing.
* The suite uses **SheetJS (`xlsx`)** to generate **both** `.xls` (BIFF8 binary) and `.xlsx` simultaneously.

### Pre-calculated Formula Values (`v` + `f`)
> [!IMPORTANT]
> **The Google Sheets / OpenCalc Zero-Sum Issue:**  
> When writing formula cells (e.g., `=SUM(E2:E50)`), spreadsheet engines like Google Sheets and OpenCalc do not execute formulas during headless imports unless a pre-calculated cached value is present.

To guarantee instant visibility of totals without manual recalculation, all total cells must be constructed with both properties:

```javascript
// Correct SheetJS formula construction
ws[cellAddress] = {
  t: 'n',             // Type: numeric
  v: computedTotal,   // Pre-calculated numerical value
  f: `SUM(E2:E${lastRow})`, // Dynamic formula
  z: '#,##0.00'       // Currency formatting
};
```

### German CSV Delimiter & Number Formatting
* **Delimiter:** Semicolon (`;`) instead of comma (`,`).
* **Decimals:** Comma (`,`) instead of dot (`.`) (e.g. `24,99` instead of `24.99`).
* This ensures German Excel, LibreOffice, and OpenCalc automatically parse amounts as numbers rather than left-aligned text strings.

---

## 5. Browser Automation, Anti-Bot & Auth Management

### Persistent Context Configuration
To prevent session timeouts and bypass bot detection systems (Cloudflare, Akamai, Securify):
```javascript
const context = await chromium.launchPersistentContext(authDir, {
  headless: false,
  channel: 'chrome',
  viewport: { width: 1360, height: 850 },
  acceptDownloads: true,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox'
  ],
  ignoreDefaultArgs: ['--enable-automation']
});
```

* **Avoid Headless Mode during Authentication:** SMS 2FA prompts and captcha challenges must be solved in a visible browser window.
* **Session Persistence:** All cookies, localStorage, and device identifiers are stored under `.auth-profile/<service>/`.

---

## 6. Desktop GUI & Process Isolation

* **Framework:** Electron with Tailwind CSS and Glassmorphism styling.
* **Entry Point:** `electron/main.js` and `electron/renderer/renderer.js`.
* **Execution:** Renderer triggers IPC calls -> Main process spawns Node child processes -> Stdout and stderr stream live to the GUI terminal view.
* **Clean Termination:** When a user closes the window or clicks "Abbrechen", `childProcess.kill('SIGINT')` cleanly terminates the running Playwright browser.

---

## 7. Cron Scheduling & OS Integration

The suite includes autonomous periodic scrapers configured via `services/scheduler/`:
* **macOS:** Generates native `launchd` `.plist` files located in `~/Library/LaunchAgents/`.
* **Linux:** Manages user `crontab` entries.
* **Windows:** Generates XML definitions for Windows Task Scheduler (`schtasks`).

---

## 8. Historical Bugs & Post-Mortem Solutions

### Bug 1: Left-Aligned CSV Strings in OpenCalc
* **Root Cause:** CSV exported numbers with dot decimals (`24.99`) and comma delimiters. In German locales, spreadsheet tools treat this as literal text.
* **Solution:** Switched CSV generation to semicolon delimiters and comma decimals, and added native binary `.xls` / `.xlsx` exports.

### Bug 2: Missing Grand Totals in Google Sheets
* **Root Cause:** Excel formula cells only contained `f: 'SUM(...)'` without `v: <number>`. Google Sheets displayed blank or `0.00`.
* **Solution:** Added dual-property cell generation (`v` for immediate numeric display + `f` for live Excel updates).

### Bug 3: Scan Summary Ledger Overwrites
* **Root Cause:** Incomplete initial scans populated ledger entries with `0.00` amounts, overwriting cached summary data.
* **Solution:** Analyzers now perform prioritized merging (`ledger.totalAmount || summary.totalAmount || 0`).

### Bug 4: AliExpress Expired Order Infinite Loop & Date Range Bypassing
* **Root Cause:** 
  1. Year range strings like `"2026-2025"` were tested with `startsWith()`, failing all comparisons.
  2. Expired orders (404) had no local PDF files, causing `isOrderDownloaded()` to return `false` on every run.
  3. Live scanner scrolled up to 150 pages without date boundary checks.
* **Solution (v1.5.9):**
  1. Implemented `parseDateFilter()` to extract years and handle swapped date bounds.
  2. Live scanner terminates as soon as scraped dates drop below the requested minimum.
  3. Expired/404 orders are permanently recorded with `status: 'expired'` in `ledger.json` and skipped automatically.

---

## 9. Configuration, CLI Arguments & Environment Variables

### CLI Options Matrix
| Argument | Description | Example |
| :--- | :--- | :--- |
| `--all` | Download all available invoices in history. | `npm run fetch:uber -- --all` |
| `--year <YEAR>` | Single year or range of years. | `npm run fetch:aliexpress -- --year 2025-2026` |
| `--start <DATE>` | Start date (`YYYY-MM-DD`). | `--start 2025-01-01` |
| `--end <DATE>` | End date (`YYYY-MM-DD`). | `--end 2026-08-31` |
| `--limit <N>` | Limit processing to the next N pending invoices. | `--limit 25` |
| `--rescan` | Force full re-scan bypassing cached summary. | `--rescan` |
| `--scan` | Only scan and output accounting summary. | `npm run scan:aliexpress` |

### Environment Variables (`.env`)
```bash
# Data Directory Overrides
INVOICE_DATA_DIR="/custom/storage/path"

# IMAP Configuration (for Email Invoices)
IMAP_HOST="imap.example.com"
IMAP_PORT=993
IMAP_USER="accounting@example.com"
IMAP_PASS="secret_password"
IMAP_TLS=true
```
