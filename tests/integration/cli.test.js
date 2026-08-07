const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const ServiceRegistry = require('../../services/registry');
const path = require('path');

describe('CLI Plugin System Integration', () => {
  test('should automatically discover Uber, AliExpress, Amazon, and custom plugins', () => {
    ServiceRegistry.autoDiscover(path.resolve(__dirname, '../../services'));
    const list = ServiceRegistry.list();

    const ids = list.map(s => s.id);
    assert.ok(ids.includes('amazon'), 'Amazon service must be registered');
    assert.ok(ids.includes('uber'), 'Uber service must be registered');
    assert.ok(ids.includes('aliexpress'), 'AliExpress service must be registered');
  });
});
