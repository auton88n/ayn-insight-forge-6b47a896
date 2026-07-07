// background.js — AYN Resume Tailor service worker
// Auth: device tokens via "Sign in with AYN" one-click flow.

// v1.9.55: two-lane resolver. Load shared constants + resolver into the SW.
try { importScripts('constants.js', 'filler.js'); } catch (e) { console.warn('AYN resolver load failed', e); }

const SUPABASE_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw';
const AYN_WEB = 'https://aynn.io';

// Open side panel when toolbar icon clicked
chrome.action.onClicked.addListener(tab => chrome.sidePanel.open({ tabId: tab.id }));
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ── v1.9.55: External bridge for aynn.io / lovable dashboard ──────
// Allows the web app to trigger autofill without opening the side panel.
// The manifest `externally_connectable.matches` gate origins to aynn.io.
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) { sendResponse({ ok: false, error: 'bad_message' }); return; }

  if (message.type === 'AYN_PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return;
  }

  if (message.type === 'AYN_TRIGGER_AUTOFILL') {
    (async () => {
      try {
        const jobUrl = String(message.jobUrl || '').trim();
        if (!jobUrl) { sendResponse({ ok: false, error: 'no_url' }); return; }
        // Find existing tab with this URL, else open a new one.
        const tabs = await chrome.tabs.query({});
        const found = tabs.find(t => t.url === jobUrl);
        const tab = found || await chrome.tabs.create({ url: jobUrl, active: true });
        if (found) { try { await chrome.tabs.update(tab.id, { active: true }); } catch {} }
        // Store handoff so hydrate script surfaces a toast if needed.
        try { await chrome.storage.local.set({ 'ayn:pendingHandoff': { targetUrl: jobUrl, resumeId: message.resumeId || '', ts: Date.now() } }); } catch {}
        // Wait for load, then dispatch AUTO_AUTOFILL to ourselves.
        await new Promise(r => setTimeout(r, 1500));
        chrome.runtime.sendMessage({ type: 'AUTO_AUTOFILL', tabId: tab.id }, () => void chrome.runtime.lastError);
        sendResponse({ ok: true, tabId: tab.id });
      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }

  sendResponse({ ok: false, error: 'unknown_type' });
});

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
async function safeSendMessage(tabId, message, frameId = 0) {
  const opts = { frameId };
  const tryOnce = () => new Promise(resolve => {
    try {
      chrome.tabs.sendMessage(tabId, message, opts, response => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response);
      });
    } catch { resolve(null); }
  });
  const direct = await tryOnce();
  if (direct !== null) return direct;
  try {
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: ['constants.js', 'filler.js', 'dom.js', 'content.js'] });
    await new Promise(r => setTimeout(r, 300));
    return tryOnce();
  } catch { return null; }
}

// ── v1.9.55: profile vector + answer memory (two-lane resolver) ──────
async function aynGetProfileVector() {
  try {
    const r = await chrome.storage.local.get('ayn_profile_vector');
    const cached = r.ayn_profile_vector;
    const fresh = cached && cached.fetchedAt && (Date.now() - cached.fetchedAt < 24 * 3600 * 1000);
    if (fresh && cached.vector) return cached.vector;
    const resp = await callFunction('ext_profile', {});
    if (resp && resp.facts) { await chrome.storage.local.set({ ayn_profile_vector: { vector: resp, fetchedAt: Date.now() } }); return resp; }
    return cached && cached.vector ? cached.vector : null;
  } catch (_) {
    try { const r = await chrome.storage.local.get('ayn_profile_vector'); return r.ayn_profile_vector ? r.ayn_profile_vector.vector : null; } catch { return null; }
  }
}
async function aynMemGet() { try { const r = await chrome.storage.local.get('ayn_answers'); return r.ayn_answers || {}; } catch { return {}; } }
async function aynMemSet(m) { try { await chrome.storage.local.set({ ayn_answers: m }); } catch (_) {} }

// Enumerate frames worth scanning: the top frame (which already covers its own
// same-origin subframes + shadow roots via collectScannableDocs), plus any frame
// that is cross-origin relative to its PARENT (an ancestor's scan cannot reach it).
// Falls back to top-only if webNavigation is unavailable.
async function getScannableFrames(tabId) {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (!frames || !frames.length) return [{ frameId: 0 }];
    const byId = new Map(frames.map(f => [f.frameId, f]));
    const originOf = (u) => { try { return new URL(u).origin; } catch { return null; } };
    const out = [];
    // v2.2.0 — include ALL non-error frames, not just cross-origin. Same-origin
    // iframes still need explicit enumeration because the top-frame content
    // script cannot always reach nested iframe DOM directly (Lever embeds,
    // Ashby step-2 iframes). safeSendMessage lazily injects content.js.
    for (const f of frames) {
      if (f.frameId === 0) { out.push({ frameId: 0 }); continue; }
      if (f.errorOccurred) continue;
      out.push({ frameId: f.frameId });
    }
    return out.length ? out : [{ frameId: 0 }];
  } catch { return [{ frameId: 0 }]; }
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

  // ── Vision fallback (v1.9.38: opt-in real screenshot, else html2canvas) ──
  if (message.type === 'AYN_VISION_FILL') {
    (async () => {
      let granted = false;
      try { granted = await chrome.permissions.contains({ origins: ['<all_urls>'] }); } catch { granted = false; }
      let dataUrl = null;
      let src = '';
      let captureError = '';
      if (granted) {
        try {
          dataUrl = await chrome.tabs.captureVisibleTab(sender?.tab?.windowId ?? undefined, { format: 'png' });
          if (dataUrl) src = 'screenshot';
        } catch (e) { captureError = String((e && e.message) || 'capture failed'); }
      }
      if (!dataUrl && message.image && typeof message.image === 'string' && message.image.startsWith('data:image/')) {
        dataUrl = message.image; src = 'html2canvas';
      }
      if (!dataUrl) {
        sendResponse({ ok: false, decisions: [], diag: { captured: false, captureError: captureError || 'no image', backendError: '', decisionsCount: 0, src: '' } });
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
        sendResponse({ ok: true, decisions, diag: { captured: true, captureError: '', backendError: '', decisionsCount: decisions.length, src } });
      } catch (e) {
        sendResponse({ ok: false, decisions: [], diag: { captured: true, captureError: '', backendError: String((e && e.message) || 'backend failed'), decisionsCount: 0, src } });
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

        const frames = await getScannableFrames(tabId);
        const AGG = (fid, id) => fid === 0 ? id : `@@F${fid}@@${id}`;
        const DEAGG = (fid, id) => fid === 0 ? id : id.replace(`@@F${fid}@@`, '');

        // Expand repeating sections in every scannable frame
        for (const fr of frames) { await safeSendMessage(tabId, { type: 'EXPAND_SECTIONS' }, fr.frameId); }
        await new Promise(r => setTimeout(r, 350));

        // Scan each frame; namespace non-top-frame field ids so they stay unique
        const frameOfField = new Map();
        const scanByFrame = {};
        let fields = [];
        for (const fr of frames) {
          const s = await safeSendMessage(tabId, { type: 'SCAN_FORM' }, fr.frameId);
          if (!s || !Array.isArray(s.fields)) continue;
          scanByFrame[fr.frameId] = s;
          for (const f of s.fields) {
            const aggId = AGG(fr.frameId, f.id);
            frameOfField.set(aggId, fr.frameId);
            fields.push({ ...f, id: aggId });
          }
        }
        const topScan = scanByFrame[0] || {};
        const jobText = topScan.jobText || {};
        if (fields.length === 0) { sendResponse({ ok: false, error: 'no_fields' }); return; }

        // ── v1.9.55 two-lane resolver stage ─────────────────────────
        // Resolves standard identity/link/logic fields locally from the
        // cached profile vector + previously-saved answer memory, so only
        // truly unknown fields go to the AI backend.
        let localValues = [];
        let unknownFields = fields;
        let __resolvedSummary = [];
        try {
          if (self.AYN_CONST && self.AYN_CONST.RESOLVER_V2 && self.AYN_RESOLVER) {
            const vector = await aynGetProfileVector();
            if (vector) {
              const host = (() => { try { return new URL(topScan.url || '').host; } catch { return ''; } })();
              const mem = await aynMemGet();
              const unknown = [];
              for (const f of fields) {
                let hit = null;
                if (!self.AYN_RESOLVER.isSensitive(f)) {
                  const fp = await self.AYN_RESOLVER.fingerprint(f, host);
                  const mm = mem[fp];
                  if (mm && (mm.value || mm.optionLabel) && (!self.AYN_RESOLVER.canReuseMemory || self.AYN_RESOLVER.canReuseMemory(f, mm))) {
                    hit = { id: f.id, ...(mm.optionLabel ? { optionLabel: mm.optionLabel, optionValue: mm.optionValue } : { value: mm.value }), confidence: 0.9, source: 'memory', reasoning: 'Reused a saved answer.' };
                  }
                }
                if (!hit) {
                  const m = self.AYN_RESOLVER.matchProfile(f, vector);
                  if (m) hit = { id: f.id, ...(m.optionLabel ? { optionLabel: m.optionLabel, optionValue: m.optionValue } : { value: m.value }), confidence: m.confidence, source: 'profile', reasoning: 'Filled from your profile.' };
                }
                if (hit) { localValues.push(hit); __resolvedSummary.push({ id: f.id, source: hit.source, confidence: hit.confidence }); }
                else unknown.push(f);
              }
              unknownFields = unknown;
            }
          }
        } catch (e) { localValues = []; unknownFields = fields; __resolvedSummary = []; }

        const fillData = await callFunction('ext_autofill', {
          fields: unknownFields.map(f => ({
            id: f.id, label: f.label, kind: f.kind || f.type, type: f.type, name: f.name || '', group: f.group,
            options: f.options, required: f.required, currentValue: f.currentValue,
            accRole: f.accRole || '', labelSource: f.labelSource || '',
            fingerprint: f.fingerprint || '',
            section: f.section || '', helperText: f.helperText || '', placeholder: f.placeholder || '',
            siblingLabels: Array.isArray(f.siblingLabels) ? f.siblingLabels : [],
            richEditor: !!f.richEditor, richDetector: f.richDetector || '',
          })),
          resolved: __resolvedSummary,
          jobText: jobText?.text || '',
          jobTitle: jobText?.title || '',
          company: jobText?.company || '',
          ats: topScan.ats || 'unknown',
          url: topScan.url || '',
          scanDiag: Array.isArray(topScan.scanDiag) ? topScan.scanDiag : [],
          extVersion: chrome.runtime.getManifest().version,
        });
        const runId = fillData?.run_id || null;

        const fieldMeta = new Map(fields.map(f => [f.id, f]));
        const isUnsafeAnswer = (v) => {
          const f = fieldMeta.get(v.id) || {};
          const blob = [f.label, f.group, f.name, f.section, f.placeholder].filter(Boolean).join(' ');
          const val = String(v.value || v.optionLabel || v.optionValue || '').trim();
          if (/linkedin/i.test(blob)) {
            return !/^https:\/\/(www\.)?linkedin\.com\/in\/[a-z0-9][a-z0-9\-_%]{2,}\/?$/i.test(val);
          }
          if ((v.optionLabel || v.optionValue) && Array.isArray(f.options) && f.options.length) {
            const want = String(v.optionLabel || v.optionValue || '').toLowerCase().replace(/\s+/g, ' ').trim();
            const hit = f.options.some(o => {
              const opt = String(o.label || o.value || '').toLowerCase().replace(/\s+/g, ' ').trim();
              return opt === want || (opt && want && (opt.includes(want) || want.includes(opt)));
            });
            if (!hit) return true;
          }
          return false;
        };
        const decorate = v => {
          const f = fieldMeta.get(v.id) || {};
          return {
            ...v,
            label: f.label || v.label || '',
            kind: f.kind || f.type || v.kind || '',
            type: f.type || v.type || '',
            name: f.name || v.name || '',
            group: f.group || v.group || '',
            labelSource: f.labelSource || v.labelSource || '',
            richDetector: f.richDetector || v.richDetector || '',
            _idx: f._idx,
            _frame: f._frame || '',
          };
        };
        const aiValues = (fillData.values || [])
          .filter(v => !v.skip && ((v.value && v.value.trim()) || v.optionValue || v.optionLabel || (Array.isArray(v.optionLabels) && v.optionLabels.length)))
          .filter(v => !isUnsafeAnswer(v))
          .map(v => decorate({ ...v, source: v.source || 'ai' }));
        const values = [...localValues.filter(v => !isUnsafeAnswer(v)).map(decorate), ...aiValues];
        if (values.length === 0) { sendResponse({ ok: false, error: 'no_values' }); return; }

        // Group values by owning frame; translate ids back to frame-local for injection
        const byFrame = new Map();
        for (const v of values) {
          const fid = frameOfField.get(v.id) ?? 0;
          if (!byFrame.has(fid)) byFrame.set(fid, []);
          byFrame.get(fid).push({ ...v, id: DEAGG(fid, v.id) });
        }

        for (const [fid, vals] of byFrame) {
          await safeSendMessage(tabId, { type: 'HIGHLIGHT_FIELDS', fieldIds: vals.map(v => v.id) }, fid);
        }
        await new Promise(r => setTimeout(r, 350));

        let mergedResults = [];
        for (const [fid, vals] of byFrame) {
          const fr = await safeSendMessage(tabId, { type: 'INJECT_VALUES', values: vals }, fid);
          (fr?.results || []).forEach(r => mergedResults.push({ ...r, id: AGG(fid, r.id), _frameId: fid }));
        }
        let fillResult = { results: mergedResults };

        // Second pass per frame — refill fields revealed by the first pass
        let secondPassFilled = 0;
        try {
          await new Promise(r => setTimeout(r, 700));
          let newFieldsAll = [];
          // v2.2.0 — a field is resendable if it was NEVER given a value in pass 1
          // (either not returned by AI, or skipped) AND is still empty in the DOM.
          // Previously we only resent brand-new IDs, so previously-skipped fields
          // that revealed themselves after lazy hydration were never retried.
          const resolvedIds = new Set((values || []).map(v => v && v.id).filter(Boolean));
          for (const fr of frames) {
            const s2 = await safeSendMessage(tabId, { type: 'SCAN_FORM' }, fr.frameId);
            (s2?.fields || []).forEach(f => {
              const aggId = AGG(fr.frameId, f.id);
              const wasOk = mergedResults.some(r => r && r.id === aggId && r.ok === true && r.verified !== false);
              if ((!resolvedIds.has(aggId) || !wasOk) && !f.currentValue) {
                frameOfField.set(aggId, fr.frameId);
                newFieldsAll.push({ ...f, id: aggId });
              }
            });
          }
          if (newFieldsAll.length > 0) {
            const fill2 = await callFunction('ext_autofill', {
                fields: newFieldsAll.map(f => ({
                  id: f.id, label: f.label, kind: f.kind || f.type, type: f.type, name: f.name || '', group: f.group,
                  options: f.options, required: f.required, currentValue: f.currentValue,
                  accRole: f.accRole || '', labelSource: f.labelSource || '',
                  fingerprint: f.fingerprint || '',
                  section: f.section || '', helperText: f.helperText || '', placeholder: f.placeholder || '',
                  siblingLabels: Array.isArray(f.siblingLabels) ? f.siblingLabels : [],
                  richEditor: !!f.richEditor, richDetector: f.richDetector || '',
                })),
              jobText: jobText?.text || '', jobTitle: jobText?.title || '', company: jobText?.company || '',
              ats: topScan.ats || 'unknown', url: topScan.url || '',
              extVersion: chrome.runtime.getManifest().version,
            });
              const newFieldMeta = new Map(newFieldsAll.map(f => [f.id, f]));
              const newValues = (fill2.values || [])
                .filter(v => !v.skip && ((v.value && v.value.trim()) || v.optionValue || v.optionLabel || (Array.isArray(v.optionLabels) && v.optionLabels.length)))
                .map(v => {
                  const f = newFieldMeta.get(v.id) || {};
                  return {
                    ...v,
                    label: f.label || v.label || '',
                    kind: f.kind || f.type || v.kind || '',
                    type: f.type || v.type || '',
                    name: f.name || v.name || '',
                    group: f.group || v.group || '',
                    labelSource: f.labelSource || v.labelSource || '',
                    richDetector: f.richDetector || v.richDetector || '',
                    _idx: f._idx,
                    _frame: f._frame || '',
                  };
                });
            if (newValues.length > 0) {
              const secondResults = [];
              const byFrame2 = new Map();
              for (const v of newValues) {
                const fid = frameOfField.get(v.id) ?? 0;
                if (!byFrame2.has(fid)) byFrame2.set(fid, []);
                byFrame2.get(fid).push({ ...v, id: DEAGG(fid, v.id) });
              }
              for (const [fid, vals] of byFrame2) {
                const fr2 = await safeSendMessage(tabId, { type: 'INJECT_VALUES', values: vals }, fid);
                secondPassFilled += (fr2?.filled || 0);
                (fr2?.results || []).forEach(r => { const rr = { ...r, id: AGG(fid, r.id), _frameId: fid }; mergedResults.push(rr); secondResults.push(rr); });
                vals.forEach(v => values.push({ ...v, id: AGG(fid, v.id) }));
              }
              // v1.9.67 — close the second-pass telemetry row (previously orphaned:
              // the second ext_autofill call inserted a run that was never completed).
              try {
                if (fill2?.run_id) {
                  callFunction('ext_log_result', {
                    run_id: fill2.run_id,
                    inject_results: secondResults,
                    filled: secondResults.filter(r => r && r.ok === true).length,
                    total: secondResults.length,
                  }).catch(() => {});
                }
              } catch (_) {}
            }
          }
        } catch { /* ignore second-pass errors */ }

        const resultMap = {};
        (fillResult?.results || []).forEach(r => { resultMap[r.id] = r; });

        // v1.9.55 — write answer memory for non-sensitive AI/inferred fills
        try {
          const host = (() => { try { return new URL(topScan.url || '').host; } catch { return ''; } })();
          const mem = await aynMemGet();
          for (const r of mergedResults) {
            if (!r || !r.ok || r.verified === false) continue;
            const v = values.find(x => x.id === r.id);
            const f = fields.find(x => x.id === r.id);
            if (!v || !f) continue;
            if (self.AYN_RESOLVER && (self.AYN_RESOLVER.isSensitive(f) || (self.AYN_RESOLVER.isMemoryBlocked && self.AYN_RESOLVER.isMemoryBlocked(f)))) continue;
            if (!(v.value || v.optionLabel)) continue;
            const fp = self.AYN_RESOLVER ? await self.AYN_RESOLVER.fingerprint(f, host) : null;
            if (!fp) continue;
            const prev = mem[fp] || { hits: 0 };
            mem[fp] = {
              label: f.label,
              kind: f.kind || f.type || '',
              value: v.value || '',
              optionLabel: v.optionLabel || '',
              optionValue: v.optionValue || '',
              source: v.source || 'ai',
              hits: (prev.hits || 0) + 1,
              last_used_at: new Date().toISOString(),
            };
          }
          await aynMemSet(mem);
        } catch (_) {}

        const details = values.map(v => {
          const f = fields.find(x => x.id === v.id);
          const needsReview = (typeof v.confidence === 'number' && v.confidence < 0.6)
            || (f ? (self.AYN_RESOLVER ? self.AYN_RESOLVER.isSensitive(f) : false) : false);
          return {
            id: v.id,
            label: f?.label || v.id,
            group: v.group || f?.group || '',
            value: v.value || v.optionLabel || v.optionValue || (Array.isArray(v.optionLabels) ? v.optionLabels.join(', ') : ''),
            confidence: typeof v.confidence === 'number' ? v.confidence : 0.8,
            reasoning: v.reasoning || '',
            source: v.source || (resultMap[v.id] ? 'ai' : ''),
            needsReview,
            ok: resultMap[v.id]?.ok || false,
            reason: resultMap[v.id]?.reason || '',
          };
        });

        // v1.9.67 — single counting rule: ok===true counts as filled.
        const __allResults = (fillResult?.results || []);
        const __filled = __allResults.filter(r => r && r.ok === true).length;
        const __total = __allResults.length;
        const __needsReviewCount = details.filter(d => d.needsReview).length;

        sendResponse({
          ok: true,
          filled: __filled,
          total: __total,
          answered: values.length,
          verified: __filled,
          needsReview: Math.max(0, values.length - __filled) + ((fillData?.skipped || []).length),
          needsReviewCount: __needsReviewCount,
          resolvedLocally: localValues.length,
          details,
          passes: secondPassFilled > 0 ? 2 : 1,
          skipped: fillData?.skipped || [],
        });

        try {
          if (runId) {
            // v2.4 — pipe closed-loop retry telemetry through when present.
            const retry_count = fillResult?.retry_count || 0;
            const failure_classes = fillResult?.failure_classes || [];
            const resolved_by = fillResult?.resolved_by || {};
            callFunction('ext_log_result', {
              run_id: runId,
              inject_results: __allResults,
              filled: __filled,
              total: __total,
              retry_count,
              failure_classes,
              resolved_by,
            }).catch(() => {});
          }
        } catch (_) { /* ignore */ }

      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }
});
