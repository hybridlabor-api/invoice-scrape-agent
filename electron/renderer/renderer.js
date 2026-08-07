let activeService = null;
let isRunning = false;

// Initialize
async function init() {
  const services = await window.api.getServices();
  const listEl = document.getElementById('services-list');
  
  services.forEach(service => {
    const btn = document.createElement('button');
    btn.className = 'w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors';
    btn.innerHTML = `<span class="mr-3">${service.icon}</span> ${service.name}`;
    btn.onclick = () => selectService(service, btn);
    listEl.appendChild(btn);
  });

  // Listen for backend logs
  window.api.onLog((data) => {
    logToTerminal(data.message, data.type);
  });
}

function selectService(service, btnEl) {
  if (isRunning) return;
  activeService = service;
  
  // Highlight active button
  document.querySelectorAll('#services-list button').forEach(b => {
    b.classList.remove('bg-indigo-500/20', 'text-indigo-400');
    b.classList.add('text-slate-300');
  });
  btnEl.classList.remove('text-slate-300');
  btnEl.classList.add('bg-indigo-500/20', 'text-indigo-400');

  // Update Main Area
  document.getElementById('active-icon').textContent = service.icon;
  document.getElementById('active-title').textContent = service.name;
  document.getElementById('active-desc').textContent = 'Select an operation to perform for this service.';
  document.getElementById('action-grid').classList.remove('hidden');
}

function logToTerminal(msg, type = 'info') {
  const terminal = document.getElementById('terminal');
  const span = document.createElement('span');
  
  if (type === 'error') {
    span.className = 'text-rose-400';
  } else if (msg.includes('✅')) {
    span.className = 'text-emerald-400';
  } else if (msg.includes('⚠️')) {
    span.className = 'text-amber-400';
  }
  
  span.textContent = msg + '\n';
  terminal.appendChild(span);
  terminal.scrollTop = terminal.scrollHeight;
}

function setLoader(state) {
  isRunning = state;
  const loader = document.getElementById('loader');
  if (state) {
    loader.classList.remove('hidden');
    document.getElementById('action-grid').style.opacity = '0.5';
    document.getElementById('action-grid').style.pointerEvents = 'none';
  } else {
    loader.classList.add('hidden');
    document.getElementById('action-grid').style.opacity = '1';
    document.getElementById('action-grid').style.pointerEvents = 'auto';
  }
}

async function runAction(action, directServiceId = null) {
  if (isRunning) return;
  const targetId = directServiceId || (activeService ? activeService.id : null);
  if (!targetId) return;

  setLoader(true);
  logToTerminal(`\n> Executing: ${action} on ${targetId}...`, 'info');
  
  const res = await window.api.runAction({ serviceId: targetId, action, params: {} });
  
  if (res.success) {
    logToTerminal(`> Completed ${action}.`, 'info');
  } else {
    logToTerminal(`> Failed: ${res.error}`, 'error');
  }
  setLoader(false);
}

async function promptYearAndDownload() {
  if (isRunning || !activeService) return;
  // A proper GUI would use a modal, but for a quick Electron wrapper we can use a native prompt if available, 
  // or just default to current year for the MVP.
  // We will just default to the current year to avoid complex modals in this rapid build.
  const year = new Date().getFullYear().toString();
  
  setLoader(true);
  logToTerminal(`\n> Downloading data for year ${year}...`, 'info');
  const res = await window.api.runAction({ serviceId: activeService.id, action: 'download_year', params: { year } });
  
  if (!res.success) logToTerminal(`> Failed: ${res.error}`, 'error');
  setLoader(false);
}

// Modal Logic
function showModal(id) {
  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.querySelectorAll('.glass.w-96').forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function hideModals() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.querySelectorAll('.glass.w-96').forEach(el => el.classList.add('hidden'));
}

async function saveImap() {
  const host = document.getElementById('imap-host').value;
  const user = document.getElementById('imap-user').value;
  const pass = document.getElementById('imap-pass').value;
  if (!host || !user || !pass) return alert('All fields required');
  
  hideModals();
  const res = await window.api.saveImap({ host, user, pass });
  if (res.success) logToTerminal('> IMAP Credentials saved successfully.', 'info');
}

async function createEmail() {
  const id = document.getElementById('ep-id').value;
  const displayName = document.getElementById('ep-name').value;
  const from = document.getElementById('ep-from').value;
  const subject = document.getElementById('ep-subj').value;
  if (!id || !displayName || !from) return alert('ID, Name, and Sender required');
  
  hideModals();
  const res = await window.api.createEmail({ id, displayName, from, subject });
  if (res.success) logToTerminal(`> Email Provider '${displayName}' created! Restart app to see it.`, 'info');
}

async function createScraper() {
  const id = document.getElementById('ws-id').value;
  const displayName = document.getElementById('ws-name').value;
  const authUrl = document.getElementById('ws-url').value;
  if (!id || !displayName || !authUrl) return alert('All fields required');
  
  hideModals();
  setLoader(true);
  const res = await window.api.createScraper({ id, displayName, authUrl });
  setLoader(false);
  
  if (res.success) logToTerminal(`> Web Scraper '${displayName}' scaffolded! Restart app to see it.`, 'info');
  else logToTerminal(`> Scaffold failed: ${res.error}`, 'error');
}

// Start
init();
