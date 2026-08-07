const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getServices: () => ipcRenderer.invoke('get-services'),
  runAction: (data) => ipcRenderer.invoke('run-action', data),
  onLog: (callback) => ipcRenderer.on('backend-log', (event, data) => callback(data)),
  openInvoices: () => ipcRenderer.invoke('open-invoices'),
  saveImap: (data) => ipcRenderer.invoke('save-imap', data),
  createEmail: (data) => ipcRenderer.invoke('create-email', data),
  createScraper: (data) => ipcRenderer.invoke('create-scraper', data),
  
  // Cron
  startCron: (interval, services) => ipcRenderer.invoke('start-cron', interval, services),
  stopCron: () => ipcRenderer.invoke('stop-cron'),
  getCronStatus: () => ipcRenderer.invoke('get-cron-status'),
  onCronStatusChanged: (callback) => ipcRenderer.on('cron-status-changed', (_event, value) => callback(value))
});
