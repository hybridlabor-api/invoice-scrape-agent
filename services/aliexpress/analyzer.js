const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const { getInvoicesDir, getLedgerFile } = require('../../utils/paths');

const INVOICE_DIR = getInvoicesDir('aliexpress');
const LEDGER_FILE = getLedgerFile('aliexpress');
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
        results.push(path.basename(fullPath)); // analyzer currently only needs filename
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

  let ledger = {};
  if (fs.existsSync(LEDGER_FILE)) {
    try {
      ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
    } catch (e) {}
  }

  const items = [];

  for (const filename of pdfFiles) {
    // Format: AliExpress-YYYY-MM-DD-ORDERID.pdf
    const match = filename.match(/AliExpress-(\d{4}-\d{2}-\d{2})-(\d+)\.pdf/);
    const date = match ? match[1] : 'Unbekannt';
    const orderId = match ? match[2] : filename.replace('.pdf', '');

    const record = ledger[orderId] || {};
    const store = record.storeName || 'AliExpress Seller';
    const gross = typeof record.totalAmount === 'number' ? record.totalAmount : 0;
    const currency = record.currency || 'EUR';

    // Estimations if not itemized
    const net = gross > 0 ? parseFloat((gross / 1.19).toFixed(2)) : 0;
    const vat = gross > 0 ? parseFloat((gross - net).toFixed(2)) : 0;

    items.push({
      filename,
      date,
      orderId,
      store,
      net,
      vat,
      gross,
      currency
    });
  }

  // Sort chronologically ascending
  items.sort((a, b) => a.date.localeCompare(b.date));

  // Write JSON export
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(items, null, 2));

  // Generate Landscape A4 PDF Table
  const doc = new PDFDocument({
    layout: 'landscape',
    size: 'A4',
    margin: 30
  });

  const writeStream = fs.createWriteStream(OUTPUT_PDF);
  doc.pipe(writeStream);

  const PAGE_WIDTH = 841.89;
  const MARGIN = 30;
  const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

  // Header Box
  doc.rect(MARGIN, MARGIN, CONTENT_WIDTH, 48).fill('#1E293B');
  doc.fontSize(16).fillColor('#FFFFFF').font('Helvetica-Bold').text('AliExpress Rechnungs- & Belegsübersicht', MARGIN + 15, MARGIN + 10);
  doc.fontSize(9).fillColor('#94A3B8').font('Helvetica').text(`Erstellt am: ${new Date().toLocaleDateString('de-DE')} | Exportierte Belege: ${items.length}`, MARGIN + 15, MARGIN + 30);

  // Table Columns
  const col = {
    nr: MARGIN + 10,
    date: MARGIN + 40,
    orderId: MARGIN + 125,
    store: MARGIN + 260,
    net: MARGIN + 490,
    vat: MARGIN + 580,
    gross: MARGIN + 670,
  };

  let y = MARGIN + 60;

  const drawTableHeader = (currY) => {
    doc.rect(MARGIN, currY, CONTENT_WIDTH, 20).fill('#F1F5F9');
    doc.fontSize(9).fillColor('#334155').font('Helvetica-Bold');
    doc.text('Nr.', col.nr, currY + 5);
    doc.text('Datum', col.date, currY + 5);
    doc.text('Bestellnummer', col.orderId, currY + 5);
    doc.text('Händler / Store', col.store, currY + 5);
    doc.text('Netto', col.net, currY + 5, { width: 75, align: 'right' });
    doc.text('MwSt. (gesch.)', col.vat, currY + 5, { width: 75, align: 'right' });
    doc.text('Gesamtbetrag', col.gross, currY + 5, { width: 90, align: 'right' });
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
      doc.addPage({ layout: 'landscape', size: 'A4', margin: 30 });
      y = drawTableHeader(MARGIN);
      doc.font('Helvetica').fontSize(8);
    }

    if (index % 2 === 1) {
      doc.rect(MARGIN, y, CONTENT_WIDTH, 17).fill('#F8FAFC');
    }

    doc.fillColor('#0F172A');
    doc.text(String(index + 1), col.nr, y + 4);
    doc.text(item.date, col.date, y + 4);
    doc.text(item.orderId, col.orderId, y + 4);
    doc.text(item.store.slice(0, 35), col.store, y + 4);
    doc.text(`${item.net.toFixed(2)} €`, col.net, y + 4, { width: 75, align: 'right' });
    doc.text(`${item.vat.toFixed(2)} €`, col.vat, y + 4, { width: 75, align: 'right' });
    doc.text(`${item.gross.toFixed(2)} €`, col.gross, y + 4, { width: 90, align: 'right' });

    totalGross += item.gross;
    totalNet += item.net;
    totalVat += item.vat;

    y += 17;
  });

  // Summary row
  y += 8;
  if (y > 510) {
    doc.addPage({ layout: 'landscape', size: 'A4', margin: 30 });
    y = MARGIN;
  }

  doc.rect(MARGIN, y, CONTENT_WIDTH, 26).fill('#E2E8F0');
  doc.fontSize(9).fillColor('#0F172A').font('Helvetica-Bold');
  doc.text('GESAMTSUMME', col.date, y + 8);
  doc.text(`${totalNet.toFixed(2)} €`, col.net, y + 8, { width: 75, align: 'right' });
  doc.text(`${totalVat.toFixed(2)} €`, col.vat, y + 8, { width: 75, align: 'right' });
  doc.text(`${totalGross.toFixed(2)} €`, col.gross, y + 8, { width: 90, align: 'right' });

  doc.end();

  await new Promise((resolve) => writeStream.on('finish', resolve));

  // Export CSV
  const csvFile = path.join(INVOICE_DIR, 'aliexpress_ledger.csv');
  const csvHeaders = ['Nr', 'Datum', 'Bestellnummer', 'Shop', 'Netto (EUR)', 'USt (EUR)', 'Brutto (EUR)', 'Steuersatz'];
  const csvRows = items.map((r, i) => [
    i + 1,
    `"${r.date}"`,
    `"${r.orderId}"`,
    `"${(r.store || '').replace(/"/g, '""')}"`,
    (r.net || 0).toFixed(2).replace('.', ','),
    (r.vat || 0).toFixed(2).replace('.', ','),
    (r.gross || 0).toFixed(2).replace('.', ','),
    '"19%"'
  ]);
  fs.writeFileSync(csvFile, '\ufeff' + [csvHeaders.join(';'), ...csvRows.map(row => row.join(';'))].join('\n'), 'utf8');

  // Export HTML
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
        <th>Datum</th>
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
      <td>${r.date}</td>
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
      <td colspan="4">GESAMTSUMME</td>
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
      date: it.date,
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
