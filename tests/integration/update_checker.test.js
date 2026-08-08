const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { compareSemver, checkUpdateAvailable } = require('../../utils/update-checker');

describe('Update Checker & Semver Comparison Logic', () => {
  test('compareSemver accurately detects newer versions', () => {
    // Newer versions -> returns 1
    assert.strictEqual(compareSemver('1.6.1', '1.6.2'), 1);
    assert.strictEqual(compareSemver('1.6.1', '1.7.0'), 1);
    assert.strictEqual(compareSemver('1.6.1', '2.0.0'), 1);
    assert.strictEqual(compareSemver('v1.6.1', 'v1.7.0'), 1);

    // Same versions -> returns 0
    assert.strictEqual(compareSemver('1.6.1', '1.6.1'), 0);
    assert.strictEqual(compareSemver('v1.6.1', '1.6.1'), 0);

    // Older versions -> returns -1
    assert.strictEqual(compareSemver('1.7.0', '1.6.1'), -1);
    assert.strictEqual(compareSemver('2.0.0', '1.6.1'), -1);
  });

  test('checkUpdateAvailable returns structured update status object', async () => {
    const res = await checkUpdateAvailable();
    assert.ok(typeof res === 'object', 'Must return an object');
    assert.ok(typeof res.updateAvailable === 'boolean', 'updateAvailable must be boolean');
    assert.ok(typeof res.currentVersion === 'string', 'currentVersion must be string');
    assert.ok(typeof res.latestVersion === 'string', 'latestVersion must be string');
    assert.ok(typeof res.releaseUrl === 'string', 'releaseUrl must be string');
  });
});
