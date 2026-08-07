# 📝 Release Notes & Changelog

All notable changes to the **Uber Invoice Agent** will be documented in this file.

---

## [v2.0.0] - 2026-08-07

### 🚀 Major Improvements
- **GraphQL Stream Interception**: Switched trip detection from DOM scraping to intercepting Uber's internal GraphQL endpoint (`/graphql`), achieving 100% trip discovery accuracy across deep pagination.
- **Smart Chronological Year Inference**: Added automatic year tracking that analyzes month jumps across paginated activity arrays, solving Uber's omission of year numbers in activity lists.
- **Deterministic PDF Parsing**: Replaced external LLM dependencies with a fast, zero-token regex extraction engine capable of outputting a formatted `Gesamtauflistung.pdf` summary table.
- **Invoice Number Normalization**: Fixed filename extraction regex to properly format files as `Uber-Bv-YYYY-MM-DD-<INVOICE_NUMBER>.pdf`.
- **Extended CLI Dashboard**: Added quick-selection options to download all lifetime invoices or select by specific years (2026, 2025, 2024...).
- **Cross-Platform Compatibility**: Added native Windows PowerShell installer script (`install.ps1`) and NPM standard script shortcuts (`npm run setup`, `npm start`, `npm run fetch`, `npm run analyze`).

---

## [v1.0.0] - Initial Release
- Initial Playwright automation and interactive CLI menu prototype.
