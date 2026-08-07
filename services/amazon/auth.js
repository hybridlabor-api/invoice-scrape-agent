const AmazonService = require('./index');
(async () => {
  const service = new AmazonService();
  await service.authenticate({ headless: false });
})();
