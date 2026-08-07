const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { parseIntervalToMs, generateLaunchdPlist } = require('../../services/scheduler/cron-runner');

describe('Cron Scheduler Utilities', () => {
  test('should parse interval strings accurately into milliseconds', () => {
    assert.equal(parseIntervalToMs('1h'), 3600000);
    assert.equal(parseIntervalToMs('24h'), 86400000);
    assert.equal(parseIntervalToMs('30m'), 1800000);
    assert.equal(parseIntervalToMs('60s'), 60000);
  });

  test('should generate valid launchd plist configuration for macOS', () => {
    const plist = generateLaunchdPlist({
      nodePath: '/usr/local/bin/node',
      scriptPath: '/path/to/cron-runner.js',
      intervalSeconds: 86400
    });

    assert.ok(plist.includes('<key>Label</key>'));
    assert.ok(plist.includes('com.bdb.invoicescrape.scheduler'));
    assert.ok(plist.includes('<key>StartInterval</key>'));
    assert.ok(plist.includes('<integer>86400</integer>'));
  });
});
