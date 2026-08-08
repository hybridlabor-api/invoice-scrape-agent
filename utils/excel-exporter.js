const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

/**
 * Currency and Date formats for Excel
 */
const NUM_FMT = '#,##0.00';
const DATE_FMT = 'yyyy-mm-dd';

/**
 * Sanitize sheet name for Excel compatibility (max 31 chars, no reserved chars)
 */
function sanitizeSheetName(name, existingNames = new Set()) {
  let clean = (name || 'Service').replace(/[\\/?*:[\]]/g, '').trim().slice(0, 31) || 'Sheet';
  let uniqueName = clean;
  let counter = 1;
  while (existingNames.has(uniqueName.toLowerCase())) {
    uniqueName = `${clean.slice(0, 27)}_${counter++}`;
  }
  existingNames.add(uniqueName.toLowerCase());
  return uniqueName;
}

/**
 * Enable native Excel AutoFilter dropdown on a worksheet
 */
function enableAutoFilter(ws, startCol, startRow, endCol, endRow) {
  if (endRow >= startRow) {
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: startRow, c: startCol },
        e: { r: endRow, c: endCol }
      })
    };
  }
}

/**
 * Sort records by criterion
 */
function sortRecords(records, sortBy = 'service') {
  const cloned = [...records];
  if (sortBy === 'service') {
    cloned.sort((a, b) => {
      const sA = (a.serviceDisplayName || a.service || '').toLowerCase();
      const sB = (b.serviceDisplayName || b.service || '').toLowerCase();
      if (sA !== sB) return sA.localeCompare(sB);
      const dA = a.steuerdatum || a.date || a.rechnungsdatum || '';
      const dB = b.steuerdatum || b.date || b.rechnungsdatum || '';
      return dB.localeCompare(dA);
    });
  } else if (sortBy === 'date') {
    cloned.sort((a, b) => {
      const dA = a.steuerdatum || a.date || a.rechnungsdatum || '';
      const dB = b.steuerdatum || b.date || b.rechnungsdatum || '';
      return dB.localeCompare(dA);
    });
  } else if (sortBy === 'amount') {
    cloned.sort((a, b) => (b.brutto || 0) - (a.brutto || 0));
  }
  return cloned;
}

/**
 * Helper to determine default category based on service and merchant / item hints
 */
function resolveCategory(record = {}) {
  if (record.category && String(record.category).trim()) {
    return String(record.category).trim();
  }
  const srv = (record.service || record.serviceDisplayName || '').toLowerCase();
  const seller = (record.seller || record.store || record.anbieter || '').toLowerCase();

  if (srv.includes('hotel') || srv.includes('airbnb') || srv.includes('booking') || srv.includes('eats') || srv.includes('lieferando') || srv.includes('restaurant') || seller.includes('hotel') || seller.includes('restaurant') || seller.includes('cafe') || seller.includes('bäckerei') || seller.includes('eats') || seller.includes('food')) {
    return 'Kost & Logis';
  }

  if (srv.includes('uber') || srv.includes('bolt') || srv.includes('taxi') || srv.includes('bahn') || srv.includes('flight') || srv.includes('lufthansa') || seller.includes('uber') || seller.includes('bolt') || seller.includes('taxi') || seller.includes('deutsche bahn')) {
    return 'Reise';
  }

  const subSrv = (record.subService || '').toLowerCase();
  if (subSrv.includes('audible') || subSrv.includes('prime video') || subSrv.includes('luna') || subSrv.includes('kindle') || subSrv.includes('music')) {
    return 'Verbrauchsmaterial';
  }

  if (srv.includes('apple') || srv.includes('cyberport') || srv.includes('saturn') || srv.includes('mediamarkt') || (record.brutto && record.brutto >= 150)) {
    return 'Anschaffung';
  }

  if (srv.includes('aliexpress') || srv.includes('amazon')) {
    if (record.brutto && record.brutto < 80) {
      return 'Verbrauchsmaterial';
    }
    return 'Anschaffung';
  }

  return 'Sonstiges';
}

/**
 * Group records by Category (Anschaffung, Verbrauchsmaterial, Kost & Logis, Reise, Sonstiges)
 */
function groupByCategory(records) {
  const categories = {};
  for (const r of records) {
    const cat = resolveCategory(r);
    if (!categories[cat]) {
      categories[cat] = {
        category: cat,
        count: 0,
        netto: 0,
        ust: 0,
        brutto: 0
      };
    }
    categories[cat].count++;
    categories[cat].netto += Number((r.netto || 0).toFixed(2));
    categories[cat].ust += Number((r.ust || 0).toFixed(2));
    categories[cat].brutto += Number((r.brutto || 0).toFixed(2));
  }

  const order = ['Anschaffung', 'Verbrauchsmaterial', 'Kost & Logis', 'Reise', 'Sonstiges'];
  return Object.values(categories).sort((a, b) => {
    const idxA = order.indexOf(a.category);
    const idxB = order.indexOf(b.category);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.category.localeCompare(b.category);
  });
}

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
 * Helper to build native Excel Date cell.
 */
function dateCell(val) {
  if (!val || val === '-' || val === 'Unbekannt') {
    return { t: 's', v: '-' };
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    return { t: 'd', v: val, z: DATE_FMT };
  }
  const str = String(val).trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const d = new Date(Date.UTC(year, month, day));
    return { t: 'd', v: d, z: DATE_FMT };
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return { t: 'd', v: d, z: DATE_FMT };
  }
  return { t: 's', v: str };
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

  const sortedRecords = sortRecords(records, 'date');
  const workbook = XLSX.utils.book_new();

  // -------------------------------------------------------------
  // Sheet 1: Alle Belege (Detailtabelle mit Steuer- und Rechnungsdatum + Kategorie)
  // -------------------------------------------------------------
  const sheet1Data = [];

  // Header Row (Row 1)
  sheet1Data.push([
    strCell('Nr.'),
    strCell('Steuerdatum'),
    strCell('Rechnungsdatum'),
    strCell('Beleg-/Bestellnummer'),
    strCell('Händler / Anbieter'),
    strCell('Kategorie'),
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
  sortedRecords.forEach((r, idx) => {
    const net = Number((r.netto || 0).toFixed(2));
    const ust = Number((r.ust || 0).toFixed(2));
    const gross = Number((r.brutto || 0).toFixed(2));

    totalNetto += net;
    totalUst += ust;
    totalBrutto += gross;

    sheet1Data.push([
      { t: 'n', v: idx + 1 },
      dateCell(r.steuerdatum || r.date || '-'),
      dateCell(r.rechnungsdatum || r.invoiceDate || r.steuerdatum || r.date || '-'),
      strCell(r.orderId || r.invoiceNumber || r.id || '-'),
      strCell(r.seller || r.store || r.anbieter || '-'),
      strCell(resolveCategory(r)),
      numCell(net),
      numCell(ust),
      numCell(gross),
      strCell(r.taxRate || r.ustSatz || '19%'),
      strCell(r.pdfPath || '')
    ]);
  });

  const lastDataRow = sortedRecords.length + 1; // 1-indexed

  // Totals Row
  if (sortedRecords.length > 0) {
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
    { wch: 20 },
    { wch: 15 },
    { wch: 15 },
    { wch: 16 },
    { wch: 12 },
    { wch: 40 }
  ];
  enableAutoFilter(ws1, 0, 0, 10, sortedRecords.length);
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

  const monthlyGroups = groupByMonth(sortedRecords);
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
  // Sheet 3: Kategorien (Ausgaben nach Art)
  // -------------------------------------------------------------
  const sheetCatData = [];
  sheetCatData.push([
    strCell('Kategorie'),
    strCell('Anzahl Belege'),
    strCell('Netto (€)'),
    strCell('USt (€)'),
    strCell('Brutto (€)')
  ]);

  const catGroups = groupByCategory(sortedRecords);
  let sumCatCount = 0;
  let sumCatNetto = 0;
  let sumCatUst = 0;
  let sumCatBrutto = 0;

  catGroups.forEach(c => {
    sumCatCount += c.count;
    sumCatNetto += c.netto;
    sumCatUst += c.ust;
    sumCatBrutto += c.brutto;

    sheetCatData.push([
      strCell(c.category),
      { t: 'n', v: c.count },
      numCell(c.netto),
      numCell(c.ust),
      numCell(c.brutto)
    ]);
  });

  const lastCatRow = catGroups.length + 1;
  if (catGroups.length > 0) {
    sheetCatData.push([
      strCell('GESAMT:'),
      { t: 'n', v: sumCatCount, f: `SUM(B2:B${lastCatRow})` },
      numCell(sumCatNetto, `SUM(C2:C${lastCatRow})`),
      numCell(sumCatUst, `SUM(D2:D${lastCatRow})`),
      numCell(sumCatBrutto, `SUM(E2:E${lastCatRow})`)
    ]);
  }

  const wsCat = XLSX.utils.aoa_to_sheet(sheetCatData);
  wsCat['!cols'] = [
    { wch: 24 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(workbook, wsCat, 'Kategorien');

  // Write .XLS and .XLSX
  XLSX.writeFile(workbook, xlsPath, { bookType: 'biff8' });
  XLSX.writeFile(workbook, xlsxPath, { bookType: 'xlsx' });

  return { xlsPath, xlsxPath };
}

/**
 * Create Unified Master .XLS (and .XLSX) for ALL services combined
 * Supports auto-filter, sorting by service/date, dedicated tabs per integration & category summary
 */
async function exportMasterExcel({ invoicesDir, records = [], metrics = {}, sortBy = 'service' }) {
  const xlsPath = path.join(invoicesDir, 'master_ledger.xls');
  const xlsxPath = path.join(invoicesDir, 'master_ledger.xlsx');

  const sortedRecords = sortRecords(records, sortBy);
  const workbook = XLSX.utils.book_new();
  const existingSheetNames = new Set();

  // -------------------------------------------------------------
  // Sheet 1: Alle Belege (Master Ledger - Sortierbar + Kategorie)
  // -------------------------------------------------------------
  const sheet1Data = [];

  sheet1Data.push([
    strCell('Nr.'),
    strCell('Dienst'),
    strCell('Steuerdatum'),
    strCell('Rechnungsdatum'),
    strCell('Rechnungsnummer / Order-ID'),
    strCell('Anbieter / Shop'),
    strCell('Kategorie'),
    strCell('Netto (€)'),
    strCell('USt (€)'),
    strCell('Brutto (€)'),
    strCell('Steuersatz')
  ]);

  let totalNetto = 0;
  let totalUst = 0;
  let totalBrutto = 0;

  sortedRecords.forEach((r, idx) => {
    const net = Number((r.netto || 0).toFixed(2));
    const ust = Number((r.ust || 0).toFixed(2));
    const gross = Number((r.brutto || 0).toFixed(2));

    totalNetto += net;
    totalUst += ust;
    totalBrutto += gross;

    const srvLabel = (r.subService && r.subService !== 'Amazon.de' && r.subService !== 'Amazon')
      ? `${r.serviceDisplayName || r.service || 'Amazon'} (${r.subService})`
      : (r.serviceDisplayName || r.service || 'Sonstige');

    sheet1Data.push([
      { t: 'n', v: idx + 1 },
      strCell(srvLabel),
      dateCell(r.steuerdatum || r.date || '-'),
      dateCell(r.rechnungsdatum || r.invoiceDate || r.steuerdatum || r.date || '-'),
      strCell(r.invoiceNumber || r.orderId || r.id || '-'),
      strCell(r.seller || r.store || r.anbieter || '-'),
      strCell(resolveCategory(r)),
      numCell(net),
      numCell(ust),
      numCell(gross),
      strCell(r.taxRate || '19%')
    ]);
  });

  const lastDataRow = sortedRecords.length + 1;
  if (sortedRecords.length > 0) {
    sheet1Data.push([
      strCell(''),
      strCell(''),
      strCell(''),
      strCell(''),
      strCell(''),
      strCell(''),
      strCell('GESAMTSUMME:'),
      numCell(totalNetto, `SUM(H2:H${lastDataRow})`),
      numCell(totalUst, `SUM(I2:I${lastDataRow})`),
      numCell(totalBrutto, `SUM(J2:J${lastDataRow})`),
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
    { wch: 20 },
    { wch: 15 },
    { wch: 15 },
    { wch: 16 },
    { wch: 12 }
  ];
  enableAutoFilter(ws1, 0, 0, 10, sortedRecords.length);
  const masterSheetName = sanitizeSheetName('Alle Belege', existingSheetNames);
  XLSX.utils.book_append_sheet(workbook, ws1, masterSheetName);

  // -------------------------------------------------------------
  // Dedicated Per-Service Sheets (Amazon, Uber, AliExpress, etc.)
  // -------------------------------------------------------------
  const serviceGroups = {};
  sortedRecords.forEach(r => {
    const key = r.serviceDisplayName || (r.service ? r.service.toUpperCase() : 'Sonstige');
    if (!serviceGroups[key]) serviceGroups[key] = [];
    serviceGroups[key].push(r);
  });

  Object.entries(serviceGroups).forEach(([srvName, srvRecords]) => {
    const srvSheetData = [];
    srvSheetData.push([
      strCell('Nr.'),
      strCell('Steuerdatum'),
      strCell('Rechnungsdatum'),
      strCell('Rechnungsnummer / Order-ID'),
      strCell('Händler / Anbieter'),
      strCell('Kategorie'),
      strCell('Netto (€)'),
      strCell('USt (€)'),
      strCell('Brutto (€)'),
      strCell('Steuersatz'),
      strCell('PDF-Datei')
    ]);

    let srvNetto = 0;
    let srvUst = 0;
    let srvBrutto = 0;

    srvRecords.forEach((r, idx) => {
      const net = Number((r.netto || 0).toFixed(2));
      const ust = Number((r.ust || 0).toFixed(2));
      const gross = Number((r.brutto || 0).toFixed(2));

      srvNetto += net;
      srvUst += ust;
      srvBrutto += gross;

      srvSheetData.push([
        { t: 'n', v: idx + 1 },
        dateCell(r.steuerdatum || r.date || '-'),
        dateCell(r.rechnungsdatum || r.invoiceDate || r.steuerdatum || r.date || '-'),
        strCell(r.invoiceNumber || r.orderId || r.id || '-'),
        strCell(r.seller || r.store || r.anbieter || '-'),
        strCell(resolveCategory(r)),
        numCell(net),
        numCell(ust),
        numCell(gross),
        strCell(r.taxRate || '19%'),
        strCell(r.pdfPath || '')
      ]);
    });

    const lastSrvRow = srvRecords.length + 1;
    if (srvRecords.length > 0) {
      srvSheetData.push([
        strCell(''),
        strCell(''),
        strCell(''),
        strCell(''),
        strCell(''),
        strCell(`SUMME (${srvName}):`),
        numCell(srvNetto, `SUM(G2:G${lastSrvRow})`),
        numCell(srvUst, `SUM(H2:H${lastSrvRow})`),
        numCell(srvBrutto, `SUM(I2:I${lastSrvRow})`),
        strCell(''),
        strCell('')
      ]);
    }

    const srvWs = XLSX.utils.aoa_to_sheet(srvSheetData);
    srvWs['!cols'] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 16 },
      { wch: 28 },
      { wch: 32 },
      { wch: 20 },
      { wch: 15 },
      { wch: 15 },
      { wch: 16 },
      { wch: 12 },
      { wch: 40 }
    ];
    enableAutoFilter(srvWs, 0, 0, 10, srvRecords.length);
    const sheetName = sanitizeSheetName(srvName, existingSheetNames);
    XLSX.utils.book_append_sheet(workbook, srvWs, sheetName);
  });

  // -------------------------------------------------------------
  // Sheet: Kategorienübersicht
  // -------------------------------------------------------------
  const sheetCatData = [];
  sheetCatData.push([
    strCell('Kategorie'),
    strCell('Anzahl Belege'),
    strCell('Netto (€)'),
    strCell('USt (€)'),
    strCell('Brutto (€)')
  ]);

  const catGroups = groupByCategory(sortedRecords);
  let sumCatCount = 0;
  let sumCatNetto = 0;
  let sumCatUst = 0;
  let sumCatBrutto = 0;

  catGroups.forEach(c => {
    sumCatCount += c.count;
    sumCatNetto += c.netto;
    sumCatUst += c.ust;
    sumCatBrutto += c.brutto;

    sheetCatData.push([
      strCell(c.category),
      { t: 'n', v: c.count },
      numCell(c.netto),
      numCell(c.ust),
      numCell(c.brutto)
    ]);
  });

  const lastCatRow = catGroups.length + 1;
  if (catGroups.length > 0) {
    sheetCatData.push([
      strCell('GESAMT:'),
      { t: 'n', v: sumCatCount, f: `SUM(B2:B${lastCatRow})` },
      numCell(sumCatNetto, `SUM(C2:C${lastCatRow})`),
      numCell(sumCatUst, `SUM(D2:D${lastCatRow})`),
      numCell(sumCatBrutto, `SUM(E2:E${lastCatRow})`)
    ]);
  }

  const wsCat = XLSX.utils.aoa_to_sheet(sheetCatData);
  wsCat['!cols'] = [
    { wch: 24 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 }
  ];
  const catSheetName = sanitizeSheetName('Kategorien', existingSheetNames);
  XLSX.utils.book_append_sheet(workbook, wsCat, catSheetName);

  // -------------------------------------------------------------
  // Sheet: Monatsübersicht & Summen
  // -------------------------------------------------------------
  const sheet2Data = [];

  sheet2Data.push([
    strCell('Monat (YYYY-MM)'),
    strCell('Anzahl Belege'),
    strCell('Netto (€)'),
    strCell('USt (€)'),
    strCell('Brutto (€)')
  ]);

  const monthlyGroups = groupByMonth(sortedRecords);
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
  const monthSheetName = sanitizeSheetName('Monatsübersicht', existingSheetNames);
  XLSX.utils.book_append_sheet(workbook, ws2, monthSheetName);

  // -------------------------------------------------------------
  // Sheet: Aufschlüsselung nach Diensten
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
    const servicesSheetName = sanitizeSheetName('Dienste', existingSheetNames);
    XLSX.utils.book_append_sheet(workbook, ws3, servicesSheetName);
  }

  // Write .XLS and .XLSX
  XLSX.writeFile(workbook, xlsPath, { bookType: 'biff8' });
  XLSX.writeFile(workbook, xlsxPath, { bookType: 'xlsx' });

  return { xlsPath, xlsxPath };
}

module.exports = {
  exportServiceExcel,
  exportMasterExcel,
  groupByMonth,
  groupByCategory,
  resolveCategory,
  sortRecords
};
