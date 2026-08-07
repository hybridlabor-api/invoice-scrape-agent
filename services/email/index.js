const BaseService = require('../base/BaseService');
const EmailProviderService = require('../base/EmailProviderService');
const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer').default || require('inquirer');

class EmailService extends BaseService {
  constructor(config = {}) {
    super({
      id: 'email',
      displayName: 'Email Scraper (Bolt, Adobe, etc.)',
      icon: '📧',
      authUrl: 'imap://'
    });
    this.providers = this.loadProviders();
  }

  loadProviders() {
    const providers = [];
    const providersDir = path.join(__dirname, 'providers');
    if (fs.existsSync(providersDir)) {
      const files = fs.readdirSync(providersDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const providerConfig = JSON.parse(fs.readFileSync(path.join(providersDir, file), 'utf8'));
            providers.push(new EmailProviderService(providerConfig));
          } catch (e) {
            console.error(`[EmailService] Failed to load provider ${file}:`, e.message);
          }
        }
      }
    }
    return providers;
  }

  async authenticate({ headless = false } = {}) {
    console.log(`\n======================================================`);
    console.log(`✉️ [Email Scraper] Verifying IMAP Authentication...`);
    console.log(`======================================================\n`);

    require('dotenv').config();
    
    if (!process.env.IMAP_HOST || !process.env.IMAP_USER || !process.env.IMAP_PASS) {
      console.log(`⚠️ Keine IMAP Zugangsdaten gefunden. Bitte richte dein Postfach ein:`);
      const answers = await inquirer.prompt([
        { type: 'input', name: 'host', message: 'IMAP Host (z.B. imap.gmail.com):', default: 'imap.gmail.com' },
        { type: 'input', name: 'user', message: 'E-Mail Adresse:' },
        { type: 'password', name: 'pass', message: 'Passwort (bzw. App-Passwort):' }
      ]);
      
      const envPath = path.resolve(process.cwd(), '.env');
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
      
      // Replace or append
      const updateEnv = (key, val) => {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) envContent = envContent.replace(regex, `${key}=${val}`);
        else envContent += `\n${key}=${val}`;
      };
      
      updateEnv('IMAP_HOST', answers.host);
      updateEnv('IMAP_USER', answers.user);
      updateEnv('IMAP_PASS', answers.pass);
      
      fs.writeFileSync(envPath, envContent.trim() + '\n');
      console.log(`\n✅ Zugangsdaten sicher in .env gespeichert!`);
      
      // Update running environment
      process.env.IMAP_HOST = answers.host;
      process.env.IMAP_USER = answers.user;
      process.env.IMAP_PASS = answers.pass;
      
      // Update provider configs dynamically
      for (const provider of this.providers) {
        provider.imapConfig.host = answers.host;
        provider.imapConfig.user = answers.user;
        provider.imapConfig.pass = answers.pass;
      }
    }

    if (this.providers.length === 0) {
      console.log(`❌ No provider configurations found in services/email/providers/`);
      return { success: false, error: 'No providers configured' };
    }

    // Authenticate using the first provider's IMAP config
    return await this.providers[0].authenticate({ headless });
  }

  async scan({ year = new Date().getFullYear().toString() } = {}) {
    console.log(`\n🔍 [Email Scraper] Scanning all configured email providers for ${year}...`);
    let totalFound = 0;
    
    // Connect to IMAP once
    const firstProvider = this.providers[0];
    await firstProvider.ensureImapConnected();
    const imapClient = firstProvider.imapService.client;

    try {
      for (const provider of this.providers) {
        console.log(`\n▶ Scanning provider: ${provider.displayName}`);
        const criteria = provider.buildSearchCriteria(year, null, null);
        const folders = provider.providerConfig.search?.folders || ['INBOX'];
        
        let providerCount = 0;
        for (const folder of folders) {
          try {
            const lock = await imapClient.getMailboxLock(folder);
            const searchRes = await imapClient.search(criteria, { uids: true });
            if (searchRes && searchRes.length > 0) {
              providerCount += searchRes.length;
            }
            lock.release();
          } catch (err) {
            // Folder might not exist
          }
        }
        console.log(`  Found ~${providerCount} matching emails for ${provider.displayName}`);
        totalFound += providerCount;
      }
    } finally {
      await firstProvider.imapService.close();
    }
    
    return new Array(totalFound).fill({}); // Return dummy array so CLI shows count
  }

  async fetch({ all = false, year = null, startDate = null, endDate = null, limit = null, headless = true } = {}) {
    const currentYear = year || new Date().getFullYear().toString();
    console.log(`\n⬇️ [Email Scraper] Processing all email providers for ${currentYear}...`);
    
    let totalDownloaded = 0;
    let totalSkipped = 0;

    for (const provider of this.providers) {
      console.log(`\n======================================================`);
      console.log(`📩 Fetching for ${provider.displayName}`);
      console.log(`======================================================`);
      try {
        const res = await provider.fetch({ all, year: currentYear, startDate, endDate, limit, headless });
        totalDownloaded += res.downloaded || 0;
        totalSkipped += res.skipped || 0;
      } catch (err) {
        console.error(`❌ Error fetching ${provider.displayName}:`, err.message);
      }
    }

    return { downloaded: totalDownloaded, skipped: totalSkipped, total: totalDownloaded + totalSkipped };
  }
}

module.exports = EmailService;
