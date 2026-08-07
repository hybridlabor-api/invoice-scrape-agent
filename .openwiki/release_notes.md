# 📝 Release Notes & Changelog

All notable changes to **BDB Invoice & Receipt Suite** are documented in this file.

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
