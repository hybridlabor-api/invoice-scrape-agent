const { analyzeInvoices } = require('./services/uber/analyzer');

if (require.main === module) {
  analyzeInvoices();
}

module.exports = { analyzeInvoices };
