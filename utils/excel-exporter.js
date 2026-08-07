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
    const rawDate = r.steuerdatum || r.date || r.rechnungsdatum || '';
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
 * Helper to build cell object with value AND optional Excel formula.
 * Critical: When formula is provided, 'v' is ALWAYS populated with the pre-calculated number
 * so that Google Sheets, OpenCalc, and Excel immediately display the total value without needing recalculation.
 */
function numCell(val, formula = null) {
  const num = Number(Number(val || 0).toFixed(2));
  if (formula) {
    return { t: 'n', v: num, f: formula, z: NUM_FMT };
  }
  return { t: 'n', v: num, z: NUM_FMT };
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
  // Sheet 1: Alle Belege (Detailtabelle mit Steuer- und Rechnungsdatum)
  // -------------------------------------------------------------
  const sheet1Data = [];

  // Header Row (Row 1)
  sheet1Data.push([
    strCell('Nr.'),
    strCell('Steuerdatum'),
    strCell('Rechnungsdatum'),
    strCell('Beleg-/Bestellnummer'),
    strCell('Händler / Anbieter'),
    strCell('Netto (€)'),
    strCell('USt (€)'),
    strCell('Brutto (€)'),
    strCell('Steuersatz'),
    strCell('PDF-Datei')
  ]);

  let totalNetto = 0;
  let totalUst = 0;
  let totalBrutto = 0;

  // Data Rows (Rows 2 to N+1)
  records.forEach((r, idx) => {
    const net = Number((r.netto || 0).toFixed(2));
    const ust = Number((r.ust || 0).toFixed(2));
    const gross = Number((r.brutto || 0).toFixed(2));

    totalNetto += net;
    totalUst += ust;
    totalBrutto += gross;

    sheet1Data.push([
      { t: 'n', v: idx + 1 },
      strCell(r.steuerdatum || r.date || '-'),
      strCell(r.rechnungsdatum || r.invoiceDate || r.steuerdatum || r.date || '-'),
      strCell(r.orderId || r.invoiceNumber || r.id || '-'),
      strCell(r.seller || r.store || r.anbieter || '-'),
      numCell(net),
      numCell(ust),
      numCell(gross),
      strCell(r.taxRate || r.ustSatz || '19%'),
      strCell(r.pdfPath || '')
    ]);
  });

  const lastDataRow = records.length + 1; // 1-indexed (e.g. 52 for 51 records)

  // Totals Row
  if (records.length > 0) {
    sheet1Data.push([
      strCell(''),
      strCell(''),
      strCell(''),
      strCell(''),
      strCell('GESAMTSUMME:'),
      numCell(totalNetto, `SUM(F2:F${lastDataRow})`),
      numCell(totalUst, `SUM(G2:G${lastDataRow})`),
      numCell(totalBrutto, `SUM(H2:H${lastDataRow})`),
      strCell(''),
      strCell('')
    ]);
  }

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  ws1['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 16 },
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
  let sumMonthCount = 0;
  let sumMonthNetto = 0;
  let sumMonthUst = 0;
  let sumMonthBrutto = 0;

  monthlyGroups.forEach(m => {
    sumMonthCount += m.count;
    sumMonthNetto += m.netto;
    sumMonthUst += m.ust;
    sumMonthBrutto += m.brutto;

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
      { t: 'n', v: sumMonthCount, f: `SUM(B2:B${lastMonthRow})` },
      numCell(sumMonthNetto, `SUM(C2:C${lastMonthRow})`),
      numCell(sumMonthUst, `SUM(D2:D${lastMonthRow})`),
      numCell(sumMonthBrutto, `SUM(E2:E${lastMonthRow})`)
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

  let totalNetto = 0;
  let totalUst = 0;
  let totalBrutto = 0;

  records.forEach((r, idx) => {
    const net = Number((r.netto || 0).toFixed(2));
    const ust = Number((r.ust || 0).toFixed(2));
    const gross = Number((r.brutto || 0).toFixed(2));

    totalNetto += net;
    totalUst += ust;
    totalBrutto += gross;

    sheet1Data.push([
      { t: 'n', v: idx + 1 },
      strCell(r.serviceDisplayName || r.service || 'Sonstige'),
      strCell(r.steuerdatum || r.date || '-'),
      strCell(r.rechnungsdatum || r.invoiceDate || r.steuerdatum || r.date || '-'),
      strCell(r.invoiceNumber || r.orderId || r.id || '-'),
      strCell(r.seller || r.store || r.anbieter || '-'),
      numCell(net),
      numCell(ust),
      numCell(gross),
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
      numCell(totalNetto, `SUM(G2:G${lastDataRow})`),
      numCell(totalUst, `SUM(H2:H${lastDataRow})`),
      numCell(totalBrutto, `SUM(I2:I${lastDataRow})`),
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
  let sumMonthCount = 0;
  let sumMonthNetto = 0;
  let sumMonthUst = 0;
  let sumMonthBrutto = 0;

  monthlyGroups.forEach(m => {
    sumMonthCount += m.count;
    sumMonthNetto += m.netto;
    sumMonthUst += m.ust;
    sumMonthBrutto += m.brutto;

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
      { t: 'n', v: sumMonthCount, f: `SUM(B2:B${lastMonthRow})` },
      numCell(sumMonthNetto, `SUM(C2:C${lastMonthRow})`),
      numCell(sumMonthUst, `SUM(D2:D${lastMonthRow})`),
      numCell(sumMonthBrutto, `SUM(E2:E${lastMonthRow})`)
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

    let sumServiceCount = 0;
    let sumServiceNetto = 0;
    let sumServiceUst = 0;
    let sumServiceBrutto = 0;

    Object.entries(metrics.byService).forEach(([srvKey, srvData]) => {
      sumServiceCount += srvData.count;
      sumServiceNetto += srvData.netto;
      sumServiceUst += srvData.ust;
      sumServiceBrutto += srvData.brutto;

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
      { t: 'n', v: sumServiceCount, f: `SUM(B2:B${lastServiceRow})` },
      numCell(sumServiceNetto, `SUM(C2:C${lastServiceRow})`),
      numCell(sumServiceUst, `SUM(D2:D${lastServiceRow})`),
      numCell(sumServiceBrutto, `SUM(E2:E${lastServiceRow})`)
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
