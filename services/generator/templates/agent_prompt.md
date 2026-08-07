# AI Agent Instruction: Scrape Service Implementation for `__DISPLAY_NAME__`

You are an expert browser automation and reverse-engineering AI agent implementing the `__DISPLAY_NAME__` invoice scraper plugin for `invoice-scrape-agent`.

## Architecture & Contract
You must implement `services/__SERVICE_ID__/index.js` subclassing `BaseService` (`services/base/BaseService.js`).

### Target Specifications:
- **Service ID:** `__SERVICE_ID__`
- **Display Name:** `__DISPLAY_NAME__`
- **Icon:** `__ICON__`
- **Login URL:** `__AUTH_URL__`

## Implementation Steps
1. **Authentication (`authenticate`)**:
   - Navigate to `__AUTH_URL__`.
   - Monitor navigation until a logged-in cookie or authenticated DOM element is detected.
   - Profile state is automatically saved into `.auth-profile/__SERVICE_ID__`.

2. **Order Scanning (`scan`)**:
   - Find the orders list page.
   - Extract `orderId`, `date`, `totalAmount`, `status`, and `invoiceDownloadUrl`.
   - Support filtering by `year` or `startDate`/`endDate`.

3. **Invoice Fetching (`fetch`)**:
   - Check `this.isAlreadyDownloaded(orderId)` to skip existing invoices.
   - If direct PDF download link exists, download to `invoices/__SERVICE_ID__/YYYY-MM-DD_Order_<orderId>.pdf`.
   - If invoice is HTML, use Playwright `page.pdf({ format: 'A4', printBackground: true })`.
   - Record entry via `this.saveLedgerRecord(record)`.

4. **Accounting Analyzer (`analyze`)**:
   - Read PDFs via `pdf-parse` or extract directly from the JSON ledger.
   - Extract Netto, USt (VAT), Brutto, Seller Name, Tax Rate.
   - Generate `invoices/__SERVICE_ID__/Gesamtauflistung___SERVICE_ID__.pdf` with PDFKit.
