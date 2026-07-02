// deep-link.js — AYN handoff bridge (v1.9.55)
// Runs on https://aynn.io/handoff* and lovable.app/handoff*. Reads
//   ?job=<encoded url>&resume=<id>
// stores it into chrome.storage.local, then navigates the tab to the target
// job URL so content.js / handoff-hydrate.js can restore context.
(function () {
  'use strict';
  try {
    const p = new URLSearchParams(location.search);
    const job = p.get('job');
    const resumeId = p.get('resume') || '';
    if (!job) return;
    let targetUrl = '';
    try { targetUrl = new URL(job).toString(); } catch { return; }
    const payload = { targetUrl, resumeId, ts: Date.now() };
    chrome.storage.local.set({ 'ayn:pendingHandoff': payload }, () => {
      try { location.replace(targetUrl); } catch { location.href = targetUrl; }
    });
  } catch (_) { /* ignore */ }
})();
