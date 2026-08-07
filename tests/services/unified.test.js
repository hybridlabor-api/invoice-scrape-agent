const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const MasterAnalyzer = require('../../services/unified/master-analyzer');

describe('Unified MasterAnalyzer', () => {
  const testDir = path.join(__dirname, '../fixtures/unified_test');

  beforeEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(testDir, 'invoices/uber'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'invoices/amazon'), { recursive: true });

    // Mock Uber ledger
    fs.writeFileSync(
      path.join(testDir, 'invoices/uber/uber_ledger.json'),
      JSON.stringify([
        { id: 'UBER-1', service: 'uber', date: '2026-03-15', brutto: 35.70, netto: 30.00, ust: 5.70, taxRate: '19%', seller: 'Uber B.V.' }
      ])
    );

    // Mock Amazon ledger
    fs.writeFileSync(
      path.join(testDir, 'invoices/amazon/amazon_ledger.json'),
      JSON.stringify([
        { id: 'AMZ-1', service: 'amazon', date: '2026-03-20', brutto: 119.00, netto: 100.00, ust: 19.00, taxRate: '19%', seller: 'Amazon EU S.a.r.l.' }
      ])
    );
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('should aggregate records from all service ledgers', () => {
    const analyzer = new MasterAnalyzer({ baseDir: testDir });
    const records = analyzer.collectAllRecords();

    assert.equal(records.length, 2);
    assert.ok(records.some(r => r.service === 'uber'));
    assert.ok(records.some(r => r.service === 'amazon'));
  });

  test('should compute unified metrics and breakdown totals accurately', () => {
    const analyzer = new MasterAnalyzer({ baseDir: testDir });
    const summary = analyzer.calculateMetrics();

    assert.equal(summary.totalCount, 2);
    assert.equal(summary.totalBrutto, 154.70);
    assert.equal(summary.totalNetto, 130.00);
    assert.equal(summary.totalUst, 24.70);
    assert.equal(summary.byService.uber.brutto, 35.70);
    assert.equal(summary.byService.amazon.brutto, 119.00);
  });
});
