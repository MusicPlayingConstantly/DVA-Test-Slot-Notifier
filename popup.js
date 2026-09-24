// popup.js — extension popup UI logic

const els = {
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  centresBox: document.getElementById('centresBox'),
  intervalSelect: document.getElementById('intervalSelect'),
  weeksSelect: document.getElementById('weeksSelect'),
  ejsPub: document.getElementById('ejsPub'),
  ejsSvc: document.getElementById('ejsSvc'),
  ejsTpl: document.getElementById('ejsTpl'),
  notifyEmail: document.getElementById('notifyEmail'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  checkNowBtn: document.getElementById('checkNowBtn'),
  logBox: document.getElementById('logBox'),
};

function logLine(msg) {
  const t = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const line = document.createElement('div');
  line.textContent = `${t}  ${msg}`;
  if (els.logBox.textContent === 'No checks run yet.') els.logBox.textContent = '';
  els.logBox.prepend(line);
}

async function getDvaTab() {
  const tabs = await chrome.tabs.query({ url: 'https://dva-bookings.nidirect.gov.uk/*' });
  return tabs[0] || null;
}

async function loadCentresFromPage() {
  const tab = await getDvaTab();
  if (!tab) {
    els.statusDot.className = 'dot bad';
    els.statusText.textContent = 'No DVA tab open — open the booking page first';
    return [];
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CENTRE_LIST' });
    if (response && response.centres) {
      els.statusDot.className = 'dot on';
      els.statusText.textContent = `Connected — ${response.centres.length} centres found`;
      return response.centres;
    }
  } catch (e) {
    els.statusDot.className = 'dot bad';
    els.statusText.textContent = 'Tab found but not responding — try refreshing it';
  }
  return [];
}

function renderCentres(centreNames, selected) {
  if (centreNames.length === 0) {
    els.centresBox.innerHTML = '<div class="hint">Open the DVA booking page first — centres load from the page\'s own dropdown.</div>';
    return;
  }
  els.centresBox.innerHTML = '';
  centreNames.forEach(name => {
    const row = document.createElement('label');
    row.className = 'centre-row';
    const checked = selected.includes(name) ? 'checked' : '';
    row.innerHTML = `<input type="checkbox" value="${name}" ${checked}/> ${name}`;
    row.querySelector('input').addEventListener('change', saveSelectedCentres);
    els.centresBox.appendChild(row);
  });
}

function getSelectedCentres() {
  return [...els.centresBox.querySelectorAll('input:checked')].map(i => i.value);
}

async function saveSelectedCentres() {
  const selected = getSelectedCentres();
  chrome.storage.local.set({ selectedCentres: selected });
}

async function saveSettings() {
  chrome.storage.local.set({
    checkIntervalMin: parseInt(els.intervalSelect.value),
    weeksAhead: parseInt(els.weeksSelect.value),
    ejsPub: els.ejsPub.value.trim(),
    ejsSvc: els.ejsSvc.value.trim(),
    ejsTpl: els.ejsTpl.value.trim(),
    notifyEmail: els.notifyEmail.value.trim(),
  });
}

async function loadSettings() {
  const data = await new Promise(resolve =>
    chrome.storage.local.get(
      ['selectedCentres', 'checkIntervalMin', 'weeksAhead', 'ejsPub', 'ejsSvc', 'ejsTpl', 'notifyEmail', 'monitoring'],
      resolve
    )
  );

  if (data.checkIntervalMin) els.intervalSelect.value = data.checkIntervalMin;
  if (data.weeksAhead) els.weeksSelect.value = data.weeksAhead;
  if (data.ejsPub) els.ejsPub.value = data.ejsPub;
  if (data.ejsSvc) els.ejsSvc.value = data.ejsSvc;
  if (data.ejsTpl) els.ejsTpl.value = data.ejsTpl;
  if (data.notifyEmail) els.notifyEmail.value = data.notifyEmail;

  const centreNames = await loadCentresFromPage();
  renderCentres(centreNames, data.selectedCentres || []);

  if (data.monitoring) {
    els.startBtn.style.display = 'none';
    els.stopBtn.style.display = 'block';
  }

  // Show last check info if available
  const last = await new Promise(resolve => chrome.storage.local.get(['lastCheck'], resolve));
  if (last.lastCheck) {
    const { results, timestamp } = last.lastCheck;
    const t = new Date(timestamp).toLocaleTimeString('en-GB', { hour12: false });
    (results || []).forEach(r => {
      logLine(`${r.centre}: ${r.dates.length} slot(s)${r.newCount ? ', ' + r.newCount + ' new' : ''}`);
    });
  }
}

els.intervalSelect.addEventListener('change', saveSettings);
els.weeksSelect.addEventListener('change', saveSettings);
[els.ejsPub, els.ejsSvc, els.ejsTpl, els.notifyEmail].forEach(el =>
  el.addEventListener('input', saveSettings)
);

els.startBtn.addEventListener('click', async () => {
  await saveSettings();
  await saveSelectedCentres();
  chrome.storage.local.set({ monitoring: true });
  els.startBtn.style.display = 'none';
  els.stopBtn.style.display = 'block';
  logLine('Monitoring started');
  triggerCheck();
});

els.stopBtn.addEventListener('click', () => {
  chrome.storage.local.set({ monitoring: false });
  els.startBtn.style.display = 'block';
  els.stopBtn.style.display = 'none';
  logLine('Monitoring stopped');
});

async function triggerCheck() {
  const tab = await getDvaTab();
  if (!tab) {
    logLine('No DVA tab open');
    return;
  }
  logLine('Checking…');
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'RUN_CHECK_NOW' });
    setTimeout(async () => {
      const last = await new Promise(resolve => chrome.storage.local.get(['lastCheck'], resolve));
      if (last.lastCheck) {
        (last.lastCheck.results || []).forEach(r => {
          logLine(`${r.centre}: ${r.dates.length} slot(s)${r.newCount ? ', ' + r.newCount + ' new' : ''}`);
        });
      }
    }, 2000);
  } catch (e) {
    logLine('Error: ' + e.message);
  }
}

els.checkNowBtn.addEventListener('click', triggerCheck);

loadSettings();
