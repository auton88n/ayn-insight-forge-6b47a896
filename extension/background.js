// background.js — AYN Resume Tailor service worker
// Auth: device tokens via "Sign in with AYN" one-click flow.

const SUPABASE_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw';
const AYN_WEB = 'https://aynn.io';

// Open side panel when toolbar icon clicked
chrome.action.onClicked.addListener(tab => chrome.sidePanel.open({ tabId: tab.id }));
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

async function getToken() {
  const d = await chrome.storage.local.get(['ayn_token']);
  return d.ayn_token || null;
}

async function callFunction(action, body) {
  const token = await getToken();
  if (!token) throw new Error('Not signed in');
  const r = await fetch(`${SUPABASE_URL}/functions/v1/resume-hub`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'x-ayn-ext-token': token,
    },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) {
    if (r.status === 401) { await chrome.storage.local.remove('ayn_token'); }
    throw new Error(data.error || `HTTP ${r.status}`);
  }
  return data;
}

async function callPublic(action, body) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/resume-hub`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ action, ...body }),
  });
  return r.json().catch(() => ({}));
}

// Inject content script if not loaded
async function safeSendMessage(tabId, message) {
  const tryOnce = () => new Promise(resolve => {
    try {
      chrome.tabs.sendMessage(tabId, message, response => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response);
      });
    } catch { resolve(null); }
  });
  const direct = await tryOnce();
  if (direct !== null) return direct;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await new Promise(r => setTimeout(r, 300));
    return tryOnce();
  } catch { return null; }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ── Link flow: start ────────────────────────────────────────────
  if (message.type === 'LINK_START') {
    (async () => {
      try {
        const r = await callPublic('link_start', { device_label: message.deviceLabel || 'Chrome' });
        if (!r.code) { sendResponse({ ok: false, error: r.error || 'Could not start link' }); return; }
        const url = `${AYN_WEB}/extension/approve?code=${encodeURIComponent(r.code)}&name=${encodeURIComponent(message.deviceLabel || 'Chrome')}`;
        await chrome.tabs.create({ url });
        sendResponse({ ok: true, code: r.code });
      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }

  // ── Link flow: poll ─────────────────────────────────────────────
  if (message.type === 'LINK_POLL') {
    (async () => {
      try {
        const r = await callPublic('link_poll', { code: message.code });
        if (r.status === 'approved' && r.token) {
          await chrome.storage.local.set({ ayn_token: r.token });
        }
        sendResponse(r);
      } catch (e) { sendResponse({ status: 'error', error: e.message }); }
    })();
    return true;
  }

  // ── Sign out ───────────────────────────────────────────────────
  if (message.type === 'SIGN_OUT') {
    chrome.storage.local.remove(['ayn_token', 'savedResume'], () => sendResponse({ ok: true }));
    return true;
  }

  // ── Bootstrap (verify token, get user) ──────────────────────────
  if (message.type === 'BOOTSTRAP') {
    (async () => {
      try { sendResponse(await callFunction('ext_bootstrap', {})); }
      catch (e) { sendResponse({ error: e.message }); }
    })();
    return true;
  }

  // Generic edge-function passthrough for the side panel
  if (message.type === 'BG_FUNC') {
    (async () => {
      try {
        const data = await callFunction(message.action, message.payload || {});
        sendResponse({ ok: true, data });
      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }


  // Store detected job
  if (message.type === 'JOB_DETECTED') {
    chrome.storage.local.set({
      lastJobText: message.text, lastJobTitle: message.title,
      lastJobUrl: sender.tab?.url || '', lastJobCompany: message.company || '',
      detectedAt: Date.now(),
    }, () => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === 'GET_JOB') {
    chrome.storage.local.get(['lastJobText','lastJobTitle','lastJobUrl','lastJobCompany','detectedAt'], sendResponse);
    return true;
  }

  // Score a job card
  if (message.type === 'SCORE_JOB_CARD') {
    (async () => {
      try {
        const data = await callFunction('ext_job_score', {
          jobTitle: message.jobTitle, company: message.company, jobSnippet: message.jobSnippet,
        });
        sendResponse({
          score: data.score || 5, matchLabel: data.matchLabel || 'Fair',
          reasons: data.reasons || [], salaryEstimate: data.salaryEstimate || '',
          key: message.key,
        });
      } catch { sendResponse(null); }
    })();
    return true;
  }

  // Application tracker
  if (['SAVE_APPLICATION','GET_APPLICATIONS','UPDATE_APPLICATION'].includes(message.type)) {
    (async () => {
      try {
        const actionMap = {
          SAVE_APPLICATION: 'ext_save_application',
          GET_APPLICATIONS: 'ext_get_applications',
          UPDATE_APPLICATION: 'ext_update_application',
        };
        sendResponse(await callFunction(actionMap[message.type], message.payload || {}));
      } catch (e) { sendResponse({ error: e.message }); }
    })();
    return true;
  }

  // Suggest roles
  if (message.type === 'SUGGEST_ROLES') {
    (async () => {
      try { sendResponse(await callFunction('ext_suggest_roles', {})); }
      catch { sendResponse(null); }
    })();
    return true;
  }

  // Auto-autofill: scan + AI + inject
  if (message.type === 'AUTO_AUTOFILL') {
    (async () => {
      try {
        const tabId = message.tabId;
        if (!tabId) { sendResponse({ ok: false, error: 'No tab ID' }); return; }
        const token = await getToken();
        if (!token) { sendResponse({ ok: false, error: 'not_signed_in' }); return; }

        const scan = await safeSendMessage(tabId, { type: 'SCAN_FORM' });
        if (!scan) { sendResponse({ ok: false, error: 'no_content_script' }); return; }

        const fields = scan.fields || [];
        const jobText = scan.jobText || {};
        if (fields.length === 0) { sendResponse({ ok: false, error: 'no_fields' }); return; }

        const fillData = await callFunction('ext_autofill', {
          fields: fields.map(f => ({
            id: f.id, label: f.label, type: f.type,
            options: f.options, required: f.required, currentValue: f.currentValue,
          })),
          jobText: jobText?.text || '',
        });

        const values = (fillData.values || []).filter(v => v.value && v.value.trim());
        if (values.length === 0) { sendResponse({ ok: false, error: 'no_values' }); return; }

        await safeSendMessage(tabId, { type: 'HIGHLIGHT_FIELDS', fieldIds: values.map(v => v.id) });
        await new Promise(r => setTimeout(r, 400));

        const fillResult = await safeSendMessage(tabId, { type: 'INJECT_VALUES', values });
        const resultMap = {};
        (fillResult?.results || []).forEach(r => { resultMap[r.id] = r; });
        const details = values.map(v => ({
          id: v.id,
          label: fields.find(f => f.id === v.id)?.label || v.id,
          value: v.value,
          ok: resultMap[v.id]?.ok || false,
          reason: resultMap[v.id]?.reason || '',
        }));

        sendResponse({ ok: true, filled: fillResult?.filled || 0, total: values.length, details });
      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }
});
