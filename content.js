// content.js — runs inside the real, logged-in DVA booking tab.
// Because this executes in the actual browser context, every fetch()
// call here carries real cookies, real TLS fingerprint, and passes
// the WAF challenge naturally (no server-side scraping involved).

(function () {
  const CHECK_INTERVAL_MS = 5 * 60 * 1000; // default 5 min, overridden by storage
  let centreMap = {};
  let pollTimer = null;

  function log(...args) {
    console.log('[DVA Notifier]', ...args);
  }

  // --- Extract centre dropdown options from the live page ---
  function extractCentreMap() {
    const select = document.querySelector('select#selectedTestCentre, select[name="SelectedTestCentre"], select');
    const map = {};
    if (!select) return map;
    [...select.options].forEach(opt => {
      const id = opt.value;
      const name = opt.textContent.trim().split(/\s{2,}|\t/)[0].toUpperCase(); // strip trailing date text
      if (id && name) map[name] = id;
    });
    return map;
  }

  // --- Format a JS Date as DD/MM/YYYY 00:00:00 (DVA's expected format) ---
  function formatDate(d) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year} 00:00:00`;
  }

  // --- Call the real SearchDays endpoint, using the page's own session ---
  async function searchDays(centreId, startDate) {
    const body = new URLSearchParams({
      SelectedTestCentre: centreId,
      FirstAvailableDate: startDate,
      StartDate: startDate,
      NumberOfDays: 5,
    });

    const res = await fetch('/BookDriver/DriverAppointment/SearchDays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      credentials: 'same-origin', // browser attaches real session cookies automatically
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();

    if (html.toLowerCase().includes('sign in') || html.toLowerCase().includes('sign-in')) {
      throw new Error('Session expired — please log in again');
    }

    const dates = [];
    const dateRegex = /class="day day-input"[^>]*data-date="([^"]+)"/g;
    let m;
    while ((m = dateRegex.exec(html)) !== null) dates.push(m[1]);
    return dates;
  }

  // --- Search N weeks ahead for one centre ---
  async function searchCentreAhead(centreId, weeksAhead) {
    const allDates = new Set();
    let cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    const totalDays = weeksAhead * 7;
    let daysCovered = 0;

    while (daysCovered < totalDays) {
      const startStr = formatDate(cursor);
      try {
        const dates = await searchDays(centreId, startStr);
        dates.forEach(d => allDates.add(d));
      } catch (e) {
        log('Search error for centre', centreId, e.message);
        if (e.message.includes('Session expired')) throw e;
      }
      cursor.setDate(cursor.getDate() + 5);
      daysCovered += 5;
      await new Promise(r => setTimeout(r, 400)); // small delay, be polite to the server
    }

    return [...allDates];
  }

  // --- Load settings from chrome.storage ---
  async function getSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get(
        ['selectedCentres', 'weeksAhead', 'checkIntervalMin', 'knownSlots', 'monitoring'],
        data => resolve(data)
      );
    });
  }

  async function setKnownSlots(known) {
    return new Promise(resolve => {
      chrome.storage.local.set({ knownSlots: known }, resolve);
    });
  }

  // --- Main check cycle ---
  async function runCheck() {
    const settings = await getSettings();
    if (!settings.monitoring) return;

    centreMap = extractCentreMap();
    if (Object.keys(centreMap).length === 0) {
      log('No centre dropdown found on this page yet — retrying next cycle');
      return;
    }

    const selected = settings.selectedCentres || [];
    const weeksAhead = settings.weeksAhead || 8;
    const known = settings.knownSlots || {};
    const results = [];
    const newSlots = [];

    for (const centreName of selected) {
      const centreId = centreMap[centreName.toUpperCase()];
      if (!centreId) {
        log('Centre not found on page:', centreName);
        continue;
      }
      try {
        const dates = await searchCentreAhead(centreId, weeksAhead);
        const key = centreName.toUpperCase();
        const knownForCentre = new Set(known[key] || []);
        const fresh = dates.filter(d => !knownForCentre.has(d));

        fresh.forEach(d => newSlots.push({ centre: centreName, date: d }));
        known[key] = dates; // update known set
        results.push({ centre: centreName, dates, newCount: fresh.length });

      } catch (e) {
        if (e.message.includes('Session expired')) {
          chrome.runtime.sendMessage({ type: 'SESSION_EXPIRED' });
          return;
        }
        log('Error checking', centreName, e.message);
      }
    }

    await setKnownSlots(known);
    chrome.runtime.sendMessage({
      type: 'CHECK_COMPLETE',
      results,
      newSlots,
      timestamp: Date.now(),
    });

    if (newSlots.length > 0) {
      chrome.runtime.sendMessage({ type: 'NEW_SLOTS_FOUND', newSlots });
    }
  }

  // --- Listen for manual trigger from popup ---
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'RUN_CHECK_NOW') {
      runCheck().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg.type === 'GET_CENTRE_LIST') {
      centreMap = extractCentreMap();
      sendResponse({ centres: Object.keys(centreMap) });
      return true;
    }
  });

  // --- Set up periodic polling while this tab stays open ---
  async function init() {
    const settings = await getSettings();
    const intervalMin = settings.checkIntervalMin || 5;
    log('Content script loaded. Polling every', intervalMin, 'minutes.');

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(runCheck, intervalMin * 60 * 1000);

    // Run once shortly after load (page needs a moment to render the dropdown)
    setTimeout(runCheck, 3000);
  }

  init();
})();
