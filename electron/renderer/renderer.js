let services = [];
let activeService = null;
let isRunning = false;
let isCronRunning = false;

// Initialize
async function init() {
  services = await window.api.getServices();
  renderSidebar();
  
  // Check cron status
  isCronRunning = await window.api.getCronStatus();
  updateCronUI(isCronRunning);
  
  window.api.onCronStatusChanged((status) => {
    isCronRunning = status;
    updateCronUI(status);
  });

  // Listen for backend logs
  window.api.onLog((data) => {
    logToTerminal(data.message, data.type);
  });
}

// Cron UI
async function toggleCron() {
  const listEl = document.getElementById('cron-services-list');
  listEl.innerHTML = '';
  
  services.forEach(service => {
    const label = document.createElement('label');
    label.className = 'flex items-center space-x-3 text-sm text-slate-300 cursor-pointer';
    label.innerHTML = `
      <input type="checkbox" value="${service.id}" class="form-checkbox h-4 w-4 text-indigo-500 rounded border-slate-600 bg-slate-900 focus:ring-indigo-500 focus:ring-offset-slate-900">
      <span>${service.icon} ${service.name}</span>
    `;
    listEl.appendChild(label);
  });
  
  showModal('cron-modal');
}

async function startCron() {
  let interval = document.getElementById('cron-freq').value;
  if (interval === 'custom') {
    const hours = document.getElementById('cron-custom').value || '24';
    interval = `${hours}h`;
  }
  
  const checkedBoxes = Array.from(document.querySelectorAll('#cron-services-list input:checked')).map(cb => cb.value);
  const selectedServices = checkedBoxes.length > 0 ? checkedBoxes.join(',') : '';
  
  hideModals();
  
  if (isCronRunning) await window.api.stopCron(); // stop existing if any
  
  const res = await window.api.startCron(interval, selectedServices);
  if (res.success) {
    isCronRunning = true;
    const srvText = selectedServices ? `for ${checkedBoxes.length} scrapers` : `for ALL scrapers`;
    logToTerminal(`> Auto-Pilot started (Interval: ${interval}) ${srvText}. Logs will appear here.`, 'info');
  } else {
    logToTerminal(`> Failed to start Auto-Pilot: ${res.error}`, 'error');
  }
  updateCronUI(isCronRunning);
}

async function stopCron() {
  hideModals();
  if (!isCronRunning) return;
  
  const res = await window.api.stopCron();
  if (res.success) {
    isCronRunning = false;
    logToTerminal(`> Auto-Pilot stopped.`, 'info');
  }
  updateCronUI(isCronRunning);
}

function updateCronUI(running) {
  const toggle = document.getElementById('cron-toggle');
  const knob = document.getElementById('cron-knob');
  const label = document.getElementById('cron-label');
  
  if (running) {
    toggle.classList.remove('bg-slate-700');
    toggle.classList.add('bg-emerald-500');
    knob.classList.remove('translate-x-1');
    knob.classList.add('translate-x-5');
    label.innerText = 'Auto-Pilot: ON';
    label.classList.add('text-emerald-400');
  } else {
    toggle.classList.add('bg-slate-700');
    toggle.classList.remove('bg-emerald-500');
    knob.classList.add('translate-x-1');
    knob.classList.remove('translate-x-5');
    label.innerText = 'Auto-Pilot: OFF';
    label.classList.remove('text-emerald-400');
  }
}

function renderSidebar() {
  const listEl = document.getElementById('services-list');
  listEl.innerHTML = '';
  
  services.forEach(service => {
    if (service.id === 'email') {
      const hasProviders = service.providers && service.providers.length > 0;
      
      const mainBtn = document.createElement('button');
      mainBtn.className = `w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors mb-1 ${hasProviders ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-slate-600 cursor-not-allowed opacity-60'}`;
      mainBtn.innerHTML = `<span class="mr-3">📧</span> ${service.name}`;
      
      if (hasProviders) {
        mainBtn.onclick = () => selectService({ id: service.id, name: service.name, icon: '📧' }, mainBtn);
      }
      listEl.appendChild(mainBtn);

      if (hasProviders) {
        service.providers.forEach(prov => {
          const btn = document.createElement('button');
          btn.className = 'w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors pl-10 mb-1';
          btn.innerHTML = `<span class="mr-2">${prov.icon || '📩'}</span> ${prov.name}`;
          btn.onclick = () => selectService({ id: 'email', subId: prov.id, name: prov.name, icon: prov.icon || '📩' }, btn);
          listEl.appendChild(btn);
        });
      }

      
    } else {
      const btn = document.createElement('button');
      btn.className = 'w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors';
      btn.innerHTML = `<span class="mr-3">${service.icon}</span> ${service.name}`;
      btn.onclick = () => selectService({ id: service.id, name: service.name, icon: service.icon }, btn);
      listEl.appendChild(btn);
    }
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
  const displayName = activeService?.subId ? activeService.name : targetId;
  logToTerminal(`\n> Executing: ${action} on ${displayName}...`, 'info');
  
  const params = activeService?.subId ? { onlyProviderId: activeService.subId } : {};
  const res = await window.api.runAction({ serviceId: targetId, action, params });
  
  if (res.success) {
    logToTerminal(`> Completed ${action}.`, 'info');
  } else {
    logToTerminal(`> Failed: ${res.error}`, 'error');
  }
  setLoader(false);
}

async function promptYearAndDownload() {
  if (isRunning || !activeService) return;
  
  // Set default to current year
  document.getElementById('dl-year').value = new Date().getFullYear();
  showModal('year-modal');
}

async function executeDownloadYear() {
  const year = document.getElementById('dl-year').value;
  hideModals();
  
  if (!year) return;
  
  setLoader(true);
  const displayName = activeService?.subId ? activeService.name : activeService.id;
  logToTerminal(`\n> Downloading data for year ${year} (${displayName})...`, 'info');
  
  const params = { year };
  if (activeService?.subId) params.onlyProviderId = activeService.subId;
  
  const res = await window.api.runAction({ serviceId: activeService.id, action: 'download_year', params });
  
  if (!res.success) logToTerminal(`> Failed: ${res.error}`, 'error');
  setLoader(false);
}

async function promptRangeAndDownload() {
  if (isRunning || !activeService) return;
  
  const date = new Date();
  document.getElementById('dl-start').value = `${date.getFullYear()}-01-01`;
  document.getElementById('dl-end').value = date.toISOString().slice(0, 10);
  
  showModal('range-modal');
}

async function executeDownloadRange() {
  const startDate = document.getElementById('dl-start').value;
  const endDate = document.getElementById('dl-end').value;
  hideModals();
  
  if (!startDate || !endDate) return;
  
  setLoader(true);
  const displayName = activeService?.subId ? activeService.name : activeService.id;
  logToTerminal(`\n> Downloading data from ${startDate} to ${endDate} (${displayName})...`, 'info');
  
  const params = { startDate, endDate };
  if (activeService?.subId) params.onlyProviderId = activeService.subId;
  
  const res = await window.api.runAction({ serviceId: activeService.id, action: 'download_range', params });
  
  if (!res.success) logToTerminal(`> Failed: ${res.error}`, 'error');
  setLoader(false);
}

// Modal Logic
function showModal(id) {
  document.getElementById('modal-backdrop').classList.remove('hidden');
  // Use w-96 for large modals, w-80 for small modals
  document.querySelectorAll('.glass.w-96, .glass.w-80').forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function hideModals() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.querySelectorAll('.glass.w-96, .glass.w-80').forEach(el => el.classList.add('hidden'));
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

async function executeAppUpdate() {
  if (isRunning) return;
  showModal('update-modal');
  const res = await window.api.updateApp();
  hideModals();
  if (res.success) {
    logToTerminal(`\n> App updated successfully! Please restart the app.`, 'info');
  } else {
    logToTerminal(`\n> Update failed: ${res.error}`, 'error');
  }
}

async function createEmail() {
  const id = document.getElementById('ep-id').value;
  const displayName = document.getElementById('ep-name').value;
  const from = document.getElementById('ep-from').value;
  const subject = document.getElementById('ep-subj').value;
  if (!id || !displayName || !from) return alert('ID, Name, and Sender required');
  
  hideModals();
  const res = await window.api.createEmail({ id, displayName, from, subject });
  if (res.success) {
    // Refresh sidebar immediately
    services = await window.api.getServices();
    renderSidebar();
    
    logToTerminal(`> Email Provider '${displayName}' created!`, 'info');
    
    // Automatically perform a test scan
    const doTest = confirm(`Provider created! Do you want to run a test scan for '${displayName}' now?`);
    if (doTest) {
      setLoader(true);
      logToTerminal(`\n> Initiating Test Scan for ${displayName}...`, 'info');
      await window.api.runAction({ 
        serviceId: 'email', 
        action: 'scan', 
        params: { onlyProviderId: res.id } 
      });
      setLoader(false);
    }
  }
}

async function createScraper() {
  const id = document.getElementById('ws-id').value;
  const displayName = document.getElementById('ws-name').value;
  const authUrl = document.getElementById('ws-url').value;
  if (!id || !displayName || !authUrl) return alert('All fields required');
  
  hideModals();
  setLoader(true);
  const res = await window.api.createScraper({ id, displayName, authUrl });
  
  if (res.success) {
    services = await window.api.getServices();
    renderSidebar();
    logToTerminal(`> Web Scraper '${displayName}' scaffolded!`, 'info');
  } else {
    logToTerminal(`> Scaffold failed: ${res.error}`, 'error');
  }
  setLoader(false);
}

// Start
init();
