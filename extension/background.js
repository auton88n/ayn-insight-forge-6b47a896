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

  // v2.7.0 — dashboard tells us the user just saved their profile.
  // Invalidate cached profile vector so the next autofill uses fresh data.
  if (message.type === 'AYN_PROFILE_UPDATED') {
    (async () => {
      try { await chrome.storage.local.remove('ayn_profile_vector'); } catch {}
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === 'AYN_TRIGGER_AUTOFILL') {
    (async () => {
      try {
        const jobUrl = String(message.jobUrl || '').trim();
        if (!jobUrl) { sendResponse({ ok: false, error: 'no_url' }); return; }
        const tabs = await chrome.tabs.query({});
        const found = tabs.find(t => t.url === jobUrl);
        const tab = found || await chrome.tabs.create({ url: jobUrl, active: true });
        if (found) { try { await chrome.tabs.update(tab.id, { active: true }); } catch {} }
        try {
          await chrome.storage.local.set({
            'ayn:pendingHandoff': { targetUrl: jobUrl, resumeId: message.resumeId || '', ts: Date.now() },
          });
          // v2.7.0 — remember which tailored resume version the user picked so
          // subsequent autofill / attach calls target that version.
          if (message.resumeVersionId) {
            await chrome.storage.local.set({
              ayn_pending_resume_version: { id: String(message.resumeVersionId), url: jobUrl, ts: Date.now() },
            });
          }
        } catch {}
        await new Promise(r => setTimeout(r, 1500));
        chrome.runtime.sendMessage({ type: 'AUTO_AUTOFILL', tabId: tab.id }, () => void chrome.runtime.lastError);
        sendResponse({ ok: true, tabId: tab.id });
      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }

  sendResponse({ ok: false, error: 'unknown_type' });
});

// v2.7.0 — read (and expire) the pending tailored-resume selection.
// Only honoured when the current tab URL matches the URL that pinned it.
async function aynReadPendingResumeVersion(tabUrl) {
  try {
    const d = await chrome.storage.local.get('ayn_pending_resume_version');
    const p = d && d.ayn_pending_resume_version;
    if (!p || !p.id) return '';
    if (Date.now() - (p.ts || 0) > 30 * 60 * 1000) {
      await chrome.storage.local.remove('ayn_pending_resume_version');
      return '';
    }
    try {
      if (p.url && tabUrl) {
        const a = new URL(p.url), b = new URL(tabUrl);
        if (a.origin !== b.origin || (a.pathname !== b.pathname && !b.pathname.startsWith(a.pathname))) return '';
      }
    } catch {}
    return p.id;
  } catch { return ''; }
}

// PART B: per-tab form-detection cache (tabId → { hasForm, fieldCount, hasResumeUpload, url, ts })
const FORM_CACHE = new Map();

// v2.8.0 — JD Resolver infrastructure.
// JD_REGISTRY: origin+pathname → { text, title, company, url, ts, source }
// TAB_OPENER: tabId → openerTabId (captured at tab creation time)
// LAST_MATCH: tabId → { score, jobId, ts } — populated by SCORE_JOB_CARD so
// AUTO_TRACK_SUBMIT can enrich the tracker row with the score at submit time.
// MANUAL_JD: tabId → { text, title, company, ts } — user-pasted override.
const JD_REGISTRY = new Map();
const TAB_OPENER = new Map();
const LAST_MATCH = new Map();
const MANUAL_JD = new Map();
// v2.8.1 — per-tab page classification + manual "Scan anyway" override.
// TAB_KIND: tabId → 'apply' | 'listing' | 'other' | 'ayn' (last known)
// TAB_OVERRIDE: tabId → true when user clicked "Scan anyway" on a page
// classified as 'other'. Reset on navigation (chrome.tabs.onUpdated info.url).
const TAB_KIND = new Map();
const TAB_OVERRIDE = new Map();
const JD_TTL_MS = 45 * 60 * 1000; // 45 minutes


function jdKey(url) {
  try { const u = new URL(url); return `${u.origin}${u.pathname.replace(/\/+$/, '')}`; }
  catch { return String(url || ''); }
}
function jdKeyHostPath(url) {
  try { const u = new URL(url); return `${u.hostname.replace(/^www\./,'').toLowerCase()}${u.pathname.replace(/\/+$/, '')}`; }
  catch { return String(url || ''); }
}
// v2.11.2 — relevance-weighted quality score. Length is only 25% of the total,
// so a 12k-char page of nav/cookie chrome no longer beats a lean 800-char JD.
// Components (all 0..100 before weighting):
//   length      25%   sigmoid on character count, saturates near 2500 chars
//   sections    30%   presence of standard JD section markers
//   bullets     15%   presence of bullet/enumeration structure
//   roleSignal  15%   role/comp/team/seniority vocabulary
//   noise      -25%   penalty for cookie/nav/legal boilerplate density
function jdQualityDetail(text) {
  const t = String(text || '');
  if (t.length < 200) return { score: 0, length: 0, sections: 0, bullets: 0, roleSignal: 0, noise: 0, reason: 'too_short' };
  const len = t.length;
  // Length component — smooth curve, ~50 at 1000 chars, ~85 at 2500, cap 100.
  const length = Math.round(Math.min(100, 100 * (1 - Math.exp(-len / 1400))));
  const sections = /responsibilit|requirement|qualif|about (the|us|the role|the team)|what you.?ll do|you.?ll (be|work|have)|we.?re looking|nice to have|preferred|minimum qualif|basic qualif|preferred qualif/i.test(t) ? 100 : 0;
  const bulletHits = (t.match(/(^|\n)\s*(?:[•·▪●\-*]|\d+\.)\s+\S/g) || []).length;
  const bullets = Math.round(Math.min(100, bulletHits * 20));
  const roleHits = (t.match(/salary|compensation|benefits|equity|401k|rrsp|remote|hybrid|on[- ]?site|senior|junior|lead|manager|engineer|designer|analyst|team|reporting to|years? of experience/gi) || []).length;
  const roleSignal = Math.round(Math.min(100, roleHits * 12));
  // Noise density — fraction of lines that look like page chrome, cookie
  // consent, footers, or nav lists. Clamp so a couple of hits don't nuke a
  // real JD; only sustained boilerplate crosses ~50.
  const lines = t.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const noiseRe = /^(cookies?|we use cookies|privacy (notice|policy)|terms( of (service|use))?|accept all|manage preferences|share (this )?job|apply now|back to (jobs|search|listings)|©\s*\d{4}|all rights reserved|equal (employment )?opportunity employer|powered by|sign in|log in|create( an)? account|home|about|contact|careers|blog|help|support)$/i;
  // Allowlist real JD section headers so they never count as chrome, even
  // though many are short Title-Case lines that would otherwise trip the
  // nav-run heuristic below.
  const headerRe = /^(about( the| us)?|the role|role|overview|summary|responsibilit\w*|what you.?ll do|duties|requirement\w*|qualification\w*|minimum qualification\w*|basic qualification\w*|preferred( qualification\w*)?|what we.?re looking for|you (have|will|bring)|skills|experience|nice to have|bonus|benefits|compensation|salary|perks|why join( us)?|our team|the team|location|schedule|education|technolog\w*|tech stack|tools)\b/i;
  // Short Title-Case candidates: single word or two short words, under 16
  // chars, no trailing colon. Only count as noise when 3+ appear consecutively
  // (nav menus come in runs; real section headers stand alone next to content).
  const shortTitleRe = /^[A-Z][A-Za-z]{0,14}(?: [A-Z]?[A-Za-z]{1,10})?$/;
  const isShortTitleCandidate = (l) => l.length < 16 && !/:$/.test(l) && shortTitleRe.test(l) && !headerRe.test(l);
  const noiseFlags = new Array(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (headerRe.test(l)) continue;
    if (noiseRe.test(l)) noiseFlags[i] = true;
  }
  let idx = 0;
  while (idx < lines.length) {
    let j = idx;
    while (j < lines.length && isShortTitleCandidate(lines[j])) j++;
    if (j - idx >= 3) { for (let k = idx; k < j; k++) noiseFlags[k] = true; }
    idx = j === idx ? idx + 1 : j;
  }
  const noiseLines = noiseFlags.filter(Boolean).length;
  const noise = lines.length ? Math.round(Math.min(100, (noiseLines / lines.length) * 200)) : 0;
  const raw = 0.25 * length + 0.30 * sections + 0.15 * bullets + 0.15 * roleSignal - 0.25 * noise;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, length, sections, bullets, roleSignal, noise };
}
function jdQuality(text) { return jdQualityDetail(text).score; }
function jdRegistrySet(url, payload, source) {
  if (!payload || !payload.text) return;
  const key = jdKey(url);
  const prev = JD_REGISTRY.get(key);
  const q = jdQuality(payload.text);
  if (prev && jdQuality(prev.text) >= q && (Date.now() - (prev.ts || 0) < JD_TTL_MS)) return;
  JD_REGISTRY.set(key, { text: payload.text, title: payload.title || (prev && prev.title) || '', company: payload.company || (prev && prev.company) || '', url, ts: Date.now(), source: source || 'unknown', quality: q });
  // gc
  if (JD_REGISTRY.size > 60) {
    const cutoff = Date.now() - JD_TTL_MS;
    for (const [k, v] of JD_REGISTRY) if ((v.ts || 0) < cutoff) JD_REGISTRY.delete(k);
  }
}
function jdRegistryGet(url) {
  const v = JD_REGISTRY.get(jdKey(url));
  if (!v) return null;
  if (Date.now() - (v.ts || 0) > JD_TTL_MS) { JD_REGISTRY.delete(jdKey(url)); return null; }
  return v;
}
// Fuzzy match: same host + path prefix (apply URL is listing URL + /application).
function jdRegistryFuzzy(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./,'').toLowerCase();
    const path = u.pathname.replace(/\/+$/, '');
    let best = null, bestQ = -1;
    for (const v of JD_REGISTRY.values()) {
      try {
        const vu = new URL(v.url);
        const vh = vu.hostname.replace(/^www\./,'').toLowerCase();
        if (vh !== host) continue;
        const vp = vu.pathname.replace(/\/+$/, '');
        // Either path shares prefix with vp, or vp is a prefix of path (apply page under listing).
        if (!(path.startsWith(vp) || vp.startsWith(path))) continue;
        if (Date.now() - (v.ts || 0) > JD_TTL_MS) continue;
        const q = jdQuality(v.text);
        if (q > bestQ) { bestQ = q; best = v; }
      } catch {}
    }
    return best;
  } catch { return null; }
}

// v2.8.0 — capture tab opener for the "opener tab" branch of the JD ladder.
chrome.tabs.onCreated.addListener(t => {
  try { if (t && t.id != null && t.openerTabId != null) TAB_OPENER.set(t.id, t.openerTabId); } catch {}
});
chrome.tabs.onRemoved.addListener(tabId => {
  FORM_CACHE.delete(tabId);
  TAB_OPENER.delete(tabId);
  LAST_MATCH.delete(tabId);
  MANUAL_JD.delete(tabId);
  TAB_KIND.delete(tabId);
  TAB_OVERRIDE.delete(tabId);
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url) {
    FORM_CACHE.delete(tabId);
    // v2.8.1 — "Scan anyway" override is per tab AND per URL. On navigation
    // we drop it so YouTube -> Ashby (same tab) doesn't inherit the bypass.
    TAB_OVERRIDE.delete(tabId);
    TAB_KIND.delete(tabId);
  }
});
// v2.8.1 — a page is treated as a job page only when kind is 'apply' or 'listing',
// unless the user explicitly clicked "Scan anyway" for this tab.
// v2.8.1 — a page is treated as a job page unless it was EXPLICITLY classified
// as 'other'. Unknown (never classified) is treated as allow, so first-time
// SCORE_JOB_CARD calls from listing search cards aren't blocked. The gate's
// job is to stop known-bad pages (youtube), not to require pre-registration.
function tabAllowsJobIntent(tabId) {
  if (tabId == null) return true;
  if (TAB_OVERRIDE.get(tabId)) return true;
  const k = TAB_KIND.get(tabId);
  if (!k) return true;
  return k !== 'other';
}



// v2.8.0 — the JD Resolver ladder. Tries, in order:
//   1. Manual paste override (user-provided JD)
//   2. Current page (from an already-run SCAN_FORM / EXTRACT_JOB_TEXT)
//   3. Opener tab (chrome.tabs.get openerTabId, ask its content script)
//   4. Registry fuzzy match (same host + prefix path, from JOB_DETECTED history)
//   5. Fetch listing URL (aynListingUrlFromApply then PARSE_JOB_HTML)
//   6. Backend lookup (ext_job_lookup by host+path)
// Returns { text, title, company, source, quality, listingUrl? } or null.
async function resolveJdForTab(tabId, pageUrl, hint) {
  const threshold = 45; // below this, keep climbing the ladder
  const results = [];
  const push = (r, source) => { if (r && r.text && r.text.length > 120) results.push({ ...r, source, quality: jdQuality(r.text) }); };

  // 1. manual
  const manual = MANUAL_JD.get(tabId);
  if (manual && manual.text && (Date.now() - manual.ts < JD_TTL_MS)) {
    return { ...manual, source: 'manual', quality: jdQuality(manual.text) };
  }
  // 2. current page (hint from a fresh scan) or ask content script
  if (hint && hint.text) push(hint, 'current_page');
  else {
    const live = await safeSendMessage(tabId, { type: 'EXTRACT_JOB_TEXT' });
    if (live && live.text) push(live, 'current_page');
  }
  // 3. opener tab
  try {
    const opener = TAB_OPENER.get(tabId);
    if (opener != null) {
      const oTab = await chrome.tabs.get(opener).catch(() => null);
      if (oTab && oTab.id != null) {
        const o = await safeSendMessage(oTab.id, { type: 'EXTRACT_JOB_TEXT' });
        if (o && o.text) { push(o, 'opener_tab'); jdRegistrySet(oTab.url || '', o, 'opener_tab'); }
      }
    }
  } catch {}
  // 4. registry fuzzy
  const fuzzy = jdRegistryFuzzy(pageUrl);
  if (fuzzy) push(fuzzy, 'registry');

  // Short-circuit if we already have a strong one.
  let best = results.sort((a,b) => b.quality - a.quality)[0] || null;
  if (best && best.quality >= threshold) return best;

  // 5. fetch listing URL
  try {
    const listing = aynListingUrlFromApply_bg(pageUrl);
    if (listing) {
      const html = await fetchText(listing);
      if (html) {
        const parsed = await safeSendMessage(tabId, { type: 'PARSE_JOB_HTML', html, url: listing });
        if (parsed && parsed.text) {
          push({ ...parsed, url: listing }, 'listing_fetch');
          jdRegistrySet(listing, parsed, 'listing_fetch');
        }
      }
    }
  } catch {}

  best = results.sort((a,b) => b.quality - a.quality)[0] || null;
  if (best && best.quality >= threshold) return { ...best, listingUrl: best.url };

  // 6. backend lookup
  try {
    const data = await callFunction('ext_job_lookup', { host_path: jdKeyHostPath(pageUrl), url: pageUrl });
    if (data && data.job && data.job.jd_text) {
      push({ text: data.job.jd_text, title: data.job.title || '', company: data.job.company || '', url: data.job.source_url || pageUrl }, 'backend');
    }
  } catch {}

  best = results.sort((a,b) => b.quality - a.quality)[0] || null;
  return best;
}
function aynListingUrlFromApply_bg(u) {
  try {
    const url = new URL(u); url.search = ''; url.hash = '';
    const host = url.hostname.toLowerCase();
    let p = url.pathname;
    if (/ashbyhq\.com$/i.test(host)) p = p.replace(/\/application\/?$/i, '');
    else if (/greenhouse\.io$/i.test(host)) p = p.replace(/\/application\/?$/i, '');
    else if (/lever\.co$/i.test(host)) p = p.replace(/\/apply\/?$/i, '');
    else if (/myworkdayjobs\.com$/i.test(host)) p = p.replace(/\/apply(\/.*)?$/i, '');
    else if (/smartrecruiters\.com$/i.test(host)) p = p.replace(/\/apply\/?$/i, '');
    else p = p.replace(/\/(application|apply)\/?$/i, '');
    url.pathname = p;
    const out = url.toString();
    return out === u ? null : out;
  } catch { return null; }
}
async function fetchText(url) {
  try {
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) return '';
    const t = await r.text();
    return t.slice(0, 400000);
  } catch { return ''; }
}


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

// v2.11.0 — proxy for the two AI edge functions that used to be guarded by
// the shared x-proxy-secret. Content scripts route through here so the
// extension token stays in background storage and never ships in the bundle.
async function callAiEdge(fnName, body) {
  const token = await getToken();
  if (!token) throw new Error('Not signed in');
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'x-ayn-ext-token': token,
      'x-source': 'ext',
    },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) {
    const err = new Error(data.error || `HTTP ${r.status}`);
    if (r.status === 401) err.status = 401;
    throw err;
  }
  return data;
}


// ── v2.10.0: server-driven adapter config ─────────────────────────
// Fetch ats_config from the edge function on startup + every 6h. Storage
// key 'ayn_ats_config' = { config, version, fetchedAt }. Broadcasts to
// active tabs so content scripts hot-swap without a reload. All failures
// are silent — content scripts fall back to BUILT_IN defaults.
const AYN_ATS_CFG_KEY = 'ayn_ats_config';
const AYN_ATS_CFG_ALARM = 'ayn_ats_config_refresh';
const AYN_ATS_CFG_INTERVAL_MIN = 6 * 60; // 6 hours

async function aynFetchAtsConfig() {
  try {
    const resp = await callPublic('ats_config_get', {});
    if (!resp || !resp.config) return null;
    const version = Number(resp.version || 0);
    const prev = (await chrome.storage.local.get(AYN_ATS_CFG_KEY))[AYN_ATS_CFG_KEY];
    if (prev && Number(prev.version || 0) > version) return prev;
    const payload = { config: resp.config, version, fetchedAt: Date.now() };
    await chrome.storage.local.set({ [AYN_ATS_CFG_KEY]: payload });
    aynBroadcastAtsConfig(payload).catch(() => {});
    return payload;
  } catch { return null; }
}

async function aynBroadcastAtsConfig(payload) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      if (!t.id) continue;
      try { chrome.tabs.sendMessage(t.id, { type: 'SET_ATS_CONFIG', payload }, () => void chrome.runtime.lastError); } catch {}
    }
  } catch {}
}

chrome.runtime.onInstalled.addListener(() => {
  aynFetchAtsConfig().catch(() => {});
  try { chrome.alarms.create(AYN_ATS_CFG_ALARM, { periodInMinutes: AYN_ATS_CFG_INTERVAL_MIN }); } catch {}
});
chrome.runtime.onStartup.addListener(() => {
  aynFetchAtsConfig().catch(() => {});
  try { chrome.alarms.create(AYN_ATS_CFG_ALARM, { periodInMinutes: AYN_ATS_CFG_INTERVAL_MIN }); } catch {}
});
try {
  chrome.alarms.onAlarm.addListener((a) => {
    if (a && a.name === AYN_ATS_CFG_ALARM) aynFetchAtsConfig().catch(() => {});
  });
} catch {}


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
// v2.7.0 — cache window trimmed from 24h to 30m so recent Profile edits
// on the dashboard show up in the extension without waiting a full day.
async function aynGetProfileVector() {
  try {
    const r = await chrome.storage.local.get('ayn_profile_vector');
    const cached = r.ayn_profile_vector;
    const fresh = cached && cached.fetchedAt && (Date.now() - cached.fetchedAt < 30 * 60 * 1000);
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
        const payload = message.payload || {};
        // v2.8.2 — auto-inject the tailored resume selection for the currently
        // active tab into ext_job_score so the backend scores against the same
        // resume the autofill would use.
        if (message.action === 'ext_job_score' && !payload.resume_version_id) {
          try {
            const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            const rvid = await aynReadPendingResumeVersion(t?.url || payload.url || '');
            if (rvid) payload.resume_version_id = rvid;
          } catch {}
        }
        const data = await callFunction(message.action, payload);
        sendResponse({ ok: true, data });
      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }

  // v2.11.0 — content-script bridges to authenticated AI edge functions.
  if (message.type === 'AYN_FN_RETRY') {
    (async () => {
      try { sendResponse({ ok: true, data: await callAiEdge('ext-fill-form-retry', message.payload || {}) }); }
      catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }
  if (message.type === 'AYN_FN_VISION') {
    (async () => {
      try { sendResponse({ ok: true, data: await callAiEdge('ext-vision-discover', message.payload || {}) }); }
      catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }

  // v2.11.1 — in-page FAB asks background to open the side panel and
  // signal the sidepanel to focus the Fill tab. chrome.sidePanel.open
  // must run in the service worker in response to a user gesture; the
  // click that produced this message counts as that gesture.
  if (message.type === 'OPEN_SIDE_PANEL') {
    (async () => {
      const focusTab = (message && message.focusTab) || 'fill';
      try {
        // Persist the focus target so sidepanels that open fresh pick it up
        // on init; already-open sidepanels also receive the broadcast below.
        try { await chrome.storage.local.set({ ayn_focus_tab: { tab: focusTab, at: Date.now() } }); } catch {}
        const tabId = sender && sender.tab && sender.tab.id;
        const windowId = sender && sender.tab && sender.tab.windowId;
        try {
          if (tabId != null) await chrome.sidePanel.open({ tabId });
          else if (windowId != null) await chrome.sidePanel.open({ windowId });
        } catch (e) { /* already open or gesture too old */ }
        try { chrome.runtime.sendMessage({ type: 'FOCUS_SIDEPANEL_TAB', tab: focusTab }, () => { void chrome.runtime.lastError; }); } catch {}
        sendResponse({ ok: true });
      } catch (e) { sendResponse({ ok: false, error: e && e.message }); }
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
    const url = sender.tab?.url || '';
    const tabId = sender.tab?.id;
    const kind = message.kind || null;
    if (tabId != null && kind) TAB_KIND.set(tabId, kind);
    chrome.storage.local.set({
      lastJobText: message.text, lastJobTitle: message.title,
      lastJobUrl: url, lastJobCompany: message.company || '',
      detectedAt: Date.now(),
    }, () => sendResponse({ ok: true }));
    // v2.8.1 — JD_REGISTRY only stores entries whose page classified as a real
    // job page ('listing' or 'apply'). Random pages with detectable text
    // (blogs, news articles) must not poison the fuzzy-match registry.
    const allowRegistry = kind === 'listing' || kind === 'apply' || (tabId != null && TAB_OVERRIDE.get(tabId));
    if (allowRegistry) {
      try { jdRegistrySet(url, { text: message.text || '', title: message.title || '', company: message.company || '' }, 'job_detected'); } catch {}
    }
    return true;
  }


  // v2.8.0 — JD Resolver: public entry point for the sidepanel.
  if (message.type === 'RESOLVE_JD') {
    (async () => {
      try {
        const tabId = message.tabId;
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (!tab) { sendResponse({ ok: false, error: 'no_tab' }); return; }
        const jd = await resolveJdForTab(tabId, tab.url || '', message.hint || null);
        if (!jd) { sendResponse({ ok: false, error: 'no_jd' }); return; }
        sendResponse({ ok: true, text: jd.text, title: jd.title || '', company: jd.company || '', source: jd.source, quality: jd.quality || 0, qualityDetail: jdQualityDetail(jd.text || ''), listingUrl: jd.listingUrl || '' });
      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }
  // v2.8.0 — user manually pasted a JD in the sidepanel.
  if (message.type === 'SET_MANUAL_JD') {
    const tabId = message.tabId;
    if (tabId != null && message.text) {
      MANUAL_JD.set(tabId, { text: String(message.text || ''), title: message.title || '', company: message.company || '', ts: Date.now() });
    }
    sendResponse({ ok: true });
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
        kind: message.kind || TAB_KIND.get(tabId) || 'other',
        ts: Date.now(),
      });
      if (message.kind) TAB_KIND.set(tabId, message.kind);
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

  // v2.8.1 — sidepanel-facing per-tab kind + override.
  if (message.type === 'GET_TAB_KIND') {
    const tabId = message.tabId;
    sendResponse({
      kind: (tabId != null && TAB_KIND.get(tabId)) || 'unknown',
      override: !!(tabId != null && TAB_OVERRIDE.get(tabId)),
    });
    return true;
  }
  if (message.type === 'SET_KIND_OVERRIDE') {
    const tabId = message.tabId;
    if (tabId != null) {
      if (message.on) TAB_OVERRIDE.set(tabId, true);
      else TAB_OVERRIDE.delete(tabId);
    }
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'SET_TAB_KIND') {
    // Content script can push its classification (e.g. from DETECT_PAGE via TAB_SEND)
    const tabId = sender.tab?.id || message.tabId;
    if (tabId != null && message.kind) TAB_KIND.set(tabId, message.kind);
    sendResponse({ ok: true });
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
        const tabId = sender.tab?.id;
        const pageUrl = sender.tab?.url || message.url || '';
        // v2.8.1 — refuse to score on pages classified as 'other' unless the
        // user has explicitly opted in via "Scan anyway". Prevents youtube.com
        // / gmail / reddit-search from burning ext_job_score credits.
        if (tabId != null && !tabAllowsJobIntent(tabId)) {
          sendResponse({ skipped: true, reason: 'not-a-job-page' });
          return;
        }
        // v2.8.0 — if this is a real "score this job" (from the sidepanel or an
        // apply page), acquire the FULL JD via the resolver ladder BEFORE calling
        // the backend, so the score is against the actual JD, not just a snippet.
        let fullJd = '';
        try {
          if (tabId != null && pageUrl && (!message.jobSnippet || message.jobSnippet.length < 600)) {
            const jd = await resolveJdForTab(tabId, pageUrl, null);
            if (jd && jd.text && jd.quality >= 30) fullJd = jd.text;
          }
        } catch {}
        // v2.8.2 — thread the tailored resume selection and echo title/company
        // so the backend can return scoredAgainst grounding metadata.
        const resume_version_id = await aynReadPendingResumeVersion(pageUrl);
        const data = await callFunction('ext_job_score', {
          jobTitle: message.jobTitle, company: message.company,
          jobSnippet: message.jobSnippet || (fullJd ? fullJd.slice(0, 2000) : ''),
          fullJd: fullJd || undefined,
          url: pageUrl,
          resume_version_id: resume_version_id || undefined,
        });
        // v2.8.0 — remember the score per tab so AUTO_TRACK_SUBMIT can attach it.
        try { if (tabId != null && data && typeof data.score === 'number') LAST_MATCH.set(tabId, { score: data.score, jobId: data.job_id || '', ts: Date.now() }); } catch {}
        sendResponse({
          score: data.score || 0, matchLabel: data.matchLabel || '',
          reasons: data.reasons || [], salaryEstimate: data.salaryEstimate || '',
          scoredAgainst: data.scoredAgainst || null,
          needsJd: !!data.needsJd,
          source: data.source || '',
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
        const tabId = sender.tab?.id;
        // v2.8.0 — attach the last-known match score and job id so the tracker
        // row surfaces "you applied and scored 82%" immediately.
        const lm = tabId != null ? LAST_MATCH.get(tabId) : null;
        await callFunction('ext_save_application', {
          jobTitle: title, company: company || 'Unknown', jobUrl: message.url || '', status: 'applied',
          match_score: lm && typeof lm.score === 'number' ? lm.score : undefined,
          job_id: lm && lm.jobId ? lm.jobId : undefined,
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
        let tabUrl = '';
        try { const t = await chrome.tabs.get(tabId); tabUrl = t && t.url || ''; } catch {}
        const resume_version_id = await aynReadPendingResumeVersion(tabUrl);
        const blob = await callFunction('ext_get_resume_blob', resume_version_id ? { resume_version_id } : {});
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
        // v2.8.0 — JD RESOLVER LADDER. The apply page rarely contains the full
        // JD; run the resolver ladder (current-page hint → opener tab → registry
        // fuzzy → listing fetch → backend lookup) and use the best result. This
        // is the difference between AI answering "why this company?" from a
        // 30-word teaser vs. the real posting.
        let jobText = topScan.jobText || {};
        try {
          const pageUrl = topScan.url || '';
          const resolved = await resolveJdForTab(tabId, pageUrl, jobText);
          if (resolved && resolved.text && jdQuality(resolved.text) > jdQuality(jobText.text || '')) {
            jobText = { text: resolved.text, title: resolved.title || jobText.title || '', company: resolved.company || jobText.company || '' };
            console.log('[AYN JD] resolved via', resolved.source, 'quality', resolved.quality, 'chars', resolved.text.length);
          }
        } catch (e) { console.warn('[AYN JD] resolve failed', e); }

        const fileFields = fields.filter(f => /file/i.test(String(f.kind || f.type || '')) || /resume|cv|curriculum|upload|attach/i.test(String(f.label || '')));
        fields = fields.filter(f => !(/file/i.test(String(f.kind || f.type || ''))));
        if (fields.length === 0) {
          if (fileFields.length > 0) {
            sendResponse({ ok: true, filled: 0, total: 0, answered: 0, verified: 0, needsReview: 0, needsReviewCount: 0, resolvedLocally: 0, details: [], passes: 1, skipped: [], fileFieldCount: fileFields.length, needsResume: true });
            return;
          }
          sendResponse({ ok: false, error: 'no_fields' }); return;
        }

        // v2.6.0 — removed: this used to fuzzy-match fields against stored
        // profile aliases client-side before ever calling the backend, using
        // a separate memory store from the one the backend's rule engine and
        // AI already query. The backend's ext_autofill already answers every
        // field (rule engine, memory, AI) against the real profile; letting
        // it see ALL fields, not a pre-filtered subset, is strictly more
        // reliable, not less, and removes an entire class of "two answers
        // disagree" bugs.
        let localValues = [];
        let unknownFields = fields;
        let __resolvedSummary = [];

        // v2.7.0 — thread the currently-selected tailored resume version, if any.
        let __tabUrl = '';
        try { const __t = await chrome.tabs.get(tabId); __tabUrl = __t && __t.url || ''; } catch {}
        const resume_version_id = await aynReadPendingResumeVersion(__tabUrl);

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
          resume_version_id: resume_version_id || undefined,
        });
        const runId = fillData?.run_id || null;

        const fieldMeta = new Map(fields.map(f => [f.id, f]));
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
          .map(v => decorate({ ...v, source: v.source || 'ai' }));
        const values = [...localValues.map(decorate), ...aiValues];
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
              const wasExplicitlySkipped = (fillData?.skipped || []).some(s => s && s.id === aggId);
              // v2.6.0 — a field the backend explicitly skipped (no matching
              // profile data, ambiguous, etc.) is a deliberate decline, not a
              // detection gap. Only resend fields that were never seen at all
              // in pass 1 (genuinely revealed late) or that failed injection
              // despite having an answer — never re-ask a field the AI or
              // rule engine already declined on purpose.
              if (((!resolvedIds.has(aggId) && !wasExplicitlySkipped) || (resolvedIds.has(aggId) && !wasOk)) && !f.currentValue) {
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
              resume_version_id: resume_version_id || undefined,
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

        // v2.6.0 — removed: duplicate client-side memory store (ayn_answers). The backend's own memory/learning system is now the single source of truth.

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
            // v2.10.0 — humanTyping telemetry aggregated across first pass +
            // any second pass results.
            const human_typing_used = !!(fillResult?.humanTypingUsed) || (Array.isArray(secondResults) && secondResults.some(r => r && r.reason === 'human-typed'));
            const human_typed_count = Number(fillResult?.humanTypedCount || 0);
            callFunction('ext_log_result', {
              run_id: runId,
              inject_results: __allResults,
              filled: __filled,
              total: __total,
              retry_count,
              failure_classes,
              resolved_by,
              human_typing_used,
              human_typed_count,
            }).catch(() => {});
          }
        } catch (_) { /* ignore */ }

      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }
});
