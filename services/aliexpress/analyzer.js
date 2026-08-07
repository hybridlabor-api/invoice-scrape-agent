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

  console.log(`\n✅ PDF-Gesamtauflistung erfolgreich generiert:`);
  console.log(`   📄 ${OUTPUT_PDF}`);
  console.log(`   📊 ${OUTPUT_JSON}`);
  console.log(`\n💰 Gesamtsumme: ${totalGross.toFixed(2)} € (${items.length} Belege)\n`);
}

if (require.main === module) {
  analyzeAliExpressInvoices();
}

module.exports = { analyzeAliExpressInvoices };
