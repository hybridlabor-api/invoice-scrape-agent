# 🏛️ Architecture Decision Records (ADRs)

---

## ADR-001: Migration from DOM Scraping to GraphQL Interception
- **Status**: Accepted & Implemented
- **Context**: DOM scraping was limited to the initial 8 trips rendered in the viewport. Subsequent clicks on the "More" button triggered dynamic React hydration where older DOM nodes lacked clickable anchors or trip links.
- **Decision**: Intercept network responses on `https://riders.uber.com/graphql` and extract the underlying `data.activities.past.activities` JSON data directly.
- **Consequences**: Successfully captured 100% of historical trips (e.g., 113 trips across multiple years) without relying on fragile CSS selectors.

---

## ADR-002: Deterministic PDF Parsing vs. LLM Extraction
- **Status**: Accepted & Implemented
- **Context**: Parsing PDF invoices with LLM APIs incurs unnecessary API costs, network latency, token limits, and failure modes on large batches of invoices.
- **Decision**: Implement a pure Node.js regex/token parser (`analyzer.js`) using `pdf-parse` combined with `pdfkit` to produce `Gesamtauflistung.pdf`.
- **Consequences**: Zero API cost, instant sub-second report generation, deterministic accounting output.

---

## ADR-003: Playwright Persistent Context for Cloudflare Avoidance
- **Status**: Accepted & Implemented
- **Context**: In headless or standard incognito automation contexts, Uber triggers Cloudflare bot verifications and session timeouts.
- **Decision**: Utilize `chromium.launchPersistentContext()` stored in `.auth-profile/` with a headed Chrome browser window on the native system channel.
- **Consequences**: Safe session persistence without repetitive SMS 2FA prompts or bot detection flags.
