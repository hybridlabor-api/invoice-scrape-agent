const fs = require('fs');
const path = require('path');

class ServiceRegistry {
  constructor() {
    this.services = new Map();
  }

  /**
   * Register a service class.
   * @param {string} id
   * @param {typeof import('./base/BaseService')} ServiceClass
   */
  register(id, ServiceClass) {
    this.services.set(id, ServiceClass);
  }

  /**
   * Check if service exists.
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return this.services.has(id);
  }

  /**
   * Get an instantiated service instance.
   * @param {string} id
   * @param {Object} [config]
   * @returns {import('./base/BaseService')}
   */
  get(id, config = {}) {
    const ServiceClass = this.services.get(id);
    if (!ServiceClass) {
      throw new Error(`Service '${id}' is not registered in ServiceRegistry.`);
    }
    return new ServiceClass(config);
  }

  /**
   * Get list of all registered service descriptors.
   * @returns {Array<{ id: string, displayName: string, icon: string, authUrl: string }>}
   */
  list() {
    const result = [];
    for (const [id, ServiceClass] of this.services.entries()) {
      try {
        const instance = new ServiceClass();
        result.push({
          id: instance.id,
          displayName: instance.displayName,
          icon: instance.icon,
          authUrl: instance.authUrl
        });
      } catch (e) {
        result.push({ id, displayName: id, icon: '📦', authUrl: '' });
      }
    }
    return result;
  }

  autoDiscover(servicesDir = __dirname) {
    if (!fs.existsSync(servicesDir)) return;
    const entries = fs.readdirSync(servicesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !['base', 'generator', 'unified', 'scheduler'].includes(entry.name)) {
        const indexPath = path.join(servicesDir, entry.name, 'index.js');
        const servicePath = path.join(servicesDir, entry.name, `${entry.name}.service.js`);
        
        let loadedModule = null;
        try {
          if (fs.existsSync(indexPath)) {
            loadedModule = require(indexPath);
          } else if (fs.existsSync(servicePath)) {
            loadedModule = require(servicePath);
          }
        } catch (e) {
          console.warn(`[ServiceRegistry] Failed loading ${entry.name}:`, e.message);
        }

        if (loadedModule && typeof loadedModule === 'function') {
          this.register(entry.name, loadedModule);
        } else if (loadedModule && loadedModule.Service) {
          this.register(entry.name, loadedModule.Service);
        }
      }
    }
  }
}

const instance = new ServiceRegistry();
module.exports = instance;
