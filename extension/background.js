// background.js — AYN Resume Tailor service worker
// Auth: device tokens via "Sign in with AYN" one-click flow.

const SUPABASE_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw';
const AYN_WEB = 'https://aynn.io';

// Open side panel when toolbar icon clicked
chrome.action.onClicked.addListener(tab => chrome.sidePanel.open({ tabId: tab.id }));
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// PART B: per-tab form-detection cache (tabId → { hasForm, fieldCount, hasResumeUpload, url, ts })
const FORM_CACHE = new Map();
chrome.tabs.onRemoved.addListener(tabId => FORM_CACHE.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.url) FORM_CACHE.delete(tabId); });

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
    // Do NOT wipe ayn_token on 401. A single spurious 401 must never
    // destroy the stored session; sidepanel verifies via ext_bootstrap
    // before deciding to sign out.
    const err = new Error(data.error || `HTTP ${r.status}`);
    if (r.status === 401) err.status = 401;
    throw err;
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

  if (message.type === 'FETCH_URL_TEXT') {
    (async () => {
      try {
        const resp = await fetch(message.url, { credentials: 'omit' });
        const text = await resp.text();
        sendResponse({ ok: true, text: text.slice(0, 200000) });
      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }

  // ── Vision fallback (v1.9.30, Phase 3) ─────────────────────────
  if (message.type === 'AYN_VISION_FILL') {
    (async () => {
      let dataUrl = (message.image && typeof message.image === 'string' && message.image.startsWith('data:image/')) ? message.image : null;
      let captureError = '';
      if (!dataUrl) {
        try { dataUrl = await chrome.tabs.captureVisibleTab(sender?.tab?.windowId ?? undefined, { format: 'png' }); }
        catch (e) { captureError = String((e && e.message) || 'capture failed'); }
      }
      if (!dataUrl) {
        sendResponse({ ok: false, decisions: [], diag: { captured: false, captureError: captureError || 'no image', backendError: '', decisionsCount: 0 } });
        return;
      }

      try {
        const resp = await callFunction('ext_vision_fill', {
          image: dataUrl,
          candidates: message.candidates || [],
          url: message.url || '',
          jobTitle: message.jobTitle || '',
          company: message.company || '',
        });
        const decisions = resp?.decisions || [];
        sendResponse({ ok: true, decisions, diag: { captured: true, captureError: '', backendError: '', decisionsCount: decisions.length } });
      } catch (e) {
        sendResponse({ ok: false, decisions: [], diag: { captured: true, captureError: '', backendError: String((e && e.message) || 'backend failed'), decisionsCount: 0 } });
      }
    })();
    return true;
  }



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

  // ── Sign out (wipe ALL local data for privacy) ─────────────────
  if (message.type === 'SIGN_OUT') {
    chrome.storage.local.clear(() => sendResponse({ ok: true }));
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

  // v1.9.7: relay a message to a tab and auto-inject content.js if missing.
  if (message.type === 'TAB_SEND') {
    (async () => {
      const tabId = message.tabId;
      const payload = message.payload || {};
      if (tabId == null) { sendResponse(null); return; }
      const r = await safeSendMessage(tabId, payload);
      sendResponse(r);
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

  // PART B: cache form-detected events per tab so the sidepanel reads them instantly
  if (message.type === 'FORM_DETECTED') {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      FORM_CACHE.set(tabId, {
        hasForm: !!message.hasForm,
        fieldCount: message.fieldCount || 0,
        hasResumeUpload: !!message.hasResumeUpload,
        url: message.url || sender.tab?.url || '',
        ts: Date.now(),
      });
      // Notify any open sidepanel
      try { chrome.runtime.sendMessage({ type: 'FORM_DETECTED_PUSH', tabId, ...FORM_CACHE.get(tabId) }, () => void chrome.runtime.lastError); } catch {}
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'GET_FORM_DETECTED') {
    const tabId = message.tabId;
    const v = tabId != null ? FORM_CACHE.get(tabId) : null;
    sendResponse(v || null);
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

  // v1.4.0: Auto-tracker — content script tells us the user submitted the form
  if (message.type === 'AUTO_TRACK_SUBMIT') {
    (async () => {
      try {
        const token = await getToken();
        if (!token) { sendResponse({ ok: false }); return; }
        const company = message.company || '';
        const title = (message.title || '').split(/\s+at\s+|\s+[-|@]\s+/i)[0].trim() || 'Job';
        await callFunction('ext_save_application', {
          jobTitle: title, company: company || 'Unknown', jobUrl: message.url || '', status: 'applied',
        });
        sendResponse({ ok: true });
      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }

  // v1.4.0: Programmatic resume attach — fetch resume bytes then attach in-page
  if (message.type === 'ATTACH_RESUME') {
    (async () => {
      try {
        const tabId = message.tabId;
        if (!tabId) { sendResponse({ ok: false, error: 'no_tab' }); return; }
        const blob = await callFunction('ext_get_resume_blob', {});
        if (!blob?.base64) { sendResponse({ ok: false, error: 'no_resume' }); return; }
        const r = await safeSendMessage(tabId, { type: 'TRY_ATTACH_RESUME', payload: blob });
        if (!r) { sendResponse({ ok: false, error: 'no_content_script' }); return; }
        if (!r.attached) { sendResponse({ ok: false, error: r.reason || 'blocked', filename: blob.filename }); return; }
        sendResponse({ ok: true, count: r.count || 1, filename: blob.filename });
      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }

  // Sidepanel builds the PDF/DOCX locally and asks us to forward it to the page.
  if (message.type === 'ATTACH_RESUME_FILE') {
    (async () => {
      try {
        const tabId = message.tabId;
        const payload = message.payload || {};
        if (!tabId) { sendResponse({ ok: false, error: 'no_tab' }); return; }
        if (!payload.base64) { sendResponse({ ok: false, error: 'no_resume' }); return; }
        const r = await safeSendMessage(tabId, { type: 'TRY_ATTACH_RESUME', payload });
        if (!r) { sendResponse({ ok: false, error: 'no_content_script' }); return; }
        if (!r.attached) { sendResponse({ ok: false, error: r.reason || 'blocked', filename: payload.filename }); return; }
        sendResponse({ ok: true, count: r.count || 1, filename: payload.filename });
      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }

  // Auto-autofill: scan + AI + inject (with v1.4.0 multi-pass for revealed fields)
  if (message.type === 'AUTO_AUTOFILL') {
    (async () => {
      try {
        const tabId = message.tabId;
        if (!tabId) { sendResponse({ ok: false, error: 'No tab ID' }); return; }
        const token = await getToken();
        if (!token) { sendResponse({ ok: false, error: 'not_signed_in' }); return; }

        // v1.4.0: First expand "Add another" buttons so repeating sections appear
        await safeSendMessage(tabId, { type: 'EXPAND_SECTIONS' });
        await new Promise(r => setTimeout(r, 350));

        const scan = await safeSendMessage(tabId, { type: 'SCAN_FORM' });
        if (!scan) { sendResponse({ ok: false, error: 'no_content_script' }); return; }

        const fields = scan.fields || [];
        const jobText = scan.jobText || {};
        if (fields.length === 0) { sendResponse({ ok: false, error: 'no_fields' }); return; }

        const fillData = await callFunction('ext_autofill', {
          fields: fields.map(f => ({
            id: f.id, label: f.label, type: f.type, group: f.group,
            options: f.options, required: f.required, currentValue: f.currentValue,
            accRole: f.accRole || '', labelSource: f.labelSource || '',
          })),
          jobText: jobText?.text || '',
          jobTitle: jobText?.title || '',
          company: jobText?.company || '',
          ats: scan.ats || 'unknown',
          url: scan.url || '',
          scanDiag: Array.isArray(scan.scanDiag) ? scan.scanDiag : [],
          extVersion: chrome.runtime.getManifest().version,
        });
        const runId = fillData?.run_id || null;

        const values = (fillData.values || []).filter(v => !v.skip && ((v.value && v.value.trim()) || v.optionValue || v.optionLabel || (Array.isArray(v.optionLabels) && v.optionLabels.length)));
        if (values.length === 0) { sendResponse({ ok: false, error: 'no_values' }); return; }

        await safeSendMessage(tabId, { type: 'HIGHLIGHT_FIELDS', fieldIds: values.map(v => v.id) });
        await new Promise(r => setTimeout(r, 350));

        const fillResult = await safeSendMessage(tabId, { type: 'INJECT_VALUES', values });

        // v1.4.0: Second pass — re-scan in case filling revealed new fields (conditional questions)
        let secondPassFilled = 0;
        try {
          await new Promise(r => setTimeout(r, 700));
          const scan2 = await safeSendMessage(tabId, { type: 'SCAN_FORM' });
          const newFields = (scan2?.fields || []).filter(f =>
            !fields.some(old => old.id === f.id) && !f.currentValue
          );
          if (newFields.length > 0) {
            const fill2 = await callFunction('ext_autofill', {
              fields: newFields.map(f => ({
                id: f.id, label: f.label, type: f.type, group: f.group,
                options: f.options, required: f.required, currentValue: f.currentValue,
                accRole: f.accRole || '', labelSource: f.labelSource || '',
              })),
              jobText: jobText?.text || '', jobTitle: jobText?.title || '', company: jobText?.company || '',
              ats: scan.ats || 'unknown', url: scan.url || '',
            });
            const newValues = (fill2.values || []).filter(v => !v.skip && ((v.value && v.value.trim()) || v.optionValue || v.optionLabel || (Array.isArray(v.optionLabels) && v.optionLabels.length)));
            if (newValues.length > 0) {
              const fr2 = await safeSendMessage(tabId, { type: 'INJECT_VALUES', values: newValues });
              secondPassFilled = fr2?.filled || 0;
              // Merge into result
              (fr2?.results || []).forEach(r => fillResult.results.push(r));
              newValues.forEach(v => values.push(v));
            }
          }
        } catch { /* ignore second-pass errors */ }

        const resultMap = {};
        (fillResult?.results || []).forEach(r => { resultMap[r.id] = r; });
        const details = values.map(v => ({
          id: v.id,
          label: fields.find(f => f.id === v.id)?.label || v.id,
          value: v.value || v.optionLabel || v.optionValue || (Array.isArray(v.optionLabels) ? v.optionLabels.join(', ') : ''),
          confidence: typeof v.confidence === 'number' ? v.confidence : 0.8,
          reasoning: v.reasoning || '',
          source: v.source || '',
          ok: resultMap[v.id]?.ok || false,
          reason: resultMap[v.id]?.reason || '',
        }));

        sendResponse({
          ok: true,
          filled: (fillResult?.filled || 0) + secondPassFilled,
          total: values.length,
          details,
          passes: secondPassFilled > 0 ? 2 : 1,
          skipped: fillData?.skipped || [],
        });

        // v1.9.19: telemetry — fire-and-forget; must never break filling
        try {
          if (runId) {
            callFunction('ext_log_result', {
              run_id: runId,
              inject_results: (fillResult?.results || []),
              filled: (fillResult?.filled || 0) + secondPassFilled,
              total: values.length,
            }).catch(() => {});
          }
        } catch (_) { /* ignore */ }
      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }
});
