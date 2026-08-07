const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

class ImapService {
  constructor(config = {}) {
    this.host = config.host || process.env.IMAP_HOST;
    this.port = config.port || 993;
    this.secure = config.secure !== false;
    this.user = config.user || process.env.IMAP_USER;
    this.pass = config.pass || process.env.IMAP_PASS;
    this.accessToken = config.accessToken; // for OAuth2
    
    if (!this.user || (!this.pass && !this.accessToken)) {
      throw new Error('IMAP credentials missing. Please configure IMAP_USER and IMAP_PASS.');
    }

    this.client = new ImapFlow({
      host: this.host,
      port: this.port,
      secure: this.secure,
      auth: {
        user: this.user,
        pass: this.pass,
        accessToken: this.accessToken
      },
      logger: false // Disable verbose logs by default
    });
  }

  async connect() {
    await this.client.connect();
  }

  async close() {
    if (this.client && this.client.usable) {
      await this.client.logout();
    }
  }

  /**
   * Search and yield parsed emails matching criteria
   */
  async *searchAndFetch(criteria, folder = 'INBOX') {
    let lock;
    try {
      lock = await this.client.getMailboxLock(folder);
      
      const searchRes = await this.client.search(criteria, { uids: true });
      if (!searchRes || searchRes.length === 0) {
        return;
      }
      
      console.log(`[IMAP] Found ${searchRes.length} matching emails in ${folder}. Fetching...`);
      
      // Fetch messages
      for await (let msg of this.client.fetch(searchRes, { source: true }, { uid: true })) {
        const parsed = await simpleParser(msg.source);
        yield { uid: msg.uid, parsed };
      }
    } finally {
      if (lock) lock.release();
    }
  }
}

module.exports = ImapService;
