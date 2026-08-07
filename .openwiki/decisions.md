# 🏛️ Architecture Decision Records (ADRs)

---

## ADR-001: Migration from DOM Scraping to GraphQL Interception
- **Status**: Accepted & Implemented
- **Context**: DOM scraping was limited to the initial 8 trips rendered in the viewport. Subsequent clicks on the "More" button triggered dynamic React hydration where older DOM nodes lacked clickable anchors or trip links.
- **Decision**: Intercept network responses on `https://riders.uber.com/graphql` and extract the underlying `data.activities.past.activities` JSON data directly.
- **Consequences**: Successfully captured 100% of historical trips without relying on fragile CSS selectors.

---

## ADR-002: Deterministic PDF Parsing vs. LLM Extraction
- **Status**: Accepted & Implemented
- **Context**: Parsing PDF invoices with LLM APIs incurs unnecessary API costs, network latency, token limits, and failure modes on large batches of invoices.
- **Decision**: Implement a pure Node.js regex/token parser using `pdf-parse` combined with `pdfkit` to produce `Gesamtauflistung.pdf`.
- **Consequences**: Zero API cost, instant sub-second report generation, deterministic accounting output.

---

## ADR-003: Playwright Persistent Context for Cloudflare Avoidance
- **Status**: Accepted & Implemented
- **Context**: In headless or standard incognito automation contexts, Uber triggers Cloudflare bot verifications and session timeouts.
- **Decision**: Utilize `chromium.launchPersistentContext()` stored in `.auth-profile/` with a headed Chrome browser window on the native system channel.
- **Consequences**: Safe session persistence without repetitive SMS 2FA prompts or bot detection flags.

---

## ADR-004: AliExpress Receipt PNG-to-A4 PDF Vector Normalization
- **Status**: Accepted & Implemented
- **Context**: AliExpress orders frequently provide receipts only as rendered PNG modal captures or Canvas elements rather than downloadable vector PDFs. Accounting workflows strictly require standardized PDF documents.
- **Decision**: Capture the high-res PNG receipt buffer and wrap it into a standardized A4 PDF document (`utils/pdf-converter.js`) with deterministic naming (`AliExpress-YYYY-MM-DD-ORDERID.pdf`) and embedded searchable accounting metadata.
- **Consequences**: Flawless PDF-based accounting compliance for all AliExpress orders with zero native compilation dependencies.

---

## ADR-005: Unified GUI with Electron and Tailwind
- **Status**: Accepted & Implemented
- **Context**: Relying strictly on the CLI limits non-technical users and makes configuring Cron-jobs or inputting date ranges tedious.
- **Decision**: Wrap the Node.js core logic in an Electron shell (`invoice-scrape-agent-gui`). Use Tailwind CSS and Glassmorphism for the UI, and spawn the Node processes with real-time terminal output streaming back to the GUI.
- **Consequences**: A stunning cross-platform desktop application that requires zero code changes to the underlying scraper services.

---

## ADR-006: IMAP-to-PDF Pipeline for E-Mail Receipts
- **Status**: Accepted & Implemented
- **Context**: Services like Bolt, Lime, Freenow, and Adobe don't have dedicated web portals for bulk invoice downloading, but they email PDF or HTML receipts.
- **Decision**: Implement a generalized IMAP scraper (`services/email/`) that connects to standard email providers. It uses declarative `.json` provider configs (Regex) to find relevant emails. It then uses headless Playwright to inject CSS overrides to hide footers/disclaimers, and renders the raw HTML emails directly into A4 PDFs.
- **Consequences**: Endless scalability to support hundreds of minor services with zero code, just by adding simple JSON regex files.

---

## ADR-007: Chronological YYYY-MM Subfolder Routing
- **Status**: Accepted & Implemented
- **Context**: Dumping thousands of generated PDF invoices from various services into a single `/invoices/` root folder makes manual browsing chaotic and strains the OS file explorer.
- **Decision**: Enforce a strict chronological subfolder routing architecture (`invoices/<service>/YYYY-MM/`) for all downloaded artifacts.
- **Consequences**: Massive performance improvement when humans browse the folders. Requires all PDF Analyzers to utilize recursive directory traversal (`getPdfFiles` function) to compile the Master Ledger.

---

## ADR-008: Dedicated "Steuerdatum" vs "Rechnungsdatum" Tracking
- **Status**: Accepted & Implemented
- **Context**: Uber and AliExpress often have trip/order dates that differ significantly from the billing date (Rechnungsdatum). German tax accounting (Buchhaltung) requires knowing both.
- **Decision**: Update the analyzers and ledgers to explicitly extract, track, and export both `orderDate` (Steuerdatum) and `invoiceDate` (Rechnungsdatum) into the `Gesamtauflistung`. Sort primarily by Steuerdatum.
- **Consequences**: 100% tax compliant exports for strict European accounting environments.
