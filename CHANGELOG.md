# 📝 Changelog

All notable changes to **invoice-scrape-agent** (BDB Multi-Service Invoice & Tax Suite) are documented in this file.

---

## [1.6.2] - 2026-08-10

### 🐛 Fixed
- **Uber Foreign Currency Parsing**: Fixed a bug where non-EUR currencies (USD, GBP, CHF, PLN, CZK) were skipped due to a hardcoded `€` symbol constraint in regex. The analyzer is now currency-agnostic and detects the correct currency dynamically.
- **Uber Priority Rides Import**: Expanded the download button locators to cover `Beleg herunterladen` and `Download Receipt`, which are sometimes used for Priority bookings. The invoice number regex now correctly extracts `Belegnummer` or `Receipt Number`.

---

## [1.6.1] - 2026-08-08

### 🚀 Added & Enhanced
- **Amazon Multi-Invoice Popover Parsing**:
  - Implemented exhaustive DOM and regex link parsing for Amazon order popovers.
  - Automatically captures and downloads *all* invoice documents (`Rechnung 1`, `Rechnung 2`, `Gutschrift`, direct PDF endpoints, and print summary fallbacks) instead of only the first link.
- **Digital Orders Scanning (`filterType=digital`)**:
  - `AmazonService.scan()` now scans both physical retail orders and digital order history tabs (`timeFilter=year-YYYY&filterType=digital`).
  - Seamlessly captures non-retail purchases including Audible audiobooks/subscriptions, Prime Video movie rentals/purchases, Amazon Luna cloud gaming, and Kindle eBooks.
- **Sub-Service Taxonomy & Auto-Categorization**:
  - Added `detectSubService()` helper to automatically identify and tag:
    - 🎧 **Audible** (*Verbrauchsmaterial*)
    - 🎬 **Prime Video** (*Verbrauchsmaterial*)
    - 🎮 **Amazon Luna** (*Verbrauchsmaterial*)
    - 📚 **Amazon Kindle** (*Verbrauchsmaterial*)
    - 📦 **Amazon.de Retail** (*Anschaffung*)
- **Composite PDF Splitting Engine (`pdf-lib` + `pdf-parse`)**:
  - Refined page-by-page inspection to accurately isolate atomic sub-invoices from combined multi-invoice delivery PDFs without miscounting multi-page invoices.
- **Excel & Master Consolidation Updates**:
  - Service and Master Excel workbooks (`.xlsx` & `.xls`) now clearly display the specific sub-service/sparte in dedicated columns.
- **In-App Update Notifier & GUI Pop-Up Modal**:
  - Implemented automatic, non-blocking version check against NPM Registry (`utils/update-checker.js`).
  - Added dedicated **GUI Pop-up Window** (`#new-version-modal`) and pulsating titlebar badge that immediately alerts the user when a new release is available with a 1-click update action.
  - Added CLI startup update banner with terminal box notification.
- **Comprehensive Agent Skill & Extension Blueprint**:
  - Published comprehensive `agent_skill.md` and global skill definition documenting headless non-interactive Agent Mode, CLI flags, JSON ledger schemas, and step-by-step blueprints for scaffolding new e-commerce scrapers.
- **Automated Test Suite Expansion**:
  - Added dedicated unit tests for update-checker semver logic and GUI contract. All 40 tests across 11 test suites pass with 100% success.

---

## [1.6.0] - 2026-08-08

### 🚀 Added & Enhanced (All 9 Core Steps & Full Test Suite)
- **Multi-Service Selection & Dynamic Registry**: Interactive checkboxes in CLI/GUI for batch scraping (`amazon, uber, aliexpress` or `ALL`).
- **Native Excel Date Formatting**: Real date cells (`t: 'd'`, `YYYY-MM-DD`) for `Steuerdatum` and `Rechnungsdatum`.
- **AutoFilter & Dedicated Service Tabs**: Native dropdowns, per-service sheets, and `=SUM(...)` formulas with embedded cache values.
- **AliExpress Tax Breakdown & Normalization**: Deterministic 19% VAT calculations from gross totals.
- **Cancellation Signal & Start/Stop GUI Controls**: Graceful worker process termination.
- **Multi-Year & Strict Date Bounds Filtering**: Support for ranges like `2023-2025` and ISO date bounds.
- **Uber Rides vs. Eats Tax Split**: 19% VAT (*Reise*) vs. 7% VAT (*Kost & Logis*).
- **Amazon Composite Invoice PDF Splitting**: Automated splitting of bundled orders.
- **Expense Categorization**: 5 standard accounting categories with dedicated summary sheet.
- **Electron GUI Real-Time Terminal Streaming**: Live log streaming over IPC.

---

## [1.5.9] - 2026-08-07

### 🚀 Added & Fixed
- **AliExpress Range & Year Filtering**: Smart parser supporting single years, year ranges, and inverted bounds with early exit.
- **Permanent Expired Order Handling**: 404 / expired orders permanently marked as `status: 'expired'` in ledger to avoid redundant network requests.
