// handoff-hydrate.js — AYN handoff toast (v1.9.55)
// Runs on every page (top frame only). If a pending handoff URL matches the
// current page, shows a lightweight toast and clears the pending record.
// Avoids editing content.js so this is completely additive.
(function () {
  'use strict';
  try {
    if (window.top !== window) return;
    if (window.__AYN_HANDOFF_HYDRATED__) return;
    window.__AYN_HANDOFF_HYDRATED__ = true;
    chrome.storage.local.get(['ayn:pendingHandoff'], (data) => {
      const h = data && data['ayn:pendingHandoff'];
      if (!h || !h.targetUrl) return;
      // Match if origin+pathname line up (query/hash may differ post-redirect)
      let ok = false;
      try {
        const a = new URL(h.targetUrl);
        const b = new URL(location.href);
        ok = a.origin === b.origin && (a.pathname === b.pathname || b.pathname.startsWith(a.pathname));
      } catch { ok = false; }
      // Expire after 5 minutes regardless
      if (Date.now() - (h.ts || 0) > 5 * 60 * 1000) {
        chrome.storage.local.remove('ayn:pendingHandoff');
        return;
      }
      if (!ok) return;
      chrome.storage.local.remove('ayn:pendingHandoff');
      // Ask the sidepanel to preselect the resume, then show a toast.
      try {
        chrome.runtime.sendMessage(
          { type: 'HANDOFF_ARRIVED', targetUrl: h.targetUrl, resumeId: h.resumeId || '' },
          () => void chrome.runtime.lastError,
        );
      } catch {}
      showToast('AYN: context restored. Open the side panel to autofill.');
    });

    function showToast(msg) {
      try {
        const d = document.createElement('div');
        d.textContent = msg;
        d.setAttribute('role', 'status');
        Object.assign(d.style, {
          position: 'fixed', right: '16px', bottom: '16px', zIndex: 2147483647,
          background: '#0b0b0f', color: '#fff', padding: '10px 14px',
          font: '500 13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.35)',
          border: '1px solid rgba(251,146,60,.5)', maxWidth: '320px',
        });
        (document.body || document.documentElement).appendChild(d);
        setTimeout(() => { try { d.remove(); } catch {} }, 6000);
      } catch {}
    }
  } catch (_) { /* ignore */ }
})();
