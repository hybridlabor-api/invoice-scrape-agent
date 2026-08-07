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
});
