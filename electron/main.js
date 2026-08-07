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

let cronProcess = null;

app.on('window-all-closed', () => {
  if (cronProcess) cronProcess.kill();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (cronProcess) cronProcess.kill();
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
  let services = ServiceRegistry.list().map(s => {
    if (s.id === 'email') {
      const emailService = ServiceRegistry.get('email');
      return {
        id: s.id,
        name: 'Email Scraper',
        icon: '📧',
        providers: emailService.providers ? emailService.providers.map(p => ({
          id: p.id,
          name: p.displayName,
          icon: p.icon
        })) : []
      };
    }
    return {
      id: s.id,
      name: s.displayName,
      icon: s.icon
    };
  });
  
  // Custom Sort: Amazon, AliExpress, Uber, Email
  const sortOrder = { 'amazon': 1, 'aliexpress': 2, 'uber': 3, 'email': 4 };
  services.sort((a, b) => (sortOrder[a.id] || 99) - (sortOrder[b.id] || 99));
  
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
  return { success: true, id: providerConfig.id };
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
      await service.scan({ ...params });
    } else if (action === 'download_all') {
      console.log(`Starting full download for ${service.displayName}...`);
      await service.fetch({ all: true, ...params });
    } else if (action === 'download_year') {
      console.log(`Starting ${params.year} download for ${service.displayName}...`);
      await service.fetch({ year: params.year, ...params });
    } else if (action === 'download_range') {
      console.log(`Starting custom range download for ${service.displayName}...`);
      await service.fetch({ startDate: params.startDate, endDate: params.endDate, ...params });
    } else if (action === 'analyze') {
      console.log(`Starting PDF analysis for ${service.displayName}...`);
      await service.analyze();
    }
    
    console.log(`✅ Action '${action}' completed successfully.`);
    return { success: true };
  } catch (err) {
    console.error(`❌ Action Failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});

const { spawn } = require('child_process');

ipcMain.handle('start-cron', async (event, interval, services) => {
  if (cronProcess) return { success: false, error: 'Already running' };
  
  const cronPath = path.join(__dirname, '..', 'services', 'scheduler', 'cron-runner.js');
  const servicesStr = services ? ` (Services: ${services})` : ' (All Services)';
  console.log(`\n⏰ Starting Background Auto-Pilot (Interval: ${interval})${servicesStr}...`);
  
  const args = [`--interval=${interval}`];
  if (services) args.push(`--services=${services}`);
  
  cronProcess = spawn(process.execPath, [cronPath, ...args]);
  
  cronProcess.stdout.on('data', data => console.log(data.toString().trim()));
  cronProcess.stderr.on('data', data => console.error(data.toString().trim()));
  
  cronProcess.on('exit', () => {
    cronProcess = null;
    console.log(`⏰ Background Auto-Pilot stopped.`);
    if (mainWindow) mainWindow.webContents.send('cron-status-changed', false);
  });
  
  return { success: true };
});

ipcMain.handle('stop-cron', async () => {
  if (cronProcess) {
    console.log(`\n🛑 Stopping Background Auto-Pilot...`);
    cronProcess.kill();
    cronProcess = null;
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('get-cron-status', () => !!cronProcess);

ipcMain.handle('update-app', async () => {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    console.log(`\n🔄 Updating application via NPM...`);
    exec('npm install -g invoice-scrape-agent@latest', (error, stdout, stderr) => {
      if (error) {
        console.error('Update failed:', stderr);
        resolve({ success: false, error: stderr || error.message });
      } else {
        console.log('Update successful:', stdout);
        resolve({ success: true });
        
        // Wait 2 seconds so the GUI can show success message before restarting
        setTimeout(() => {
          app.relaunch();
          app.exit(0);
        }, 2000);
      }
    });
  });
});
