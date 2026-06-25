// background.js — AYN Resume Tailor service worker

const SUPABASE_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw';

// Open side panel when toolbar icon clicked
chrome.action.onClicked.addListener(tab => chrome.sidePanel.open({ tabId: tab.id }));
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Get stored session
async function getSession() {
  const data = await chrome.storage.local.get(['session']);
  return data.session || null;
}

async function refreshIfNeeded(session) {
  if (!session) return null;
  const expiresAt = (session.expires_at || 0) * 1000;
  if (Date.now() < expiresAt - 60000) return session;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const data = await res.json();
    if (data.access_token) {
      const refreshed = { ...session, ...data };
      await chrome.storage.local.set({ session: refreshed });
      return refreshed;
    }
  } catch {}
  return null;
}

async function callFunction(action, body, session) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/resume-hub`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...body }),
  });
  return res.json();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Store detected job text
  if (message.type === 'JOB_DETECTED') {
    chrome.storage.local.set({
      lastJobText: message.text,
      lastJobTitle: message.title,
      lastJobUrl: sender.tab?.url || '',
      lastJobCompany: message.company || '',
      detectedAt: Date.now(),
    }, () => sendResponse({ ok: true }));
    return true;
  }

  // Return stored job
  if (message.type === 'GET_JOB') {
    chrome.storage.local.get(['lastJobText','lastJobTitle','lastJobUrl','lastJobCompany','detectedAt'], sendResponse);
    return true;
  }

  // Score a job card — called from content script, needs auth
  if (message.type === 'SCORE_JOB_CARD') {
    (async () => {
      try {
        let session = await getSession();
        if (!session) { sendResponse(null); return; }
        session = await refreshIfNeeded(session);
        if (!session) { sendResponse(null); return; }

        const data = await callFunction('ext_job_score', {
          jobTitle: message.jobTitle,
          company: message.company,
          jobSnippet: message.jobSnippet,
        }, session);

        sendResponse({
          score: data.score || 5,
          matchLabel: data.matchLabel || 'Fair',
          reasons: data.reasons || [],
          key: message.key,
        });
      } catch (e) {
        sendResponse(null);
      }
    })();
    return true; // keep channel open for async
  }

  // Auto-autofill: scan + fill in one shot, no preview
  if (message.type === 'AUTO_AUTOFILL') {
    (async () => {
      try {
        const tabId = sender.tab?.id;
        if (!tabId) { sendResponse({ ok: false, error: 'No tab' }); return; }

        let session = await getSession();
        if (!session) { sendResponse({ ok: false, error: 'Not signed in' }); return; }
        session = await refreshIfNeeded(session);
        if (!session) { sendResponse({ ok: false, error: 'Session expired' }); return; }

        // 1. Scan the form
        const scan = await chrome.tabs.sendMessage(tabId, { type: 'SCAN_FORM' });
        const { fields = [], jobText = {} } = scan || {};
        if (fields.length === 0) { sendResponse({ ok: false, error: 'No fields found' }); return; }

        // 2. Get AI values
        const fillData = await callFunction('ext_autofill', {
          fields: fields.map(f => ({ id: f.id, label: f.label, type: f.type, options: f.options, required: f.required, currentValue: f.currentValue })),
          jobText: jobText?.text || '',
        }, session);

        const values = (fillData.values || []).filter(v => v.value && v.value.trim());
        if (values.length === 0) { sendResponse({ ok: false, error: 'No values to fill' }); return; }

        // 3. Highlight briefly
        await chrome.tabs.sendMessage(tabId, { type: 'HIGHLIGHT_FIELDS', fieldIds: values.map(v => v.id) });
        await new Promise(r => setTimeout(r, 400));

        // 4. Inject values
        const fillResult = await chrome.tabs.sendMessage(tabId, { type: 'INJECT_VALUES', values });

        sendResponse({ ok: true, filled: fillResult?.filled || 0, total: values.length });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  // Suggest roles: call edge function and return
  if (message.type === 'SUGGEST_ROLES') {
    (async () => {
      try {
        let session = await getSession();
        if (!session) { sendResponse(null); return; }
        session = await refreshIfNeeded(session);
        if (!session) { sendResponse(null); return; }
        const data = await callFunction('ext_suggest_roles', {}, session);
        sendResponse(data);
      } catch { sendResponse(null); }
    })();
    return true;
  }
});
