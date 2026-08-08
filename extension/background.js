// background.js — AYN Resume Tailor service worker
// Auth: device tokens via "Sign in with AYN" one-click flow.

// v1.9.55: two-lane resolver. Load shared constants + resolver into the SW.

const SUPABASE_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw';
const AYN_WEB = 'https://ayn.careers';

// Open side panel when toolbar icon clicked
chrome.action.onClicked.addListener(tab => chrome.sidePanel.open({ tabId: tab.id }));
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ── v1.9.55: External bridge for ayn.careers / lovable dashboard ──────
// Allows the web app to hand a job to the side panel.
// The manifest `externally_connectable.matches` gate origins to ayn.careers.
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) { sendResponse({ ok: false, error: 'bad_message' }); return; }

  if (message.type === 'AYN_PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return;
  }

  // v2.7.0 — dashboard tells us the user just saved their profile.
  // Invalidate cached profile so the next read uses fresh data.
  if (message.type === 'AYN_PROFILE_UPDATED') {
    (async () => {
      try { await chrome.storage.local.remove('ayn_profile_vector'); } catch {}
      sendResponse({ ok: true });
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

// v2.8.0 — JD Resolver infrastructure.
// JD_REGISTRY: origin+pathname → { text, title, company, url, ts, source }
// TAB_OPENER: tabId → openerTabId (captured at tab creation time)
// LAST_MATCH: tabId → { score, jobId, ts } — last score computed for the tab.
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


// v3.37.0 — sites like LinkedIn's /jobs/search and /jobs/collections/* keep
// every job under the SAME pathname and only vary a query param
// (currentJobId). Dropping the query string here collapsed every job in a
// browsing session onto one registry slot, so jdRegistrySet's "only replace
// if the new one scores higher" guard could keep an earlier, unrelated job
// pinned in place of whatever is actually open. Keep the params that
// actually distinguish one posting from another — same KEEP-list as
// normalizeUrlForHash in supabase/functions/resume-hub/index.ts, so a job's
// identity agrees client and server side.
const JD_KEY_PARAMS = new Set([
  'jk', 'vjk', 'currentJobId', 'jobId', 'job_id', 'id',
  'gh_jid', 'lever-source', 'postingId', 'requisitionId',
]);
function jdKey(url) {
  try {
    const u = new URL(url);
    const kept = [];
    for (const [k, v] of u.searchParams) { if (JD_KEY_PARAMS.has(k)) kept.push(`${k}=${v}`); }
    kept.sort();
    const qs = kept.length ? `?${kept.join('&')}` : '';
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}${qs}`;
  }
  catch { return String(url || ''); }
}
function jdKeyHostPath(url) {
  try { const u = new URL(url); return `${u.hostname.replace(/^www\./,'').toLowerCase()}${u.pathname.replace(/\/+$/, '')}`; }
  catch { return String(url || ''); }
}
// v2.11.3 — relevance-weighted quality score. Length is a small factor so a
// 12k-char page of nav/cookie chrome cannot beat a lean structured JD.
// Components (all 0..100 before weighting):
//   length      15%   sigmoid on character count, saturates near 2500 chars
//   sections    30%   presence of standard JD section markers
//   bullets     20%   presence of bullet/enumeration structure
//   roleSignal  25%   role/comp/team/seniority vocabulary
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
  const raw = 0.15 * length + 0.30 * sections + 0.20 * bullets + 0.25 * roleSignal - 0.25 * noise;
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
  TAB_OPENER.delete(tabId);
  LAST_MATCH.delete(tabId);
  MANUAL_JD.delete(tabId);
  TAB_KIND.delete(tabId);
  TAB_OVERRIDE.delete(tabId);
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url) {
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
  // v3.37.0 — a good live read of the CURRENT page is authoritative: stop
  // here, before step 4 (registry fuzzy) ever runs. This is what "ladder"
  // is supposed to mean — try steps in order, climb only while the answer
  // so far is weak — but the old code collected steps 2-4 unconditionally
  // and picked whichever scored highest quality, so on a site like
  // LinkedIn's /jobs/search (every job shares one pathname, only
  // currentJobId differs) a stale, unrelated, higher-scoring job sitting in
  // the registry could silently outrank the job actually on screen right
  // now. Only fall through to the registry/listing/backend steps when the
  // live read is missing or too thin to trust on its own.
  let best = results[0] || null;
  if (best && best.quality >= threshold) return best;

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
  best = results.sort((a,b) => b.quality - a.quality)[0] || null;
  if (best && best.quality >= threshold) return best;

  // 4. registry fuzzy
  const fuzzy = jdRegistryFuzzy(pageUrl);
  if (fuzzy) push(fuzzy, 'registry');

  // Short-circuit if we already have a strong one.
  best = results.sort((a,b) => b.quality - a.quality)[0] || null;
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
      // v3.3.0 — the backend refuses builds below the configured minimum.
      'x-ayn-ext-version': chrome.runtime.getManifest().version,
    },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) {
    // Do NOT wipe ayn_token on 401. A single spurious 401 must never
    // destroy the stored session; sidepanel verifies via ext_bootstrap
    // before deciding to sign out.
    const err = new Error(data.message || data.error || `HTTP ${r.status}`);
    if (r.status === 401) err.status = 401;
    if (data.code) err.code = data.code;
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


// Relay a message to a content script in a tab (read-only messages only).
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
  return await tryOnce();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'FETCH_URL_TEXT') {
    (async () => {
      try {
        const resp = await fetch(message.url, { credentials: 'omit' });
        const text = await resp.text();
        sendResponse({ ok: true, text: text.slice(0, 200000) });
      } catch (e) { sendResponse({ ok: false, error: e.message, code: e.code || null }); }
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
      catch (e) { sendResponse({ error: e.message, code: e.code || null }); }
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
        // resume the copilot would use.
        if (message.action === 'ext_job_score' && !payload.resume_version_id) {
          try {
            const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            const rvid = await aynReadPendingResumeVersion(t?.url || payload.url || '');
            if (rvid) payload.resume_version_id = rvid;
          } catch {}
        }
        const data = await callFunction(message.action, payload);
        sendResponse({ ok: true, data });
      } catch (e) { sendResponse({ ok: false, error: e.message, code: e.code || null }); }
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
        // Remember the score per tab so the panel can show it without a refetch.
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


  // Suggest roles
  if (message.type === 'SUGGEST_ROLES') {
    (async () => {
      try { sendResponse(await callFunction('ext_suggest_roles', {})); }
      catch { sendResponse(null); }
    })();
    return true;
  }
});
