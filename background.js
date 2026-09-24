// background.js — service worker. Handles desktop notifications and
// triggers EmailJS sends when the content script reports new slots.

importScripts('emailjs-lite.js');

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'NEW_SLOTS_FOUND') {
    handleNewSlots(msg.newSlots);
  }
  if (msg.type === 'SESSION_EXPIRED') {
    chrome.notifications.create('session-expired', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'DVA Notifier — session expired',
      message: 'Please refresh the DVA booking tab and log in again.',
      priority: 2,
    });
  }
  if (msg.type === 'CHECK_COMPLETE') {
    chrome.storage.local.set({ lastCheck: msg });
  }
});

async function handleNewSlots(newSlots) {
  if (!newSlots || newSlots.length === 0) return;

  const grouped = {};
  newSlots.forEach(s => {
    if (!grouped[s.centre]) grouped[s.centre] = [];
    grouped[s.centre].push(s.date);
  });

  const summaryLines = Object.entries(grouped)
    .map(([centre, dates]) => `${centre}: ${dates.join(', ')}`)
    .join('\n');

  // Desktop notification
  chrome.notifications.create('new-slots-' + Date.now(), {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `DVA: ${newSlots.length} new slot${newSlots.length > 1 ? 's' : ''} found!`,
    message: summaryLines.slice(0, 200),
    priority: 2,
    requireInteraction: true,
  });

  // Update badge
  chrome.action.setBadgeText({ text: String(newSlots.length) });
  chrome.action.setBadgeBackgroundColor({ color: '#3B6D11' });

  // Email via EmailJS
  const settings = await new Promise(resolve =>
    chrome.storage.local.get(['ejsPub', 'ejsSvc', 'ejsTpl', 'notifyEmail'], resolve)
  );

  if (settings.ejsPub && settings.ejsSvc && settings.ejsTpl && settings.notifyEmail) {
    try {
      await sendEmailJS({
        publicKey: settings.ejsPub,
        serviceId: settings.ejsSvc,
        templateId: settings.ejsTpl,
        params: {
          to_email: settings.notifyEmail,
          subject: `DVA slot available — ${Object.keys(grouped).join(', ')}`,
          message: `New DVA practical test slots found:\n\n${summaryLines}\n\nBook via NIDirect.`,
          slots_html: newSlots
            .map(s => `<p><strong>${s.centre}</strong> &mdash; ${s.date}</p>`)
            .join(''),
        },
      });
      console.log('[DVA Notifier] Email sent');
    } catch (e) {
      console.error('[DVA Notifier] Email failed:', e.message);
    }
  }
}

chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.query({ url: 'https://dva-bookings.nidirect.gov.uk/*' }, tabs => {
    if (tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    }
  });
  chrome.action.setBadgeText({ text: '' });
});
