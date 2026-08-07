#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');

const electronPath = require('electron');
const appPath = path.join(__dirname, '..', 'electron', 'main.js');

const child = spawn(electronPath, [appPath], {
  stdio: 'inherit',
  windowsHide: false
});

child.on('close', (code) => {
  process.exit(code);
});
