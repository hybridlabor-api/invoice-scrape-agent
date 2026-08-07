const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { scaffoldService } = require('../../services/generator/scaffold');

describe('Service Scaffolder', () => {
  const targetDir = path.join(__dirname, '../../services/testvendor');
  const testDir = path.join(__dirname, '../services/testvendor.test.js');

  afterEach(() => {
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { force: true });
  });

  test('should scaffold all required service files and prompt artifact', () => {
    const result = scaffoldService({
      name: 'testvendor',
      displayName: 'Test Vendor Store',
      icon: '🛒',
      authUrl: 'https://testvendor.com/login'
    });

    assert.equal(result.success, true);
    assert.ok(fs.existsSync(path.join(targetDir, 'index.js')));
    assert.ok(fs.existsSync(path.join(targetDir, 'auth.js')));
    assert.ok(fs.existsSync(path.join(targetDir, 'fetcher.js')));
    assert.ok(fs.existsSync(path.join(targetDir, 'analyzer.js')));
    assert.ok(fs.existsSync(path.join(targetDir, 'AGENT_PROMPT.md')));
  });
});
