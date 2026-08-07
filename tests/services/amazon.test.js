const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const AmazonService = require('../../services/amazon/index');

describe('AmazonService', () => {
  const testBaseDir = path.join(__dirname, '../fixtures/amazon_test');

  beforeEach(() => {
    if (!fs.existsSync(testBaseDir)) fs.mkdirSync(testBaseDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testBaseDir)) fs.rmSync(testBaseDir, { recursive: true, force: true });
  });

  test('should initialize with Amazon.de defaults and proper endpoints', () => {
    const amazon = new AmazonService({ baseDir: testBaseDir, domain: 'amazon.de' });
    assert.equal(amazon.id, 'amazon');
    assert.equal(amazon.displayName, 'Amazon.de');
    assert.equal(amazon.icon, '📦');
    assert.equal(amazon.ordersUrl, 'https://www.amazon.de/your-orders/orders');
  });

  test('should parse order summary HTML data into normalized invoice structure', () => {
    const amazon = new AmazonService({ baseDir: testBaseDir });
    const parsed = amazon.parseOrderCardData({
      orderId: '305-1234567-8901234',
      dateText: '24. Juli 2026',
      totalText: 'EUR 49,99'
    });

    assert.equal(parsed.orderId, '305-1234567-8901234');
    assert.equal(parsed.date, '2026-07-24');
    assert.equal(parsed.brutto, 49.99);
    assert.equal(parsed.currency, 'EUR');
  });

  test('should accurately calculate tax breakdown from German invoice amounts', () => {
    const amazon = new AmazonService({ baseDir: testBaseDir });
    const tax = amazon.calculateTaxBreakdown({ brutto: 119.00, taxRate: '19%' });
    assert.equal(tax.netto, 100.00);
    assert.equal(tax.ust, 19.00);
    assert.equal(tax.taxRate, '19%');
  });

  test('should resolve target years from year string or date range', () => {
    const amazon = new AmazonService({ baseDir: testBaseDir });
    assert.deepEqual(amazon.resolveTargetYears({ year: '2024' }), ['2024']);
    assert.deepEqual(amazon.resolveTargetYears({ year: '2023-2025' }), ['2025', '2024', '2023']);
    assert.deepEqual(amazon.resolveTargetYears({ year: '2024, 2025' }), ['2024', '2025']);
    assert.deepEqual(amazon.resolveTargetYears({ startDate: '2023-05-01', endDate: '2025-02-28' }), ['2025', '2024', '2023']);
  });

  test('should filter orders accurately by start and end date bounds', () => {
    const amazon = new AmazonService({ baseDir: testBaseDir });
    const sampleOrders = [
      { orderId: '1', date: '2025-01-10' },
      { orderId: '2', date: '2025-03-15' },
      { orderId: '3', date: '2025-06-20' },
      { orderId: '4', date: '2025-09-01' }
    ];

    const filtered = amazon.filterOrdersByDate(sampleOrders, {
      startDate: '2025-02-01',
      endDate: '2025-07-01'
    });

    assert.equal(filtered.length, 2);
    assert.equal(filtered[0].orderId, '2');
    assert.equal(filtered[1].orderId, '3');
  });

  test('should extract invoice number from PDF text correctly', async () => {
    const amazon = new AmazonService({ baseDir: testBaseDir });

    const text1 = 'Rechnungsdetails\nRechnungsnummer INV-DE-1585411755-2024-45385\nBestelldatum 24 Mai 2024';
    const res1 = await amazon.extractInvoiceDetails(text1, '304-0325258-6098733');
    assert.equal(res1.invoiceNumber, 'INV-DE-1585411755-2024-45385');

    const text2 = 'Rechnung LU42MG7O5AEUI\nAmazon EU S.a.r.l.';
    const res2 = await amazon.extractInvoiceDetails(text2, '304-4587427-0229918');
    assert.equal(res2.invoiceNumber, 'LU42MG7O5AEUI');

    const text3 = 'Rechnung DE504LPTASZ0BI\nAmazon EU S.a.r.l.';
    const res3 = await amazon.extractInvoiceDetails(text3, '303-5545798-8280327');
    assert.equal(res3.invoiceNumber, 'DE504LPTASZ0BI');

    const text4 = 'Bestellbestaetigung ohne gesonderte Nummer';
    const res4 = await amazon.extractInvoiceDetails(text4, '304-7114940-0621929');
    assert.equal(res4.invoiceNumber, 'INV-304-7114940-0621929');
  });

  test('should detect, split and extract multiple invoices from a combined Amazon PDF', async () => {
    const amazon = new AmazonService({ baseDir: testBaseDir });
    const samplePdfPath = path.join(__dirname, '../fixtures/amazon_multi_invoice_sample.pdf');
    
    if (fs.existsSync(samplePdfPath)) {
      const sampleBuffer = fs.readFileSync(samplePdfPath);
      const splitInvoices = await amazon.splitAndExtractInvoices(sampleBuffer, {
        orderId: '304-8397662-8408358',
        date: '2025-11-28'
      });

      assert.equal(splitInvoices.length, 2, 'Should split into exactly 2 separate invoices');

      // Sub-invoice 1
      assert.equal(splitInvoices[0].invoiceNumber, 'DS-AEU-INV-DE-2025-598381416');
      assert.equal(splitInvoices[0].brutto, 16.99);
      assert.equal(splitInvoices[0].netto, 14.28);
      assert.equal(splitInvoices[0].ust, 2.71);
      assert.ok(splitInvoices[0].pdfBuffer && splitInvoices[0].pdfBuffer.length > 0);

      // Sub-invoice 2
      assert.equal(splitInvoices[1].invoiceNumber, 'DS-AEU-INV-DE-2025-598381454');
      assert.equal(splitInvoices[1].brutto, 11.94);
      assert.equal(splitInvoices[1].netto, 10.03);
      assert.equal(splitInvoices[1].ust, 1.91);
      assert.ok(splitInvoices[1].pdfBuffer && splitInvoices[1].pdfBuffer.length > 0);
    }
  });
});
