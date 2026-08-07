const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const ServiceRegistry = require('../../services/registry');
const BaseService = require('../../services/base/BaseService');

describe('ServiceRegistry', () => {
  test('should register and retrieve services', () => {
    class DummyService extends BaseService {
      constructor() {
        super({ id: 'dummy', displayName: 'Dummy Service', icon: '📦' });
      }
    }

    ServiceRegistry.register('dummy', DummyService);
    assert.ok(ServiceRegistry.has('dummy'));

    const serviceInstance = ServiceRegistry.get('dummy');
    assert.equal(serviceInstance.id, 'dummy');
    assert.equal(serviceInstance.displayName, 'Dummy Service');
  });

  test('should list all registered services with metadata', () => {
    const list = ServiceRegistry.list();
    assert.ok(Array.isArray(list));
    const found = list.find(s => s.id === 'dummy');
    assert.ok(found);
    assert.equal(found.displayName, 'Dummy Service');
  });
});
