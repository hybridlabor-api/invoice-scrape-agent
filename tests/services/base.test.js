const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const BaseService = require('../../services/base/BaseService');

describe('BaseService Interface & Utilities', () => {
  const testDir = path.join(__dirname, '../fixtures/test_service_data');
  
  class MockService extends BaseService {
    constructor() {
      super({
        id: 'mock_service',
        displayName: 'Mock Service Inc.',
        icon: '🧪',
        authUrl: 'https://example.com/login',
        baseDir: testDir
      });
    }

    async authenticate() { return { success: true }; }
    async scan() { return [{ orderId: 'MOCK-1', date: '2026-01-01', brutto: 50 }]; }
    async fetch() { return { downloaded: 1, skipped: 0 }; }
    async analyze() { return { totalNetto: 42.02, totalUst: 7.98, totalBrutto: 50.00 }; }
  }

  beforeEach(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('should initialize service metadata and paths correctly', () => {
    const service = new MockService();
    assert.equal(service.id, 'mock_service');
    assert.equal(service.displayName, 'Mock Service Inc.');
    assert.equal(service.icon, '🧪');
    assert.ok(service.invoicesDir.includes('mock_service'));
    assert.ok(service.ledgerFile.includes('mock_service_ledger.json'));
  });

  test('should manage atomic ledger read, write, and duplicate checks', () => {
    const service = new MockService();
    assert.deepEqual(service.loadLedger(), []);

    const record = {
      id: 'MOCK-100',
      orderId: 'MOCK-100',
      date: '2026-05-10',
      brutto: 119.00,
      netto: 100.00,
      ust: 19.00,
      pdfPath: 'invoices/mock_service/2026-05-10_MOCK-100.pdf'
    };

    service.saveLedgerRecord(record);
    const ledger = service.loadLedger();
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].id, 'MOCK-100');
    assert.equal(service.isAlreadyDownloaded('MOCK-100'), false); // pdf file doesn't exist on disk yet
  });

  test('should normalize various date formats to YYYY-MM-DD', () => {
    const service = new MockService();
    assert.equal(service.normalizeDate('2026-08-07'), '2026-08-07');
    assert.equal(service.normalizeDate('07.08.2026'), '2026-08-07');
    assert.equal(service.normalizeDate('Aug 7, 2026'), '2026-08-07');
    assert.equal(service.normalizeDate('7. August 2026'), '2026-08-07');
  });

  test('should parse European and US currency formats accurately', () => {
    const service = new MockService();
    assert.equal(service.parseCurrency('1.234,56 €'), 1234.56);
    assert.equal(service.parseCurrency('$1,234.56'), 1234.56);
    assert.equal(service.parseCurrency('24,99 EUR'), 24.99);
    assert.equal(service.parseCurrency('19.99'), 19.99);
  });
});
