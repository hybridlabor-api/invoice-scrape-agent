const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

/**
 * Currency Number Format for Excel (German display)
 */
const NUM_FMT = '#,##0.00';

/**
 * Group records by month (YYYY-MM)
 */
function groupByMonth(records) {
  const monthly = {};
  for (const r of records) {
    const rawDate = r.date || r.rechnungsdatum || r.steuerdatum || '';
    const month = /^\d{4}-\d{2}/.test(rawDate) ? rawDate.slice(0, 7) : 'Unbekannt';
    if (!monthly[month]) {
      monthly[month] = {
        month,
        count: 0,
        netto: 0,
        ust: 0,
        brutto: 0
      };
    }
    monthly[month].count++;
    monthly[month].netto += Number((r.netto || 0).toFixed(2));
    monthly[month].ust += Number((r.ust || 0).toFixed(2));
    monthly[month].brutto += Number((r.brutto || 0).toFixed(2));
  }

  return Object.values(monthly).sort((a, b) => b.month.localeCompare(a.month));
}

/**
 * Helper to build cell object
 */
function numCell(val, formula = null) {
  if (formula) {
    return { t: 'n', f: formula, z: NUM_FMT };
  }
  return { t: 'n', v: Number((val || 0).toFixed(2)), z: NUM_FMT };
}

function strCell(val) {
  return { t: 's', v: String(val == null ? '' : val) };
}

/**
 * Create .XLS (and .XLSX) files for a single service (Amazon, Uber, AliExpress)
 */
async function exportServiceExcel({
  serviceName = 'Service',
  title = 'Rechnungsübersicht',
  invoicesDir,
  records = [],
  filename = null
}) {
  const baseName = filename ? filename.replace(/\.(xls|xlsx)$/i, '') : `${serviceName.toLowerCase()}_ledger`;
  const xlsPath = path.join(invoicesDir, `${baseName}.xls`);
  const xlsxPath = path.join(invoicesDir, `${baseName}.xlsx`);

  const workbook = XLSX.utils.book_new();

  // -------------------------------------------------------------
  // Sheet 1: Alle Belege (Detailtabelle)
  // -------------------------------------------------------------
  const sheet1Data = [];

  // Header Row (Row 1)
  sheet1Data.push([
    strCell('Nr.'),
    strCell('Datum'),
    strCell('Beleg-/Bestellnummer'),
    strCell('Händler / Anbieter'),
    strCell('Netto (€)'),
    strCell('USt (€)'),
    strCell('Brutto (€)'),
    strCell('Steuersatz'),
    strCell('PDF-Datei')
  ]);

  // Data Rows (Rows 2 to N+1)
  records.forEach((r, idx) => {
    sheet1Data.push([
      { t: 'n', v: idx + 1 },
      strCell(r.date || r.rechnungsdatum || r.steuerdatum || '-'),
      strCell(r.orderId || r.invoiceNumber || r.id || '-'),
      strCell(r.seller || r.anbieter || '-'),
      numCell(r.netto),
      numCell(r.ust),
      numCell(r.brutto),
      strCell(r.taxRate || r.ustSatz || '19%'),
      strCell(r.pdfPath || '')
    ]);
  });

  const lastDataRow = records.length + 1; // 1-indexed

  // Totals Row
  if (records.length > 0) {
    sheet1Data.push([
      strCell(''),
      strCell(''),
      strCell(''),
      strCell('GESAMTSUMME:'),
      numCell(null, `SUM(E2:E${lastDataRow})`),
      numCell(null, `SUM(F2:F${lastDataRow})`),
      numCell(null, `SUM(G2:G${lastDataRow})`),
      strCell(''),
      strCell('')
    ]);
  }

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  ws1['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 28 },
    { wch: 32 },
    { wch: 15 },
    { wch: 15 },
    { wch: 16 },
    { wch: 12 },
    { wch: 40 }
  ];
  XLSX.utils.book_append_sheet(workbook, ws1, 'Alle Belege');

  // -------------------------------------------------------------
  // Sheet 2: Monatsübersicht & Summen
  // -------------------------------------------------------------
  const sheet2Data = [];

  sheet2Data.push([
    strCell('Monat (YYYY-MM)'),
    strCell('Anzahl Belege'),
    strCell('Netto (€)'),
    strCell('USt (€)'),
    strCell('Brutto (€)')
  ]);

  const monthlyGroups = groupByMonth(records);
  monthlyGroups.forEach(m => {
    sheet2Data.push([
      strCell(m.month),
      { t: 'n', v: m.count },
      numCell(m.netto),
      numCell(m.ust),
      numCell(m.brutto)
    ]);
  });

  const lastMonthRow = monthlyGroups.length + 1;
  if (monthlyGroups.length > 0) {
    sheet2Data.push([
      strCell('GESAMT:'),
      { t: 'n', f: `SUM(B2:B${lastMonthRow})` },
      numCell(null, `SUM(C2:C${lastMonthRow})`),
      numCell(null, `SUM(D2:D${lastMonthRow})`),
      numCell(null, `SUM(E2:E${lastMonthRow})`)
    ]);
  }

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  ws2['!cols'] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(workbook, ws2, 'Monatsübersicht');

  // Write .XLS (BIFF8 binary format - 100% native in OpenCalc, Excel & Sheets)
  XLSX.writeFile(workbook, xlsPath, { bookType: 'biff8' });

  // Write .XLSX as companion
  XLSX.writeFile(workbook, xlsxPath, { bookType: 'xlsx' });

  return { xlsPath, xlsxPath };
}

/**
 * Create Unified Master .XLS (and .XLSX) for ALL services combined
 */
async function exportMasterExcel({ invoicesDir, records = [], metrics = {} }) {
  const xlsPath = path.join(invoicesDir, 'master_ledger.xls');
  const xlsxPath = path.join(invoicesDir, 'master_ledger.xlsx');

  const workbook = XLSX.utils.book_new();

  // -------------------------------------------------------------
  // Sheet 1: Alle Belege (Master Ledger)
  // -------------------------------------------------------------
  const sheet1Data = [];

  sheet1Data.push([
    strCell('Nr.'),
    strCell('Dienst'),
    strCell('Steuerdatum'),
    strCell('Rechnungsdatum'),
    strCell('Rechnungsnummer / Order-ID'),
    strCell('Anbieter / Shop'),
    strCell('Netto (€)'),
    strCell('USt (€)'),
    strCell('Brutto (€)'),
    strCell('Steuersatz')
  ]);

  records.forEach((r, idx) => {
    sheet1Data.push([
      { t: 'n', v: idx + 1 },
      strCell(r.serviceDisplayName || r.service || 'Sonstige'),
      strCell(r.date || '-'),
      strCell(r.invoiceDate || r.rechnungsdatum || '-'),
      strCell(r.invoiceNumber || r.orderId || r.id || '-'),
      strCell(r.seller || '-'),
      numCell(r.netto),
      numCell(r.ust),
      numCell(r.brutto),
      strCell(r.taxRate || '19%')
    ]);
  });

  const lastDataRow = records.length + 1;
  if (records.length > 0) {
    sheet1Data.push([
      strCell(''),
      strCell(''),
      strCell(''),
      strCell(''),
      strCell(''),
      strCell('GESAMTSUMME:'),
      numCell(null, `SUM(G2:G${lastDataRow})`),
      numCell(null, `SUM(H2:H${lastDataRow})`),
      numCell(null, `SUM(I2:I${lastDataRow})`),
      strCell('')
    ]);
  }

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  ws1['!cols'] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 28 },
    { wch: 32 },
    { wch: 15 },
    { wch: 15 },
    { wch: 16 },
    { wch: 12 }
  ];
  XLSX.utils.book_append_sheet(workbook, ws1, 'Alle Belege');

  // -------------------------------------------------------------
  // Sheet 2: Monatsübersicht & Summen
  // -------------------------------------------------------------
  const sheet2Data = [];

  sheet2Data.push([
    strCell('Monat (YYYY-MM)'),
    strCell('Anzahl Belege'),
    strCell('Netto (€)'),
    strCell('USt (€)'),
    strCell('Brutto (€)')
  ]);

  const monthlyGroups = groupByMonth(records);
  monthlyGroups.forEach(m => {
    sheet2Data.push([
      strCell(m.month),
      { t: 'n', v: m.count },
      numCell(m.netto),
      numCell(m.ust),
      numCell(m.brutto)
    ]);
  });

  const lastMonthRow = monthlyGroups.length + 1;
  if (monthlyGroups.length > 0) {
    sheet2Data.push([
      strCell('GESAMT:'),
      { t: 'n', f: `SUM(B2:B${lastMonthRow})` },
      numCell(null, `SUM(C2:C${lastMonthRow})`),
      numCell(null, `SUM(D2:D${lastMonthRow})`),
      numCell(null, `SUM(E2:E${lastMonthRow})`)
    ]);
  }

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  ws2['!cols'] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(workbook, ws2, 'Monatsübersicht');

  // -------------------------------------------------------------
  // Sheet 3: Aufschlüsselung nach Diensten
  // -------------------------------------------------------------
  if (metrics.byService && Object.keys(metrics.byService).length > 0) {
    const sheet3Data = [];
    sheet3Data.push([
      strCell('Dienst / Plattform'),
      strCell('Anzahl Belege'),
      strCell('Netto (€)'),
      strCell('USt (€)'),
      strCell('Brutto (€)')
    ]);

    Object.entries(metrics.byService).forEach(([srvKey, srvData]) => {
      sheet3Data.push([
        strCell(srvData.displayName || srvKey),
        { t: 'n', v: srvData.count },
        numCell(srvData.netto),
        numCell(srvData.ust),
        numCell(srvData.brutto)
      ]);
    });

    const lastServiceRow = Object.keys(metrics.byService).length + 1;
    sheet3Data.push([
      strCell('GESAMT:'),
      { t: 'n', f: `SUM(B2:B${lastServiceRow})` },
      numCell(null, `SUM(C2:C${lastServiceRow})`),
      numCell(null, `SUM(D2:D${lastServiceRow})`),
      numCell(null, `SUM(E2:E${lastServiceRow})`)
    ]);

    const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
    ws3['!cols'] = [
      { wch: 24 },
      { wch: 16 },
      { wch: 18 },
      { wch: 18 },
      { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(workbook, ws3, 'Dienste');
  }

  // Write .XLS (BIFF8 binary) and .XLSX
  XLSX.writeFile(workbook, xlsPath, { bookType: 'biff8' });
  XLSX.writeFile(workbook, xlsxPath, { bookType: 'xlsx' });

  return { xlsPath, xlsxPath };
}

module.exports = {
  exportServiceExcel,
  exportMasterExcel,
  groupByMonth
};
