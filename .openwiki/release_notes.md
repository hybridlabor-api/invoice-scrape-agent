# 📝 Release Notes & Changelog

All notable changes to **BDB Invoice & Receipt Suite** are documented in this file.

---

## [1.4.16] - 2026-08-07

### 🚀 Added
- **NPM Version Badge**: Added dynamic NPM version badge to `README.md` to reflect the latest published state natively.

---

## [1.4.11 - 1.4.15] - 2026-08-07

### 🐛 Fixed & Optimized
- **AliExpress Robust Pagination**: Replaced fragile scrolling loops with the bulletproof 150-pass, 3-second DOM-aware pagination logic from the scanner. Effectively fixed lazy-load stalling for massive accounts (350+ orders).
- **Windows GUI Spawner**: Fixed background Electron daemon on Windows. Uses `npx.cmd` and `stdio: ignore` to prevent silent CLI execution death on Windows CMD/PowerShell.
- **AliExpress Browser Crashes**: Added `.catch(() => {})` wrappers to Playwright `waitForTimeout` calls to prevent unhandled promise rejections if the user or the script closes the browser during a wait frame.
- **Automatic YYYY-MM Subfolders**: Implemented strict `YYYY-MM` month-based subfolder routing for ALL downloaded PDFs (Uber, AliExpress, Amazon, Emails).
- **Master Analyzer Recursion**: Updated the Master PDF analyzer to scan directories recursively, ensuring the global ledger works flawlessly with the new subfolder structure.
- **Uber Tax Date Parsing**: Implemented "Steuerdatum vs Rechnungsdatum" parsing distinction in the Uber fetcher to correctly reflect exact trip dates vs billing dates.

---

## [1.4.2] - 2026-08-07

### Added
- **Complete GUI Feature Parity:** All features from the CLI are now available in the Electron GUI.
- **Advanced Auto-Pilot GUI Configuration:** The "Configure Auto-Pilot" modal now supports frequency selection (Daily, Weekly, Monthly, Custom Hours) and checkboxes for targeted scraper execution.
- **Custom Date Range Downloads:** Added a beautiful GUI modal for users to select custom start and end dates (`YYYY-MM-DD`) for invoice fetching.
- **Master PDF Report in GUI:** Added the ability to generate the combined master report directly from the GUI sidebar.
- **Automatic Desktop Shortcuts:** `npm install -g invoice-scrape-agent` now triggers a `postinstall` script (`utils/shortcut-maker.js`) that automatically drops Mac (`.command`) and Windows (`.bat`) shortcuts on the user's desktop.
- **Pre-Install Dependency Checks:** Added `utils/env-check.js` as a `preinstall` hook to strictly verify Node.js >= 18 and check Python status before allowing installation.
- **Immediate E-Mail Provider Testing:** Creating a new Email provider (e.g., Bolt) now asks the user via a native confirm dialog if they'd like to run a targeted test scan for the newly created provider instantly.

### Fixed
- **Dynamic Service Sorting:** Fixed GUI layout to properly sort Amazon, AliExpress, Uber, and Email Scraper dynamically.
- **Tailwind CSS Flexbox Bleed:** Fixed a critical CSS issue where the Terminal overlap squished the Sidebar. Solved using `flex-shrink-0` and `min-w-0` to maintain perfect boundaries.
- **Year Download Bug:** Fixed an issue where the "Download Year" button hardcoded the current year without prompting. Replaced with a sleek Tailwind Glass Modal to input the desired year.

---

## [1.1.1] - 2026-08-07

### 🐛 Fixed
- **Uber Multi-Invoice Modal Support**: Automatically detects and downloads all sub-invoices (`Rechnung 1`, `Rechnung 2`, `Rechnung 3`, etc.) when a single Uber trip contains multiple receipts.

---

## [1.1.0] - 2026-08-07

### 🚀 Added
- **AliExpress Multi-Service Integration**:
  - `services/aliexpress/auth.js`: 1-click persistent session authenticator for AliExpress.
  - `services/aliexpress/fetcher.js`: MTOP network response interceptor + order pagination + receipt downloader.
  - `utils/pdf-converter.js`: Lossless PNG-to-A4 PDF conversion engine using PDFKit.
  - `services/aliexpress/analyzer.js`: Table generator producing `invoices/aliexpress/Gesamtauflistung.pdf` and `Gesamtauflistung.json`.
- **Interactive Multi-Service CLI Dashboard**: Unified selector in `index.js` supporting both Uber and AliExpress operations.
- **Binary Aliases**: Added `aliexpress-invoice-agent` CLI binary command in `package.json`.

### 🔄 Changed
- Refactored project into modular `services/uber/`, `services/aliexpress/`, and `utils/` layout while maintaining 100% root backwards compatibility.
- Cleaned up installers (`install.sh` and `install.ps1`) to automatically verify Chromium and guide user setup.

---

## [1.0.2] - 2026-08-07

### 🔄 Changed
- Overhauled installer scripts (`install.sh` and `install.ps1`) for seamless cross-platform execution.
- Removed legacy LLM prompts from `setup.js` in favor of zero-token deterministic parsing.

---

## [1.0.0] - 2026-08-07

### 🚀 Initial Release
- Official Uber Tax Invoice extraction and renaming (`Uber-Bv-*.pdf`).
- GraphQL activity stream interception.
- Automated `Gesamtauflistung.pdf` accounting report generation.
