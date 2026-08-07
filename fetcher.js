const { startFetcher } = require('./services/uber/fetcher');

if (require.main === module) {
  startFetcher();
}

module.exports = { startFetcher };
