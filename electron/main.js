const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const ServiceRegistry = require('../services/registry');
const MasterAnalyzer = require('../services/unified/master-analyzer');
const { scaffoldService } = require('../services/generator/scaffold');

// Discover services
ServiceRegistry.autoDiscover(path.join(__dirname, '../services'));

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 750,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a', // slate-900
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Intercept console.log and console.error to send to GUI
const originalLog = console.log;
console.log = (...args) => {
  originalLog(...args);
  if (mainWindow) {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    mainWindow.webContents.send('backend-log', { type: 'info', message: msg });
  }
};

const originalError = console.error;
console.error = (...args) => {
  originalError(...args);
  if (mainWindow) {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    mainWindow.webContents.send('backend-log', { type: 'error', message: msg });
  }
};

// IPC Handlers
ipcMain.handle('get-services', () => {
  const services = ServiceRegistry.list().map(s => ({
    id: s.id,
    name: s.displayName,
    icon: s.icon
  }));
  return services;
});

ipcMain.handle('open-invoices', async () => {
  const invDir = path.join(__dirname, '..', 'invoices');
  if (!fs.existsSync(invDir)) fs.mkdirSync(invDir, { recursive: true });
  await shell.openPath(invDir);
});

ipcMain.handle('save-imap', async (event, data) => {
  const envPath = path.resolve(__dirname, '..', '.env');
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  
  const updateEnv = (key, val) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) envContent = envContent.replace(regex, `${key}=${val}`);
    else envContent += `\n${key}=${val}`;
  };
  
  updateEnv('IMAP_HOST', data.host);
  updateEnv('IMAP_USER', data.user);
  updateEnv('IMAP_PASS', data.pass);
  fs.writeFileSync(envPath, envContent.trim() + '\n');
  
  process.env.IMAP_HOST = data.host;
  process.env.IMAP_USER = data.user;
  process.env.IMAP_PASS = data.pass;
  
  const emailService = ServiceRegistry.get('email');
  if (emailService) {
    for (const provider of emailService.providers) {
      provider.imapConfig.host = data.host;
      provider.imapConfig.user = data.user;
      provider.imapConfig.pass = data.pass;
    }
  }
  console.log('✅ IMAP Credentials saved to .env securely.');
  return { success: true };
});

ipcMain.handle('create-email', async (event, data) => {
  const providerConfig = {
    id: data.id.toLowerCase().trim(),
    displayName: data.displayName,
    icon: "✉️",
    authUrl: "imap://",
    search: {
      from: [data.from.trim()],
      subjectKeywords: data.subject ? [data.subject.trim()] : [],
      folders: ["INBOX", "[Gmail]/All Mail"]
    },
    extraction: {
      mode: "attachment_or_html",
      attachmentRegex: "\\.pdf$",
      htmlCssFixes: "@media print { body { font-size: 11pt; } }"
    },
    parser: { currency: "EUR", regex: { orderId: "", date: "", brutto: "", ust: "", seller: "" }, taxRate: "19%", aiFallback: false }
  };

  const emailDir = path.join(__dirname, '..', 'services', 'email', 'providers');
  if (!fs.existsSync(emailDir)) fs.mkdirSync(emailDir, { recursive: true });
  fs.writeFileSync(path.join(emailDir, `${providerConfig.id}.json`), JSON.stringify(providerConfig, null, 2));
  
  const emailService = ServiceRegistry.get('email');
  if (emailService) emailService.providers = emailService.loadProviders();
  console.log(`✅ Email Provider ${data.displayName} created successfully.`);
  return { success: true };
});

ipcMain.handle('create-scraper', async (event, data) => {
  const res = scaffoldService(data);
  if (res.success) {
    ServiceRegistry.autoDiscover(path.join(__dirname, '..', 'services'));
    console.log(`✅ Web Scraper ${data.displayName} created.`);
    return { success: true };
  } else {
    console.error(`❌ Failed to scaffold: ${res.error}`);
    return { success: false, error: res.error };
  }
});

ipcMain.handle('run-action', async (event, { serviceId, action, params }) => {
  try {
    if (serviceId === 'master_report') {
      const analyzer = new MasterAnalyzer();
      await analyzer.generateMasterPdf();
      return { success: true };
    }

    const service = ServiceRegistry.get(serviceId);
    if (!service) throw new Error("Service not found");

    if (action === 'auth') {
      console.log(`Starting authentication for ${service.displayName}...`);
      await service.authenticate({ headless: false });
    } else if (action === 'scan') {
      console.log(`Starting scan for ${service.displayName}...`);
      await service.scan(params || {});
    } else if (action === 'download_all') {
      console.log(`Starting full download for ${service.displayName}...`);
      await service.fetch({ all: true });
    } else if (action === 'download_year') {
      console.log(`Starting ${params.year} download for ${service.displayName}...`);
      await service.fetch({ year: params.year });
    }
    
    console.log(`✅ Action '${action}' completed successfully.`);
    return { success: true };
  } catch (err) {
    console.error(`❌ Action Failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});
