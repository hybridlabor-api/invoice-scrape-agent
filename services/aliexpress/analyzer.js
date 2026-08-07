const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const { getInvoicesDir, getLedgerFile } = require('../../utils/paths');

const INVOICE_DIR = getInvoicesDir('aliexpress');
const LEDGER_FILE = getLedgerFile('aliexpress');
const SCAN_SUMMARY_FILE = path.join(INVOICE_DIR, 'account_scan_summary.json');
const OUTPUT_PDF = path.join(INVOICE_DIR, 'Gesamtauflistung.pdf');
const OUTPUT_JSON = path.join(INVOICE_DIR, 'Gesamtauflistung.json');

async function analyzeAliExpressInvoices() {
  console.log("\n======================================================");
  console.log("    📊 AliExpress Rechnungsanalyse & Gesamtauswertung 📊   ");
  console.log("======================================================\n");

  if (!fs.existsSync(INVOICE_DIR)) {
    console.log("❌ Kein Verzeichnis 'invoices/aliexpress' gefunden. Bitte lade zuerst Rechnungen herunter.");
    return;
  }

  function getPdfFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getPdfFiles(fullPath));
      } else if (file.endsWith('.pdf') && file.startsWith('AliExpress-')) {
        results.push(path.relative(INVOICE_DIR, fullPath));
      }
    });
    return results;
  }

  const pdfFiles = getPdfFiles(INVOICE_DIR);
  
  if (pdfFiles.length === 0) {
    console.log("❌ Keine AliExpress-Rechnungen (AliExpress-*.pdf) gefunden.");
    return;
  }

  console.log(`🔍 Analysiere ${pdfFiles.length} heruntergeladene Rechnungen...`);

  // Build unified lookup map from ledger.json and account_scan_summary.json
  const ledgerMap = {};
  if (fs.existsSync(LEDGER_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
      if (Array.isArray(raw)) {
        raw.forEach(item => { if (item.orderId || item.id) ledgerMap[String(item.orderId || item.id)] = item; });
      } else if (raw && typeof raw === 'object') {
        Object.entries(raw).forEach(([k, v]) => { ledgerMap[String(k)] = v; });
      }
    } catch (e) {}
  }

  if (fs.existsSync(SCAN_SUMMARY_FILE)) {
    try {
      const scanSummary = JSON.parse(fs.readFileSync(SCAN_SUMMARY_FILE, 'utf8'));
      if (scanSummary.years) {
        Object.values(scanSummary.years).forEach(y => {
          if (Array.isArray(y.orders)) {
            y.orders.forEach(o => {
              if (o.orderId && !ledgerMap[String(o.orderId)]) {
                ledgerMap[String(o.orderId)] = o;
              }
            });
          }
        });
      }
    } catch (e) {}
  }

  const items = [];

  for (const relPath of pdfFiles) {
    const filename = path.basename(relPath);
    // Format: AliExpress-YYYY-MM-DD-ORDERID.pdf
    const match = filename.match(/AliExpress-(\d{4}-\d{2}-\d{2})-(\d+)\.pdf/);
    const orderId = match ? match[2] : filename.replace('.pdf', '');
    const dateFromFilename = match ? match[1] : 'Unbekannt';

    const record = ledgerMap[orderId] || {};
    const steuerdatum = record.orderDate || record.steuerdatum || dateFromFilename;
    const rechnungsdatum = record.invoiceDate || record.rechnungsdatum || steuerdatum;
    const store = record.storeName || record.seller || 'AliExpress Seller';
    const gross = typeof record.totalAmount === 'number' ? record.totalAmount : (typeof record.brutto === 'number' ? record.brutto : 0);
    const currency = record.currency || 'EUR';

    // Itemized or estimated Netto & USt
    const net = gross > 0 ? parseFloat((gross / 1.19).toFixed(2)) : 0;
    const vat = gross > 0 ? parseFloat((gross - net).toFixed(2)) : 0;

    items.push({
      filename,
      relPath,
      pdfPath: path.join('invoices', 'aliexpress', relPath),
      steuerdatum,
      rechnungsdatum,
      date: steuerdatum,
      orderId,
      store,
      net,
      vat,
      gross,
      currency
    });
  }

  // Sort primarily by Steuerdatum ascending
  items.sort((a, b) => (a.steuerdatum || '').localeCompare(b.steuerdatum || ''));

  // Write JSON exports
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(items, null, 2));
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(items, null, 2));

  // Generate Landscape A4 PDF Table
  const doc = new PDFDocument({
    layout: 'landscape',
    size: 'A4',
    margin: 25
  });

  const writeStream = fs.createWriteStream(OUTPUT_PDF);
  doc.pipe(writeStream);

  const PAGE_WIDTH = 841.89;
  const MARGIN = 25;
  const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

  // Header Box
  doc.rect(MARGIN, MARGIN, CONTENT_WIDTH, 45).fill('#1E293B');
  doc.fontSize(15).fillColor('#FFFFFF').font('Helvetica-Bold').text('AliExpress Rechnungs- & Belegsübersicht', MARGIN + 15, MARGIN + 8);
  doc.fontSize(8.5).fillColor('#94A3B8').font('Helvetica').text(`Erstellt am: ${new Date().toLocaleDateString('de-DE')} | Exportierte Belege: ${items.length} | Sortierung: Steuerdatum`, MARGIN + 15, MARGIN + 28);

  // Table Columns
  const col = {
    nr: MARGIN + 8,
    steuerdatum: MARGIN + 35,
    rechnungsdatum: MARGIN + 105,
    orderId: MARGIN + 180,
    store: MARGIN + 320,
    net: MARGIN + 520,
    vat: MARGIN + 600,
    gross: MARGIN + 685,
  };

  let y = MARGIN + 55;

  const drawTableHeader = (currY) => {
    doc.rect(MARGIN, currY, CONTENT_WIDTH, 20).fill('#F1F5F9');
    doc.fontSize(8.5).fillColor('#334155').font('Helvetica-Bold');
    doc.text('Nr.', col.nr, currY + 5);
    doc.text('Steuerdatum', col.steuerdatum, currY + 5);
    doc.text('Rechnungsdatum', col.rechnungsdatum, currY + 5);
    doc.text('Bestellnummer', col.orderId, currY + 5);
    doc.text('Händler / Store', col.store, currY + 5);
    doc.text('Netto', col.net, currY + 5, { width: 70, align: 'right' });
    doc.text('MwSt. (19%)', col.vat, currY + 5, { width: 75, align: 'right' });
    doc.text('Gesamtbetrag', col.gross, currY + 5, { width: 85, align: 'right' });
    return currY + 22;
  };

  y = drawTableHeader(y);

  let totalGross = 0;
  let totalNet = 0;
  let totalVat = 0;

  doc.font('Helvetica').fontSize(8);

  items.forEach((item, index) => {
    // Check page overflow
    if (y > 520) {
      doc.addPage({ layout: 'landscape', size: 'A4', margin: 25 });
      y = drawTableHeader(MARGIN);
      doc.font('Helvetica').fontSize(8);
    }

    if (index % 2 === 1) {
      doc.rect(MARGIN, y, CONTENT_WIDTH, 16).fill('#F8FAFC');
    }

    doc.fillColor('#0F172A');
    doc.text(String(index + 1), col.nr, y + 4);
    doc.text(item.steuerdatum, col.steuerdatum, y + 4);
    doc.text(item.rechnungsdatum, col.rechnungsdatum, y + 4);
    doc.text(item.orderId, col.orderId, y + 4);
    doc.text(item.store.length > 32 ? item.store.slice(0, 30) + '...' : item.store, col.store, y + 4);
    doc.text(`${item.net.toFixed(2)} €`, col.net, y + 4, { width: 70, align: 'right' });
    doc.text(`${item.vat.toFixed(2)} €`, col.vat, y + 4, { width: 75, align: 'right' });
    doc.text(`${item.gross.toFixed(2)} €`, col.gross, y + 4, { width: 85, align: 'right' });

    totalGross += item.gross;
    totalNet += item.net;
    totalVat += item.vat;

    y += 16;
  });

  // Summary row
  y += 6;
  if (y > 510) {
    doc.addPage({ layout: 'landscape', size: 'A4', margin: 25 });
    y = MARGIN;
  }

  doc.rect(MARGIN, y, CONTENT_WIDTH, 24).fill('#E2E8F0');
  doc.fontSize(8.5).fillColor('#0F172A').font('Helvetica-Bold');
  doc.text('GESAMTSUMME', col.steuerdatum, y + 7);
  doc.text(`${totalNet.toFixed(2)} €`, col.net, y + 7, { width: 70, align: 'right' });
  doc.text(`${totalVat.toFixed(2)} €`, col.vat, y + 7, { width: 75, align: 'right' });
  doc.text(`${totalGross.toFixed(2)} €`, col.gross, y + 7, { width: 85, align: 'right' });

  doc.end();

  await new Promise((resolve) => writeStream.on('finish', resolve));

  // Export CSV (German format with Steuerdatum and Rechnungsdatum)
  const csvFile = path.join(INVOICE_DIR, 'aliexpress_ledger.csv');
  const csvHeaders = ['Nr', 'Steuerdatum', 'Rechnungsdatum', 'Bestellnummer', 'Shop', 'Netto (EUR)', 'USt (EUR)', 'Brutto (EUR)', 'Steuersatz', 'PDF-Datei'];
  const csvRows = items.map((r, i) => [
    i + 1,
    `"${r.steuerdatum}"`,
    `"${r.rechnungsdatum}"`,
    `"${r.orderId}"`,
    `"${(r.store || '').replace(/"/g, '""')}"`,
    (r.net || 0).toFixed(2).replace('.', ','),
    (r.vat || 0).toFixed(2).replace('.', ','),
    (r.gross || 0).toFixed(2).replace('.', ','),
    '"19%"',
    `"${r.pdfPath}"`
  ]);
  fs.writeFileSync(csvFile, '\ufeff' + [csvHeaders.join(';'), ...csvRows.map(row => row.join(';'))].join('\n'), 'utf8');

  // Export HTML (Clean table with Steuerdatum and Rechnungsdatum)
  const htmlFile = path.join(INVOICE_DIR, 'aliexpress_ledger.html');
  let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>AliExpress Rechnungsübersicht</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1e293b; background-color: #f8fafc; }
  .card { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
  h2 { color: #e11d48; margin-top: 0; }
  table { border-collapse: collapse; width: 100%; margin-top: 16px; font-size: 13px; }
  th, td { border: 1px solid #e2e8f0; padding: 10px 14px; text-align: left; }
  th { background-color: #e11d48; color: white; font-weight: 600; }
  tr:nth-child(even) { background-color: #f1f5f9; }
  .totals { font-weight: bold; background-color: #ffe4e6; color: #881337; }
  .text-right { text-align: right; }
</style>
</head>
<body>
<div class="card">
  <h2>🛍️ AliExpress Rechnungsübersicht</h2>
  <p><strong>Erstellt am:</strong> ${new Date().toLocaleDateString('de-DE')} | <strong>Rechnungen:</strong> ${items.length}</p>
  <table>
    <thead>
      <tr>
        <th>Nr.</th>
        <th>Steuerdatum</th>
        <th>Rechnungsdatum</th>
        <th>Bestellnummer</th>
        <th>Shop</th>
        <th class="text-right">Netto (€)</th>
        <th class="text-right">USt (€)</th>
        <th class="text-right">Brutto (€)</th>
        <th>Steuersatz</th>
      </tr>
    </thead>
    <tbody>`;

  items.forEach((r, i) => {
    html += `
    <tr>
      <td>${i + 1}</td>
      <td>${r.steuerdatum}</td>
      <td>${r.rechnungsdatum}</td>
      <td>${r.orderId}</td>
      <td>${r.store}</td>
      <td class="text-right">${(r.net || 0).toFixed(2).replace('.', ',')}</td>
      <td class="text-right">${(r.vat || 0).toFixed(2).replace('.', ',')}</td>
      <td class="text-right">${(r.gross || 0).toFixed(2).replace('.', ',')}</td>
      <td>19%</td>
    </tr>`;
  });

  html += `
    <tr class="totals">
      <td colspan="5">GESAMTSUMME</td>
      <td class="text-right">${totalNet.toFixed(2).replace('.', ',')}</td>
      <td class="text-right">${totalVat.toFixed(2).replace('.', ',')}</td>
      <td class="text-right">${totalGross.toFixed(2).replace('.', ',')}</td>
      <td>-</td>
    </tr>
  </tbody>
</table>
</div>
</body>
</html>`;
  fs.writeFileSync(htmlFile, html, 'utf8');

  // Export XLS & XLSX
  let excelFiles = null;
  try {
    const { exportServiceExcel } = require('../../utils/excel-exporter');
    const formattedRecords = items.map(it => ({
      steuerdatum: it.steuerdatum,
      rechnungsdatum: it.rechnungsdatum,
      date: it.steuerdatum,
      orderId: it.orderId,
      seller: it.store,
      netto: it.net,
      ust: it.vat,
      brutto: it.gross,
      taxRate: '19%',
      pdfPath: it.pdfPath || ''
    }));

    excelFiles = await exportServiceExcel({
      serviceName: 'AliExpress',
      title: 'AliExpress Rechnungsübersicht',
      invoicesDir: INVOICE_DIR,
      records: formattedRecords
    });
  } catch (err) {
    console.warn('[AliExpress] Warning exporting Excel:', err.message);
  }

  console.log(`\n✅ Auswertungen erfolgreich generiert:`);
  console.log(`   📄 PDF:  ${OUTPUT_PDF}`);
  console.log(`   📊 XLS:  ${excelFiles?.xlsPath || path.join(INVOICE_DIR, 'aliexpress_ledger.xls')}`);
  console.log(`   📊 XLSX: ${excelFiles?.xlsxPath || path.join(INVOICE_DIR, 'aliexpress_ledger.xlsx')}`);
  console.log(`   📊 CSV:  ${csvFile}`);
  console.log(`   🌐 HTML: ${htmlFile}`);
  console.log(`   📦 JSON: ${OUTPUT_JSON}`);
  console.log(`\n💰 Gesamtsumme: ${totalGross.toFixed(2)} € (${items.length} Belege)\n`);
}

if (require.main === module) {
  analyzeAliExpressInvoices();
}

module.exports = { analyzeAliExpressInvoices };
