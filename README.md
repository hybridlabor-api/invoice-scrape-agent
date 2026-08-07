# Uber Invoice Agent

An automated agent to fetch and analyze your Uber invoices/receipts using Puppeteer and Google's Gemini AI.

## Prerequisites

- Node.js (v18 or higher recommended)
- Google Gemini API Key
- Your authenticated Uber Cookie string

## Installation

We provide an interactive installation script to get you set up quickly.

1. Clone or download this repository.
2. Run the installer script:
   ```bash
   ./install.sh
   ```
   *Note: If the script is not executable, run `chmod +x install.sh` first.*

The installer will:
- Verify you have Node.js installed.
- Install all required npm dependencies (`npm install`).
- Prompt you for your Uber `COOKIE` and `GEMINI_API_KEY`.
- Automatically generate a `.env` file with your credentials.

## Usage

The agent is split into two main scripts:

### 1. Fetching Invoices

To scrape your Uber invoices and save them locally:

```bash
node fetcher.js
```

This will launch a Puppeteer instance, authenticate using your provided cookie, navigate to the Uber receipts page, and download the invoices to the `invoices/` directory.

### 2. Analyzing Invoices

To process the downloaded invoices using the Gemini AI:

```bash
node analyze.js
```

This will read the files from the `invoices/` directory and use the Gemini API to extract structured data (like dates, amounts, taxes, and trip details).

## Security Note

**Never commit your `.env` file to version control.** It contains sensitive authentication tokens. The `.gitignore` is pre-configured to exclude it.

## License

ISC
