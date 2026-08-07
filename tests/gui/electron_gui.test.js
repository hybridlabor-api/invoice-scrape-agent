const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Electron GUI & Real-time Debugging Pipeline', () => {
  const htmlPath = path.join(__dirname, '../../electron/renderer/index.html');
  const rendererPath = path.join(__dirname, '../../electron/renderer/renderer.js');
  const preloadPath = path.join(__dirname, '../../electron/preload.js');
  const mainPath = path.join(__dirname, '../../electron/main.js');

  test('GUI DOM Structure & Elements Integrity', () => {
    assert.ok(fs.existsSync(htmlPath), 'index.html must exist');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Sidebar & Navigation
    assert.ok(html.includes('id="services-list"'), 'Must contain services-list container');
    assert.ok(html.includes('id="app-version-badge"'), 'Must contain app version badge');
    assert.ok(html.includes('id="app-version-title"'), 'Must contain app version title');

    // Action Grid & Dynamic Controls
    assert.ok(html.includes('id="action-grid"'), 'Must contain main action-grid');
    assert.ok(html.includes('id="cancel-btn"'), 'Must contain cancellation button');
    assert.ok(html.includes('id="loader"'), 'Must contain loader container');

    // Terminal & Debug Stream
    assert.ok(html.includes('id="terminal"'), 'Must contain terminal log stream');

    // Auto-Pilot & Modals
    assert.ok(html.includes('id="cron-toggle"'), 'Must contain Auto-Pilot toggle');
    assert.ok(html.includes('id="cron-modal"'), 'Must contain Auto-Pilot configuration modal');
    assert.ok(html.includes('id="cron-services-list"'), 'Must contain target scrapers selector in cron modal');
    assert.ok(html.includes('id="year-modal"'), 'Must contain year-modal');
    assert.ok(html.includes('id="range-modal"'), 'Must contain range-modal');
    assert.ok(html.includes('id="imap-modal"'), 'Must contain imap credentials modal');
  });

  test('Preload IPC API Contract & Bridge Definition', () => {
    assert.ok(fs.existsSync(preloadPath), 'preload.js must exist');
    const preloadContent = fs.readFileSync(preloadPath, 'utf8');

    const expectedMethods = [
      'getServices',
      'runAction',
      'cancelAction',
      'onLog',
      'openInvoices',
      'saveImap',
      'createEmail',
      'createScraper',
      'startCron',
      'stopCron',
      'getCronStatus',
      'onCronStatusChanged',
      'getVersion',
      'updateApp'
    ];

    expectedMethods.forEach(method => {
      assert.ok(preloadContent.includes(`${method}:`), `preload.js must expose api.${method}`);
    });
  });

  test('Main Process IPC Handlers & Log Forwarding Pipeline', () => {
    assert.ok(fs.existsSync(mainPath), 'main.js must exist');
    const mainContent = fs.readFileSync(mainPath, 'utf8');

    // IPC channel handlers
    assert.ok(mainContent.includes("ipcMain.handle('get-services'"), "Must handle 'get-services'");
    assert.ok(mainContent.includes("ipcMain.handle('run-action'"), "Must handle 'run-action'");
    assert.ok(mainContent.includes("ipcMain.handle('cancel-action'"), "Must handle 'cancel-action'");
    assert.ok(mainContent.includes("ipcMain.handle('start-cron'"), "Must handle 'start-cron'");
    assert.ok(mainContent.includes("ipcMain.handle('stop-cron'"), "Must handle 'stop-cron'");
    assert.ok(mainContent.includes("ipcMain.handle('open-invoices'"), "Must handle 'open-invoices'");

    // Real-time log interceptors
    assert.ok(mainContent.includes("mainWindow.webContents.send('backend-log'"), 'Must broadcast logs to GUI via backend-log');
  });

  test('Renderer Logic, State Management & Terminal Streaming', () => {
    assert.ok(fs.existsSync(rendererPath), 'renderer.js must exist');
    const rendererContent = fs.readFileSync(rendererPath, 'utf8');

    // State management and log formatting
    assert.ok(rendererContent.includes('function logToTerminal'), 'Must implement logToTerminal stream parser');
    assert.ok(rendererContent.includes('function cancelAction'), 'Must implement cancellation call');
    assert.ok(rendererContent.includes('function updateCronUI'), 'Must handle Auto-Pilot UI states');
    assert.ok(rendererContent.includes('function renderSidebar'), 'Must dynamically render discovered services');
    assert.ok(rendererContent.includes('function runAction'), 'Must implement action runner');
  });
});
