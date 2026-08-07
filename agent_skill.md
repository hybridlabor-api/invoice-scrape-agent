---
name: uber-invoice-agent
description: Autonomous workflow for fetching and analyzing Uber invoices. Use this skill when the user requests to download, process, or summarize their Uber receipts and invoices.
---

# Uber Invoice Agent Skill

This skill provides the standard operating procedure for extracting, downloading, and analyzing Uber invoices using the `uber-invoice-agent` tools.

## Workflow Instructions

When invoked to process Uber invoices, you MUST follow this exact sequence of steps:

### 1. Scan Available Dates
First, discover the range of available invoices by running the fetcher in scan mode:
```bash
node fetcher.js --scan
```
Review the output to understand the earliest and latest available invoices.

### 2. Elicit User Preferences
Do NOT proceed to download all invoices automatically unless explicitly instructed.
Proactively ask the user which time period they want to download. Present the available date range found in step 1 and ask them to specify a start and end date.

### 3. Fetch Invoices
Once the user has confirmed the desired date range, execute the fetcher script with the specified dates:
```bash
node fetcher.js --start <start-date> --end <end-date>
```
*Note: Ensure the dates are formatted correctly according to the script's requirements (typically YYYY-MM-DD).*

### 4. Analyze and Summarize
After the download process is complete, process the downloaded invoices and generate the summary PDF by running:
```bash
node analyzer.js
```

### 5. Final Reporting
Inform the user that the process is complete, summarize any key findings from the analyzer output (e.g., total amount spent, number of trips), and provide the path to the generated summary PDF so they can easily access it.

## 🤖 Programmatic API (For Agents like Codex/Cline)
If you are an AI Agent building an automated workflow in code, you can use `fetcher.js` directly as a Node.js module instead of using the CLI. It returns structured JSON objects.

```javascript
const uber = require('./fetcher.js');

(async () => {
  // 1. Scan for dates
  const scanResult = await uber.scan();
  console.log(scanResult); 
  // { success: true, earliest: '2023-01-01', latest: '2023-12-31', totalTrips: 45 }

  // 2. Download invoices for a specific date range
  const downloadResult = await uber.download('2023-01-01', '2023-12-31');
  console.log(downloadResult);
  // { success: true, count: 12 }
})();
```
This is the preferred way if you are integrating this tool into another automated Node.js system.
