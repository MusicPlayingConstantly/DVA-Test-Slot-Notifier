# DVA Test Slot Notifier — Browser Extension

Monitors NIDirect for new DVA practical driving test slots while you're logged in normally, and alerts you (desktop notification + optional email) the moment a new date appears.

## Why an extension instead of the standalone app?

The DVA booking site is protected by a bot-detection firewall (WAF) that blocks automated server-side requests — even with valid cookies copy-pasted in. This extension runs entirely inside your real browser tab, using the page's own session, so every request looks exactly like normal browsing. There's nothing to bypass or fake.

---

## Install (Chrome / Edge / Brave)

1. Unzip this folder somewhere permanent (don't delete it after installing — Chrome loads the extension from this folder each time).
2. Go to `chrome://extensions` (or `edge://extensions`)
3. Turn on **Developer mode** (toggle, top right)
4. Click **Load unpacked**
5. Select this `dva-extension` folder
6. The extension icon will appear in your toolbar

---

## Use it

1. Log in to NIDirect and open the DVA practical test booking page:
   `https://dva-bookings.nidirect.gov.uk/BookDriver/DriverAppointment`
2. **Pin this tab** (right-click the tab → Pin) so it stays open
3. Click the extension icon in your toolbar
4. Tick the test centres you want to monitor — they're pulled directly from the page's own dropdown
5. (Optional) Fill in your EmailJS details under "Email alerts" if you also want emails, not just desktop notifications
6. Click **Start monitoring**

The extension will recheck on the schedule you set (5–60 minutes) for as long as that tab stays open. New slots trigger:
- A desktop notification
- A badge count on the extension icon
- An email (if EmailJS is configured)

---

## EmailJS setup (optional)

If you want emails as well as desktop notifications:

1. Sign up free at [emailjs.com](https://emailjs.com)
2. Create an Email Service (e.g. connect your Gmail)
3. Create an Email Template using these variables: `{{to_email}}`, `{{subject}}`, `{{message}}`, `{{slots_html}}`
4. Copy your Public Key, Service ID, and Template ID into the extension popup

---

## Important notes

- **The DVA tab must stay open** (pinned is fine, minimized window is fine, but the browser itself must be running)
- **Don't close your laptop / let it sleep** — checks won't run while the computer is asleep
- If your session expires, you'll get a notification asking you to refresh and log in again
- This only reads availability — it does not book anything automatically

---

## Files

```
dva-extension/
├── manifest.json       # Extension config
├── background.js       # Notifications + email sending
├── content.js          # Runs inside the DVA tab, does the actual checking
├── emailjs-lite.js      # Minimal EmailJS REST client
├── popup.html           # Extension popup UI
├── popup.js              # Popup logic
└── icons/                # Toolbar icons
```

---

## Troubleshooting

**"No DVA tab open" in the popup**
Open the booking page in a tab first, then reopen the popup.

**Centres list is empty**
Refresh the DVA booking tab, wait for it to fully load, then reopen the popup.

**Notifications not appearing**
Check your OS notification settings — make sure Chrome/Edge is allowed to show notifications.

**"Session expired" notification**
Your NIDirect login timed out. Refresh the tab, log in again, and monitoring will pick back up automatically.
