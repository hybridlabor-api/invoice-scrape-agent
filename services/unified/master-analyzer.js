const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const { getInvoicesDir } = require('../../utils/paths');

class MasterAnalyzer {
  constructor({ baseDir = null } = {}) {
    this.invoicesDir = baseDir ? path.join(baseDir, 'invoices') : getInvoicesDir();
    this.outputPdf = path.join(this.invoicesDir, 'Gesamtauflistung_Master.pdf');
    this.outputCsv = path.join(this.invoicesDir, 'master_ledger.csv');
    this.outputJson = path.join(this.invoicesDir, 'master_ledger.json');
  }

  /**
   * Scan and collect records across all service directories
   */
  collectAllRecords() {
    if (!fs.existsSync(this.invoicesDir)) return [];

    const records = [];
    const entries = fs.readdirSync(this.invoicesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const ledgerPath = path.join(this.invoicesDir, entry.name, `${entry.name}_ledger.json`);
        if (fs.existsSync(ledgerPath)) {
          try {
            const raw = fs.readFileSync(ledgerPath, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data)) {
              data.forEach(item => {
                records.push({
                  service: item.service || entry.name,
                  serviceDisplayName: item.serviceDisplayName || entry.name.toUpperCase(),
                  invoiceNumber: item.invoiceNumber || item.rechnungsnummer || item.orderId || '',
                  date: item.steuerdatum || item.date || item.rechnungsdatum || '',
                  invoiceDate: item.rechnungsdatum || item.date || '',
                  netto: parseFloat(item.netto) || 0,
                  ust: parseFloat(item.ust) || 0,
                  brutto: parseFloat(item.brutto) || 0,
                  taxRate: item.taxRate || item.ustSatz || '19%',
                  seller: item.seller || item.anbieter || 'Unbekannt',
                  currency: item.currency || 'EUR',
                  pdfPath: item.pdfPath || ''
                });
              });
            }
          } catch (e) {
            console.warn(`[MasterAnalyzer] Error reading ledger ${ledgerPath}:`, e.message);
          }
        }
      }
    }

    return records;
  }

  /**
   * Calculate aggregated metrics and breakdowns
   */
  calculateMetrics() {
    const records = this.collectAllRecords();
    const sorted = [...records].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const totalBrutto = parseFloat(sorted.reduce((s, r) => s + r.brutto, 0).toFixed(2));
    const totalNetto = parseFloat(sorted.reduce((s, r) => s + r.netto, 0).toFixed(2));
    const totalUst = parseFloat(sorted.reduce((s, r) => s + r.ust, 0).toFixed(2));

    const byService = {};
    const byTaxRate = {};

    sorted.forEach(r => {
      // By Service
      if (!byService[r.service]) {
        byService[r.service] = { count: 0, brutto: 0, netto: 0, ust: 0 };
      }
      byService[r.service].count++;
      byService[r.service].brutto = parseFloat((byService[r.service].brutto + r.brutto).toFixed(2));
      byService[r.service].netto = parseFloat((byService[r.service].netto + r.netto).toFixed(2));
      byService[r.service].ust = parseFloat((byService[r.service].ust + r.ust).toFixed(2));

      // By Tax Rate
      const rate = r.taxRate || 'Other';
      if (!byTaxRate[rate]) byTaxRate[rate] = { count: 0, brutto: 0, ust: 0 };
      byTaxRate[rate].count++;
      byTaxRate[rate].brutto = parseFloat((byTaxRate[rate].brutto + r.brutto).toFixed(2));
      byTaxRate[rate].ust = parseFloat((byTaxRate[rate].ust + r.ust).toFixed(2));
    });

    return {
      totalCount: sorted.length,
      totalBrutto,
      totalNetto,
      totalUst,
      byService,
      byTaxRate,
      records: sorted
    };
  }

  /**
   * Export Master CSV
   */
  exportCsv(records) {
    const headers = ['Service', 'Steuerdatum', 'Rechnungsdatum', 'Rechnungsnummer / Bestellnummer', 'Händler / Anbieter', 'Netto (EUR)', 'USt (EUR)', 'Brutto (EUR)', 'Steuersatz', 'PDF-Datei'];
    const rows = records.map(r => [
      `"${r.serviceDisplayName}"`,
      `"${r.date}"`,
      `"${r.invoiceDate}"`,
      `"${r.invoiceNumber || r.orderId}"`,
      `"${(r.seller || '').replace(/"/g, '""')}"`,
      r.netto.toFixed(2),
      r.ust.toFixed(2),
      r.brutto.toFixed(2),
      `"${r.taxRate}"`,
      `"${r.pdfPath || ''}"`
    ]);

    const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    fs.writeFileSync(this.outputCsv, '\ufeff' + csvContent, 'utf8');
  }

  /**
   * Export HTML (Best for Copy/Paste to Excel/Numbers)
   */
  exportHtml(records, metrics) {
    const outputPath = path.join(this.invoicesDir, 'master_ledger.html');
    let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Master Ledger</title>
<style>
  body { font-family: sans-serif; padding: 20px; color: #333; }
  table { border-collapse: collapse; width: 100%; margin-top: 20px; font-size: 13px; }
  th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
  th { background-color: #102a43; color: white; }
  tr:nth-child(even) { background-color: #f8fafc; }
  .totals { font-weight: bold; background-color: #d9e2ec; color: #102a43; }
  .text-right { text-align: right; }
  h2 { color: #102a43; }
</style>
</head>
<body>
<h2>🏢 UNIFIED MASTER TAX & INVOICE LEDGER</h2>
<p><strong>Generiert am:</strong> ${new Date().toLocaleDateString('de-DE')} | <strong>Erfasste Belege:</strong> ${records.length}</p>
<table>
  <thead>
    <tr>
      <th>Service</th>
      <th>Steuerdatum</th>
      <th>Rechnungsdatum</th>
      <th>Rechnungsnummer</th>
      <th>Anbieter</th>
      <th class="text-right">Netto (€)</th>
      <th class="text-right">USt (€)</th>
      <th class="text-right">Brutto (€)</th>
      <th>Steuersatz</th>
    </tr>
  </thead>
  <tbody>`;

    records.forEach(r => {
      html += `
    <tr>
      <td>${r.serviceDisplayName}</td>
      <td>${r.date || '-'}</td>
      <td>${r.invoiceDate || '-'}</td>
      <td>${r.invoiceNumber || r.orderId || '-'}</td>
      <td>${r.seller || '-'}</td>
      <td class="text-right">${r.netto.toFixed(2).replace('.', ',')}</td>
      <td class="text-right">${r.ust.toFixed(2).replace('.', ',')}</td>
      <td class="text-right">${r.brutto.toFixed(2).replace('.', ',')}</td>
      <td>${r.taxRate}</td>
    </tr>`;
    });

    html += `
    <tr class="totals">
      <td colspan="5">GESAMT KONSOLIDIERT</td>
      <td class="text-right">${metrics.totalNetto.toFixed(2).replace('.', ',')}</td>
      <td class="text-right">${metrics.totalUst.toFixed(2).replace('.', ',')}</td>
      <td class="text-right">${metrics.totalBrutto.toFixed(2).replace('.', ',')}</td>
      <td></td>
    </tr>
  </tbody>
</table>
</body>
</html>`;

    fs.writeFileSync(outputPath, html, 'utf8');
  }

  /**
   * Generate Multi-Page Master Landscape Accounting PDF
   */
  async generateMasterPdf() {
    const metrics = this.calculateMetrics();
    const { records, totalBrutto, totalNetto, totalUst, byService } = metrics;

    if (!fs.existsSync(this.invoicesDir)) fs.mkdirSync(this.invoicesDir, { recursive: true });

    // Export CSV and JSON alongside
    this.exportCsv(records);
    this.exportHtml(records, metrics);
    fs.writeFileSync(this.outputJson, JSON.stringify(metrics, null, 2), 'utf8');

    if (records.length === 0) {
      console.log('ℹ️ No invoices found to generate Master Report.');
      return { success: false, message: 'No invoices found.' };
    }

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    const stream = fs.createWriteStream(this.outputPdf);
    doc.pipe(stream);

    // Header Title
    doc.fontSize(20).font('Helvetica-Bold').text('🏢 UNIFIED MASTER TAX & INVOICE LEDGER', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(10).font('Helvetica').text(
      `Generiert am: ${new Date().toLocaleDateString('de-DE')} ${new Date().toLocaleTimeString('de-DE')} | Erfasste Belege: ${records.length}`,
      { align: 'center' }
    );
    doc.moveDown(0.8);

    // Summary KPI Box
    const kpiY = doc.y;
    doc.rect(30, kpiY, 782, 45).fill('#f0f4f8');
    doc.fillColor('#102a43').font('Helvetica-Bold').fontSize(11);
    doc.text('GESAMTÜBERSICHT (KONSOLIDIERT):', 40, kpiY + 8);
    
    doc.font('Helvetica').fontSize(10);
    const serviceBreakdownStr = Object.entries(byService)
      .map(([k, v]) => `${k.toUpperCase()}: ${v.brutto.toFixed(2)}€ (${v.count})`)
      .join('  |  ');
    doc.text(serviceBreakdownStr, 40, kpiY + 24);

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0b69a3');
    doc.text(`Netto: ${totalNetto.toFixed(2)} €    USt: ${totalUst.toFixed(2)} €    BRUTTO: ${totalBrutto.toFixed(2)} €`, 420, kpiY + 16, { align: 'right', width: 380 });

    doc.moveDown(2.8);

    // Table Columns
    const cols = [
      { label: 'Dienst', width: 60 },
      { label: 'Steuerdatum', width: 60 },
      { label: 'Rg.Datum', width: 60 },
      { label: 'Beleg- / Bestell-Nr.', width: 135 },
      { label: 'Netto (€)', width: 60 },
      { label: 'USt (€)', width: 50 },
      { label: 'Brutto (€)', width: 60 },
      { label: 'Satz', width: 30 },
      { label: 'Anbieter / Händler', width: 267 }
    ];

    let x = 30;
    let y = doc.y + 10;
    const rowHeight = 17;

    // Header Row
    doc.fontSize(8).font('Helvetica-Bold');
    doc.rect(x, y, cols.reduce((s, c) => s + c.width, 0), rowHeight).fill('#102a43');
    let cx = x;
    for (const col of cols) {
      doc.fillColor('#ffffff').text(col.label, cx + 3, y + 4, { width: col.width - 6 });
      cx += col.width;
    }
    y += rowHeight;

    // Data Rows
    doc.font('Helvetica').fontSize(7);
    for (let i = 0; i < records.length; i++) {
      if (y > 540) {
        doc.addPage();
        y = 30;
      }

      const item = records[i];
      const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
      doc.rect(x, y, cols.reduce((s, c) => s + c.width, 0), rowHeight).fill(bg);
      doc.fillColor('#000000');

      const values = [
        item.serviceDisplayName || item.service,
        item.date || '-',
        item.invoiceDate || '-',
        item.invoiceNumber || item.orderId || '-',
        item.netto.toFixed(2),
        item.ust.toFixed(2),
        item.brutto.toFixed(2),
        item.taxRate || '19%',
        item.seller || '-'
      ];

      cx = x;
      for (let j = 0; j < cols.length; j++) {
        doc.text(values[j], cx + 3, y + 4, { width: cols[j].width - 6 });
        cx += cols[j].width;
      }
      y += rowHeight;
    }

    // Master Totals Footer Row
    y += 4;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.rect(x, y, cols.reduce((s, c) => s + c.width, 0), rowHeight + 3).fill('#d9e2ec');
    doc.fillColor('#102a43');
    cx = x;
    doc.text('GESAMT KONSOLIDIERT', cx + 3, y + 5, { width: cols[0].width + cols[1].width + cols[2].width + cols[3].width - 6 });
    cx += cols[0].width + cols[1].width + cols[2].width + cols[3].width;
    doc.text(totalNetto.toFixed(2), cx + 3, y + 5, { width: cols[4].width - 6 });
    cx += cols[4].width;
    doc.text(totalUst.toFixed(2), cx + 3, y + 5, { width: cols[5].width - 6 });
    cx += cols[5].width;
    doc.text(totalBrutto.toFixed(2), cx + 3, y + 5, { width: cols[6].width - 6 });

    doc.end();
    await new Promise(resolve => stream.on('finish', resolve));

    console.log(`\n🎉 [MasterAnalyzer] Master Report Ready:`);
    console.log(`   📄 PDF:  ${this.outputPdf}`);
    console.log(`   📊 CSV:  ${this.outputCsv}`);
    console.log(`   🌐 HTML: ${path.join(this.invoicesDir, 'master_ledger.html')} (Perfect for Excel copy-paste!)`);
    console.log(`   📦 JSON: ${this.outputJson}\n`);

    return {
      success: true,
      pdfFile: this.outputPdf,
      csvFile: this.outputCsv,
      jsonFile: this.outputJson,
      metrics
    };
  }
}

if (require.main === module) {
  const analyzer = new MasterAnalyzer();
  analyzer.generateMasterPdf();
}

module.exports = MasterAnalyzer;
