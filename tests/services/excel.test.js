const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { exportServiceExcel, exportMasterExcel } = require('../../utils/excel-exporter');

describe('Excel Exporter Date & Formatting', () => {
  const testDir = path.join(__dirname, '../fixtures/excel_test');

  beforeEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('should format Steuerdatum and Rechnungsdatum as native date cells', async () => {
    const records = [
      {
        orderId: 'ORDER-123',
        steuerdatum: '2026-05-10',
        rechnungsdatum: '2026-05-12',
        seller: 'Test Seller',
        netto: 100,
        ust: 19,
        brutto: 119,
        taxRate: '19%'
      }
    ];

    const { xlsxPath, xlsPath } = await exportServiceExcel({
      serviceName: 'TestService',
      invoicesDir: testDir,
      records
    });

    assert.ok(fs.existsSync(xlsxPath));
    assert.ok(fs.existsSync(xlsPath));

    const workbook = XLSX.readFile(xlsxPath, { cellDates: true });
    const sheet = workbook.Sheets['Alle Belege'];

    // Row 2: B2 (Steuerdatum), C2 (Rechnungsdatum)
    const steuerCell = sheet['B2'];
    const rechnungsCell = sheet['C2'];

    assert.ok(steuerCell, 'Steuerdatum cell B2 should exist');
    assert.ok(rechnungsCell, 'Rechnungsdatum cell C2 should exist');
    assert.equal(steuerCell.t, 'd', 'Steuerdatum cell type should be Date (d)');
    assert.equal(rechnungsCell.t, 'd', 'Rechnungsdatum cell type should be Date (d)');
    assert.ok(sheet['!autofilter'], 'AutoFilter should be enabled on Alle Belege sheet');
  });

  test('should sort master records by service and create dedicated per-service tabs', async () => {
    const records = [
      {
        service: 'uber',
        serviceDisplayName: 'Uber',
        orderId: 'UBER-1',
        steuerdatum: '2026-06-01',
        netto: 20,
        ust: 3.8,
        brutto: 23.8,
        taxRate: '19%'
      },
      {
        service: 'amazon',
        serviceDisplayName: 'Amazon',
        orderId: 'AMZ-1',
        steuerdatum: '2026-06-05',
        netto: 50,
        ust: 9.5,
        brutto: 59.5,
        taxRate: '19%'
      },
      {
        service: 'amazon',
        serviceDisplayName: 'Amazon',
        orderId: 'AMZ-2',
        steuerdatum: '2026-06-02',
        netto: 10,
        ust: 1.9,
        brutto: 11.9,
        taxRate: '19%'
      }
    ];

    const metrics = {
      byService: {
        amazon: { displayName: 'Amazon', count: 2, netto: 60, ust: 11.4, brutto: 71.4 },
        uber: { displayName: 'Uber', count: 1, netto: 20, ust: 3.8, brutto: 23.8 }
      }
    };

    const { xlsxPath, xlsPath } = await exportMasterExcel({
      invoicesDir: testDir,
      records,
      metrics,
      sortBy: 'service'
    });

    assert.ok(fs.existsSync(xlsxPath));
    assert.ok(fs.existsSync(xlsPath));

    const workbook = XLSX.readFile(xlsxPath);
    assert.ok(workbook.SheetNames.includes('Alle Belege'));
    assert.ok(workbook.SheetNames.includes('Amazon'));
    assert.ok(workbook.SheetNames.includes('Uber'));
    assert.ok(workbook.SheetNames.includes('Monatsübersicht'));
    assert.ok(workbook.SheetNames.includes('Dienste'));

    // Check AutoFilter
    assert.ok(workbook.Sheets['Alle Belege']['!autofilter']);
    assert.ok(workbook.Sheets['Amazon']['!autofilter']);
    assert.ok(workbook.Sheets['Uber']['!autofilter']);

    // Check sorted order on 'Alle Belege' (Amazon should come before Uber)
    const masterSheet = workbook.Sheets['Alle Belege'];
    assert.equal(masterSheet['B2']?.v, 'Amazon');
    assert.equal(masterSheet['B3']?.v, 'Amazon');
    assert.equal(masterSheet['B4']?.v, 'Uber');

    // Check Kategorie column G in Alle Belege
    assert.equal(masterSheet['G1']?.v, 'Kategorie');
    assert.equal(masterSheet['G2']?.v, 'Verbrauchsmaterial'); // AMZ-2: 11.90€ < 80€
    assert.equal(masterSheet['G3']?.v, 'Verbrauchsmaterial'); // AMZ-1: 59.50€ < 80€
    assert.equal(masterSheet['G4']?.v, 'Reise'); // UBER-1 -> Reise

    // Check Kategorien summary sheet
    assert.ok(workbook.SheetNames.includes('Kategorien'));
    const catSheet = workbook.Sheets['Kategorien'];
    assert.equal(catSheet['A1']?.v, 'Kategorie');
    assert.equal(catSheet['A2']?.v, 'Verbrauchsmaterial');
    assert.equal(catSheet['B2']?.v, 2);
    assert.equal(catSheet['A3']?.v, 'Reise');
    assert.equal(catSheet['B3']?.v, 1);
  });

  test('should support manual category override in records', async () => {
    const records = [
      {
        service: 'amazon',
        serviceDisplayName: 'Amazon',
        orderId: 'AMZ-MACBOOK',
        steuerdatum: '2026-06-10',
        seller: 'Apple Store on Amazon',
        category: 'Anschaffung',
        netto: 2000,
        ust: 380,
        brutto: 2380,
        taxRate: '19%'
      },
      {
        service: 'uber',
        serviceDisplayName: 'Uber',
        orderId: 'UBER-EATS-1',
        steuerdatum: '2026-06-11',
        seller: 'Uber Eats',
        category: 'Kost & Logis',
        netto: 35,
        ust: 2.45,
        brutto: 37.45,
        taxRate: '7%'
      }
    ];

    const { xlsxPath } = await exportMasterExcel({
      invoicesDir: testDir,
      records,
      sortBy: 'date'
    });

    const workbook = XLSX.readFile(xlsxPath);
    const masterSheet = workbook.Sheets['Alle Belege'];
    // Sorted by date descending: 2026-06-11 (Uber) is row 2, 2026-06-10 (Amazon) is row 3
    assert.equal(masterSheet['G2']?.v, 'Kost & Logis');
    assert.equal(masterSheet['G3']?.v, 'Anschaffung');

    const catSheet = workbook.Sheets['Kategorien'];
    assert.equal(catSheet['A2']?.v, 'Anschaffung');
    assert.equal(catSheet['B2']?.v, 1);
    assert.equal(catSheet['A3']?.v, 'Kost & Logis');
    assert.equal(catSheet['B3']?.v, 1);
  });
});
