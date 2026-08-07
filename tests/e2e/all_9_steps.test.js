const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Core modules
const ServiceRegistry = require('../../services/registry');
const BaseService = require('../../services/base/BaseService');
const AmazonService = require('../../services/amazon/index');
const AliExpressService = require('../../services/aliexpress/index');
const UberService = require('../../services/uber/index');
const MasterAnalyzer = require('../../services/unified/master-analyzer');
const {
  exportServiceExcel,
  exportMasterExcel,
  resolveCategory,
  groupByCategory,
  groupByMonth,
  sortRecords
} = require('../../utils/excel-exporter');

describe('Full 9-Step Verification & End-to-End Suite', () => {
  const testRoot = path.join(__dirname, '../fixtures/e2e_all_steps_test');
  const invoicesDir = path.join(testRoot, 'invoices');

  beforeEach(() => {
    if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true, force: true });
    fs.mkdirSync(invoicesDir, { recursive: true });
    ServiceRegistry.autoDiscover(path.join(__dirname, '../../services'));
  });

  afterEach(() => {
    if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // -------------------------------------------------------------
  // STEP 1: Multi-Service Selection & Registry Auto-Discovery
  // -------------------------------------------------------------
  test('Step 1: Multi-Service Registry & Selection Logic', () => {
    const list = ServiceRegistry.list();
    assert.ok(list.length >= 3, 'Registry should have at least Amazon, AliExpress, Uber');

    const ids = list.map(s => s.id);
    assert.ok(ids.includes('amazon'), 'Registry must contain amazon');
    assert.ok(ids.includes('aliexpress'), 'Registry must contain aliexpress');
    assert.ok(ids.includes('uber'), 'Registry must contain uber');

    // Simulate multi-service selection input parsing
    const parseSelection = (input) => {
      if (!input || input === 'all') return ServiceRegistry.list().map(s => s.id);
      return input.split(',').map(s => s.trim().toLowerCase()).filter(id => ServiceRegistry.has(id));
    };

    const selectedPartial = parseSelection('amazon, uber');
    assert.deepEqual(selectedPartial, ['amazon', 'uber']);

    const selectedAll = parseSelection('all');
    assert.ok(selectedAll.includes('amazon') && selectedAll.includes('uber') && selectedAll.includes('aliexpress'));
  });

  // -------------------------------------------------------------
  // STEP 2: Excel Native Date Formatting (Steuerdatum & Rechnungsdatum)
  // -------------------------------------------------------------
  test('Step 2: Native Date Cell Formatting (YYYY-MM-DD)', async () => {
    const records = [
      {
        orderId: 'DATE-TEST-1',
        steuerdatum: '2026-04-15',
        rechnungsdatum: '2026-04-18',
        seller: 'Test Store',
        netto: 84.03,
        ust: 15.97,
        brutto: 100.00,
        taxRate: '19%'
      }
    ];

    const { xlsxPath } = await exportServiceExcel({
      serviceName: 'DateTest',
      invoicesDir,
      records
    });

    const wb = XLSX.readFile(xlsxPath, { cellDates: true });
    const ws = wb.Sheets['Alle Belege'];

    const steuerCell = ws['B2'];
    const rechnungsCell = ws['C2'];

    assert.ok(steuerCell && steuerCell.t === 'd', 'Steuerdatum must be native date cell type (d)');
    assert.ok(rechnungsCell && rechnungsCell.t === 'd', 'Rechnungsdatum must be native date cell type (d)');
    assert.ok(steuerCell.v instanceof Date, 'Steuerdatum value must be a JavaScript Date');
    assert.equal(steuerCell.v.toISOString().slice(0, 10), '2026-04-15');
    assert.equal(rechnungsCell.v.toISOString().slice(0, 10), '2026-04-18');
  });

  // -------------------------------------------------------------
  // STEP 3: Sortable Master Tables, AutoFilter & Per-Service Tabs
  // -------------------------------------------------------------
  test('Step 3: AutoFilter, Dynamic SUM Formulas & Dedicated Tabs', async () => {
    const records = [
      {
        service: 'amazon',
        serviceDisplayName: 'Amazon.de',
        orderId: 'AMZ-101',
        steuerdatum: '2026-05-01',
        seller: 'Amazon EU SARL',
        netto: 100,
        ust: 19,
        brutto: 119,
        taxRate: '19%'
      },
      {
        service: 'uber',
        serviceDisplayName: 'Uber',
        orderId: 'UBER-101',
        steuerdatum: '2026-05-05',
        seller: 'Uber BV',
        netto: 50,
        ust: 9.5,
        brutto: 59.5,
        taxRate: '19%'
      }
    ];

    const { xlsxPath } = await exportMasterExcel({
      invoicesDir,
      records,
      sortBy: 'service'
    });

    const wb = XLSX.readFile(xlsxPath);
    assert.ok(wb.SheetNames.includes('Alle Belege'));
    assert.ok(wb.SheetNames.includes('Amazon.de') || wb.SheetNames.includes('Amazon'));
    assert.ok(wb.SheetNames.includes('Uber'));
    assert.ok(wb.SheetNames.includes('Monatsübersicht'));
    assert.ok(wb.SheetNames.includes('Kategorien'));

    const masterSheet = wb.Sheets['Alle Belege'];
    assert.ok(masterSheet['!autofilter'], 'AutoFilter must be present on Master sheet');

    // Totals row: Row 4 (Header + 2 rows data + Totals row)
    const totalsNettoCell = masterSheet['H4'];
    assert.ok(totalsNettoCell && totalsNettoCell.f, 'Totals row must contain dynamic Excel SUM formula');
    assert.equal(totalsNettoCell.f, 'SUM(H2:H3)');
    assert.equal(totalsNettoCell.v, 150);
  });

  // -------------------------------------------------------------
  // STEP 4: AliExpress Invoice & Tax Calculation
  // -------------------------------------------------------------
  test('Step 4: AliExpress Tax Parsing & Amount Normalization', () => {
    const ali = new AliExpressService({ baseDir: testRoot });
    
    // Tax breakdown calculation (19% standard VAT)
    const tax19 = ali.calculateTaxBreakdown({ brutto: 119.00, taxRate: '19%' });
    assert.equal(tax19.netto, 100.00);
    assert.equal(tax19.ust, 19.00);
    assert.equal(tax19.brutto, 119.00);

    // Currency parsing
    const parsedAmount = ali.parseAmount('€ 45,50');
    assert.equal(parsedAmount, 45.50);

    // Auto-category verification
    assert.equal(resolveCategory({ service: 'aliexpress', brutto: 25.00 }), 'Verbrauchsmaterial');
    assert.equal(resolveCategory({ service: 'aliexpress', brutto: 180.00 }), 'Anschaffung');
  });

  // -------------------------------------------------------------
  // STEP 5: Start / Stopp Button & Asynchronous Cancellation
  // -------------------------------------------------------------
  test('Step 5: Cancellation Signal & Graceful Process Termination', async () => {
    const testService = new BaseService({
      id: 'mock-runner',
      displayName: 'Mock Runner',
      baseDir: testRoot
    });

    assert.equal(testService.isCancelled, false, 'isCancelled must be false initially');
    
    let iterationsCompleted = 0;
    const asyncLoopPromise = (async () => {
      for (let i = 0; i < 20; i++) {
        if (testService.isCancelled) {
          testService.log('Vorgang vorzeitig abgebrochen.', 'warn');
          break;
        }
        iterationsCompleted++;
        await new Promise(r => setTimeout(r, 5));
        if (i === 3) {
          testService.cancel(); // Trigger stop midway
        }
      }
    })();

    await asyncLoopPromise;
    assert.equal(testService.isCancelled, true, 'isCancelled flag must be true after cancel()');
    assert.equal(iterationsCompleted, 4, 'Loop must terminate immediately when cancellation flag is encountered');
  });

  // -------------------------------------------------------------
  // STEP 6: Multi-Year & Date Bounds Range Fetching
  // -------------------------------------------------------------
  test('Step 6: Multi-Year Parsing & Strict Date Bounds Filtering', () => {
    const amazon = new AmazonService({ baseDir: testRoot });

    // Multi-year string parsing
    assert.deepEqual(amazon.resolveTargetYears({ year: '2023-2025' }), ['2025', '2024', '2023']);
    assert.deepEqual(amazon.resolveTargetYears({ year: '2024, 2026' }), ['2024', '2026']);
    assert.deepEqual(amazon.resolveTargetYears({ startDate: '2023-11-01', endDate: '2025-01-15' }), ['2025', '2024', '2023']);

    // Date bounds filtering
    const sampleList = [
      { orderId: 'O1', date: '2024-01-01' },
      { orderId: 'O2', date: '2024-05-15' },
      { orderId: 'O3', date: '2024-08-20' },
      { orderId: 'O4', date: '2025-02-10' }
    ];

    const filtered = amazon.filterOrdersByDate(sampleList, {
      startDate: '2024-03-01',
      endDate: '2024-10-01'
    });

    assert.equal(filtered.length, 2);
    assert.equal(filtered[0].orderId, 'O2');
    assert.equal(filtered[1].orderId, 'O3');
  });

  // -------------------------------------------------------------
  // STEP 7: Uber Receipt vs. Invoice Extraction
  // -------------------------------------------------------------
  test('Step 7: Uber Ride (19%) vs. Meal/Eats (7%) Tax Categorization', () => {
    const uber = new UberService({ baseDir: testRoot });

    const rideTax = uber.calculateTaxBreakdown({ brutto: 23.80, taxRate: '19%' });
    assert.equal(rideTax.netto, 20.00);
    assert.equal(rideTax.ust, 3.80);

    const eatsTax = uber.calculateTaxBreakdown({ brutto: 32.10, taxRate: '7%' });
    assert.equal(eatsTax.netto, 30.00);
    assert.equal(eatsTax.ust, 2.10);

    const rideCategory = resolveCategory({ service: 'uber', seller: 'Uber BV Driver' });
    assert.equal(rideCategory, 'Reise');

    const eatsCategory = resolveCategory({ service: 'uber', seller: 'Uber Eats Restaurant' });
    assert.equal(eatsCategory, 'Kost & Logis');
  });

  // -------------------------------------------------------------
  // STEP 8: Amazon Multi-Invoice PDF Splitting
  // -------------------------------------------------------------
  test('Step 8: Splitting Composite Invoices into Atomic PDFs', async () => {
    const amazon = new AmazonService({ baseDir: testRoot });
    const fixturePdf = path.join(__dirname, '../fixtures/amazon_multi_invoice_sample.pdf');

    if (fs.existsSync(fixturePdf)) {
      const buffer = fs.readFileSync(fixturePdf);
      const splitInvoices = await amazon.splitAndExtractInvoices(buffer, {
        orderId: '304-8397662-8408358',
        date: '2025-11-28'
      });

      assert.equal(splitInvoices.length, 2, 'Must split sample composite into exactly 2 distinct invoice PDFs');
      assert.equal(splitInvoices[0].invoiceNumber, 'DS-AEU-INV-DE-2025-598381416');
      assert.equal(splitInvoices[0].brutto, 16.99);
      assert.equal(splitInvoices[1].invoiceNumber, 'DS-AEU-INV-DE-2025-598381454');
      assert.equal(splitInvoices[1].brutto, 11.94);
    }
  });

  // -------------------------------------------------------------
  // STEP 9: Categorization & Master Summary Dashboard
  // -------------------------------------------------------------
  test('Step 9: Expense Categorization & Category Summary Dashboard', async () => {
    const testRecords = [
      { service: 'amazon', brutto: 25.00, seller: 'Kabel Direkt', steuerdatum: '2026-07-01' }, // Verbrauchsmaterial (<80€)
      { service: 'amazon', brutto: 450.00, seller: 'Dell Store', steuerdatum: '2026-07-02' }, // Anschaffung (>=150€)
      { service: 'uber', brutto: 18.50, seller: 'Taxi Driver', steuerdatum: '2026-07-03' }, // Reise
      { service: 'uber', brutto: 28.00, seller: 'Burger Joint', category: 'Kost & Logis', steuerdatum: '2026-07-04' } // Kost & Logis
    ];

    const catSummary = groupByCategory(testRecords);
    const catNames = catSummary.map(c => c.category);

    assert.ok(catNames.includes('Anschaffung'));
    assert.ok(catNames.includes('Verbrauchsmaterial'));
    assert.ok(catNames.includes('Kost & Logis'));
    assert.ok(catNames.includes('Reise'));

    const { xlsxPath } = await exportMasterExcel({
      invoicesDir,
      records: testRecords,
      sortBy: 'date'
    });

    const wb = XLSX.readFile(xlsxPath);
    assert.ok(wb.SheetNames.includes('Kategorien'), 'Master Excel must include dedicated Kategorien sheet');
    
    const catWs = wb.Sheets['Kategorien'];
    assert.equal(catWs['A1']?.v, 'Kategorie');
    assert.ok(catWs['B5']?.f || catWs['B6']?.f, 'Totals row in Kategorien sheet must calculate dynamic sum');
  });
});
