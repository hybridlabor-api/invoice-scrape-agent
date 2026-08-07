const AmazonService = require('./index');
(async () => {
  const service = new AmazonService();
  const args = process.argv.slice(2);
  let year = null;
  const yearIdx = args.indexOf('--year');
  if (yearIdx >= 0 && args[yearIdx + 1]) year = args[yearIdx + 1];
  const all = args.includes('--all');

  await service.fetch({ year, all, headless: false });
})();
