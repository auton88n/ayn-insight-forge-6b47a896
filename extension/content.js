// content.js — AYN Resume Tailor
// Handles: job text extraction, form scanning, value injection,
//          job card scoring on search pages, role suggestions

(function () {
  'use strict';

  // ── Install guard: prevent double-injection from registering duplicate listeners ──
  if (window.__AYN_CONTENT_LOADED_V2__) {
    try { console.log('[AYN] content script already loaded, skipping re-init'); } catch {}
    return;
  }
  window.__AYN_CONTENT_LOADED_V2__ = true;
  // AYN_BUILD is sourced from the manifest so the version lives in one place.
  const AYN_BUILD = (() => { try { return chrome.runtime.getManifest().version; } catch (_) { return '2.11.0'; } })();
  const MAX_JD_CHARS = 20000;
  const AYN_VISION_ENABLED = true;
  // v2.4 — legacy scanFormFields removed. Question Engine is the only scanner.
  // v1.9.53 — top-frame guard for proactive UI/observers. Behaviorally inert while all_frames is off.
  const AYN_IS_TOP = (() => { try { return window === window.top; } catch (_) { return false; } })();

  // Quiet message sender — swallows chrome.runtime.lastError when no receiver
  function sendQuiet(message) {
    try {
      chrome.runtime.sendMessage(message, () => {
        void chrome.runtime.lastError; // read & discard
      });
    } catch { /* extension context invalidated, ignore */ }
  }

  // v2.5.7 — normalized snapshot key: origin + pathname only (strip query/hash so
  // reCAPTCHA callbacks and Ashby source=... rewrites don't break restore).
  const AYN_RELOAD_SNAPSHOT_KEY = `ayn_reload_snapshot:${location.origin}${location.pathname}`;

  function aynSnapshotValueKey(v) {
    return String((v && v._frame) || '') + '::' + String((v && v.id) || '');
  }

  // v2.6.1 — normalize a label+kind+group into a stable-ish signature so a
  // restored answer can be re-matched against a FRESH scan's fields even
  // though the DOM-stamped id changed. Not as strong as a real hash, but the
  // scanner already resolves label/kind/group deterministically per field.
  function aynFieldSignature(label, kind, group) {
    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    return norm(label) + '::' + norm(kind) + '::' + norm(group);
  }

  function aynSnapshotValue(v) {
    try {
      if (!v || !v.id || v.skip) return null;
      const hasValue = v.value != null || v.optionValue != null || v.optionLabel != null || (Array.isArray(v.optionValues) && v.optionValues.length) || (Array.isArray(v.optionLabels) && v.optionLabels.length);
      if (!hasValue) return null;
      return {
        id: v.id,
        _frame: v._frame,
        value: v.value,
        optionValue: v.optionValue,
        optionLabel: v.optionLabel,
        optionValues: v.optionValues,
        optionLabels: v.optionLabels,
        source: v.source || 'injected-values',
        // v2.6.1a — preserve an existing sig (from a restored record pulled
        // out of storage, which has sig but not label/kind/group) rather than
        // recomputing it from fields that don't exist there — recomputing
        // would silently produce an empty signature and overwrite the
        // correct one, making every restored answer fail to match anything.
        sig: v.sig || aynFieldSignature(v.label, v.kind || v.type, v.group),
      };
    } catch (_) { return null; }
  }

  function aynRememberInjectedValues(values) {
    try {
      const byId = new Map();
      const prev = Array.isArray(window.__AYN_LAST_INJECTED_VALUES__) ? window.__AYN_LAST_INJECTED_VALUES__ : [];
      for (const v of prev) {
        const snap = aynSnapshotValue(v);
        if (snap) byId.set(aynSnapshotValueKey(snap), snap);
      }
      for (const v of (Array.isArray(values) ? values : [])) {
        const snap = aynSnapshotValue(v);
        if (snap) byId.set(aynSnapshotValueKey(snap), snap);
      }
      const merged = Array.from(byId.values());
      window.__AYN_LAST_INJECTED_VALUES__ = merged;
      return merged;
    } catch (_) { return []; }
  }

  function aynPersistInjectedSnapshot(values, reason) {
    try {
      const remembered = aynRememberInjectedValues(values);
      if (!remembered.length || !chrome || !chrome.storage || !chrome.storage.local) return;
      const snap = { url: location.href, savedAt: Date.now(), answers: remembered };
      chrome.storage.local.set({ [AYN_RELOAD_SNAPSHOT_KEY]: snap }, () => {
        try {
          if (chrome.runtime.lastError) {
            console.warn('[AYN][content] injected snapshot save failed:', chrome.runtime.lastError.message);
            return;
          }
          console.log('[AYN][content] injected snapshot saved:', remembered.length, 'answers, reason=', reason || 'fill', 'key=', AYN_RELOAD_SNAPSHOT_KEY);
        } catch (_) {}
      });
    } catch (_) {}
  }

  function aynRestoredSnapshotValues() {
    try {
      const raw = window.__AYN_RESTORED_ANSWERS__;
      if (!Array.isArray(raw) || !raw.length) return [];
      return raw.map(aynSnapshotValue).filter(Boolean);
    } catch (_) { return []; }
  }

  // v2.6.1 — re-anchor restored answers to the CURRENT scan's live ids by
  // content signature (label+kind+group) instead of trusting the id saved in
  // the snapshot, which belongs to a prior scan generation and will not
  // resolve to anything on a fresh page load. Any restored answer that can't
  // be matched to a current field is dropped rather than injected against a
  // dead reference (which only produced silent "not found" failures before).
  function aynCurrentFieldsForSignatureMatch() {
    try {
      const legacy = window.__AYN_QUESTIONS_LEGACY__;
      if (Array.isArray(legacy) && legacy.length) return legacy;
    } catch (_) {}
    return [];
  }

  function aynMergeRestoredValues(values) {
    try {
      const base = Array.isArray(values) ? values : [];
      const restored = aynRestoredSnapshotValues();
      if (!restored.length) return base;

      const currentFields = aynCurrentFieldsForSignatureMatch();
      const sigIndex = new Map();
      for (const f of currentFields) {
        const sig = aynFieldSignature(f.label, f.kind || f.type, f.group);
        if (sig && sig !== '::' ) sigIndex.set(sig, f);
      }

      const reanchored = [];
      let dropped = 0;
      for (const v of restored) {
        if (!v.sig) { dropped++; continue; } // pre-v2.6.1 snapshot, no signature to trust
        const match = sigIndex.get(v.sig);
        if (!match) { dropped++; continue; } // field genuinely not on this page anymore
        reanchored.push({ ...v, id: match.id, _frame: match._frame || '' });
      }
      if (dropped) {
        console.log('[AYN][content] restored snapshot: dropped', dropped, 'of', restored.length, 'answers with no matching current field');
      }

      const byId = new Map();
      for (const v of reanchored) byId.set(aynSnapshotValueKey(v), v);
      for (const v of base) byId.set(aynSnapshotValueKey(v), v);
      const merged = Array.from(byId.values());
      if (merged.length !== base.length) {
        console.log('[AYN][content] merged restored reload snapshot values:', reanchored.length, 're-anchored of', restored.length, 'restored,', merged.length, 'total');
      }
      return merged;
    } catch (_) { return Array.isArray(values) ? values : []; }
  }

  let __aynRestoredReplayDone = false;
  function aynScheduleRestoredReplay() {
    try {
      [700, 1800, 3600].forEach((delay) => {
        setTimeout(() => {
          try {
            if (__aynRestoredReplayDone) return;
            const restored = aynRestoredSnapshotValues();
            if (!restored.length) return;
            // v2.5.9 — no independent write path here anymore. Restored answers
            // are available via aynMergeRestoredValues() for the next real
            // INJECT_VALUES call; this function no longer injects on its own.
            console.log('[AYN][content] restored snapshot available for next fill:', restored.length, 'answers (not injected independently)');
            __aynRestoredReplayDone = true;
          } catch (_) {}
        }, delay);
      });
    } catch (_) {}
  }

  // Safe text helper — never throws on weird/SVG/null nodes
  function safeText(el) {
    if (!el) return '';
    try {
      const t = (typeof el.innerText === 'string' ? el.innerText : null)
              ?? (typeof el.textContent === 'string' ? el.textContent : '');
      return t || '';
    } catch { return ''; }
  }
  function safeLen(el) { return safeText(el).length; }

  function aynVisibleText(el) {
    return String(safeText(el) || '').replace(/\s+/g, ' ').trim();
  }

  function aynFileContextText(input) {
    try {
      const parts = [];
      const push = (v) => { const s = String(v || '').replace(/\s+/g, ' ').trim(); if (s) parts.push(s); };
      push(getLabelFor(input));
      push(input.name); push(input.id); push(input.getAttribute && input.getAttribute('aria-label'));
      const labelledBy = input.getAttribute && input.getAttribute('aria-labelledby');
      if (labelledBy) labelledBy.split(/\s+/).forEach(id => push(input.ownerDocument.getElementById(id)?.textContent));
      let node = input.parentElement;
      for (let i = 0; i < 5 && node; i++, node = node.parentElement) {
        const t = aynVisibleText(node);
        if (t && t.length < 900) push(t);
      }
      return parts.join(' ').toLowerCase();
    } catch (_) { return ''; }
  }

  function aynIsResumeFileInput(input) {
    try {
      if (!input || input.disabled || String(input.type || '').toLowerCase() !== 'file') return false;
      const accept = String(input.accept || '').toLowerCase();
      const ctx = aynFileContextText(input);
      if (/resume|cv|curriculum|cover letter|upload|attach|file|document/.test(ctx)) return true;
      if (/\.pdf|\.docx?|\.rtf|\.txt|application\/pdf|wordprocessingml|msword/.test(accept)) return true;
      return !accept;
    } catch (_) { return false; }
  }

  // v2.1.0 — reveal-and-settle pass. Two problems this solves:
  //   1. Lazy sections (Workday step 2, Ashby demographics, Gem EEO) mount
  //      after IntersectionObserver fires, so we scroll and wait for both
  //      scrollHeight AND control count to stabilize for 2 ticks.
  //   2. EEO / voluntary blocks are often collapsed behind a button
  //      aria-expanded="false" whose name matches voluntary|self-identif|
  //      demograph|eeo|additional|more|expand. We click those once.
  // Returns restore() to put the scroll back after the caller finishes scanning.
  async function aynEnsureRendered() {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let startY = 0;
    try {
      const se = document.scrollingElement || document.documentElement;
      if (!se) return () => {};
      startY = se.scrollTop || 0;

      const countCtrls = () => {
        try { return document.querySelectorAll('input,textarea,select,[role="radio"],[role="checkbox"],[role="combobox"]').length; }
        catch { return 0; }
      };
      const revealCollapsibles = () => {
        try {
          const RE = /voluntary|self[- ]?identif|demograph|eeo|additional\s+questions|show\s+more|see\s+more|expand/i;
          const btns = Array.from(document.querySelectorAll('button[aria-expanded="false"], [role="button"][aria-expanded="false"]'));
          let clicked = 0;
          for (const b of btns) {
            if (clicked >= 4) break;
            const name = ((b.innerText || b.getAttribute('aria-label') || '') + '').trim();
            if (!name || name.length > 80) continue;
            if (!RE.test(name)) continue;
            try { b.click(); clicked++; } catch (_) {}
          }
          return clicked;
        } catch (_) { return 0; }
      };

      const max0 = Math.max(0, (se.scrollHeight || 0) - (se.clientHeight || 0));
      if (max0 > 100) {
        for (let step = 1; step <= 6; step++) {
          const cur = Math.max(0, (se.scrollHeight || 0) - (se.clientHeight || 0));
          try { window.scrollTo(0, Math.floor(cur * (step / 6))); } catch (_) {}
          await sleep(200);
        }
      }
      // Reveal collapsibles once we've paged through the document.
      revealCollapsibles();
      await sleep(200);
      // Settle loop: stop only when scrollHeight AND control count are stable
      // for two consecutive ticks (or 8 iterations, whichever first).
      let lastH = se.scrollHeight || 0;
      let lastC = countCtrls();
      let stable = 0;
      for (let i = 0; i < 8; i++) {
        await sleep(250);
        const h = se.scrollHeight || 0;
        const c = countCtrls();
        try { window.scrollTo(0, Math.max(0, h - (se.clientHeight || 0))); } catch (_) {}
        if (Math.abs(h - lastH) < 8 && c === lastC) {
          stable++;
          if (stable >= 2) break;
        } else {
          stable = 0;
          // If the page grew, a new collapsible may now be reachable.
          if (c > lastC) revealCollapsibles();
        }
        lastH = h; lastC = c;
      }
      await sleep(150);
    } catch (_) {}
    return () => { try { window.scrollTo(0, startY); } catch (_) {} };
  }

  // ══════════════════════════════════════════════════════════════════
  // 1. JOB TEXT EXTRACTION
  // ══════════════════════════════════════════════════════════════════

  function cleanTitle(t) {
    return String(t || '').replace(/\s*[|\-–—]\s*Lovable\s*$/i, '').trim();
  }

  // Concatenate text from ALL matching nodes, dropping nodes nested inside another match.
  function combinedText(selector) {
    if (!selector) return '';
    let nodes;
    try { nodes = Array.from(document.querySelectorAll(selector)); } catch { return ''; }
    if (!nodes.length) return '';
    // Drop nodes nested inside another match so we don't duplicate text
    const top = nodes.filter(n => !nodes.some(o => o !== n && o.contains(n)));
    const seen = new Set();
    const parts = [];
    let total = 0;
    for (const n of top) {
      const t = safeText(n).trim();
      if (!t) continue;
      const key = t.slice(0, 120).toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(t);
      total += t.length + 2;
      if (total >= MAX_JD_CHARS) break;
    }
    const joined = parts.join('\n\n').trim();
    return joined.length > MAX_JD_CHARS ? joined.slice(0, MAX_JD_CHARS) : joined;
  }

  // Click "See more / Show more / Read more" controls so the full JD is in the DOM
  // before we extract. Idempotent per URL. Hard-skip dangerous controls.
  const _expandedFor = new Set();
  function expandSeeMore() {
    try {
      const key = location.href;
      if (_expandedFor.has(key)) return 0;
      _expandedFor.add(key);
      // Click only descriptive "show more" controls
      const POS_RE = /^\s*(\+\s*)?(see|show|read|view)\s+(more|full|all|details?|description|the\s+(full|complete))\b/i;
      // Hard-skip anything destructive, navigational, or action-y
      const NEG_RE = /\b(apply|submit|sign\s*in|sign\s*up|log\s*in|register|save|saved|follow|message|connect|easy\s*apply|share|report|comment|review|reviews|rating|see\s+all\s+jobs|see\s+more\s+jobs|view\s+all\s+jobs|view\s+more\s+jobs|similar\s+jobs|next|previous|cancel|close|delete|remove|upload|attach|edit)\b/i;
      const ctrls = Array.from(document.querySelectorAll(
        'button, a[role="button"], [role="button"], .show-more-less-html__button, [aria-label*="more" i], [aria-expanded="false"]'
      ));
      let clicked = 0;
      for (const b of ctrls) {
        if (b.disabled) continue;
        const txt = (safeText(b) || b.getAttribute('aria-label') || '').trim();
        if (!txt || txt.length > 40) continue;
        if (NEG_RE.test(txt)) continue;
        if (!POS_RE.test(txt) && !/^(more|show more|read more|see more|view more)$/i.test(txt)) continue;
        try { b.click(); clicked++; } catch {}
        if (clicked >= 3) break;
      }
      return clicked;
    } catch { return 0; }
  }

  function aynHtmlToText(html) {
    if (!html) return '';
    try {
      const doc = new DOMParser().parseFromString(String(html), 'text/html');
      return (doc.body.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    } catch { return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
  }
  function aynJobFromLdNode(node) {
    const t = node && node['@type'];
    const isJob = Array.isArray(t) ? t.includes('JobPosting') : t === 'JobPosting';
    if (!isJob) return null;
    const company = (node.hiringOrganization && (node.hiringOrganization.name || node.hiringOrganization)) || '';
    return { text: aynHtmlToText(node.description || ''), title: String(node.title || '').trim(), company: String(company || '').trim() };
  }
  function extractJsonLdJob() {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        let data; try { data = JSON.parse(s.textContent); } catch { continue; }
        const arr = Array.isArray(data) ? data : (data['@graph'] || [data]);
        for (const node of arr) { const j = aynJobFromLdNode(node); if (j && j.text) return j; }
      }
    } catch {}
    return null;
  }
  function parseJsonLdFromHtml(html) {
    try {
      const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
      let m;
      while ((m = re.exec(html))) {
        let data; try { data = JSON.parse(m[1].trim()); } catch { continue; }
        const arr = Array.isArray(data) ? data : (data['@graph'] || [data]);
        for (const node of arr) { const j = aynJobFromLdNode(node); if (j && j.text) return j; }
      }
    } catch {}
    return null;
  }
  function metaJobText() {
    try {
      const og = document.querySelector('meta[property="og:description"]')?.content || '';
      const de = document.querySelector('meta[name="description"]')?.content || '';
      return (og.length >= de.length ? og : de).trim();
    } catch { return ''; }
  }

  function parseMetaFromHtml(html) {
    try {
      const pick = (re) => { const m = re.exec(html); return m ? m[1] : ''; };
      const og = pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["']/i)
              || pick(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+property=["']og:description["']/i);
      const de = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i)
              || pick(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["']/i);
      let t = (og.length >= de.length ? og : de) || '';
      if (!t) return '';
      try { const d = new DOMParser().parseFromString(t, 'text/html'); t = d.documentElement.textContent || t; } catch {}
      return t.trim();
    } catch { return ''; }
  }

  function aynIsApplyPage(u) { return /\/(application|apply)\/?($|\?)/i.test(u || ''); }
  function aynListingUrlFromApply(u) {
    try {
      const url = new URL(u); url.search = ''; url.hash = '';
      let p = url.pathname;
      const host = url.hostname.toLowerCase();
      // v2.8.0 — per-ATS strip rules for the listing URL derivation.
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

  // v2.8.0 — shared site selector map used by both the live DOM extractor
  // and the parsed-HTML body extractor (PARSE_JOB_HTML). Returns null when
  // no site-specific selectors apply; the caller falls back to generic.
  function getSiteSelectors(url) {
    const map = [
      ['ca.indeed.com/viewjob', { desc: '#jobDescriptionText, [class*="jobsearch-JobComponent-description"]', title: '[class*="jobsearch-JobInfoHeader-title"], h1', company: '[data-testid="inlineHeader-companyName"], [class*="jobsearch-CompanyInfoContainer"]' }],
      ['indeed.com/viewjob', { desc: '#jobDescriptionText, [class*="jobsearch-JobComponent-description"]', title: '[class*="jobsearch-JobInfoHeader-title"], h1', company: '[class*="jobsearch-CompanyInfoContainer"], [data-testid="inlineHeader-companyName"]' }],
      ['linkedin.com/jobs', { desc: '#job-details, .jobs-description-content__text, .jobs-description__content, .jobs-box__html-content, [class*="jobs-description"]', title: '.job-details-jobs-unified-top-card__job-title, h1', company: '.job-details-jobs-unified-top-card__company-name, [class*="company-name"]' }],
      ['greenhouse.io', { desc: '#content, .job__description, [class*="description"]', title: 'h1', company: '.company-name, [class*="company"]' }],
      ['jobs.lever.co', { desc: '.section-wrapper, [class*="description"], .posting-requirements', title: 'h2, h1', company: '.main-header-text .large-category-label' }],
      ['jobs.ashbyhq.com', { desc: '[class*="description"], [class*="job-post"], .ashby-job-posting-right-pane', title: 'h1', company: '[class*="company"]' }],
      ['glassdoor.com/job', { desc: '[class*="jobDescriptionContent"], [class*="JobDesc"]', title: '[class*="job-title"], h1', company: '[class*="employer-name"]' }],
      ['myworkdayjobs.com', { desc: '[data-automation-id="jobPostingDescription"]', title: '[data-automation-id="jobPostingHeader"] h2, h1', company: '[data-automation-id="company-name"]' }],
      ['smartrecruiters.com', { desc: '.job-description, [class*="description"]', title: 'h1', company: '[class*="company-name"]' }],
    ].sort((a, b) => b[0].length - a[0].length);
    const u = String(url || '').toLowerCase();
    for (const [pat, sel] of map) { if (u.includes(pat)) return sel; }
    return null;
  }

  // v2.8.0 — parse a raw HTML string (from FETCH_URL_TEXT) and extract the
  // job description text, title, and company using the same site selector
  // map as the live extractor, plus JSON-LD, meta, and largest-block fallback.
  function parseBodyFromHtml(html, url) {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const pickText = (selList) => {
        try {
          const parts = [];
          (selList || '').split(',').forEach(s => {
            doc.querySelectorAll(s.trim()).forEach(el => {
              const t = (el.textContent || '').trim();
              if (t && t.length > 20) parts.push(t);
            });
          });
          return parts.join('\n\n').replace(/\s{3,}/g, '  ').trim();
        } catch { return ''; }
      };
      let text = '', title = '', company = '';
      const sel = getSiteSelectors(url || '');
      if (sel) {
        text = pickText(sel.desc);
        const tEl = doc.querySelector(sel.title);
        const cEl = doc.querySelector(sel.company);
        title = (tEl && tEl.textContent || '').trim();
        company = (cEl && cEl.textContent || '').trim();
      }
      if (!text || text.length < 400) {
        let best = null, bestLen = 0;
        doc.querySelectorAll('article, main, [class*="description"], [class*="job"], [id*="description"]').forEach(el => {
          const t = (el.textContent || '').trim();
          if (t.length > bestLen) { bestLen = t.length; best = t; }
        });
        if (best && best.length > text.length) text = best;
      }
      if (!title) title = (doc.querySelector('h1')?.textContent || doc.title || '').trim();
      // JSON-LD + meta merge for missing pieces / longer text
      try {
        const j = parseJsonLdFromHtml(html);
        if (j && j.text && j.text.length > text.length) { text = j.text; title = title || j.title; company = company || j.company; }
      } catch {}
      try {
        const meta = parseMetaFromHtml(html);
        if (meta && meta.length > text.length) text = meta;
      } catch {}
      return { text: (text || '').slice(0, MAX_JD_CHARS), title: cleanTitle(title || ''), company: (company || '').trim() };
    } catch { return { text: '', title: '', company: '' }; }
  }


  function extractJobTextRaw() {
    try {
    // Best-effort: open any truncated description before we read.
    try { expandSeeMore(); } catch {}
    const url = window.location.href;
    const docTitle = cleanTitle(document.title);

    // v1.4.6: LinkedIn unified extraction — the right-hand job detail pane uses the
    // SAME DOM across /jobs/view, /jobs/collections/recommended, /jobs/search,
    // /jobs/collections/*, etc. Use unified selectors for ANY linkedin.com/jobs URL
    // that has a detectable job detail pane. SPA hooks already re-fire on URL change.
    if (/linkedin\.com\/jobs/i.test(url)) {
      const liSel = {
        desc: '#job-details, .jobs-description-content__text, .jobs-description__content, .jobs-box__html-content, .jobs-details__main-content, [class*="jobs-description"]',
        title: '.job-details-jobs-unified-top-card__job-title, h1',
        company: '.job-details-jobs-unified-top-card__company-name, [class*="company-name"]',
      };
      let liDesc = combinedText(liSel.desc);
      if (!liDesc || liDesc.length < 50) {
        const paneDesc = combinedText('.scaffold-layout__detail, .jobs-details, .jobs-search__job-details');
        if (paneDesc && paneDesc.length >= 50) liDesc = paneDesc;
      }
      if (liDesc && liDesc.length >= 50) {
        const titleEl = document.querySelector(liSel.title);
        const companyEl = document.querySelector(liSel.company);
        return {
          text: liDesc,
          title: cleanTitle(safeText(titleEl).trim() || docTitle),
          company: safeText(companyEl).trim(),
        };
      }
      // fall through to legacy/generic if pane hasn't hydrated yet
    }

    if (/indeed\.com/i.test(url)) {
      const inSel = {
        desc: '#jobDescriptionText, [class*="jobsearch-JobComponent-description"]',
        title: '[class*="jobsearch-JobInfoHeader-title"], h1',
        company: '[data-testid="inlineHeader-companyName"], [class*="jobsearch-CompanyInfoContainer"]',
      };
      const inDesc = combinedText(inSel.desc);
      if (inDesc && inDesc.length >= 50) {
        const titleEl = document.querySelector(inSel.title);
        const companyEl = document.querySelector(inSel.company);
        return {
          text: inDesc,
          title: cleanTitle(safeText(titleEl).trim() || docTitle),
          company: safeText(companyEl).trim(),
        };
      }
      // fall through if the detail pane has not hydrated yet
    }

    const map = {
      // ca.indeed BEFORE indeed so the more-specific pattern wins
      'ca.indeed.com/viewjob': {
        desc: '#jobDescriptionText, [class*="jobsearch-JobComponent-description"]',
        title: '[class*="jobsearch-JobInfoHeader-title"], h1',
        company: '[data-testid="inlineHeader-companyName"], [class*="jobsearch-CompanyInfoContainer"]',
      },
      'indeed.com/viewjob': {
        desc: '#jobDescriptionText, [class*="jobsearch-JobComponent-description"]',
        title: '[class*="jobsearch-JobInfoHeader-title"], h1',
        company: '[class*="jobsearch-CompanyInfoContainer"], [data-testid="inlineHeader-companyName"]',
      },
      'jobright.ai/jobs': {
        desc: '[class*="description"], [class*="job-desc"], main article',
        title: 'h1, [class*="title"]',
        company: '[class*="company"]',
      },
      'greenhouse.io': {
        desc: '#content, .job__description, [class*="description"]',
        title: 'h1',
        company: '.company-name, [class*="company"]',
      },
      'jobs.lever.co': {
        desc: '.section-wrapper, [class*="description"], .posting-requirements',
        title: 'h2, h1',
        company: '.main-header-text .large-category-label',
      },
      'jobs.ashbyhq.com': {
        desc: '[class*="description"], [class*="job-post"]',
        title: 'h1',
        company: '[class*="company"]',
      },
      'glassdoor.com/job': {
        desc: '[class*="jobDescriptionContent"], [class*="JobDesc"]',
        title: '[class*="job-title"], h1',
        company: '[class*="employer-name"]',
      },
      'myworkdayjobs.com': {
        desc: '[data-automation-id="jobPostingDescription"]',
        title: '[data-automation-id="jobPostingHeader"] h2, h1',
        company: '[data-automation-id="company-name"]',
      },
      'smartrecruiters.com': {
        desc: '.job-description, [class*="description"]',
        title: 'h1',
        company: '[class*="company-name"]',
      },
    };

    // Iterate longest-pattern-first so ca.indeed.com isn't shadowed by indeed.com.
    const entries = Object.entries(map).sort((a, b) => b[0].length - a[0].length);
    for (const [pattern, sel] of entries) {
      if (url.includes(pattern)) {
        const desc = combinedText(sel.desc);
        const titleEl = document.querySelector(sel.title);
        const companyEl = document.querySelector(sel.company);
        return {
          text: desc,
          title: cleanTitle(safeText(titleEl).trim() || docTitle),
          company: safeText(companyEl).trim(),
        };
      }
    }

    // Generic fallback — safeText-guarded so a broken node never throws
    let best = null; let bestLen = 0;
    const candidates = document.querySelectorAll(
      'article, main, [class*="description"], [class*="job"], [id*="description"]'
    );
    candidates.forEach(el => {
      const len = safeLen(el);
      if (len > bestLen) { bestLen = len; best = el; }
    });
    const fallbackText = safeText(best).trim();
    return { text: fallbackText.length > MAX_JD_CHARS ? fallbackText.slice(0, MAX_JD_CHARS) : fallbackText, title: docTitle, company: '' };
    } catch (err) {
      try { console.warn('[AYN] extractJobText failed:', err?.message); } catch {}
      return { text: '', title: cleanTitle(document.title || ''), company: '' };
    }
  }

  function extractJobText() {
    const base = extractJobTextRaw();
    try {
      const j = extractJsonLdJob();
      const meta = metaJobText();
      let best = base.text || '';
      if (j && j.text && j.text.length > best.length) best = j.text;
      if (meta && meta.length > best.length) best = meta;
      if (best && best.length > (base.text || '').length) {
        return { text: best.slice(0, MAX_JD_CHARS), title: base.title || (j && j.title) || '', company: base.company || (j && j.company) || '' };
      }
    } catch {}
    return base;
  }

  async function extractJobTextDeep() {
    const base = extractJobText();
    if (base.text && base.text.length >= 200) return base;
    if (!aynIsApplyPage(window.location.href)) return base;
    const listing = aynListingUrlFromApply(window.location.href);
    if (!listing) return base;
    try {
      const r = await new Promise(res => chrome.runtime.sendMessage({ type: 'FETCH_URL_TEXT', url: listing }, res));
      if (r && r.ok && r.text) {
        const j = parseJsonLdFromHtml(r.text);
        const meta = parseMetaFromHtml(r.text);
        let best = base.text || '', title = base.title, company = base.company;
        if (j && j.text && j.text.length > best.length) { best = j.text; title = title || j.title; company = company || j.company; }
        if (meta && meta.length > best.length) { best = meta; }
        if (best && best.length > (base.text || '').length) {
          return { text: best.slice(0, MAX_JD_CHARS), title: title || '', company: company || '' };
        }
      }
    } catch {}
    return base;
  }




  // ══════════════════════════════════════════════════════════════════
  // 2. FORM SCANNING
  // ══════════════════════════════════════════════════════════════════

  function detectATS() {
    const url = window.location.href;
    const html = document.documentElement.outerHTML.slice(0, 30000);
    if (/greenhouse\.io|boards\.greenhouse/i.test(url) || /greenhouse/i.test(html)) return 'greenhouse';
    if (/jobs\.lever\.co/i.test(url)) return 'lever';
    if (/myworkdayjobs\.com|workday/i.test(url)) return 'workday';
    if (/icims\.com/i.test(url)) return 'icims';
    if (/jobs\.ashbyhq\.com/i.test(url)) return 'ashby';
    if (/jobs\.gem\.com/i.test(url)) return 'gem';
    if (/smartrecruiters\.com/i.test(url)) return 'smartrecruiters';
    if (/cornerstoneondemand|csod\.com/i.test(url)) return 'cornerstone';
    if (/linkedin\.com\/jobs/i.test(url) && document.querySelector('[data-test-modal], .jobs-easy-apply-modal')) return 'linkedin_easy_apply';
    return 'unknown';
  }

  // Walk up the DOM and harvest the nearest visible question text near the input.
  // Tightened: only accept text that actually looks like a question/prompt,
  // not any capitalized blob — stops autofill from mislabeling fields.
  const QUESTION_RE = /\?\s*$|^(what|how|are|is|do|did|have|has|why|when|where|which|will|would|can|could|may|should|please|describe|tell|list|provide|select|choose|enter|specify)\b/i;
  function nearestQuestionText(el) {
    let node = el.parentElement;
    for (let i = 0; i < 5 && node; i++) {
      const raw = safeText(node).slice(0, 400).trim();
      if (!raw) { node = node.parentElement; continue; }
      // Try the first non-empty line — that's usually the actual question
      const firstLine = raw.split(/\n+/).map(s => s.trim()).find(s => s.length >= 3 && s.length <= 240);
      if (firstLine && QUESTION_RE.test(firstLine)) {
        return firstLine.replace(el.value || '', '').replace(/\s+/g, ' ').trim();
      }
      node = node.parentElement;
    }
    return '';
  }

  // v1.9.57 — open-answer prompt resolver for large text boxes and custom editors.
  // Many ATS pages render the question as plain text above a textarea / rich editor,
  // not as a real <label>. Resolve from visual and document proximity before falling
  // back to placeholder/name so open-ended questions do not arrive at the backend as
  // anonymous fields.
  function aynCleanPromptText(raw, maxLen = 280) {
    const lines = String(raw || '')
      .replace(/\u00a0/g, ' ')
      .split(/\n+/)
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const meaningful = lines.filter(s => !/^(\*|required|optional|optional\s*[–—-]|\d+\s*\/\s*\d+|characters?\s+remaining)$/i.test(s));
    if (!meaningful.length) return '';
    const joined = meaningful.slice(0, 3).join(' ').replace(/\s+/g, ' ').trim();
    return joined.length > maxLen ? joined.slice(0, maxLen).trim() : joined;
  }

  function aynLooksLikePromptText(text) {
    const t = String(text || '').trim();
    if (!t || t.length < 3 || t.length > 320) return false;
    if (/^(yes|no|submit|next|back|continue|apply|cancel|save|upload|attach)$/i.test(t)) return false;
    if (QUESTION_RE.test(t)) return true;
    return /\b(interested|working at|work history|career transitions?|gaps? in|expand on|clarify|motivation|why|about yourself|cover letter|additional information|anything else|tell us|describe|experience with|familiarity with)\b/i.test(t);
  }

  function aynNearbyPrompt(el) {
    try {
      if (!el || !el.getBoundingClientRect) return '';
      const ownRect = el.getBoundingClientRect();
      const ownsField = (node) => node && node.querySelector && node.querySelector('input:not([type="hidden"]), textarea, select, [contenteditable="true"], [role="textbox"]');

      // 1) Walk document-order ancestors and prefer preceding text-only siblings.
      let node = el.parentElement;
      for (let d = 0; d < 7 && node; d++, node = node.parentElement) {
        const kids = Array.from(node.children || []);
        const fieldIdx = kids.findIndex(k => k === el || k.contains(el));
        if (fieldIdx > 0) {
          const parts = [];
          for (let i = Math.max(0, fieldIdx - 3); i < fieldIdx; i++) {
            const k = kids[i];
            if (!k || (k.contains && k.contains(el))) continue;
            if (ownsField(k)) continue;
            const t = aynCleanPromptText(k.innerText || k.textContent || '');
            if (t) parts.push(t);
          }
          for (let i = parts.length - 1; i >= 0; i--) {
            if (aynLooksLikePromptText(parts[i])) return parts[i];
          }
        }
      }

      // 2) Visual pass: nearest visible text block above or left of the control.
      const root = el.closest('form, [role="form"], main, body') || document.body;
      const nodes = Array.from(root.querySelectorAll('label, legend, p, h1, h2, h3, h4, h5, strong, span, div'));
      let best = ''; let bestScore = Infinity;
      for (const n of nodes) {
        if (n === el || n.contains(el) || ownsField(n)) continue;
        const text = aynCleanPromptText(n.innerText || n.textContent || '');
        if (!aynLooksLikePromptText(text)) continue;
        const r = n.getBoundingClientRect && n.getBoundingClientRect();
        if (!r || (!r.width && !r.height)) continue;
        const above = r.bottom <= ownRect.top + 16 && r.bottom >= ownRect.top - 360 && Math.abs(r.left - ownRect.left) < 420;
        const left = r.right <= ownRect.left + 16 && Math.abs(r.top - ownRect.top) < 90;
        if (!above && !left) continue;
        const dy = above ? Math.max(0, ownRect.top - r.bottom) : Math.abs(r.top - ownRect.top);
        const dx = Math.max(0, Math.abs(r.left - ownRect.left) - 80);
        const score = dy * 1.2 + dx;
        if (score < bestScore) { bestScore = score; best = text; }
      }
      return best || '';
    } catch (_) { return ''; }
  }

  function aynNearbyRequired(el) {
    try {
      if (!el) return false;
      if (el.required || (el.getAttribute && el.getAttribute('aria-required') === 'true')) return true;
      let node = el.parentElement;
      for (let i = 0; i < 5 && node; i++, node = node.parentElement) {
        const t = String(node.innerText || node.textContent || '').slice(0, 360);
        if (/\*|\brequired\b/i.test(t)) return true;
        const aria = node.getAttribute && (node.getAttribute('aria-required') || node.getAttribute('data-required'));
        if (String(aria || '').toLowerCase() === 'true') return true;
      }
    } catch (_) {}
    return false;
  }

  // ---- Accessible name + role resolver (W3C accname-style, Playwright-inspired) ----
  function aynAccRole(el) {
    const explicit = (el.getAttribute('role') || '').trim().toLowerCase();
    if (explicit) return explicit;
    const tag = (el.tagName || '').toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'range') return 'slider';
      if (['button','submit','reset','image'].includes(type)) return 'button';
      if (['email','tel','url','number','search','password','date','datetime-local','month','time','week'].includes(type)) return 'textbox';
      return 'textbox';
    }
    if (tag === 'button') return 'button';
    if (el.getAttribute('aria-haspopup') === 'listbox' || el.getAttribute('aria-autocomplete')) return 'combobox';
    return '';
  }

  // v2.10.1 — duplicate aynVisibleText removed. The safeText-based definition
  // near line 196 is the single source of truth (adds null guard + try/catch).

  // v2.3.2 — Reject framework-generated IDs before using them as label keys.
  // Workday appends hash suffixes (--ab12cd), React uses :r0:, MUI/Radix/HeadlessUI
  // use mui-*/rc-*/radix-*, some ATSes use raw UUIDs. If we hand any of these to
  // querySelector('label[for=...]'), a stray match yields the WRONG label.
  const AYN_GENERATED_ID_RE =
    /^:[a-z0-9]+:$|^[0-9a-f]{8}-[0-9a-f]{4}-|--[a-f0-9]{6,}$|^(mui|rc|rdk|headlessui|radix)-[a-z0-9-]+$|^r[0-9]+$/i;
  function aynStableId(el) {
    const id = el && el.id;
    return id && !AYN_GENERATED_ID_RE.test(id) ? id : '';
  }


  function aynAccName(el) {
    const tryText = (s) => { const v = (s || '').replace(/\s+/g,' ').trim(); return v.length ? v : ''; };
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const parts = labelledby.split(/\s+/).map(id => {
        const ref = document.getElementById(id);
        return ref ? aynVisibleText(ref) : '';
      }).filter(Boolean);
      const joined = tryText(parts.join(' '));
      if (joined) return joined;
    }
    const al = tryText(el.getAttribute('aria-label'));
    if (al) return al;
    const sid = aynStableId(el);
    if (sid) {
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(sid)}"]`);
        const t = lbl ? tryText(aynVisibleText(lbl)) : '';
        if (t) return t;
      } catch (_) {}
    }

    const wrap = el.closest('label');
    if (wrap) {
      const clone = wrap.cloneNode(true);
      clone.querySelectorAll('input,textarea,select,button').forEach(n => n.remove());
      const t = tryText(aynVisibleText(clone));
      if (t) return t;
    }
    const title = tryText(el.getAttribute('title'));
    if (title) return title;
    const ph = tryText(el.getAttribute('placeholder'));
    if (ph) return ph;
    return '';
  }

  function aynGroupName(el) {
    const group = el.closest('[role="radiogroup"], [role="group"], fieldset');
    if (group) {
      const direct = aynAccName(group);
      if (direct) return direct;
      const legend = group.querySelector('legend');
      if (legend) { const t = aynVisibleText(legend); if (t) return t; }
      const h = group.querySelector('legend, [class*="label"], [class*="question"], h2, h3, h4, strong, p');
      if (h && !h.contains(el)) { const t = aynVisibleText(h); if (t && t.length < 400) return t; }
    }
    return '';
  }

  function aynResolveLabel(el) {
    const role = aynAccRole(el);
    let name = aynAccName(el);
    if (role === 'radio' || role === 'checkbox') {
      const g = aynGroupName(el);
      if (g) name = g;
    }
    return { role, name };
  }

  // v1.9.43 — robust question resolver used by injectValues text-match fallback.
  // Prefers proper labels; walks up to previous-sibling headings only when absent.
  function aynFieldQuestion(el) {
    if (!el || !el.getAttribute) return '';
    const c = s => (s || '').replace(/\s+/g, ' ').trim();
    let v = c(el.getAttribute('aria-label')); if (v) return v;
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const t = lb.split(/\s+/).map(id => {
        const r = document.getElementById(id); return r ? r.innerText : '';
      }).join(' ');
      if (c(t)) return c(t);
    }
    const sid2 = aynStableId(el);
    if (sid2) {
      try {
        const l = document.querySelector(`label[for="${CSS.escape(sid2)}"]`);
        if (l && c(l.innerText)) return c(l.innerText);
      } catch (_) {}
    }

    const w = el.closest && el.closest('label');
    if (w) {
      const cl = w.cloneNode(true);
      cl.querySelectorAll('input,textarea,select,button').forEach(n => n.remove());
      if (c(cl.innerText)) return c(cl.innerText);
    }
    // 5. v1.9.57 — nearest plain-text prompt above large text fields / editors.
    try { const nearPrompt = aynNearbyPrompt(el); if (nearPrompt) return nearPrompt; } catch (_) {}
    // 6. document-order walk-up: at each ancestor, find the text block that precedes THIS field
    //    among the ancestor's children and does not contain another fillable field.
    let node = el.parentElement;
    for (let d = 0; d < 6 && node; d++, node = node.parentElement) {
      const kids = Array.from(node.children);
      const fieldIdx = kids.findIndex(k => k.contains(el));
      if (fieldIdx > 0) {
        for (let i = fieldIdx - 1; i >= 0; i--) {
          const k = kids[i];
          if (k.querySelector && k.querySelector('input:not([type="hidden"]), textarea, select')) continue;
          const t = (k.innerText || '').replace(/\s+/g, ' ').trim();
          const firstLine = t.split('\n')[0].trim();
          if (firstLine && firstLine.length >= 3 && firstLine.length < 200 && !/^(\*|required)$/i.test(firstLine)) {
            return firstLine.slice(0, 160);
          }
        }
      }
    }
    // 7. placeholder
    const ph = c(el.getAttribute('placeholder'));
    if (ph) return ph;
    // 8. v1.9.56 — visual-neighbor fallback (grid forms, DOM ≠ visual order)
    try { const vn = aynVisualNeighbor(el); if (vn) return vn; } catch (_) {}
    // 9. v1.9.56 — synthesize from name attr as last resort so backend still receives it
    const nm = c(el.getAttribute('name'));
    if (nm && !/^[a-f0-9-]{20,}$/i.test(nm)) return nm.replace(/[_\-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    return '';
  }

  function aynQuestionScore(a, b) {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    a = clean(a); b = clean(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.9;
    const wa = new Set(a.split(' ').filter(w => w.length > 3));
    const wb = b.split(' ').filter(w => w.length > 3);
    if (!wb.length) return 0;
    let h = 0; wb.forEach(w => { if (wa.has(w)) h++; });
    return h / Math.max(wa.size, wb.length);
  }

  function aynShortLabelFallback(el) {
    try {
      let node = el.parentElement;
      for (let i = 0; i < 5 && node; i++) {
        const controls = node.querySelectorAll('input, textarea, select');
        if (controls.length > 1) break; // shared container, stop climbing
        const clone = node.cloneNode(true);
        clone.querySelectorAll('input,textarea,select,button,svg').forEach(n => n.remove());
        const raw = (clone.innerText || clone.textContent || '').trim();
        const firstLine = raw.split(/\n+/).map(s => s.trim()).find(s => s.length >= 2 && s.length <= 120);
        if (firstLine) {
          const out = { label: firstLine.replace(/\s*\*\s*$/, '').replace(/\s+/g, ' ').trim(), required: /\*\s*$/.test(firstLine) };
          try { el.__aynProxLabel = out; } catch (_) {}
          return out;
        }
        node = node.parentElement;
      }
    } catch (_) {}
    return null;
  }

  function getLabelFor(el) {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
    const sid3 = aynStableId(el);
    if (sid3) {
      const lbl = document.querySelector(`label[for="${CSS.escape(sid3)}"]`);
      if (lbl) return lbl.innerText.trim();
    }

    const wrap = el.closest('label');
    if (wrap) return wrap.innerText.replace(el.value || '', '').trim();
    const lblId = el.getAttribute('aria-labelledby');
    if (lblId) {
      const parts = lblId.split(' ').map(id => document.getElementById(id)?.innerText?.trim()).filter(Boolean);
      if (parts.length) return parts.join(' ');
    }
    const section = el.closest('fieldset, [class*="field"], [class*="question"], [class*="form-group"], [data-automation-id], li, div');
    if (section) {
      const h = section.querySelector('legend, label, [class*="label"], [class*="question"], h3, h4, strong, [data-automation-id*="label"]');
      if (h && !h.contains(el)) {
        const t = h.innerText.trim();
        if (t && t.length < 240) return t;
      }
    }
    // Last resort: walk ancestors for the nearest question-shaped text
    const near = nearestQuestionText(el);
    if (near) return near;
    const prox = aynShortLabelFallback(el);
    if (prox && prox.label) return prox.label;
    // v1.9.57 — stronger prompt fallback for textareas and rich editors.
    try { const np = aynNearbyPrompt(el); if (np) return np; } catch (_) {}
    // v1.9.56 — visual-neighbor fallback before falling back to placeholder/name
    try { const vn = aynVisualNeighbor(el); if (vn) return vn; } catch (_) {}
    return el.placeholder?.trim() || el.name?.replace(/[_\-]/g, ' ').trim() || '';
  }



  // Strip bilingual labels (e.g. "Are you authorized?/Êtes-vous autorisé?") and return the
  // mostly-ASCII half so downstream regex classifiers work on the English text.
  function aynStripBilingual(label) {
    const raw = String(label || '').trim();
    if (!raw) return raw;
    const parts = raw.split(/\s*[\/|·|\n\r]+\s*/).map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) return raw;
    const asciiRatio = (s) => {
      if (!s) return 0;
      const m = s.match(/[A-Za-z0-9 ,.'?()\-]/g);
      return m ? m.length / s.length : 0;
    };
    // Prefer the first half if it looks English enough; otherwise scan all halves.
    let best = parts[0]; let bestScore = asciiRatio(parts[0]);
    for (const p of parts.slice(1)) {
      const s = asciiRatio(p);
      if (s > bestScore + 0.05) { best = p; bestScore = s; }
    }
    return bestScore > 0.8 ? best : raw;
  }

  // Classify a field into a semantic group so the AI can reason about it
   function classifyField(label, name, type) {
     const stripped = aynStripBilingual(label);
     // v1.9.49 — normalize + strip diacritics so FR/ES/DE synonyms match case- and accent-insensitively.
     const l = (((stripped || '') + ' ' + (name || '')).toLowerCase())
       .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
     if (/middle\s*name|deuxieme\s*prenom|segundo\s*nombre/.test(l)) return 'identity.middle_name';
     if (/preferred\s*(first\s*)?name|nick\s*name|name\s+you\s+go\s+by|prenom\s+prefere|nombre\s+preferido|rufname/.test(l)) return 'identity.preferred_name';
     if (/\bfirst\s*name|given\s*name|forename\b|\bprenom\b|\bnombre\b|\bvorname\b/.test(l)) return 'identity.first_name';
     if (/\blast\s*name|surname|family\s*name\b|nom\s+de\s+famille|\bapellido|\bnachname|\bapellidos\b/.test(l)) return 'identity.last_name';
     if (/\bfull\s*name|legal\s*name\b|nom\s+complet|nombre\s+completo|vollstandiger\s+name/.test(l) || /^(name|nom|nombre)$/i.test((stripped||'').trim())) return 'identity.full_name';
     if (/\bemail\b|\bcourriel\b|adresse\s+courriel|adresse\s+electronique|\bcorreo\b|correo\s+electronico|e[-\s]?mail/.test(l)) return 'identity.email';
     if (/\bphone|mobile|cell\b|\btelephone\b|numero\s+de\s+telephone|\btelefono\b|telefonnummer|handynummer|portable/.test(l)) return 'identity.phone';
     if (/\baddress|street\b|\badresse\b|\bdireccion\b|strasse|anschrift/.test(l)) return 'identity.address';
     if (/\bcity|town\b|\bville\b|\bciudad\b|\bstadt\b/.test(l)) return 'identity.city';
     if (/\bstate|province|region\b|provincia|bundesland/.test(l)) return 'identity.state';
     if (/\bzip|postal\s*code|postcode\b|code\s+postal|codigo\s+postal|postleitzahl|\bplz\b/.test(l)) return 'identity.postal_code';
     if (/\bcountry\b|\bpays\b|\bpais\b|\bland\b/.test(l)) return 'identity.country';
    if (/linkedin/.test(l)) return 'link.linkedin';
    if (/portfolio|website|personal\s*site/.test(l)) return 'link.portfolio';
    if (/github/.test(l)) return 'link.github';
     if (/authoriz(e|ed)\s+to\s+work|work\s+authorization|legally\s+(authorized|allowed|entitled)|right\s+to\s+work|autoris(e|ee?)\s+a\s+travailler|autorisation\s+de\s+travail|permis\s+de\s+travail|autorizad[oa]\s+para\s+trabajar|arbeitserlaubnis|arbeitsgenehmigung/.test(l)) return 'logic.work_auth';
     if (/sponsor|visa|require.*sponsorship|parrainage|patrocinio/.test(l)) return 'logic.sponsorship';
     if (/relocat|demenager|relocalisation|reubicacion|umzug|umziehen/.test(l)) return 'logic.relocate';
    if (/remote|hybrid|on[\s-]?site/.test(l) && type !== 'text') return 'logic.work_mode';
    if (/years?\s+of\s+experience|experience\s+(level|years)|how\s+many\s+years/.test(l)) return 'logic.years_experience';
    if (/highest\s+(degree|education|level)|education\s+level|degree/.test(l) && type !== 'text') return 'logic.education_level';
    // Preferred city (checkbox/radio group of cities) takes precedence over generic preferred_location
    if (/preferred\s+(office|work)?\s*(city|location)|which\s+city.*(work|office)|preferred\s+office\s+location|city\s+.*(prefer|preferred)/.test(l) && (type === 'checkbox' || type === 'radio' || type === 'buttongroup')) return 'logic.preferred_city';
    // Salary min/max detection when label/name signals min|max|from|to and the surrounding context has salary/comp/currency
     if (/(salary|compensation|expectation|salaire|remuneration|attentes\s+salariales|salario|gehalt|\$|€|£|cad|usd)/.test(l) && /\b(min(imum)?|from|a\s*partir|starting|floor|low(er)?)\b/.test(l)) return 'logic.salary_min';
     if (/(salary|compensation|expectation|salaire|remuneration|attentes\s+salariales|salario|gehalt|\$|€|£|cad|usd)/.test(l) && /\b(max(imum)?|to|jusqu|upper|high(er)?|ceiling|top)\b/.test(l)) return 'logic.salary_max';
     if (/salary\s+(expectation|expected|range|requirement)|expected\s+salary|compensation|salaire|remuneration|attentes\s+salariales|salario|gehalt|gehaltsvorstellung/.test(l)) return 'logic.salary';
    if (/notice\s+period|when\s+can\s+you\s+start|start\s+date|available/.test(l)) return 'logic.start_date';
    if (/gender|sex\b/.test(l)) return 'eeo.gender';
    if (/ethnic|race|hispanic/.test(l)) return 'eeo.ethnicity';
    if (/veteran/.test(l)) return 'eeo.veteran';
    if (/disab(ility|led)/.test(l)) return 'eeo.disability';
    if (/pronoun/.test(l)) return 'eeo.pronouns';
    if (/tell\s+(us|me)\s+about|about\s+yourself|introduce\s+yourself/.test(l)) return 'open.about';
    if (/motivat|why\s+(this|do you want|are you interested|are you applying|.*role|.*company|.*position)|why\s+(does|do)\s+\w+|explore\s+a\s+new/.test(l)) return 'open.why';
    if (/cover\s+letter|message\s+to\s+(hiring|recruiter)|lettre\s+de\s+motivation|carta\s+de\s+presentacion|anschreiben|motivationsschreiben/.test(l)) return 'open.cover';
    if (/heard.*about|where.*find|how.*hear|source/.test(l)) return 'open.source';
    if (/legal(ly)?\s+(eligible|able|entitled)\s+to\s+work|eligible\s+to\s+work\b|proof\s+of\s+(eligibility|authorization)/.test(l)) return 'logic.work_auth';
    if (/citizen|permanent\s+resident|\bpr\b\s+status|immigration\s+status|status\s+in\s+canada/.test(l)) return 'logic.citizenship';
    if (/\b18\b|over\s+18|at\s+least\s+18|legal\s+working\s+age|age\s+of\s+majority/.test(l)) return 'logic.legal_age';
    if (/security\s+clearance|clearance\s+level|secret\s+clearance/.test(l)) return 'logic.clearance';
    if (/driver'?s?\s+licen[cs]e|valid\s+licen[cs]e/.test(l)) return 'logic.drivers_license';
    if (/willing\s+to\s+travel|able\s+to\s+travel|travel\s+(up\s+to|requirement|percentage|%)/.test(l)) return 'logic.travel';
    // Multi-checkbox languages field (before generic logic.languages)
     if ((type === 'checkbox') && /languages?\s+(you\s+)?(are\s+)?(fluent|speak|proficient|spoken)|which\s+languages?|specify.*languages?|fluent\s+in|langues?\s+parl|quelles\s+langues|idiomas?\s+que\s+habla|welche\s+sprachen/.test(l)) return 'logic.languages_multi';
     if (/what\s+languages|languages?\s+(do\s+you|you\s+speak|spoken|proficiency|fluency)|fluent\s+in|bilingual|langue|langues|idioma|sprache|sprachen/.test(l)) return 'logic.languages';
    if (/criminal|convicted|felony|background\s+check|drug\s+(test|screen)/.test(l)) return 'logic.background';
    // Company-history specific patterns take precedence over generic prior_relationship
    if (/currently\s+employed\s+by|current\s+employee\s+of|are\s+you\s+.*current(ly)?\s+.*employee/.test(l)) return 'logic.company_current_employee';
    if (/(past|former|previous)\s+.*employee|previously\s+worked\s+(at|for)|ever\s+been\s+an\s+employee/.test(l)) return 'logic.company_past_employee';
    if (/current(ly)?\s+(employed|employee).*(here|us|company)|former\s+employee|previously\s+(employed|worked|applied)|ever\s+(worked|applied)\s+(at|for|here|with\s+us)/.test(l)) return 'logic.prior_relationship';
    if (/non[\s-]?compete|non[\s-]?disclosure|\bnda\b|restrictive\s+covenant/.test(l)) return 'logic.noncompete';
    if (/accommodat/.test(l)) return 'logic.accommodation';
    if (/referr?ed\s+by|referral\s+(name|source)|who\s+referred|refere\s+par|recommande\s+par|referido\s+por|empfohlen\s+von/.test(l)) return 'open.referral';
    if (/reference|referee/.test(l)) return 'logic.references';
    if (/preferred\s+(location|office)|which\s+(location|office)|work\s+location/.test(l)) return 'logic.preferred_location';
    if (/employment\s+type|full[\s-]?time|part[\s-]?time|contract|desired\s+(employment|job\s+type)/.test(l) && type !== 'text') return 'logic.employment_type';
    if (/subscribe|newsletter|marketing|keep\s+me\s+(updated|informed)|opt[\s-]?in/.test(l)) return 'consent.marketing';
    if (/agree\b|consent|terms|privacy\s+policy|i\s+certify|i\s+acknowledge|i\s+confirm|gdpr|data\s+(processing|protection)/.test(l)) return 'consent.agree';
    if (/describe\s+a\s+time|tell\s+(us|me)\s+about\s+a\s+time|give\s+(an|us\s+an)\s+example|situation\s+where/.test(l)) return 'open.behavioral';
    if (/work\s+history|employment\s+history|career\s+transition|resume\s+gap|gaps?\s+in\s+(your\s+)?resume|clarify\s+or\s+expand|anything\s+.*(clarify|expand)|additional\s+information/.test(l)) return 'open.work_history';
    // Dependent follow-up text fields ("Which agency", "Please specify", "If yes, ...")
    if (type === 'text' && /which\s+(agency|bu|department|team)|please\s+specify|if\s+(yes|so)\s*,|if\s+yes\s+which/.test(l)) return 'logic.dependent_followup';
    // Widened v1.9.37 categories
    if (/notice\s+period|weeks?\s+of\s+notice|how\s+much\s+notice/.test(l)) return 'logic.notice_period';
    if (/earliest\s+start|when\s+(can|could)\s+you\s+start|available\s+start|start\s+availability/.test(l)) return 'logic.start_date';
    if (/hours?\s+per\s+week|weekly\s+hours|availability.*hours/.test(l)) return 'logic.hours_per_week';
    if (/reference\s*(1|one|#?1)?\s*(name|contact)|first\s+reference/.test(l)) return 'logic.reference_name';
    if (/reference.*email|referee.*email/.test(l)) return 'logic.reference_email';
    if (/reference.*(phone|number|tel)/.test(l)) return 'logic.reference_phone';
    if (/current\s+salary|current\s+compensation|present\s+salary/.test(l)) return 'logic.current_salary';
    if (/desired\s+salary|expected\s+salary|salary\s+expectation/.test(l)) return 'logic.salary';
    return 'other';
  }

  // Resolve whether a text/number input is the min or max half of a salary range pair.
  // Looks at the nearest fieldset/section header for salary/comp keywords, then decides
  // by aria-label/name/placeholder or by DOM order (first sibling = min, second = max).
  function resolveSalaryRole(el) {
    try {
      if (!el || !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return null;
      const t = (el.type || '').toLowerCase();
      if (t && !/^(text|number|tel|)$/.test(t)) return null;
      const section = el.closest('fieldset, [class*="field-entry"], [class*="fieldEntry"], [data-automation-id], [class*="question"], [class*="form-group"]');
      if (!section) return null;
      const header = section.querySelector('legend, label, [class*="label"], [class*="question"], h3, h4');
      const headText = header ? aynStripBilingual((header.innerText || '').trim()).toLowerCase() : '';
      if (!/salary|compensation|expectation|pay\s+range|comp\s+range/.test(headText)) return null;
      // Direct hint from this input
      const own = ((el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('placeholder') || '')) + ' ' + (el.name || '') + ' ' + (el.id || '')).toLowerCase();
      if (/\b(min(imum)?|from|starting|floor|low)\b/.test(own)) return 'min';
      if (/\b(max(imum)?|\bto\b|upper|ceiling|high|top)\b/.test(own)) return 'max';
      // Fall back to DOM order among sibling numeric/text inputs inside the section
      const sibs = Array.from(section.querySelectorAll('input')).filter(i => {
        const it = (i.type || '').toLowerCase();
        return !it || it === 'text' || it === 'number' || it === 'tel';
      });
      if (sibs.length === 2) {
        return sibs[0] === el ? 'min' : (sibs[1] === el ? 'max' : null);
      }
    } catch {}
    return null;
  }


  // Return options as {label, value} pairs for select/radio/checkbox groups.
  function getOptionPairs(el) {
    if (el.tagName === 'SELECT') {
      return Array.from(el.options)
        .filter(o => o.value !== '' || (o.textContent || '').trim())
        .map(o => ({ label: (o.textContent || '').trim(), value: o.value }))
        .slice(0, 40);
    }
    if ((el.type === 'radio' || el.type === 'checkbox') && el.name) {
      const root = el.ownerDocument || document;
      return Array.from(root.querySelectorAll(`input[type="${el.type}"][name="${CSS.escape(el.name)}"]`))
        .map(s => ({ label: (getLabelFor(s) || s.value || '').trim(), value: s.value || (getLabelFor(s) || '').trim() }))
        .filter(o => o.label || o.value)
        .slice(0, 30);
    }
    return [];
  }

  // Heuristic: is this text input acting like a typeahead/combobox?
  function isTypeahead(el) {
    if (el.tagName !== 'INPUT') return false;
    if ((el.type || 'text') !== 'text' && el.type !== 'search') return false;
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (role === 'combobox' || role === 'searchbox') return true;
    if (el.getAttribute('aria-autocomplete')) return true;
    if (el.getAttribute('aria-haspopup') === 'listbox') return true;
    if (el.getAttribute('aria-controls') || el.getAttribute('aria-owns')) {
      const id = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
      const tgt = id && document.getElementById(id);
      if (tgt && /listbox|menu|option/i.test(tgt.getAttribute('role') || tgt.className || '')) return true;
    }
    if (el.getAttribute('list')) return true;
    const cls = (el.className || '') + ' ' + (el.parentElement?.className || '');
    if (/combobox|typeahead|autocomplete|select__input|react-select|downshift/i.test(cls)) return true;
    const ph = (el.placeholder || '').toLowerCase();
    if (/start typing|search\.\.\.|begin typing/.test(ph)) return true;
    return false;
  }

  function isFilled(el) {
    if (el.tagName === 'SELECT') return !!el.value;
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
    return (el.value || '').trim().length > 0;
  }

  // v1.9.49 — recursively collect top doc + open shadow roots + same-origin
  // (possibly nested) iframes. Shadow roots get sh<n>: prefix; iframes get
  // frame<i>: prefix scoped to their host root; nested prefixes concatenate.
  // Every root is registered in window.__AYN_ROOTS_MAP__ so injectValues can
  // resolve elements later.
  function collectScannableDocs() {
    const docs = [];
    const map = new Map();
    const seenRoots = new WeakSet();
    function add(root, prefix) {
      if (!root || seenRoots.has(root)) return;
      seenRoots.add(root);
      docs.push({ doc: root, prefix });
      map.set(prefix, root);
      let els;
      try { els = root.querySelectorAll ? root.querySelectorAll('*') : []; } catch { return; }
      els.forEach(el => {
        try {
          if (el.shadowRoot) {
            add(el.shadowRoot, prefix + `sh${aynFid(el)}:`);
          }
        } catch {}
        if (el.tagName === 'IFRAME') {
          try {
            const fdoc = el.contentDocument;
            if (fdoc) add(fdoc, prefix + `frame${aynFid(el)}:`);
          } catch { /* cross-origin, ignore */ }
        }
      });
    }
    add(document, '');
    try { window.__AYN_ROOTS_MAP__ = map; } catch {}
    return docs;
  }

  function aynScanDiag() {
    const out = [];
    const seen = new Set();
    const push = (el, note) => {
      if (!el || seen.has(el) || out.length >= 30) return;
      seen.add(el);
      const anc = [];
      let p = el.parentElement;
      for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
        anc.push({ tag: p.tagName, role: p.getAttribute('role') || '', cls: String(p.className || '').slice(0, 50) });
      }
      out.push({
        note,
        tag: el.tagName,
        type: el.getAttribute('type') || '',
        role: el.getAttribute('role') || '',
        name: el.getAttribute('name') || '',
        ariaChecked: el.getAttribute('aria-checked') || '',
        ariaLabel: String(el.getAttribute('aria-label') || '').slice(0, 40),
        cls: String(el.className || '').slice(0, 60),
        text: String(el.innerText || el.textContent || '').trim().slice(0, 40),
        ancestors: anc,
      });
    };
    try {
      document.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], [role="radiogroup"], [role="group"]').forEach(el => push(el, 'aria-native'));
      const optionWords = /^(us|canada|ireland|male|female|non-binary|agender|other gender|asian|black|white|hispanic|indigenous|native hawaiian|middle eastern|yes|no|decline to self-identify|prefer not to disclose|i identify as|i am not a|i do not wish)/i;
      document.querySelectorAll('label, button, div, span, li, a').forEach(el => {
        if (out.length >= 30) return;
        if (el.children.length > 2) return;
        const t = String(el.innerText || '').trim();
        if (t && t.length < 48 && optionWords.test(t)) push(el, 'option-text');
      });
    } catch (_) {}
    return out;
  }

  // v1.9.37 — capture section heading, sibling labels, helper text and placeholder for each field.
  // Gives the AI real context so it can answer questions whose meaning depends on neighbors
  // (e.g. "Address line 2" under "Mailing address"; "Which agency" under a prior Yes/No).
  function aynCaptureContext(el) {
    const ctx = { section: '', siblingLabels: [], helperText: '', placeholder: '', labelRaw: '' };
    try {
      if (!el) return ctx;
      ctx.placeholder = (el.placeholder || el.getAttribute?.('placeholder') || '').trim().slice(0, 120);
      // aria-describedby → helper text
      const descId = el.getAttribute && el.getAttribute('aria-describedby');
      if (descId) {
        const parts = String(descId).split(/\s+/).map(id => {
          const n = el.ownerDocument && el.ownerDocument.getElementById(id);
          return n ? (n.innerText || n.textContent || '').trim() : '';
        }).filter(Boolean);
        if (parts.length) ctx.helperText = parts.join(' ').slice(0, 240);
      }
      // Section heading — walk up to nearest section/fieldset/form-section container, take its heading
      let node = el.parentElement;
      for (let i = 0; i < 8 && node; i++, node = node.parentElement) {
        const isSection = node.tagName === 'FIELDSET' || node.tagName === 'SECTION'
          || /section|group|card|panel|step|page/i.test(node.className || '')
          || node.getAttribute?.('role') === 'group';
        if (!isSection) continue;
        const h = node.querySelector('legend, h1, h2, h3, h4, [class*="heading"], [class*="section-title"], [class*="sectionTitle"]');
        if (h && !h.contains(el)) {
          const t = (h.innerText || h.textContent || '').trim();
          if (t && t.length < 120) { ctx.section = t; break; }
        }
      }
      // Sibling labels — up to 3 preceding sibling field labels in the same form-row group
      try {
        const row = el.closest('fieldset, [class*="field"], [class*="form-group"], [class*="row"]');
        if (row) {
          const inputs = Array.from(row.querySelectorAll('input, select, textarea')).filter(i => i !== el && !i.disabled);
          const seen = new Set();
          for (const inp of inputs.slice(0, 4)) {
            const lbl = (typeof aynResolveLabel === 'function' ? (aynResolveLabel(inp).name || getLabelFor(inp)) : getLabelFor(inp)) || '';
            const clean = String(lbl || '').trim().slice(0, 60);
            if (!clean || seen.has(clean)) continue;
            seen.add(clean);
            ctx.siblingLabels.push(clean);
            if (ctx.siblingLabels.length >= 3) break;
          }
        }
      } catch {}
    } catch {}
    return ctx;
  }

  // v1.9.62 — shared question resolver for native radios, structural radios,
  // ARIA/custom radios, label groups and Yes/No merges. The previous scanners
  // each guessed independently, which let helper copy such as "Question" or
  // "What is considered a disability?" replace the real field title.
  function aynNormLine(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function aynFirstUsefulLine(text) {
    const lines = String(text || '').split(/[\n\r]+/).map(aynNormLine).filter(Boolean);
    return lines[0] || '';
  }
  function aynHashShort(s) {
    let h = 2166136261;
    const str = String(s || '');
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  // v2.0.0 — question resolution moved to dom.js (self.AYN_DOM), the single
  // brain for label logic: page-global option-text exclusion plus proximity
  // decay. This thin delegate keeps all nine call sites unchanged.
  function aynFindQuestionForOptionGroup(container, optionsOrEls, fallbackEl) {
    try {
      if (self.AYN_DOM && self.AYN_DOM.findQuestion) {
        return self.AYN_DOM.findQuestion(container, optionsOrEls, fallbackEl, (container && container.ownerDocument) || document);
      }
    } catch (_) {}
    return { label: '', source: '' };
  }

  function aynFingerprintField(field) {
    try {
      const label = aynNormLine(field.label || '').toLowerCase();
      const section = aynNormLine(field.section || '').toLowerCase();
      const opts = Array.isArray(field.options) ? field.options.map(o => aynNormLine(o.label || o.value || '').toLowerCase()).join('|') : '';
      const sig = [field._frame || '', field.kind || field.type || '', label, section, field.name || '', opts].join('::');
      return `fp_${aynHashShort(sig)}`;
    } catch (_) { return `fp_${aynHashShort(Math.random())}`; }
  }

  // v1.9.67 — stable field identity. A monotonic sequence stamped directly on the
  // DOM node. Survives rescans: a node keeps its id for the lifetime of the page,
  // so re-scanning never repoints ids the way the old per-scan counters did.
  function aynFid(el) {
    try {
      if (!el.__aynFid) {
        window.__AYN_FID_SEQ__ = (window.__AYN_FID_SEQ__ || 0) + 1;
        el.__aynFid = window.__AYN_FID_SEQ__;
      }
      return el.__aynFid;
    } catch (_) {
      return Math.floor(Math.random() * 1e9);
    }
  }

  // v2.3.1 — prefer the Question Engine's projected questions when present and
  // the flag is on; otherwise fall back to the legacy scanner. The engine stamps
  // data-ayn-fid on the same nodes the injector resolves, so ids stay valid.
  // v2.3.1 — register engine choice-groups into the injector's lookup maps.
  // The injector resolves __structradio__ via window.__AYN_STRUCTRADIO_MAP__
  // (entry: {container, radios}) and __checkbox__:multi via
  // window.__AYN_MULTICHECK_MAP__ (array of boxes). The engine stamps
  // data-ayn-fid on controls; we resolve those nodes and register the group.
  function aynRegisterEngineGroups(rich) {
    try {
      window.__AYN_STRUCTRADIO_MAP__ = window.__AYN_STRUCTRADIO_MAP__ || new Map();
      window.__AYN_MULTICHECK_MAP__ = window.__AYN_MULTICHECK_MAP__ || new Map();
      window.__AYN_BG_MAP__ = window.__AYN_BG_MAP__ || new Map();
      window.__AYN_TEXT_FIELD_MAP__ = window.__AYN_TEXT_FIELD_MAP__ || new Map();
      for (const q of rich) {
        const kind = q && q.kind;
        const controls = Array.isArray(q.controls) ? q.controls : [];
        if (controls.length < 1) continue;
        const nodes = controls
          .map(function (c) { return document.querySelector('[data-ayn-fid="' + (c && c.fid) + '"]'); })
          .filter(Boolean);
        if (!nodes.length) continue;
        let container = nodes[0].closest('fieldset,[role="radiogroup"],[role="group"],[class*="fieldEntry"],[class*="field-entry"],[class*="field"],[class*="question"]') || nodes[0].parentElement;
        if (container && !nodes.every(function (n) { return container.contains(n); })) {
          container = nodes[0].parentElement;
        }
        if (kind === 'single_choice') {
          window.__AYN_STRUCTRADIO_MAP__.set(q.id, { container: container, radios: nodes });
        } else if (kind === 'multi_choice') {
          window.__AYN_MULTICHECK_MAP__.set(q.id, nodes);
        } else if (kind === 'boolean') {
          const opts = (Array.isArray(q.options) && q.options.length ? q.options : [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }])
            .map(function (o) { return String((o && (o.label || o.value)) || '').trim(); })
            .filter(Boolean);
          window.__AYN_BG_MAP__.set(q.id, {
            qLabel: q.label || '',
            optionTexts: opts.length ? opts : ['Yes', 'No'],
            containerSelector: container ? aynBuildQuickSelector(container) : '',
            fids: controls.map(function (c) { return c && c.fid; }).filter(Boolean),
          });
        } else if (kind === 'text' || kind === 'date' || kind === 'file') {
          window.__AYN_TEXT_FIELD_MAP__.set(q.id, nodes[0]);
        }
      }
    } catch (e) { /* non-fatal */ }
  }

  function aynBuildQuickSelector(el) {
    try {
      if (!el || el.nodeType !== 1) return '';
      if (el.id) return '#' + (CSS && CSS.escape ? CSS.escape(el.id) : el.id);
      const fid = el.getAttribute && el.getAttribute('data-ayn-fid');
      if (fid) return '[data-ayn-fid="' + String(fid).replace(/"/g, '\\"') + '"]';
      const parts = [];
      let n = el;
      for (let i = 0; i < 4 && n && n.nodeType === 1; i++, n = n.parentElement) {
        let part = n.tagName.toLowerCase();
        const cls = String(n.getAttribute('class') || '').split(/\s+/).find(Boolean);
        if (cls) part += '.' + cls.replace(/[^\w-]/g, '');
        parts.unshift(part);
      }
      return parts.join(' > ');
    } catch (_) { return ''; }
  }

  // v2.5.7 — dedupe rapid rescans. A successful scan populates
  // __AYN_QUESTIONS__ and then subsequent DOM mutations often trigger empty
  // rescans (rich=0). Those must not re-enter the pipeline or spam logs.
  let __aynLastHybridN = -1;
  let __aynLastHybridAt = 0;
  function scanFormFieldsHybrid() {
    // v2.4 — no legacy fallback. Question Engine is authoritative.
    try {
      const rich = window.__AYN_QUESTIONS__;
      const legacy = window.__AYN_QUESTIONS_LEGACY__;
      const rN = Array.isArray(rich) ? rich.length : 0;
      const lN = Array.isArray(legacy) ? legacy.length : 0;
      const now = Date.now();
      const dupe = (rN === __aynLastHybridN) && (now - __aynLastHybridAt < 1500);
      __aynLastHybridN = rN;
      __aynLastHybridAt = now;
      if (!dupe) { try { console.log('[AYN-HYBRID] rich=' + rN + ' legacy=' + lN); } catch (_) {} }
      if (rN === 0) {
        // Silent: empty rescans right after a successful fill are expected.
        return [];
      }
      aynRegisterEngineGroups(rich);
      const projected = rich.map(function (q) {
        const firstRef = Array.isArray(q.controls) ? q.controls[0] : null;
        const liveNode = firstRef && firstRef.fid ? document.querySelector('[data-ayn-fid="' + firstRef.fid + '"]') : null;
        const currentValue = (() => {
          try {
            if (!liveNode) return '';
            if (liveNode.type === 'checkbox' || liveNode.type === 'radio') return liveNode.checked ? (liveNode.value || 'checked') : '';
            if (liveNode.tagName === 'SELECT') return liveNode.options[liveNode.selectedIndex]?.text || liveNode.value || '';
            return liveNode.value || liveNode.innerText || '';
          } catch (_) { return ''; }
        })();
        let legacyKind, legacyType;
        switch (q.kind) {
          case 'single_choice': legacyKind = 'structradio'; legacyType = 'radio'; break;
          case 'multi_choice':  legacyKind = 'checkbox';    legacyType = 'checkbox'; break;
          case 'boolean':       legacyKind = 'buttongroup'; legacyType = 'buttongroup'; break;
          case 'file':          legacyKind = 'file';        legacyType = 'file'; break;
          case 'date':          legacyKind = 'text';        legacyType = 'text'; break;
          case 'text':
          default:              legacyKind = 'text';        legacyType = 'text'; break;
        }
        return {
          id: q.id,
          kind: legacyKind,
          type: legacyType,
          label: q.label || '',
          name: '',
          options: Array.isArray(q.options)
            ? q.options.map(function (o) { return { value: o.value, label: o.label }; })
            : [],
          required: !!q.required,
          group: q.semanticType || '',
          section: q.section || '',
          placeholder: q.placeholder || '',
          currentValue,
          multi: q.kind === 'multi_choice',
          _frame: q.frame || '',
          labelSource: 'engine',
          confidence: q.confidence && typeof q.confidence.overall === 'number' ? q.confidence.overall : undefined,
          _engine: true
        };
      });
      try {
        projected._fileFields = projected.filter(function (f) {
          return f && (f.kind === 'file' || f.type === 'file' || /resume|cv|curriculum|upload|attach/i.test(String(f.label || '')));
        }).map(function (f) { return { ...f, isResume: /resume|cv|curriculum|upload|attach/i.test(String(f.label || '')) }; });
      } catch (_) { projected._fileFields = []; }
      return projected;
    } catch (e) {
      try { console.log('[AYN-HYBRID] engine path threw:', e); } catch (_) {}
      return [];
    }
  }



  // ══════════════════════════════════════════════════════════════════
  // 3. VALUE INJECTION
  // ══════════════════════════════════════════════════════════════════

  function resolveDoc(id, _frame) {
    let doc = document;
    let rawId = id || '';
    // v1.9.49 — support concatenated prefixes: frame0:sh1:frame2:...
    const m = /^((?:(?:frame\d+|sh\d+):)+)(.*)$/.exec(rawId);
    let prefix = '';
    if (m) { prefix = m[1]; rawId = m[2]; }
    else if (_frame) { prefix = _frame; }
    if (prefix) {
      let map = (typeof window !== 'undefined' && window.__AYN_ROOTS_MAP__) || null;
      let root = map && map.get(prefix);
      if (!root) {
        // Rebuild registry (docs may have re-rendered)
        try { collectScannableDocs(); } catch {}
        map = (typeof window !== 'undefined' && window.__AYN_ROOTS_MAP__) || null;
        root = map && map.get(prefix);
      }
      if (root) doc = root;
    }
    return { doc, rawId };
  }

  // v1.9.51 — shared field-element resolver. MUST match injectValues' resolution
  // so the settle-and-reapply pass targets the exact same DOM node injection
  // wrote to. Handles: real ids, name= lookups, and index-scheme ids like "f4".
  // v2.6.2 — a stored node ref is only trustworthy if it is still attached to
  // the document. Mid-fill partial rebuilds (Ashby bot-check rerenders) detach
  // subtrees without a navigation, leaving maps full of dead nodes that read
  // as empty and produce false "postverify-failed" / silent wipes.
  function aynLiveEl(el) {
    try { return (el && el.isConnected) ? el : null; } catch (_) { return el || null; }
  }
  function aynResolveFieldEl(id, _frame) {
    try {
      const { doc, rawId } = resolveDoc(id, _frame);
      if (!doc || !rawId) return null;
      let el = null;
      if (!el && rawId.includes('__textfield__:')) {
        try {
          const map = window.__AYN_TEXT_FIELD_MAP__;
          el = aynLiveEl(map && (map.get(id) || map.get(rawId)));
        } catch (_) {}
      }
      if (!el) { try { el = doc.getElementById(rawId); } catch (_) {} }
      if (!el) { try { el = doc.querySelector(`[name="${CSS.escape(rawId)}"]`); } catch (_) {} }
      if (!el) {
        const im = /^f(\d+)$/.exec(rawId);
        if (im) {
          const idx = parseInt(im[1], 10);
          const all = doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="image"]):not([type="reset"]), textarea, select');
          el = all[idx] || null;
        }
      }
      if (!el && rawId.includes('__opentext__:')) {
        el = aynLiveEl(window.__AYN_OPEN_TEXT_MAP__ && (window.__AYN_OPEN_TEXT_MAP__.get(id) || window.__AYN_OPEN_TEXT_MAP__.get(rawId)));
      }
      if (!el && rawId.includes('__richedit__:')) {
        el = aynLiveEl(window.__AYN_RICH_EDITOR_MAP__ && (window.__AYN_RICH_EDITOR_MAP__.get(id) || window.__AYN_RICH_EDITOR_MAP__.get(rawId)));
      }
      // v2.6.0 — fid-desync fallback (audit C1). If the fid stamp was lost
      // because the element was replaced on re-render, everything above
      // misses. The engine already computed a richer ElementRef (selector,
      // xpath) for the same control at scan time; try that before giving up.
      if (!el) {
        try {
          const anchorMatch = /:g(f?\d+[a-z0-9]*)$/.exec(rawId) || /^(f?\d+[a-z0-9]*)$/.exec(rawId);
          const anchorFid = anchorMatch ? anchorMatch[1] : null;
          const rich = window.__AYN_QUESTIONS__;
          if (anchorFid && Array.isArray(rich)) {
            for (const q of rich) {
              const ctrl = (q.controls || []).find((c) => c && String(c.fid) === anchorFid);
              if (!ctrl) continue;
              if (ctrl.selector) {
                try { el = doc.querySelector(ctrl.selector); } catch (_) {}
              }
              if (!el && ctrl.xpath) {
                try {
                  const r = doc.evaluate(ctrl.xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                  if (r.singleNodeValue && r.singleNodeValue.nodeType === 1) el = r.singleNodeValue;
                } catch (_) {}
              }
              // v2.6.2 — the replaced node has no fid stamp, which is why every
              // stamp-based lookup (maps, rebuilds) misses it. Re-stamp so the
              // rest of this fill resolves it directly.
              if (el) {
                try { if (!el.getAttribute('data-ayn-fid')) el.setAttribute('data-ayn-fid', String(ctrl.fid)); } catch (_) {}
                break;
              }
            }
          }
        } catch (_) {}
      }
      return el || null;
    } catch (_) { return null; }
  }

  // v2.1.0 — post-inject read-back verification. This function
  // inspects the LIVE DOM for every result that was reported ok, and if the
  // control's real state does not reflect what we intended, it flips the
  // result to unverified and attaches a fillDiag record on the injectResult
  // so telemetry captures which stage lied about success. It does NOT retry
  // structural clicks itself (that responsibility stays in injectValues)
  // because false-success signals were the actual failure mode we saw —
  // knowing about them is more valuable than another blind click.
  function aynPostInjectVerify(values, injectResult) {
    const diag = [];
    try {
      if (!injectResult || !Array.isArray(injectResult.results)) return;
      const wantById = new Map();
      const rowById = new Map();
      (values || []).forEach(v => {
        if (!v || !v.id) return;
        const want = v.optionLabel || v.optionValue || v.value || '';
        wantById.set(v.id, String(want || '').trim());
        rowById.set(v.id, v);
      });
      let __rebuiltOnce = false;
      const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
      for (const res of injectResult.results) {
        if (!res || !res.id || res.ok !== true) continue;
        const want = wantById.get(res.id) || '';
        let verified = null;
        let method = '';
        try {
          const rawId = String(res.id);
          // Custom (ARIA) radio group
          if (rawId.includes('__radio__:custom:')) {
            const els = (window.__AYN_CUSTOM_RADIO_MAP__ && window.__AYN_CUSTOM_RADIO_MAP__.get(rawId)) || [];
            const target = els.find(e => norm((e.innerText || e.getAttribute('aria-label') || '')) === norm(want)) || els.find(e => e.getAttribute('aria-checked') === 'true');
            method = 'custom-radio';
            verified = !!(target && target.getAttribute('aria-checked') === 'true' && (!want || norm(target.innerText || target.getAttribute('aria-label') || '') === norm(want)));
          } else if (rawId.includes('__structradio__:')) {
            const entry = (window.__AYN_STRUCTRADIO_MAP__ && window.__AYN_STRUCTRADIO_MAP__.get(rawId)) || null;
            const radios = entry ? (Array.isArray(entry) ? entry : (entry.radios || [])) : [];
            const checked = radios.find(r => r && r.checked);
            method = 'struct-radio';
            if (checked) {
              const lbl = ((checked.closest && checked.closest('label') || checked.parentElement)?.innerText || '').replace(/\s+/g,' ').trim();
              verified = !want || norm(lbl) === norm(want) || norm(checked.value || '') === norm(want);
            } else verified = false;
          } else if (rawId.includes('__checkbox__:multi:')) {
            // v2.2.0 — multi-select unique-name checkbox group
            const boxes = (window.__AYN_MULTICHECK_MAP__ && window.__AYN_MULTICHECK_MAP__.get(rawId)) || [];
            method = 'multi-checkbox';
            verified = boxes.some(b => b && b.checked);
          } else {
            const m = /^(?:frame\d+:)?__(radio|checkbox)__:(.+)$/.exec(rawId);
            if (m) {
              const kind = m[1]; const name = m[2];
              method = kind;
              const nodes = Array.from(document.querySelectorAll(`input[type="${kind}"][name="${CSS.escape(name)}"]`));
              const checked = nodes.filter(n => n.checked);
              // v2.2.1 — hidden-checkbox proxy (Ashby): the native <input> is hidden
              // and never toggles; the real answer lives in a visible Yes/No button.
              // Reading input.checked here caused false "postverify-failed" on
              // work-auth/sponsorship even though the correct button was selected.
              // Verify the visible button state instead, matching the click path.
              if (kind === 'checkbox' && nodes[0] && isElHidden(nodes[0])) {
                method = 'checkbox-proxy';
                const container = nodes[0].closest('[data-field-path],[class*="fieldEntry"],[class*="field-entry"],fieldset,[class*="field"]') || nodes[0].parentElement;
                const btns = container ? Array.from(container.querySelectorAll('button,[role="button"],[role="radio"],[role="option"]')).filter(b => !b.disabled) : [];
                const sel = btns.find(b => bgIsSelected(b));
                if (sel) {
                  const selTxt = norm(safeText(sel) || sel.getAttribute('aria-label') || '');
                  verified = !want || selTxt === norm(want) || aynOptionMatches(selTxt, want);
                } else {
                  verified = false;
                }
              } else if (kind === 'radio') {
                verified = checked.length === 1;
              } else {
                verified = checked.length >= 1;
              }
            } else {
              const el = aynResolveFieldEl(res.id, res._frame);
              if (el) {
                const tag = (el.tagName || '').toUpperCase();
                if (tag === 'SELECT') { method = 'select'; verified = norm(el.value) === norm(want) || norm(el.options[el.selectedIndex]?.text || '') === norm(want); }
                else if (tag === 'INPUT' || tag === 'TEXTAREA') { method = 'text'; verified = !want || norm(el.value).includes(norm(want)) || norm(want).includes(norm(el.value)); }
                else if (el.isContentEditable) { method = 'richedit'; verified = !want || norm(el.innerText || '').includes(norm(want)); }
              }
            }
          }
        } catch (_) { verified = null; }
        // v2.6.2 — before trusting a failure, get a second opinion that does
        // not depend on stored refs or fid stamps: rebuild maps once (cheap),
        // then re-locate the question in the live DOM by its label text. A
        // mid-fill partial rebuild detaches the nodes the checks above read
        // from, so they report "empty" even when the answer stuck.
        if (verified === false) {
          try {
            if (!__rebuiltOnce) { __rebuiltOnce = true; aynRebuildFieldMaps(); }
            const row = rowById.get(res.id);
            const live = aynReadLiveAnswerByContent(row, want);
            if (live === true) {
              verified = true;
              res.reanchorVerified = true;
              try { console.log('[AYN][verify] re-anchor by content confirmed answer stuck:', res.id); } catch (_) {}
            }
          } catch (_) {}
        }
        if (verified === false) {
          res.verified = false;
          res.reason = (res.reason ? res.reason + '; ' : '') + 'postverify-failed';
          diag.push({ id: res.id, method, want: want.slice(0, 60), status: 'unverified' });
        } else if (verified === true) {
          res.verified = true;
        }
      }
      // Recompute filled count from the truthful signal, and expose the
      // unverified id list so INJECT_VALUES can re-attempt each one once.
      try {
        injectResult.filled = injectResult.results.filter(r => r && r.ok === true && r.verified !== false).length;
        injectResult.fillDiag = diag;
        injectResult.unverifiedIds = diag.map(d => d && d.id).filter(Boolean);
      } catch (_) {}
    } catch (_) { /* never break the fill */ }
  }

  // v2.2.0 — one-shot re-attempt for controls that failed post-verify.
  // Buttongroup / custom-radio / structradio / select get a second click
  // (bg via findButtongroupOption's cached meta); text via page-world bridge.
  // v2.5.9 — deterministic retry and closed-loop AI replan removed. The single
  // writer is injectValues; aynPostInjectVerify reports failures without
  // re-injecting.

  // v2.6.2 — one narrow exception to the no-rewrite rule: aynRecoverWipedAnswers.
  // It runs exactly once per INJECT_VALUES, only for answers that post-verify
  // (including the content re-anchor second opinion) confirmed are NOT on the
  // page, and it resolves every target by live label text — never by stored
  // refs or fid stamps. This is the mid-fill counterpart of the reload-snapshot
  // restore: the page quietly rebuilt a piece of itself and wiped what we just
  // wrote; write it once more against the rebuilt DOM.
  async function aynRecoverWipedAnswers(values, injectResult) {
    const MAX_RECOVER = 15;
    try {
      if (!injectResult || !Array.isArray(injectResult.results)) return;
      const rowById = new Map((values || []).filter((v) => v && v.id).map((v) => [v.id, v]));
      const candidates = injectResult.results.filter((r) => {
        if (!r || !r.id) return false;
        if (r.ok === true && r.verified !== false) return false;
        const reason = String(r.reason || '');
        if (/skipped|no value|no option$/.test(reason)) return false; // deliberate skips
        const row = rowById.get(r.id);
        if (!row) return false;
        const want = row.optionLabel || row.optionValue || row.value;
        return want != null && String(want).trim() !== '';
      }).slice(0, MAX_RECOVER);
      if (!candidates.length) return;

      // Let the rebuild settle before touching the fresh DOM.
      await aynSleep(300);
      try { aynRebuildFieldMaps(); } catch (_) {}
      try { console.log('[AYN][recover] attempting content-anchored recovery for', candidates.length, 'answers'); } catch (_) {}

      let recovered = 0;
      for (const res of candidates) {
        const row = rowById.get(res.id);
        const want = String(row.optionLabel || row.optionValue || row.value || '').trim();
        try {
          // Precheck: the write may have stuck after all (rebuild replayed
          // React state) — never double-fire a click on a correct answer.
          if (aynLiveMatchesWanted(res.id, want, row) || aynReadLiveAnswerByContent(row, want) === true) {
            res.ok = true; res.verified = true;
            res.reason = 'recovered-already-correct';
            recovered++;
            continue;
          }
          const label = aynLabelForValueRow(row);
          const found = aynFindQuestionScopeByLabel(label);
          if (!found || !found.scope) { res.recoverAttempt = 'scope-not-found'; continue; }
          const scope = found.scope;
          const kindHint = String(row.kind || row.type || '').toLowerCase();
          const choiceLike = /radio|checkbox|boolean|choice|button/.test(kindHint)
            || !!(row.optionLabel || (Array.isArray(row.optionLabels) && row.optionLabels.length));

          let wrote = false;
          // 1. native radio/checkbox inside the live scope
          if (choiceLike || !wrote) {
            const inputs = Array.from(scope.querySelectorAll('input[type="radio"], input[type="checkbox"]')).filter((i) => !i.disabled);
            const match = inputs.find((i) => aynOptionMatches(getLabelFor(i) || i.value, want));
            if (match) {
              if (!match.checked) {
                match.click(); await aynSleep(50);
                if (!match.checked) { const lab = match.closest('label'); if (lab) { lab.click(); await aynSleep(50); } }
                if (!match.checked) aynSetChecked(match, true);
                await aynSleep(50);
              }
              wrote = true;
            }
          }
          // 2. custom option buttons (Ashby Yes/No toggles, ARIA radios)
          if (!wrote && choiceLike) {
            const btns = Array.from(scope.querySelectorAll('button, [role="radio"], [role="checkbox"], [role="button"], [role="option"]')).filter((b) => !b.disabled);
            const btn = btns.find((b) => aynOptionMatches(safeText(b) || b.getAttribute('aria-label') || '', want));
            if (btn) { await clickOptionButton(btn, label, norm(want)); wrote = true; }
          }
          // 3. native select
          if (!wrote) {
            const selEl = scope.querySelector('select');
            if (selEl) { await aynFillSelect(selEl, row.optionLabel, row.optionValue || row.value); wrote = true; }
          }
          // 4. text-like
          if (!wrote) {
            const txtEl = scope.querySelector('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"]):not([type="button"]):not([type="file"]), textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]');
            if (txtEl && !choiceLike) { await aynFillTextbox(txtEl, want); wrote = true; }
          }
          if (!wrote) { res.recoverAttempt = 'no-writable-control'; continue; }

          await aynSleep(120);
          const okNow = aynLiveMatchesWanted(res.id, want, row) || aynReadLiveAnswerByContent(row, want) === true;
          res.recoverAttempt = okNow ? 'recovered' : 'recover-unverified';
          if (okNow) {
            res.ok = true; res.verified = true;
            res.reason = 'recovered-after-rebuild';
            recovered++;
          }
          // human-like pacing between recovered fields, same as injectValues
          await aynSleep(60 + Math.floor(Math.random() * 120));
        } catch (e) {
          try { res.recoverAttempt = 'error: ' + (e && e.message ? e.message : 'unknown'); } catch (_) {}
        }
      }

      // Recompute the truthful counters and keep the snapshot fresh so a
      // subsequent full reload restores the recovered answers too.
      try {
        injectResult.filled = injectResult.results.filter((r) => r && r.ok === true && r.verified !== false).length;
        injectResult.unverifiedIds = injectResult.results.filter((r) => r && (r.ok !== true || r.verified === false)).map((r) => r.id);
        injectResult.recovered = recovered;
      } catch (_) {}
      if (recovered) {
        try { aynPersistInjectedSnapshot(values, 'recovery'); } catch (_) {}
      }
      try { console.log('[AYN][recover] done:', recovered, 'of', candidates.length, 'recovered'); } catch (_) {}
    } catch (_) { /* never break the fill */ }
  }

  // v2.6.2 — debug hooks, same spirit as window.AYN_FILL_SESSION: lets
  // fill-session tooling drive verify/recovery directly against a live page.
  try {
    window.__AYN_TEST_HOOKS__ = {
      aynPostInjectVerify,
      aynRecoverWipedAnswers,
      aynReadLiveAnswerByContent,
      aynFindQuestionScopeByLabel,
      aynResolveFieldEl,
    };
  } catch (_) {}


  // v2.4 — persist verified answers to learning memory (per user).
  function aynRecordLearnedAnswers(values, injectResult) {
    try {
      const learning = window.__AYN_LEARNING__;
      if (!learning || typeof learning.recordVerified !== 'function') return;
      const questions = window.__AYN_QUESTIONS__ || [];
      const qById = new Map(questions.map((q) => [q.id, q]));
      const results = (injectResult && injectResult.results) || [];
      const valById = new Map((values || []).filter((v) => v && v.id).map((v) => [v.id, v]));
      const ats = window.__AYN_ATS_HINT__ || (location.hostname || '').split('.').slice(-2).join('.');
      for (const r of results) {
        if (!r || !r.id) continue;
        const q = qById.get(r.id);
        const v = valById.get(r.id);
        if (!q || !v) continue;
        const verified = r.ok === true && r.verified !== false;
        if (!verified) continue;
        const answer = {
          value: v.value,
          optionLabel: v.optionLabel,
          optionValue: v.optionValue,
          optionLabels: v.optionLabels,
        };
        void learning.recordVerified({ ...q, answer }, verified, ats);
      }
    } catch (_) {}
  }




  // v2.5.9 — post-fill settle/stabilize passes removed. Post-fill page-writing
  // is gone; verification is report-only.

  function norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

  // v2.4.2 — rebuild BG/text maps from live DOM before any post-fill pass.
  // Old node refs get invalidated by React rerenders; re-register keeps
  // stabilize/retry from clicking dead nodes.
  function aynRebuildFieldMaps() {
    try {
      if (Array.isArray(window.__AYN_QUESTIONS__)) {
        aynRegisterEngineGroups(window.__AYN_QUESTIONS__);
      }
    } catch (_) {}
  }

  // ── v2.6.2: mid-fill content re-anchoring ──
  // Same idea as the v2.6.1 reload-snapshot signature match, applied to the
  // moment right after a write: when a partial rebuild (no navigation) has
  // replaced the subtree we just filled, every stored ref and fid stamp is
  // dead. Instead of trusting the internal tag, re-locate the question in the
  // LIVE DOM by what it says (label text) and read/write against that.

  function aynLabelForValueRow(v) {
    try {
      if (!v) return '';
      let label = String(v.label || v.question || '').trim();
      if (label) return label;
      const id = v.id;
      const cache = window.__AYN_FIELD_LABELS__;
      if (cache && cache.get) label = String(cache.get(id) || '').trim();
      if (label) return label;
      const rich = window.__AYN_QUESTIONS__;
      if (Array.isArray(rich)) {
        const q = rich.find((q) => q && q.id === id);
        if (q && q.label) return String(q.label).trim();
      }
      const legacy = window.__AYN_QUESTIONS_LEGACY__;
      if (Array.isArray(legacy)) {
        const f = legacy.find((f) => f && f.id === id);
        if (f && f.label) return String(f.label).trim();
      }
    } catch (_) {}
    return '';
  }

  // Locate the live question scope by label text: find the smallest visible
  // element whose text matches the label, then walk up until the ancestor
  // contains at least one form control. Mirrors findButtongroupOption's
  // locator but generalized to any control kind.
  function aynFindQuestionScopeByLabel(labelText) {
    try {
      const qKey = norm(labelText).slice(0, 60);
      if (!qKey || qKey.length < 4) return null;
      let labelEl = null;
      const candidates = document.querySelectorAll('label, legend, p, h2, h3, h4, strong, div, span');
      for (const c of candidates) {
        const t = norm(safeText(c));
        if (!t) continue;
        if (t.length >= qKey.length + 220) continue; // question line, not a wrapper
        if (t === qKey || t.includes(qKey)) { labelEl = c; break; }
      }
      if (!labelEl) return null;
      const CTRL_SEL = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]), textarea, select, [role="radio"], [role="checkbox"], [role="combobox"], [role="textbox"], [contenteditable="true"], [contenteditable=""], button';
      let node = labelEl;
      for (let i = 0; i < 7 && node; i++, node = node.parentElement) {
        try { if (node.querySelector && node.querySelector(CTRL_SEL)) return { labelEl, scope: node }; } catch (_) {}
      }
      return { labelEl, scope: labelEl.parentElement || null };
    } catch (_) { return null; }
  }

  // Read the LIVE answer state for a value row by content only. Returns
  // true (live DOM shows the wanted answer), false (located but not showing
  // it / empty), or null (question not locatable by content — no opinion).
  function aynReadLiveAnswerByContent(v, want) {
    try {
      const label = aynLabelForValueRow(v);
      const found = aynFindQuestionScopeByLabel(label);
      if (!found || !found.scope) return null;
      const scope = found.scope;
      const wantStr = String(want || '').trim();
      if (!wantStr) return null;
      // choice-style: any selected option in scope matching want
      const sel = aynSelectedLabelInScope(scope);
      if (sel && aynOptionMatches(sel, wantStr)) return true;
      const checkedInput = scope.querySelector('input[type="radio"]:checked, input[type="checkbox"]:checked');
      if (checkedInput) {
        const lbl = (getLabelFor(checkedInput) || checkedInput.value || '').trim();
        if (aynOptionMatches(lbl, wantStr)) return true;
      }
      // select
      const selEl = scope.querySelector('select');
      if (selEl && selEl.selectedIndex >= 0) {
        const optTxt = (selEl.options[selEl.selectedIndex] && selEl.options[selEl.selectedIndex].text) || selEl.value || '';
        if (aynOptionMatches(optTxt, wantStr)) return true;
      }
      // text-like
      const txtEl = scope.querySelector('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"]):not([type="button"]):not([type="file"]), textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]');
      if (txtEl) {
        const cur = norm(txtEl.isContentEditable ? (txtEl.innerText || '') : (txtEl.value || ''));
        const nw = norm(wantStr);
        if (cur && (cur === nw || (nw.length >= 6 && (cur.includes(nw) || nw.includes(cur))))) return true;
      }
      return false;
    } catch (_) { return null; }
  }

  // v2.4.2 — read the live DOM value for a field id and compare against
  // what we intended to fill. Used as a short-circuit so we never overwrite
  // a correct answer after a rerender.
  function aynLiveMatchesWanted(id, want, vRow) {
    try {
      if (!id || want == null || want === '') return false;
      const wantStr = String(want);
      const rawId = String(id);
      if (rawId.includes('__buttongroup__:')) {
        const meta = window.__AYN_BG_MAP__ && window.__AYN_BG_MAP__.get(rawId);
        if (!meta) return false;
        try {
          const scope = meta.containerSelector ? document.querySelector(meta.containerSelector) : null;
          if (scope) {
            const sel = aynSelectedLabelInScope(scope);
            if (sel && aynOptionMatches(sel, wantStr)) return true;
          }
        } catch (_) {}
        return false;
      }
      if (rawId.includes('__structradio__:')) {
        const entry = window.__AYN_STRUCTRADIO_MAP__ && window.__AYN_STRUCTRADIO_MAP__.get(rawId);
        // v2.6.2 — a detached container still answers querySelectorAll, but with
        // stale nodes that read unchecked. Only trust it while connected.
        const container = aynLiveEl(entry && entry.container);
        const live = container ? Array.from(container.querySelectorAll('input[type="radio"]')) : (entry && entry.radios) || [];
        const checked = live.find(r => r.checked);
        if (!checked) return false;
        const lbl = ((checked.closest('label') || checked.parentElement)?.innerText || checked.value || '').trim();
        return aynOptionMatches(lbl, wantStr);
      }
      const el = aynResolveFieldEl(id, vRow && vRow._frame);
      if (!el) return false;
      if (el.type === 'checkbox' || el.type === 'radio') return !!el.checked;
      const cur = (el.isContentEditable ? (el.innerText || el.textContent || '') : (el.value || '')).trim();
      if (!cur) return false;
      const nc = norm(cur), nw = norm(wantStr);
      if (nc === nw) return true;
      if (nw.length >= 6 && (nc.includes(nw) || nw.includes(nc))) return true;
      const d = (s) => String(s || '').replace(/\D+/g, '');
      if (d(nw).length >= 7 && d(nc) === d(nw)) return true;
      return false;
    } catch (_) { return false; }
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value); else el.value = value;
  }

  function bgIsSelected(el) {
    if (!el) return false;
    if (el.getAttribute('aria-checked') === 'true') return true;
    if (el.getAttribute('aria-pressed') === 'true') return true;
    if (el.getAttribute('aria-selected') === 'true') return true;
    const cls = (el.className && typeof el.className === 'string') ? el.className : (el.getAttribute('class') || '');
    // Match active/selected/checked/on bounded by start, whitespace, underscore, or dash
    // (so Ashby's "_active_1svni_57" matches but "inactive" does not).
    if (/(?:^|[\s_-])(?:active|selected|checked|on)(?:[\s_-]|\d|$)/i.test(cls)) return true;
    if (/(?:^|[\s-])(?:bg-[a-z]|--selected)/i.test(cls)) return true;
    try {
      const inp = el.querySelector && el.querySelector('input[type="radio"], input[type="checkbox"]');
      if (inp && inp.checked) return true;
    } catch {}
    return false;
  }

  function aynSelectedLabelInScope(scope) {
    try {
      if (!scope) return '';
      const choices = Array.from(scope.querySelectorAll('button,[role="radio"],[role="button"],[role="option"],label,a[role="button"]'));
      const sel = choices.find(b => bgIsSelected(b));
      return sel ? aynVisibleText(sel) || sel.getAttribute('aria-label') || '' : '';
    } catch (_) { return ''; }
  }

  function aynChoiceMatchesWanted(scope, target, want) {
    try {
      const wanted = String(want || '').trim();
      if (!wanted) return !!(target && bgIsSelected(target));
      if (target && bgIsSelected(target)) {
        const t = aynVisibleText(target) || target.getAttribute('aria-label') || '';
        if (aynOptionMatches(t, wanted)) return true;
      }
      const selected = aynSelectedLabelInScope(scope || (target && target.parentElement));
      return !!selected && aynOptionMatches(selected, wanted);
    } catch (_) { return false; }
  }

  function fireFullClick(target) {
    try { target.scrollIntoView({ block: 'center' }); } catch {}
    try { target.focus && target.focus(); } catch {}
    const fire = (type, Ctor) => {
      try {
        const ev = Ctor === MouseEvent
          ? new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 })
          : new PointerEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, pointerType: 'mouse' });
        target.dispatchEvent(ev);
      } catch { try { target.dispatchEvent(new Event(type, { bubbles: true })); } catch {} }
    };
    fire('pointerdown', PointerEvent);
    fire('mousedown', MouseEvent);
    fire('pointerup', PointerEvent);
    fire('mouseup', MouseEvent);
    try { target.click(); } catch {}
  }

  // Re-resolve the question container and option button live from the DOM at click time.
  // PART 2: never trust stored element refs (React re-renders detach them).
  function findButtongroupOption(meta, want) {
    const wantN = norm(want);
    if (!wantN) return { target: null, scope: null };
    const qLabel = (meta && meta.qLabel) || '';
    const optionTexts = (meta && meta.optionTexts) || [];
    const qKey = norm(qLabel).slice(0, 40);

    // 1. Locate the question label element (must look like a question line, not a giant wrapper)
    let labelEl = null;
    if (qKey) {
      const candidates = document.querySelectorAll('label, legend, p, h2, h3, h4, strong, div, span');
      for (const c of candidates) {
        const t = norm(safeText(c));
        if (!t) continue;
        if (t.length >= qKey.length + 220) continue;
        if (t === qKey || t.includes(qKey)) { labelEl = c; break; }
      }
    }

    if (!labelEl && meta && meta.containerSelector) {
      try {
        const c = document.querySelector(meta.containerSelector);
        if (c) labelEl = c;
      } catch (_) {}
    }

    if (!labelEl && meta && Array.isArray(meta.fids)) {
      try {
        for (const fid of meta.fids) {
          const node = document.querySelector('[data-ayn-fid="' + String(fid).replace(/"/g, '\\"') + '"]');
          if (node) { labelEl = node.closest('[class*="fieldEntry"],[class*="field-entry"],[class*="field"],[class*="question"],fieldset,[role="group"]') || node.parentElement; break; }
        }
      } catch (_) {}
    }

    // Helper: pick best matching choice inside a root, restricted to known optionTexts
    const pickIn = (root) => {
      const choices = root.querySelectorAll('button, [role="radio"], [role="button"], [role="option"], a[role="button"], label');
      for (const el of choices) {
        const txt = safeText(el) || el.getAttribute('aria-label') || '';
        if (!txt.trim()) continue;
        const isOption = optionTexts.length === 0
          || optionTexts.some(o => aynOptionMatches(o, txt));
        if (!isOption) continue;
        if (aynOptionMatches(txt, want)) return el;
      }
      return null;
    };


    // 2. Walk UP from the label (up to 7 ancestors). The first ancestor that contains
    // a clickable option whose text matches one of meta.optionTexts is the scope.
    // This works regardless of CSS-module hashed class names.
    let scope = null;
    if (labelEl && optionTexts.length) {
      let node = labelEl.parentElement;
      for (let i = 0; i < 7 && node; i++, node = node.parentElement) {
        const choices = node.querySelectorAll('button, [role="radio"], [role="button"], [role="option"], a, label');
        let found = false;
        for (const b of choices) {
          const txt = safeText(b) || b.getAttribute('aria-label') || '';
          if (!txt.trim()) continue;
          if (optionTexts.some(o => aynOptionMatches(o, txt))) { found = true; break; }
        }
        if (found) { scope = node; break; }
      }
    }


    let target = scope ? pickIn(scope) : null;
    if (!target) {
      const all = document.querySelectorAll('button, [role="radio"], [role="button"], [role="option"], a[role="button"]');
      const matches = [];
      for (const el of all) {
        const txt = safeText(el) || el.getAttribute('aria-label') || '';
        if (!txt.trim()) continue;
        if (aynOptionMatches(txt, want)) matches.push(el);
      }

      if (matches.length === 1) target = matches[0];
      else if (matches.length > 1 && qKey) {
        const scored = matches.map(el => {
          let node = el, hit = -1;
          for (let i = 0; i < 8 && node; i++, node = node.parentElement) {
            const t = norm(safeText(node));
            if (t && t.includes(qKey)) { hit = i; break; }
          }
          return { el, hit };
        }).filter(s => s.hit >= 0).sort((a, b) => a.hit - b.hit);
        if (scored.length === 1) target = scored[0].el;
        else if (scored.length > 1 && scored[0].hit < scored[1].hit) target = scored[0].el;
      }
    }
    const interactive = target ? (target.closest('button, [role="radio"], [role="button"], [role="option"], a, label') || target) : null;
    try {
      console.log('[AYN-BG] resolve', JSON.stringify({
        qLabel: (meta && meta.qLabel) || '',
        want: wantN,
        labelElFound: !!labelEl,
        scopeFound: !!scope,
        targetFound: !!interactive,
        targetTag: interactive && interactive.tagName,
        targetText: interactive && (interactive.textContent || '').trim().slice(0, 20),
        targetClass: interactive && (typeof interactive.className === 'string' ? interactive.className : '')
      }));
    } catch {}
    if (!interactive) return { target: null, scope };
    return { target: interactive, scope };
  }

  // Main-world click fallback — v1.9.67: routed through page-world.js via the same
  // attribute+event bridge used for text fills. Replaces the old inline <script>
  // injection, which page CSP blocked on many sites.
  function mainWorldClickByText(qLabel, optionText) {
    try {
      const root = document.documentElement;
      root.setAttribute('data-ayn-click-q', String(qLabel || '').slice(0, 120));
      root.setAttribute('data-ayn-click-opt', String(optionText || '').trim().slice(0, 200));
      document.dispatchEvent(new Event('ayn-click-request', { bubbles: true }));
      return true;
    } catch (e) {
      console.log('[AYN-BG] mainWorld bridge failed', e && e.message);
      return false;
    }
  }


  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function isElHidden(el) {
    try {
      if (!el) return false;
      if (el.tabIndex === -1) return true;
      if (!el.offsetParent && (el.style && el.style.position !== 'fixed')) return true;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return true;
      const cs = (el.ownerDocument && el.ownerDocument.defaultView || window).getComputedStyle(el);
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return true;
      return false;
    } catch { return false; }
  }

  async function clickOptionButton(btn, qLabel, wantText) {
    const scope = btn && (btn.closest('[data-field-path],[class*="fieldEntry"],[class*="field-entry"],fieldset,[class*="field"],[class*="question"],[role="group"]') || btn.parentElement);
    try { btn.scrollIntoView({ block: 'center' }); } catch {}
    try { btn.focus && btn.focus(); } catch {}
    btn.click();
    await sleep(60);
    let ok = aynChoiceMatchesWanted(scope, btn, wantText);
    if (!ok) { await sleep(140); ok = aynChoiceMatchesWanted(scope, btn, wantText); }
    if (!ok) {
      fireFullClick(btn);
      await sleep(60); ok = aynChoiceMatchesWanted(scope, btn, wantText);
      if (!ok) { await sleep(140); ok = aynChoiceMatchesWanted(scope, btn, wantText); }
    }
    if (!ok) {
      mainWorldClickByText(qLabel, wantText);
      await sleep(150); ok = aynChoiceMatchesWanted(scope, btn, wantText);
    }
    try { console.log('[AYN-BG] proxyClick', wantText, 'verified=', ok); } catch {}
    return ok;
  }

  // ───── Phase 2: verify-and-retry executor ─────
  const aynSleep = (ms) => new Promise(r => setTimeout(r, ms));

  function aynSetNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    const prev = el.value;
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    // React controlled-input fix: reset the internal _valueTracker to the OLD value so React
    // sees a diff on the input event and commits the new value to state (stops the revert-to-blank).
    try { if (el._valueTracker && typeof el._valueTracker.setValue === 'function') el._valueTracker.setValue(prev); } catch (_) {}
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Same React-controlled-input fix as aynSetNativeValue, but for radio/checkbox
  // `checked`. Goes through the native property setter and resets _valueTracker
  // so React detects a real change instead of silently reverting it on the next
  // re-render. This is the LAST-RESORT path only, used when no real click
  // (native or ancestor) could be made to register.
  function aynSetChecked(el, value) {
    const proto = el.type === 'checkbox' ? HTMLInputElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'checked');
    const prev = el.checked;
    if (desc && desc.set) desc.set.call(el, value); else el.checked = value;
    try { if (el._valueTracker && typeof el._valueTracker.setValue === 'function') el._valueTracker.setValue(prev); } catch (_) {}
    el.dispatchEvent(new Event('click', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function aynShowActivityGlow(on) {
    if (!AYN_IS_TOP) return;
    try {
      const ID = 'ayn-activity-glow';
      let el = document.getElementById(ID);
      if (on) {
        if (!document.getElementById('ayn-activity-glow-style')) {
          const st = document.createElement('style');
          st.id = 'ayn-activity-glow-style';
          st.textContent = '@keyframes aynGlowPulse{0%,100%{opacity:.5}50%{opacity:1}}#ayn-activity-glow{position:fixed;inset:0;pointer-events:none;z-index:2147483646;box-shadow:inset 0 0 0 3px rgba(249,115,22,.75), inset 0 0 26px 7px rgba(234,88,12,.32);animation:aynGlowPulse 1.4s ease-in-out infinite;transition:opacity .2s}';
          (document.head || document.documentElement).appendChild(st);
        }
        if (!el) { el = document.createElement('div'); el.id = ID; el.setAttribute('aria-hidden','true'); (document.body || document.documentElement).appendChild(el); }
        clearTimeout(window.__aynGlowTO);
        window.__aynGlowTO = setTimeout(() => { try { const e = document.getElementById(ID); if (e) e.remove(); } catch(_){} }, 25000);
      } else {
        clearTimeout(window.__aynGlowTO);
        if (el) el.remove();
      }
    } catch (_) {}
  }

  // ────────────────────────────────────────────────────────────────
  //  v2.11.1 — Floating in-page trigger (FAB).
  //  Injected only on top frame of pages classifyPage() calls 'apply'.
  //  Never on aynn.io. Isolated inside a closed shadow root so page CSS
  //  cannot alter it. Clicking asks background to open the side panel
  //  and focus the Fill tab. Never starts a fill directly.
  // ────────────────────────────────────────────────────────────────
  const AYN_FAB_HOST_ID = '__ayn_fab_host__';
  const AYN_FAB_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

  function aynFabHostBlocked() {
    try {
      const h = location.hostname || '';
      return h === 'aynn.io' || h.endsWith('.aynn.io');
    } catch { return true; }
  }

  function aynFabReadPrefs() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(['ayn_fab_enabled', 'ayn_fab_dismissed'], (d) => {
          const enabled = d && d.ayn_fab_enabled !== false; // default on
          const dismissed = (d && d.ayn_fab_dismissed) || {};
          resolve({ enabled, dismissed });
        });
      } catch { resolve({ enabled: true, dismissed: {} }); }
    });
  }

  function aynFabSetDismissed(host) {
    try {
      chrome.storage.local.get(['ayn_fab_dismissed'], (d) => {
        const map = (d && d.ayn_fab_dismissed) || {};
        map[host] = Date.now() + AYN_FAB_DISMISS_MS;
        try { chrome.storage.local.set({ ayn_fab_dismissed: map }); } catch {}
      });
    } catch {}
  }

  function aynRemoveFab() {
    try {
      const h = document.getElementById(AYN_FAB_HOST_ID);
      if (h) h.remove();
      window.__AYN_FAB__ = false;
    } catch {}
  }

  function aynInjectFab() {
    try {
      if (!AYN_IS_TOP) return;
      if (window.__AYN_FAB__) return;
      if (!document.body) return;
      if (aynFabHostBlocked()) return;

      const host = document.createElement('div');
      host.id = AYN_FAB_HOST_ID;
      // Host itself carries only positioning + z-index. Everything visible
      // lives inside the closed shadow root below.
      host.style.cssText = 'all:initial;position:fixed;right:24px;bottom:24px;z-index:2147483645;';
      const root = host.attachShadow({ mode: 'closed' });

      const style = document.createElement('style');
      style.textContent = `
        :host, * { box-sizing: border-box; }
        .wrap { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .btn {
          display: inline-flex; align-items: center; gap: 8px;
          height: 48px; min-width: 48px; padding: 0 14px;
          border-radius: 24px; border: 0; cursor: pointer;
          background: #f97316; color: #ffffff;
          box-shadow: 0 6px 20px rgba(234,88,12,.35), 0 2px 6px rgba(0,0,0,.15);
          transition: transform .18s ease, box-shadow .18s ease, padding .18s ease;
          font-weight: 700; font-size: 13px; letter-spacing: .2px;
        }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(234,88,12,.45), 0 3px 8px rgba(0,0,0,.2); }
        .btn:focus { outline: 2px solid #ffffff; outline-offset: 2px; }
        .glyph { width: 22px; height: 22px; flex: 0 0 22px; display: inline-flex; align-items: center; justify-content: center; }
        .label { display: none; white-space: nowrap; }
        .wrap:hover .label { display: inline; }
        .close {
          position: absolute; top: -6px; right: -6px;
          width: 20px; height: 20px; border-radius: 50%;
          background: #1f2937; color: #ffffff; border: 0; cursor: pointer;
          display: none; align-items: center; justify-content: center;
          font-size: 12px; line-height: 1; font-weight: 700;
          box-shadow: 0 2px 6px rgba(0,0,0,.3);
        }
        .wrap:hover .close { display: inline-flex; }
        @media (prefers-reduced-motion: reduce) {
          .btn { transition: none; }
          .btn:hover { transform: none; }
        }
      `;

      const wrap = document.createElement('div');
      wrap.className = 'wrap';
      wrap.style.cssText = 'position:relative;';

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Fill with AYN');
      btn.innerHTML = `
        <span class="glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z"/>
          </svg>
        </span>
        <span class="label">Fill with AYN</span>
      `;
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        try {
          chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL', focusTab: 'fill' }, () => {
            try { void chrome.runtime.lastError; } catch {}
          });
        } catch {}
      });

      const close = document.createElement('button');
      close.className = 'close';
      close.type = 'button';
      close.setAttribute('aria-label', 'Hide floating button on this site for 7 days');
      close.textContent = '\u00d7';
      close.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        try { aynFabSetDismissed(location.hostname || ''); } catch {}
        aynRemoveFab();
      });

      wrap.appendChild(btn);
      wrap.appendChild(close);
      root.appendChild(style);
      root.appendChild(wrap);
      document.body.appendChild(host);
      window.__AYN_FAB__ = true;
    } catch {}
  }

  async function aynSyncFab() {
    try {
      if (!AYN_IS_TOP) return;
      let kind = 'other';
      try { kind = (classifyPage() || {}).kind || 'other'; } catch {}
      if (kind !== 'apply' || aynFabHostBlocked()) { aynRemoveFab(); return; }
      const { enabled, dismissed } = await aynFabReadPrefs();
      if (!enabled) { aynRemoveFab(); return; }
      const host = location.hostname || '';
      const until = dismissed && dismissed[host];
      if (until && Date.now() < until) { aynRemoveFab(); return; }
      aynInjectFab();
    } catch {}
  }

  try { window.addEventListener('pagehide', aynRemoveFab); } catch {}
  try { window.addEventListener('beforeunload', aynRemoveFab); } catch {}
  try {
    chrome.storage.onChanged && chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.ayn_fab_enabled || changes.ayn_fab_dismissed) aynSyncFab();
    });
  } catch {}

  // Option-text normalizer: lenient about dashes, punctuation, whitespace
  function aynNormOpt(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[\u2010-\u2015\u2212]/g, '-')   // normalize all dash variants to hyphen
      .replace(/[.,;:!?"()]/g, ' ')            // drop punctuation
      .replace(/\s+/g, ' ')                      // collapse whitespace
      .trim();
  }

  function aynOptionMatches(optionText, wantText) {
    const a = aynNormOpt(optionText);
    const b = aynNormOpt(wantText);
    if (!a || !b) return false;
    if (a === b) return true;
    // bidirectional containment for sentence-style options
    if (a.includes(b) && b.length >= 3) return true;
    if (b.includes(a) && a.length >= 3) return true;
    // token-overlap fallback for long sentences: if the shorter string's
    // significant words are nearly all present in the longer one
    const wa = a.split(' ').filter(w => w.length > 2);
    const wb = b.split(' ').filter(w => w.length > 2);
    const [short, long] = wa.length <= wb.length ? [wa, new Set(wb)] : [wb, new Set(wa)];
    if (short.length >= 3) {
      const hits = short.filter(w => long.has(w)).length;
      if (hits / short.length >= 0.8) return true;
    }
    return false;
  }


  // v2.10.0 — human-grade typing. Bot-blockers (Cloudflare, DataDome, Akamai)
  // flag zero-latency value writes on sensitive ATS hosts. This helper is
  // consulted by aynFillTextbox to decide whether to reorder the ladder so
  // per-character typing runs FIRST for the risky fields, without slowing
  // down normal Greenhouse-style pages.
  // v2.10.1 — built-in host list guarantees Workday/iCIMS/Taleo are protected
  // even before the first ats_config fetch (fresh install, offline, backend
  // down). Remote config ADDS hosts on top; it can never remove built-ins.
  const AYN_BUILTIN_HUMAN_TYPING_HOSTS = [
    'myworkdayjobs.com', 'workday.com', 'icims.com', 'taleo.net',
    'brassring.com', 'successfactors.com', 'successfactors.eu',
  ];
  function aynShouldTypeHumanly(el, value) {
    try {
      // Trigger (c): textarea.
      if (el && el.tagName === 'TEXTAREA') return true;
      // Trigger (b): long values (>120 chars).
      if (String(value || '').length > 120) return true;
      // Trigger (a): union of built-in bot-sensitive hosts and any extras
      // pushed via SET_ATS_CONFIG. Remote adds, never replaces.
      const remote = (window.__AYN_HUMAN_TYPING_HOSTS__ && Array.isArray(window.__AYN_HUMAN_TYPING_HOSTS__))
        ? window.__AYN_HUMAN_TYPING_HOSTS__ : [];
      const host = (location.hostname || '').toLowerCase();
      const seen = new Set();
      const check = (needle) => {
        const n = String(needle || '').toLowerCase();
        if (!n || seen.has(n)) return false;
        seen.add(n);
        return host === n || host.endsWith('.' + n);
      };
      for (let i = 0; i < AYN_BUILTIN_HUMAN_TYPING_HOSTS.length; i++) {
        if (check(AYN_BUILTIN_HUMAN_TYPING_HOSTS[i])) return true;
      }
      for (let i = 0; i < remote.length; i++) {
        if (check(remote[i])) return true;
      }
    } catch (_) {}
    return false;
  }

  function aynRand(min, max) { return min + Math.random() * (max - min); }

  async function aynTypeKeystrokes(el, value) {
    el.focus();
    // Randomized pre-type pause (30-120ms) so the first char isn't instant.
    await aynSleep(Math.round(aynRand(30, 120)));
    // clear existing
    aynSetNativeValue(el, '');
    const s = String(value);
    const bigJob = (window.__aynFillFieldCount || 0) > 40;
    const longVal = s.length > 120;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const opts = { bubbles: true, cancelable: true, key: ch };
      el.dispatchEvent(new KeyboardEvent('keydown', opts));
      el.dispatchEvent(new KeyboardEvent('keypress', opts));
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      const next = (el.value || '') + ch;
      if (desc && desc.set) desc.set.call(el, next); else el.value = next;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
      el.dispatchEvent(new KeyboardEvent('keyup', opts));
      // Randomized 12-45ms per-character delay.
      await aynSleep(Math.round(aynRand(12, 45)));
      // Natural break chunk pauses for long values, skipped in big fill sessions.
      if (longVal && !bigJob) {
        const sentenceEnd = ch === '.' || ch === '!' || ch === '?';
        const boundaryHit = (i > 0) && (i % Math.round(aynRand(40, 70)) === 0);
        if (sentenceEnd || boundaryHit) {
          await aynSleep(Math.round(aynRand(80, 200)));
        }
      }
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    await aynSleep(40);
    return (el.value || '').trim() === String(value).trim();
  }


  function aynReadValue(el) {
    if (el.isContentEditable) return String(el.innerText || el.textContent || '').trim();
    return String(el.value || '').trim();
  }
  function aynSelectAllIn(el) {
    try {
      if (el.isContentEditable) {
        const r = document.createRange(); r.selectNodeContents(el);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      } else if (typeof el.select === 'function') { el.select(); }
    } catch (_) {}
  }
  async function aynInsertViaExec(el, value) {
    try { el.focus(); aynSelectAllIn(el); const ok = document.execCommand('insertText', false, value); await aynSleep(40); return ok; }
    catch (_) { return false; }
  }
  async function aynInsertViaPaste(el, value) {
    try {
      el.focus(); aynSelectAllIn(el);
      const dt = new DataTransfer(); dt.setData('text/plain', value);
      el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      await aynSleep(50); return true;
    } catch (_) { return false; }
  }

  async function aynFillTextbox(el, value) {
    const want = String(value).trim();
    const digits = s => String(s || '').replace(/\D/g, '');
    const wantD = digits(want);
    const matches = () => {
      const c = aynReadValue(el);
      if (c === want) return true;
      if (want.length > 12 && c.includes(want.slice(0, Math.min(30, want.length)))) return true;
      // Masked inputs: "4166609926" → "(416) 660-9926". Accept when digit streams match.
      if (wantD.length >= 6 && digits(c) === wantD) return true;
      return false;
    };
    const maskedAccept = () => {
      const c = aynReadValue(el);
      if (!c) return false;
      if (wantD.length < 6) return false;
      return digits(c).includes(wantD);
    };

    // contenteditable: native .value is useless — use execCommand/paste directly
    if (el.isContentEditable) {
      await aynInsertViaExec(el, value);
      if (matches()) return { ok: true, verified: true };
      await aynInsertViaPaste(el, value);
      if (matches()) return { ok: true, verified: true };
      if (maskedAccept()) return { ok: true, verified: true, reason: 'masked-accepted' };
      return { ok: false, verified: false, reason: 'contenteditable rejected' };
    }

    // real input/textarea
    // v2.10.0 — bot-blocker resilience: on humanTypingHosts, textareas, or
    // long values, run per-character typing FIRST. Otherwise use the fast
    // native-setter path exactly as before.
    if (aynShouldTypeHumanly(el, value)) {
      try {
        window.__aynHumanTypingUsed = true;
        window.__aynHumanTypedCount = (window.__aynHumanTypedCount || 0) + 1;
        await aynTypeKeystrokes(el, value);
      } catch (_) {}
      if (matches()) return { ok: true, verified: true, reason: 'human-typed' };
    }

    el.focus();
    if (!el.isContentEditable) { aynSetNativeValue(el, ''); }
    aynSetNativeValue(el, value);

    await aynSleep(40);
    if (matches()) return { ok: true, verified: true };

    el.focus(); aynSetNativeValue(el, ''); aynSetNativeValue(el, value);
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true })); el.blur();
    await aynSleep(40);
    if (matches()) return { ok: true, verified: true };

    // execCommand insertText — fires real beforeinput/input events React/rich editors honor
    await aynInsertViaExec(el, value);
    if (matches()) return { ok: true, verified: true };

    // per-character keystrokes
    try { await aynTypeKeystrokes(el, value); } catch (_) {}
    if (matches()) return { ok: true, verified: true };

    // synthetic paste (DataTransfer)
    await aynInsertViaPaste(el, value);
    if (matches()) return { ok: true, verified: true };

    // last resort: set the value from the page's own JS world (reaches framework-controlled inputs)
    await aynFillViaPageWorld(el, value);
    if (matches()) return { ok: true, verified: true, reason: 'page-world' };

    // Final: masked-input safety net — non-empty and contains the requested digits.
    if (maskedAccept()) return { ok: true, verified: true, reason: 'masked-accepted' };

    return { ok: false, verified: false, reason: 'value did not stick (all methods)' };
  }

  async function aynFillViaPageWorld(el, value) {
    try {
      el.setAttribute('data-ayn-fill-target', '1');
      el.setAttribute('data-ayn-fill-value', String(value));
      document.dispatchEvent(new CustomEvent('ayn-fill-request'));
      await aynSleep(130);
      try { el.removeAttribute('data-ayn-fill-target'); el.removeAttribute('data-ayn-fill-value'); } catch (_) {}
    } catch (_) {}
    return aynReadValue(el);
  }



  function aynNativeOptionEls(el) {
    if (el.name) {
      try { return Array.from((el.ownerDocument||document).querySelectorAll(`input[type="${el.type}"][name="${CSS.escape(el.name)}"]`)); } catch(_) {}
    }
    return [el];
  }

  async function aynFillOption(el, wantLabel, wantValue) {
    const want = wantLabel || wantValue;
    // If this isn't a real native group (no shared name, or only one checkable input),
    // signal fallthrough so the dispatcher can try the buttongroup resolver.
    const hasName = !!(el.name && String(el.name).trim());
    const group = aynNativeOptionEls(el);
    const nativeCheckables = group.filter(r => r && (r.type === 'radio' || r.type === 'checkbox'));
    if (!hasName || nativeCheckables.length <= 1) {
      const single = nativeCheckables[0] || el;
      const singleLabel = getLabelFor(single) || single.value || '';
      if (!want || !singleLabel || !aynOptionMatches(singleLabel, want)) {
        return { ok: false, fallthrough: true, reason: 'no native group' };
      }
    }
    let target = group.find(r => aynOptionMatches(getLabelFor(r) || r.value, want));
    if (!target) return { ok: false, fallthrough: true, reason: 'no native group' };
    target.click();
    await aynSleep(30);
    if (target.checked) return { ok: true, verified: true };
    const lab = (target.id && (target.ownerDocument||document).querySelector(`label[for="${CSS.escape(target.id)}"]`)) || target.closest('label');
    if (lab) { lab.click(); await aynSleep(30); if (target.checked) return { ok: true, verified: true }; }
    target.checked = true;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    await aynSleep(30);
    const ok = !!target.checked;
    return { ok, verified: ok, reason: ok ? '' : 'option would not check' };
  }


  // Detect rich-text editors (ProseMirror, TipTap, Slate, Draft, Quill, Lexical, CodeMirror, Monaco, role=textbox, data-editor, contenteditable).
  // Returns the true editable descendant node (or null) plus a detector tag for telemetry.
  function aynResolveRichEditor(el) {
    if (!el || el.nodeType !== 1) return { editable: null, detector: '' };
    try {
      const tag = (el.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return { editable: null, detector: '' };
      const ce = el.getAttribute && el.getAttribute('contenteditable');
      if (ce === '' || ce === 'true' || ce === 'plaintext-only' || el.isContentEditable) {
        return { editable: el, detector: 'contenteditable' };
      }
      if ((el.getAttribute && el.getAttribute('role')) === 'textbox') {
        const inner = el.querySelector('[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]');
        return { editable: inner || el, detector: 'role-textbox' };
      }
      const selMap = [
        ['[data-slate-editor="true"]', 'slate'],
        ['[data-lexical-editor="true"]', 'lexical'],
        ['[data-editor]', 'data-editor'],
        ['.ProseMirror', 'prosemirror'],
        ['.tiptap', 'tiptap'],
        ['.ql-editor', 'quill'],
        ['.DraftEditor-root', 'draft'],
        ['.public-DraftEditor-content', 'draft'],
        ['.cm-content', 'codemirror'],
        ['.monaco-editor .view-lines', 'monaco'],
      ];
      for (const [sel, det] of selMap) {
        if (el.matches && el.matches(sel)) {
          const ed = el.querySelector('[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"],.ql-editor,.cm-content,.public-DraftEditor-content') || el;
          return { editable: ed, detector: det };
        }
      }
      let cur = el.parentElement; let depth = 0;
      while (cur && depth < 4) {
        for (const [sel, det] of selMap) {
          if (cur.matches && cur.matches(sel)) {
            const ed = cur.querySelector('[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"],.ql-editor,.cm-content,.public-DraftEditor-content') || cur;
            return { editable: ed, detector: det + '-ancestor' };
          }
        }
        cur = cur.parentElement; depth++;
      }
    } catch {}
    return { editable: null, detector: '' };
  }

  async function aynFillSelect(el, wantLabel, wantValue) {
    const want = wantLabel || wantValue;
    const opts = Array.from(el.options || []);
    const opt = opts.find(o => aynOptionMatches(o.textContent, want) || aynOptionMatches(o.value, want));
    if (!opt) return { ok: false, verified: false, reason: 'no matching select option', selectStrategy: '', selectVerified: false };

    const verify = () => {
      const cur = el.options[el.selectedIndex];
      if (!cur) return false;
      if (cur.value === opt.value) return true;
      return aynOptionMatches(cur.textContent, opt.textContent);
    };

    // Strategy A — native setter + input/change
    try {
      el.focus && el.focus();
      el.value = opt.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await aynSleep(40);
      if (verify()) return { ok: true, verified: true, selectStrategy: 'A', selectVerified: true };
    } catch {}

    // Strategy B — selectedIndex + full pointer/focus/blur sequence
    try {
      el.focus && el.focus();
      try { el.dispatchEvent(new Event('pointerdown', { bubbles: true })); } catch {}
      try { el.dispatchEvent(new Event('mousedown', { bubbles: true })); } catch {}
      try { el.dispatchEvent(new Event('focus', { bubbles: true })); } catch {}
      el.selectedIndex = opt.index;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      try { el.blur && el.blur(); } catch {}
      try { el.dispatchEvent(new Event('blur', { bubbles: true })); } catch {}
      await aynSleep(60);
      if (verify()) return { ok: true, verified: true, selectStrategy: 'B', selectVerified: true };
    } catch {}

    // Strategy C — native type-ahead keystrokes
    try {
      el.focus && el.focus();
      const txt = String(opt.textContent || '').trim();
      for (const ch of txt.slice(0, 40)) {
        try { el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ch })); } catch {}
        try { el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ch })); } catch {}
        await aynSleep(15);
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await aynSleep(40);
      if (verify()) return { ok: true, verified: true, selectStrategy: 'C', selectVerified: true };
    } catch {}

    return { ok: false, verified: false, reason: 'value did not stick after retries', selectStrategy: 'failed', selectVerified: false };
  }


  // v2.10.1 — sensitive intents where a confident wrong answer is worse than
  // a blank. Covers work authorization, sponsorship (now and future), EEO/
  // self-identification (gender, race, ethnicity, veteran, disability),
  // salary/compensation, and notice period. Matched against the resolved
  // question engine semantic type OR, when unavailable, against the visible
  // question text via regex.
  const AYN_SENSITIVE_NO_GUESS_TYPES = new Set([
    'work_authorization', 'work_auth', 'authorized_to_work',
    'sponsorship', 'sponsorship_now', 'sponsorship_future', 'require_sponsorship',
    'gender', 'race', 'ethnicity', 'hispanic_latino', 'veteran', 'veteran_status',
    'disability', 'disability_status', 'self_identification',
    'salary', 'salary_expectation', 'compensation', 'desired_salary',
    'notice_period', 'notice',
  ]);
  const AYN_SENSITIVE_NO_GUESS_RE = /(work\s*auth|authori[sz]ed\s+to\s+work|legally\s+authori[sz]ed|require\s+sponsor|sponsorship|visa\s+sponsor|gender|race|ethnic|hispanic|latino|veteran|disab(?:le|il)|self[-\s]?identif|salary|compensation|expected\s+pay|desired\s+pay|pay\s+expectation|notice\s+period)/i;
  function aynIsSensitiveNoGuess(field, el) {
    try {
      const st = field && (field.semanticType || field.semantic_type || field.intent || field.intentKey);
      if (st && AYN_SENSITIVE_NO_GUESS_TYPES.has(String(st).toLowerCase())) return true;
      let text = '';
      try { text = (aynAccName && aynAccName(el)) || ''; } catch (_) {}
      if (!text) { try { text = (aynGroupName && aynGroupName(el)) || ''; } catch (_) {} }
      if (!text && field) text = String(field.label || field.question || '');
      return !!(text && AYN_SENSITIVE_NO_GUESS_RE.test(text));
    } catch (_) { return false; }
  }

  async function aynFillTypeahead(el, value, field) {
    const nrm = (s) => String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
    const val = String(value || '');
    el.focus();
    el.click();
    // v2.2.0 — Type first characters key-by-key so the ATS search API fires.
    // Full-value sets never trigger per-char input listeners the typeahead
    // debounces on (Greenhouse location, Ashby school, Workday country).
    const trigger = val.slice(0, Math.min(6, val.length));
    try { await aynTypeKeystrokes(el, trigger); } catch (_) { try { aynSetNativeValue(el, trigger); } catch(_) {} }
    // Poll up to ~2.6s (200 * 13) with backoff; accept portal-rendered options
    // whose offsetParent is null but which have a real bounding rect.
    let optionEls = [];
    const isVisibleOpt = (o) => {
      if (o.offsetParent !== null) return true;
      try { const r = o.getBoundingClientRect(); return r.width > 1 && r.height > 1; } catch (_) { return false; }
    };
    // v2.3.2 — Prefer the specific listbox the combobox owns via aria-controls/-owns.
    // Falls back to document-wide poll when the attribute is missing.
    const ctrlId = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
    for (let i = 0; i < 13; i++) {
      await aynSleep(i < 4 ? 150 : 250);
      const listbox = ctrlId ? document.getElementById(ctrlId) : null;
      const scope = (listbox && isVisibleOpt(listbox)) ? listbox : document;
      optionEls = Array.from(scope.querySelectorAll('[role="option"], [role="listbox"] [role="option"], [role="listbox"] li, [class*="option" i], [class*="menu" i] li, [id*="option" i]'))
        .filter(o => isVisibleOpt(o) && nrm(o.textContent).length && nrm(o.textContent).length < 200);
      if (!optionEls.length && scope !== document) {
        // Portal listbox exists but empty this tick — try doc-wide fallback.
        optionEls = Array.from(document.querySelectorAll('[role="option"], [role="listbox"] [role="option"], [role="listbox"] li, [class*="option" i], [class*="menu" i] li, [id*="option" i]'))
          .filter(o => isVisibleOpt(o) && nrm(o.textContent).length && nrm(o.textContent).length < 200);
      }
      if (optionEls.length) break;
    }

    if (optionEls.length) {
      const match = optionEls.find(o => aynOptionMatches(o.textContent, val));
      // v2.10.1 — never guess on discrete sensitive questions. Free-form
      // typeaheads (city, school, university, discipline) keep the
      // first-option fallback; work auth / sponsorship / EEO / salary /
      // notice period do not. Blank is safer than confidently wrong.
      const sensitive = aynIsSensitiveNoGuess(field, el);
      if (!match && sensitive) {
        return { ok: false, skip: true, verified: false, reason: 'no-confident-option' };
      }
      const pick = match || optionEls[0];
      if (pick) {
        try { pick.scrollIntoView({ block: 'nearest' }); } catch {}
        pick.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        pick.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        pick.click();
        await aynSleep(80);
        return { ok: true, verified: true, picked: nrm(pick.textContent) };
      }
    }
    // No listbox appeared — commit the raw typed value with Enter as last resort.
    // v2.10.1 — but not on sensitive discrete questions, where committing a
    // typed value the ATS didn't confirm is still a guess.
    if (aynIsSensitiveNoGuess(field, el)) {
      return { ok: false, skip: true, verified: false, reason: 'no-confident-option' };
    }
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
    await aynSleep(40);
    const ok = (el.value || '').trim().length > 0;
    return { ok, verified: false, reason: ok ? 'typed, no option list' : 'typeahead found no options' };
  }

  async function aynFillField(el, field, ai) {
    try {
      const kind = ((field && (field.kind || field.type)) || '').toLowerCase();
      const role = ((field && field.accRole) || '').toLowerCase();
      const wantText = ai.value != null ? String(ai.value) : '';
      const wantLabel = ai.optionLabel || ai.value || '';
      const wantValue = ai.optionValue || '';
      // Rich-text editors (ProseMirror, TipTap, Slate, Draft, Quill, Lexical, CodeMirror, Monaco, role=textbox, data-editor)
      if (kind !== 'radio' && kind !== 'checkbox' && kind !== 'select' && el.tagName !== 'SELECT' && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') {
        const info = aynResolveRichEditor(el);
        if (info.editable) {
          const r = await aynFillTextbox(info.editable, wantText);
          r.richEditor = true;
          r.richDetector = info.detector;
          return r;
        }
      }
      if (el && el.isContentEditable) {
        const r = await aynFillTextbox(el, wantText);
        r.richEditor = true;
        r.richDetector = r.richDetector || 'contenteditable';
        return r;
      }
      if (kind === 'radio' || kind === 'checkbox' || role === 'radio' || role === 'checkbox' || el.type === 'radio' || el.type === 'checkbox') {
        return await aynFillOption(el, wantLabel, wantValue);
      }
      if (kind === 'select' || el.tagName === 'SELECT') {
        return await aynFillSelect(el, wantLabel, wantValue);
      }
      if (kind === 'typeahead' || role === 'combobox' || (typeof isTypeahead === 'function' && isTypeahead(el))) {
        return await aynFillTypeahead(el, wantText || wantLabel, field);
      }
      return await aynFillTextbox(el, wantText);
    } catch (e) {
      return { ok: false, reason: 'exception: ' + (e && e.message ? e.message : 'unknown') };
    }
  }

  async function injectValues(values) {
    let filled = 0;
    const results = [];

    try { aynPersistInjectedSnapshot(values, 'inject-start'); } catch (_) {}

    try {
      console.log('[AYN-BG] injecting', values.length, 'values; buttongroups=',
        values.filter(v => /^__buttongroup__:/.test(v.id || '')).length);
    } catch {}

    // v1.9.43 — text-candidate cache for question-based matching fallback
    const __textCandCache = new Map(); // doc -> [{el, q}]
    const __textUsed = new WeakSet();
    function __textCandsFor(doc) {
      if (__textCandCache.has(doc)) return __textCandCache.get(doc);
      const sel = 'input:not([type]), input[type="text"], input[type="tel"], input[type="email"], input[type="url"], input[type="number"], input[type="search"], textarea, [role="textbox"], [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]';
      const list = [];
      try {
        Array.from(doc.querySelectorAll(sel)).forEach(el => {
          if (!el || el.disabled || el.readOnly) return;
          const rect = el.getBoundingClientRect && el.getBoundingClientRect();
          if (rect && rect.width === 0 && rect.height === 0) return;
          let q = '';
          try { q = aynFieldQuestion(el); } catch (_) {}
          list.push({ el, q });
        });
      } catch (_) {}
      __textCandCache.set(doc, list);
      return list;
    }
    function __resolveByQuestion(doc, aiLabel, preferTag) {
      if (!aiLabel) return null;
      const cands = __textCandsFor(doc);
      let best = null, bestScore = 0;
      for (const c of cands) {
        if (__textUsed.has(c.el)) continue;
        let s = aynQuestionScore(aiLabel, c.q);
        if (preferTag && c.el.tagName === preferTag) s += 0.08; // prefer textarea for open answers
        if (s > bestScore) { bestScore = s; best = c; }
      }
      if (best && bestScore >= 0.5) return best.el;
      return null;
    }

    function __isTextLikeEl(el) {
      if (!el) return false;
      const tag = (el.tagName || '').toUpperCase();
      const type = String(el.type || '').toLowerCase();
      return tag === 'TEXTAREA'
        || el.isContentEditable
        || (el.getAttribute && el.getAttribute('role') === 'textbox')
        || (tag === 'INPUT' && /^(|text|email|tel|url|number|search|password)$/.test(type));
    }

    function __isKindMismatch(el, expectedKind, looksText) {
      if (!el) return false;
      const tag = (el.tagName || '').toUpperCase();
      const type = String(el.type || '').toLowerCase();
      if (looksText && (tag === 'SELECT' || type === 'radio' || type === 'checkbox')) return true;
      if (/textarea|opentext|richedit/.test(expectedKind) && !__isTextLikeEl(el)) return true;
      if (/select/.test(expectedKind) && tag !== 'SELECT') return true;
      if (/(radio|checkbox)/.test(expectedKind) && type && type !== expectedKind) return true;
      return false;
    }



    let _injectIdx = 0;
    for (const v of values) {
      // Human-like pacing between distinct fields (not inside a single
      // field's retry logic). Reduces bot-detection reloads triggered by
      // synchronous burst-fills. 60-180ms random jitter.
      if (_injectIdx++ > 0) {
        try { await aynSleep(60 + Math.floor(Math.random() * 120)); } catch (_) {}
      }
      const { id, value, optionValue, optionLabel, optionValues, optionLabels, skip, _idx, _frame } = v;
      if (skip) { results.push({ id, ok: false, reason: 'skipped' }); continue; }

      // v2.5.0 — universal short-circuit: never overwrite a correct live value.
      // Kills the "AI writes right answer -> pipeline overwrites it" class of bugs.
      try {
        const wantForCheck = optionLabel || optionValue || value;
        if (wantForCheck && aynLiveMatchesWanted(id, wantForCheck, v)) {
          filled++;
          results.push({ id, ok: true, verified: true, reason: 'already-correct' });
          continue;
        }
      } catch (_) {}

      const { doc, rawId } = resolveDoc(id, _frame);

      // Label-based custom group click
      if (id.includes('__labelgroup__:')) {
        const targets = [optionLabel || optionValue || value].filter(Boolean);
        const labs = (window.__AYN_LABELGROUP_MAP__ && window.__AYN_LABELGROUP_MAP__.get(id)) || null;
        if (!labs || !labs.length) { results.push({ id, ok: false, reason: 'labelgroup not found' }); continue; }
        let landed = false;
        for (const tRaw of targets) {
          const want = String(tRaw || '').trim(); if (!want) continue;
          const target = labs.find(l => aynOptionMatches((l.innerText || '').trim(), want));
          if (!target) continue;
          try {
            try { target.scrollIntoView({ block: 'center' }); } catch {}
            const sig = (el) => (el ? (String(el.className || '') + '|' + (el.querySelector('*') ? String(el.querySelector('*').className || '') : '')) : '');
            const before = sig(target);
            target.click();
            await sleep(70);
            const inner = target.querySelector('div, span');
            if (inner) { try { fireFullClick(inner); } catch {} await sleep(40); }
            const after = sig(target);
            const selectedish = /selected|checked|active|-on\b/i;
            landed = (after !== before) || selectedish.test(after)
              || target.getAttribute('aria-checked') === 'true'
              || !!target.querySelector('[aria-checked="true"]');
          } catch {}
          break;
        }
        results.push({ id, ok: landed, verified: landed, reason: landed ? 'labelgroup-click' : 'labelgroup-click-unverified' });
        if (landed) filled++;
        continue;
      }

      // v1.9.57 — recovered open-answer boxes (textarea / rich editor wrappers).
      if (id.includes('__opentext__:')) {
        const editable = window.__AYN_OPEN_TEXT_MAP__ && window.__AYN_OPEN_TEXT_MAP__.get(id);
        if (!editable) { results.push({ id, ok: false, reason: 'open text editor not found' }); continue; }
        const chosenOT = optionValue || optionLabel || value;
        if (!chosenOT || !String(chosenOT).trim()) { results.push({ id, ok: false, reason: 'no value' }); continue; }
        try {
          const r = await aynFillTextbox(editable, String(chosenOT));
          if (r.ok) filled++;
          const out = { id, ok: !!r.ok, openText: true };
          if (r.verified !== undefined) out.verified = !!r.verified;
          if (r.reason) out.reason = r.reason;
          if (editable.isContentEditable || (editable.getAttribute && editable.getAttribute('role') === 'textbox')) out.richEditor = true;
          results.push(out);
        } catch (e) { results.push({ id, ok: false, reason: e.message, openText: true }); }
        continue;
      }

      // v1.9.44 — structural native-radio group (unique-name forms like Gem)
      if (id.includes('__structradio__:')) {
        const entry = (window.__AYN_STRUCTRADIO_MAP__ && window.__AYN_STRUCTRADIO_MAP__.get(id)) || null;
        let radios = null;
        if (entry) {
          // v1.9.67 — prefer LIVE radios from the persisted container. React
          // re-renders replace input nodes, but the container usually survives.
          const container = entry.container || null;
          const stored = Array.isArray(entry) ? entry : (entry.radios || []);
          if (container && container.isConnected) {
            const live = Array.from(container.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled);
            radios = live.length >= 2 ? live : stored;
          } else {
            radios = stored;
          }
        }
        if (!radios || !radios.length) { results.push({ id, ok: false, reason: 'structradio group not found' }); continue; }
        const cands = [optionLabel, optionValue, value].map(s => String(s || '').trim()).filter(Boolean);
        // v2.3.2 — Synthetic Workday values ("opt_1", "Yes_3847", raw hashes) drift
        // per posting; visible label text is stable. Skip synthetic values so the
        // AI can't accidentally lock the injector to a stale position.
        const SYNTH_VALUE_RE = /^(on|off|true|false|\d+|opt[_-]?\d+|[a-f0-9]{8,}|.+_\d{3,})$/i;
        let target = null;
        outer:
        for (const want of cands) {
          for (const r of radios) {
            // v2.5.1 — Ashby (and similar ATS) render <label for="id"> as a SIBLING of
            // the input, never an ancestor. r.closest('label') returns null on that
            // shape and previously fell back to an empty wrapper's innerText, which is
            // why every option failed to match. Check label[for=id] FIRST.
            const labelForEl = r.id ? (r.ownerDocument || document).querySelector('label[for="' + CSS.escape(r.id) + '"]') : null;
            const lbl = (labelForEl?.innerText || (r.closest('label'))?.innerText || r.parentElement?.innerText || '').replace(/\s+/g,' ').trim();
            if (aynOptionMatches(lbl, want)) { target = r; break outer; }
            if (r.value && r.value !== 'on' && !SYNTH_VALUE_RE.test(r.value) && aynOptionMatches(r.value, want)) { target = r; break outer; }
          }
        }

        let ok = false;
        if (target) {
          try {
            // First attempt: try normal clicks
            const lab = target.closest('label') || (target.id && doc.querySelector(`label[for="${CSS.escape(target.id)}"]`)) || target.parentElement;
            target.click(); await aynSleep(30);
            if (!target.checked && lab) { lab.click(); await aynSleep(30); }
            
            if (!target.checked) {
              const optionAncestor = target.closest('[class*="option" i],[class*="Option" i],li,[role="radio"]');
              if (optionAncestor && optionAncestor !== target) { optionAncestor.click(); await aynSleep(30); }
            }
            if (!target.checked && self.AYN_DOM && self.AYN_DOM.writeControlled) { 
              self.AYN_DOM.writeControlled(target, true); 
              await aynSleep(20); 
            }
            
            // Wait for React to re-render and potentially drop our change
            await aynSleep(150);
            
            // Re-acquire the target in case React replaced the DOM nodes
            let liveTarget = target;
            if (!liveTarget.isConnected && entry && entry.container) {
              const liveRadios = Array.from(entry.container.querySelectorAll('input[type="radio"]'));
              if (liveRadios.length) {
                // Find the one with the same value or index
                const originalIndex = radios.indexOf(target);
                if (originalIndex >= 0 && originalIndex < liveRadios.length) {
                  liveTarget = liveRadios[originalIndex];
                }
              }
            }

            // Verify and Retry if it dropped
            if (!liveTarget.checked) {
              console.log('[AYN-BG] structradio reverted after first pass, retrying via writeControlled');
              if (self.AYN_DOM && self.AYN_DOM.writeControlled) {
                self.AYN_DOM.writeControlled(liveTarget, true);
              } else {
                liveTarget.click();
              }
              await aynSleep(100);
            }
            
            ok = !!liveTarget.checked;
          } catch (_) {}
        }
        results.push({ id, ok, verified: ok, reason: ok ? 'structradio-click' : 'structradio no match' });
        if (ok) filled++;
        continue;
      }


      // v2.2.0 — multi-select unique-name checkbox group (Ashby race/ethnicity).
      // id shape: "__checkbox__:multi:g<fid>"; look up boxes from __AYN_MULTICHECK_MAP__
      // and click each whose label matches any of optionLabels[]. Never uncheck.
      if (/^(?:frame\d+:)?__checkbox__:multi:/.test(id)) {
        const boxes = (window.__AYN_MULTICHECK_MAP__ && window.__AYN_MULTICHECK_MAP__.get(id)) || [];
        if (!boxes.length) { results.push({ id, ok: false, reason: 'multi-checkbox map missing' }); continue; }
        const wants = Array.isArray(optionLabels) && optionLabels.length ? optionLabels
                    : Array.isArray(optionValues) && optionValues.length ? optionValues
                    : [optionLabel || optionValue || value].filter(Boolean);
        if (!wants.length) { results.push({ id, ok: false, reason: 'no options for multi-check' }); continue; }
        let clicked = 0;
        for (const w of wants) {
          const wantStr = String(w || '').trim();
          if (!wantStr) continue;
          const box = boxes.find(b => {
            const lbl = (getLabelFor(b) || aynAccName(b) || b.value || '').trim();
            return aynOptionMatches(lbl, wantStr) || aynOptionMatches(b.value || '', wantStr);
          });
          if (box && !box.checked) {
            try {
              const clickable = box.closest('label') || box;
              try { box.scrollIntoView({ block: 'center' }); } catch {}
              clickable.click();
              await sleep(30);
              if (!box.checked) {
                const optionAncestor = box.closest('[class*="option" i],[class*="Option" i],li,[role="checkbox"]');
                if (optionAncestor && optionAncestor !== box) { optionAncestor.click(); await sleep(30); }
              }
              if (!box.checked) { aynSetChecked(box, true); }
              clicked++;
            } catch {}
          } else if (box && box.checked) {
            clicked++;
          }
        }
        if (clicked) { filled++; results.push({ id, ok: true, verified: true, picked: clicked }); }
        else { results.push({ id, ok: false, reason: 'no multi-check option matched' }); }
        continue;
      }

      // Radio/checkbox group ids look like "__radio__:<name>" or "frame0:__checkbox__:<name>"
      const groupMatch = /^(?:frame\d+:)?__(radio|checkbox)__:(.+)$/.exec(id);
      if (groupMatch) {
        const kind = groupMatch[1];
        const name = groupMatch[2];
        const radios = Array.from(doc.querySelectorAll(`input[type="${kind}"][name="${CSS.escape(name)}"]`));

        // Custom (ARIA) radio group fallback: id like "__radio__:custom:N" (or empty name lookup)
        const customEls = (kind === 'radio' && (!radios.length))
          ? ((window.__AYN_CUSTOM_RADIO_MAP__ && window.__AYN_CUSTOM_RADIO_MAP__.get(id)) || null)
          : null;

        if (!radios.length && !customEls) { results.push({ id, ok: false, reason: 'group not found' }); continue; }

        const targets = (kind === 'checkbox' && Array.isArray(optionLabels))
          ? optionLabels
          : (kind === 'checkbox' && Array.isArray(optionValues))
            ? optionValues
            : [optionLabel || optionValue || value].filter(Boolean);
        if (!targets.length) { results.push({ id, ok: false, reason: 'no option' }); continue; }

        // Hidden-checkbox proxy: Ashby renders hidden <input type=checkbox> with visible Yes/No buttons
        const firstInput = radios[0];
        if (kind === 'checkbox' && isElHidden(firstInput)) {
          const wantRaw = String(optionLabel || optionValue || value || '').trim();
          const wantTrue = /^(yes|true|1|agree|consent|checked|on)$/i.test(wantRaw);
          const container = firstInput.closest('[data-field-path],[class*="fieldEntry"],[class*="field-entry"],fieldset,[class*="field"]') || firstInput.parentElement;
          const btns = container ? Array.from(container.querySelectorAll('button,[role="button"],[role="radio"],[role="option"]')).filter(b => !b.disabled) : [];
          const tries = [wantRaw, wantTrue ? 'yes' : 'no'].filter(Boolean);
          let btn = null;
          for (const tnorm of tries) { btn = btns.find(b => aynOptionMatches(safeText(b) || b.getAttribute('aria-label') || '', tnorm)); if (btn) break; }

          const qLabel = getLabelFor(firstInput) || name;
          try { console.log('[AYN-BG] proxy detected; hiddenCheckbox; btnFound=', !!btn, 'want=', wantRaw); } catch {}
          if (btn) {
            // v2.2.0 — only short-circuit when the already-selected button IS
            // the wanted answer. Previously we returned "already-set" whenever
            // ANY button was selected (Ashby often pre-highlights "No"), which
            // silently reported the wrong answer as verified.
            const btnLabel = (safeText(btn) || btn.getAttribute('aria-label') || '').trim();
            const alreadySelected = bgIsSelected(btn);
            const alreadyCorrect = alreadySelected && aynOptionMatches(btnLabel, wantRaw);
            if (alreadyCorrect) {
              filled++; results.push({ id, ok: true, verified: true, reason: 'proxy-already-set' });
              continue;
            }
            const okv = await clickOptionButton(btn, qLabel, norm(btnLabel));
            if (okv) { filled++; results.push({ id, ok: true, verified: true }); continue; }
          }
        }

        // Custom (ARIA) radio group click+verify path
        if (customEls && customEls.length) {
          let anyC = false;
          for (const tRaw of targets) {
            const tRawStr = String(tRaw || '').trim();
            if (!tRawStr) continue;
            const target = customEls.find(e => aynOptionMatches(aynAccName(e) || safeText(e) || e.getAttribute('aria-label') || '', tRawStr)
              || aynOptionMatches(e.getAttribute('value') || '', tRawStr));
            if (!target) continue;
            try {
              try { target.scrollIntoView({ block: 'center' }); } catch {}
              const clickable = target.closest('label') || target;
              try { target.focus && target.focus(); } catch {}
              clickable.click();
              await sleep(50);
              let verified = target.getAttribute('aria-checked') === 'true';
              if (!verified) {
                fireFullClick(clickable);
                await sleep(80);
                verified = target.getAttribute('aria-checked') === 'true';
              }
              // v1.9.67 — removed forced success. Painting aria-checked ourselves does
              // not change the page's real state; reporting it as verified poisoned
              // answer memory and inflated fill counts. Unverified stays unverified.
              if (verified) anyC = true;
            } catch {}
          }
          if (anyC) { filled++; results.push({ id, ok: true, verified: true }); }
          else results.push({ id, ok: false, reason: 'custom radio option not matched' });
          continue;
        }


        let any = false;
        // Single-choice-by-checkbox: when exactly one label was returned for a checkbox group,
        // uncheck any already-checked siblings first so the "pick one" contract holds.
        const singleChoiceCheckbox = (kind === 'checkbox' && targets.length === 1);
        if (singleChoiceCheckbox) {
          radios.forEach(r => {
            if (r.checked && !r.disabled) {
              try { r.checked = false; r.click(); r.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
            }
          });
        }
        targets.forEach(tRaw => {
          const tRawStr = String(tRaw || '').trim();
          if (!tRawStr) return;
          const m = radios.find(r => {
            return aynOptionMatches(getLabelFor(r) || r.value, tRawStr) || aynOptionMatches(r.value, tRawStr);
          });

          if (m && !m.disabled) {
            try {
              if (!m.checked) {
                m.click();
                if (!m.checked) {
                  const optionAncestor = m.closest('[class*="option" i],[class*="Option" i],li,[role="checkbox"],[role="radio"]');
                  if (optionAncestor && optionAncestor !== m) optionAncestor.click();
                }
                if (!m.checked) aynSetChecked(m, true);
              }
              m.dispatchEvent(new Event('change', { bubbles: true }));
              any = true;
            } catch {}
          }
        });
        if (any) { filled++; results.push({ id, ok: true }); }
        else results.push({ id, ok: false, reason: `${kind} option not matched` });
        continue;
      }

      // PART 2: buttongroup (custom Yes/No toggles) — re-resolve LIVE at click time
      if (/^__buttongroup__:/.test(id)) {
        let meta = window.__AYN_BG_MAP__ && window.__AYN_BG_MAP__.get(id);
        // v2.5.0 — rebuild-and-retry when stale rerenders wipe the map entry
        if (!meta || !meta.qLabel) {
          try { aynRebuildFieldMaps(); } catch (_) {}
          meta = window.__AYN_BG_MAP__ && window.__AYN_BG_MAP__.get(id);
        }
        if (!meta || !meta.qLabel) { results.push({ id, ok: false, reason: 'buttongroup meta missing' }); continue; }
        const wantRaw = optionLabel || optionValue || value;
        if (!wantRaw) { results.push({ id, ok: false, reason: 'no option' }); continue; }

        // v2.5.0 — short-circuit if the live DOM already shows the wanted answer
        if (aynLiveMatchesWanted(id, wantRaw, v)) {
          filled++;
          results.push({ id, ok: true, verified: true, reason: 'already-correct' });
          continue;
        }

        const { target, scope } = findButtongroupOption(meta, wantRaw);
        if (!target) { results.push({ id, ok: false, reason: 'buttongroup option not matched' }); continue; }

        try {
          console.log('[AYN-BG] click', id, 'target?', !!target);
          // PRIMARY: single plain click (proven to work on Ashby; full mouse sequence double-toggles)
          try { target.scrollIntoView({ block: 'center' }); } catch {}
          try { target.focus && target.focus(); } catch {}
          target.click();
          // v1.9.67 — removed manual aria-checked painting. Verification below must
          // observe the page's own state change; otherwise the result is unverified.

          await sleep(60);
          let verified = aynChoiceMatchesWanted(scope, target, wantRaw);
          if (!verified) { await sleep(140); verified = aynChoiceMatchesWanted(scope, target, wantRaw); }
          try {
            console.log('[AYN-BG] afterPlainClick verified=', verified, 'class=',
              (target && typeof target.className === 'string' ? target.className : ''));
          } catch {}
          if (!verified) {
            // Fallback 1: full pointer/mouse sequence
            fireFullClick(target);
            await sleep(60);
            verified = aynChoiceMatchesWanted(scope, target, wantRaw);
            if (!verified) { await sleep(140); verified = aynChoiceMatchesWanted(scope, target, wantRaw); }
            try { console.log('[AYN-BG] afterFallback verified=', verified); } catch {}
          }
          if (!verified) {
            // Fallback 2: click parent / label
            const fallback = target.closest('label') || target.parentElement;
            if (fallback && fallback !== target) {
              fireFullClick(fallback);
              await sleep(60);
              verified = aynChoiceMatchesWanted(scope || fallback.parentElement, target, wantRaw) || aynChoiceMatchesWanted(scope || fallback.parentElement, fallback, wantRaw);
              if (!verified) { await sleep(140); verified = aynChoiceMatchesWanted(scope || fallback.parentElement, target, wantRaw) || aynChoiceMatchesWanted(scope || fallback.parentElement, fallback, wantRaw); }
              try { console.log('[AYN-BG] afterFallback verified=', verified); } catch {}
            }
          }
          if (!verified) {
            // Fallback 3: main-world click (isolated-world click may not reach React)
            mainWorldClickByText(meta.qLabel, optionLabel || optionValue || value);
            await sleep(150);
            verified = aynChoiceMatchesWanted(scope, target, wantRaw);
            try { console.log('[AYN-BG] afterMainWorld verified=', verified); } catch {}
          }
          try { console.log('[AYN-BG] result', id, 'verified=', verified); } catch {}
          if (verified) { filled++; results.push({ id, ok: true, verified: true }); }
          else { results.push({ id, ok: false, reason: 'not verified after click' }); }
        } catch (e) { results.push({ id, ok: false, reason: e.message }); }


        continue;
      }

      // Rich editor ids (contenteditable / ProseMirror / TipTap / Slate / Draft / Quill / Lexical / etc.)
      if (/^(?:frame\d+:)?__richedit__:/.test(id)) {
        const editable = window.__AYN_RICH_EDITOR_MAP__ && window.__AYN_RICH_EDITOR_MAP__.get(id);
        if (!editable) { results.push({ id, ok: false, reason: 'rich editor not found' }); continue; }
        const chosenRE = optionValue || optionLabel || value;
        if (!chosenRE || !String(chosenRE).trim()) { results.push({ id, ok: false, reason: 'no value' }); continue; }
        try {
          const r = await aynFillTextbox(editable, String(chosenRE));
          if (r.ok) filled++;
          const out = { id, ok: !!r.ok, richEditor: true };
          if (r.verified !== undefined) out.verified = !!r.verified;
          if (r.reason) out.reason = r.reason;
          results.push(out);
        } catch (e) { results.push({ id, ok: false, reason: e.message, richEditor: true }); }
        continue;
      }

      // Resolve a single element
      let el = aynResolveFieldEl(id, _frame);

      // v1.9.43 — for text-like answers, prefer BEST QUESTION-TEXT MATCH over positional _idx.
      // Rehydrate label from scan cache if the value payload didn't include it.
      let __aiLabel = (v.label || v.question || '');
      if (!__aiLabel) {
        try {
          const cache = window.__AYN_FIELD_LABELS__;
          if (cache && cache.get) __aiLabel = cache.get(id) || cache.get(rawId) || '';
        } catch (_) {}
      }
      const __kindHint = String(v.kind || v.type || '').toLowerCase();
      const __looksText = !/(radio|checkbox|select)/.test(__kindHint)
        && !(optionValues && optionValues.length)
        && !(optionLabels && optionLabels.length);
      let __resolverUsed = el ? (rawId && rawId.includes('__textfield__:') ? 'stable-text-map' : 'direct') : '';
      let __indexFallbackUsed = false;
      if ((!el || __isKindMismatch(el, __kindHint, __looksText)) && __looksText && __aiLabel) {
        const preferTag = /textarea/.test(__kindHint) ? 'TEXTAREA' : '';
        const matched = __resolveByQuestion(doc, __aiLabel, preferTag);
        if (matched) { el = matched; __resolverUsed = 'question-match'; try { console.log('[AYN-BG] question-match resolved for', id, '=>', __aiLabel); } catch {} }
      }

      if (!el && _idx != null) {
        const all = doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="image"]):not([type="reset"]), textarea, select');
        el = all[_idx];
        __resolverUsed = 'index-fallback';
        __indexFallbackUsed = true;
      }
      if (!el || el.disabled || el.readOnly) { results.push({ id, ok: false, reason: 'not found or disabled' }); continue; }
      if (__isKindMismatch(el, __kindHint, __looksText)) {
        results.push({
          id,
          ok: false,
          reason: 'resolved element kind mismatch',
          expectedKind: __kindHint,
          resolvedTag: el.tagName || '',
          resolvedType: el.type || '',
          resolver: __resolverUsed || '',
          indexFallback: __indexFallbackUsed,
        });
        continue;
      }
      if (__looksText) { try { __textUsed.add(el); } catch (_) {} }
      const chosen = optionValue || optionLabel || value;
      if (!chosen || !String(chosen).trim()) { results.push({ id, ok: false, reason: 'no value' }); continue; }

      if (el.type !== 'radio' && el.type !== 'checkbox') {
        const __cur = (el.isContentEditable ? (el.innerText || el.textContent || '') : (el.value || '')).trim();
        const __want = String(chosen).trim();
        const __digits = s => String(s || '').replace(/\D/g, '');
        if (__cur && (__cur === __want || (__digits(__want).length >= 6 && __digits(__cur) === __digits(__want)))) {
          results.push({ id, ok: true, verified: true, reason: 'already correct' }); continue;
        }
      }


      try {
        const aiVal = { value: chosen, optionLabel, optionValue };
        const field = { kind: __kindHint || (el.tagName === 'SELECT' ? 'select' : (el.tagName === 'TEXTAREA' ? 'textarea' : (el.type || '').toLowerCase())), accRole: (el.getAttribute && el.getAttribute('role')) || '' };
        let res = await aynFillField(el, field, aiVal);
        // Fallback: for radio/checkbox proxies (no native group), try buttongroup resolver
        if (!res.ok && (res.fallthrough || el.type === 'radio' || el.type === 'checkbox')) {
          try {
            if (typeof findButtongroupOption === 'function' && typeof clickOptionButton === 'function') {
              const qLabel = getLabelFor(el) || el.name || '';
              const container = el.closest('[data-field-path],[class*="fieldEntry"],[class*="field-entry"],fieldset,[class*="field"]') || el.parentElement;
              const btns = container ? Array.from(container.querySelectorAll('button,[role="button"],[role="radio"],[role="option"]')).filter(b => !b.disabled) : [];
              const wantRaw = String(optionLabel || optionValue || chosen || '').trim();
              const btn = btns.find(b => aynOptionMatches(safeText(b) || b.getAttribute('aria-label') || '', wantRaw));

              if (btn) {
                const okv = await clickOptionButton(btn, qLabel, norm(safeText(btn)));
                if (okv) res = { ok: true, verified: true };
              }
            }
          } catch {}
        }
        if (res.ok) filled++;
        const out = { id, ok: !!res.ok, expectedKind: __kindHint, resolvedTag: el.tagName || '', resolvedType: el.type || '', resolver: __resolverUsed || '', indexFallback: __indexFallbackUsed };
        if (res.verified !== undefined) out.verified = !!res.verified;
        if (res.reason) out.reason = res.reason;
        if (res.picked) out.picked = res.picked;
        if (res.selectStrategy) out.selectStrategy = res.selectStrategy;
        if (res.selectVerified !== undefined) out.selectVerified = !!res.selectVerified;
        if (res.richEditor) out.richEditor = true;
        if (res.richDetector) out.richDetector = res.richDetector;
        results.push(out);
      } catch (e) { results.push({ id, ok: false, reason: e.message }); }
    }


    // v1.9.58 — enrich failed results with skip diagnostics (selector, tag, resolver, kind)
    try {
      const aynBuildSelector = (el) => {
        if (!el || el.nodeType !== 1) return '';
        try {
          if (el.id) return '#' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id);
          const nm = el.getAttribute && el.getAttribute('name');
          if (nm) return `${el.tagName.toLowerCase()}[name="${String(nm).replace(/"/g, '\\"')}"]`;
          const parts = [];
          let n = el;
          for (let i = 0; i < 4 && n && n.nodeType === 1; i++, n = n.parentElement) {
            let seg = n.tagName.toLowerCase();
            const cls = (typeof n.className === 'string' ? n.className : '').trim().split(/\s+/)[0];
            if (cls) seg += '.' + cls.replace(/[^\w-]/g, '');
            parts.unshift(seg);
          }
          return parts.join(' > ');
        } catch (_) { return ''; }
      };
      const failed = results.filter(r => r && r.ok === false);
      const enriched = failed.map(r => {
        const v = values.find(x => x && x.id === r.id) || {};
        let el = null;
        try {
          const rd = resolveDoc(r.id, v._frame);
          const doc = rd && rd.doc;
          const raw = rd && rd.rawId;
          if (doc && raw) {
            el = aynResolveFieldEl(r.id, v._frame)
              || doc.getElementById(raw)
              || doc.querySelector(`[name="${String(raw).replace(/"/g,'\\"')}"]`)
              || null;
          }
        } catch (_) {}
        const isOpenText = !!(el && (
          el.tagName === 'TEXTAREA'
          || (el.getAttribute && el.getAttribute('role') === 'textbox')
          || el.isContentEditable
        ));
        const skipMeta = {
          id: r.id,
          reason: r.reason || 'unknown',
          selector: aynBuildSelector(el),
          tag: el ? el.tagName : '',
          kind: v.kind || v.type || '',
          expectedKind: r.expectedKind || v.kind || v.type || '',
          resolvedTag: r.resolvedTag || (el ? el.tagName : ''),
          resolvedType: r.resolvedType || (el ? el.type || '' : ''),
          question: v.label || '',
          resolver: r.resolver || v.labelSource || '',
          labelSource: v.labelSource || '',
          indexFallback: !!r.indexFallback,
          richDetector: v.richDetector || r.richDetector || '',
          isOpenText,
          hasValue: !!(v.value || v.optionLabel || v.optionValue),
          at: Date.now(),
        };
        r.skipMeta = skipMeta;
        try {
          console.groupCollapsed(`[AYN skip] ${skipMeta.reason} — ${skipMeta.selector || skipMeta.id}${isOpenText ? ' (open-text)' : ''}`);
          console.log(skipMeta);
          if (el) console.log('element:', el);
          console.groupEnd();
        } catch (_) {}
        return skipMeta;
      });
      try {
        window.__aynSkipLog = (window.__aynSkipLog || []).concat(enriched).slice(-50);
      } catch (_) {}
    } catch (_) { /* diagnostics must never break fill */ }

    // v1.9.67 — single counting rule: ok===true counts as filled (incl. "already correct").
    const __filled = results.filter(r => r && r.ok === true).length;
    return { filled: __filled, total: results.length, results };
  }

  // ══════════════════════════════════════════════════════════════════
  // 4. JOB CARD SCORING — inject badges onto search result cards
  // ══════════════════════════════════════════════════════════════════

  const AYN_BADGE_CLASS = 'ayn-score-badge';
  let scoringEnabled = false;
  let scoreCache = new Map(); // jobKey → { score, matchLabel, reasons }
  let userCardSkills = [];
  let userCardRoleTerms = [];

  function getJobCardSelectors() {
    const url = window.location.href;
    if (url.includes('linkedin.com')) {
      return {
        cards: '[data-occludable-job-id], [data-job-id], .job-card-container, .jobs-search-results__list-item, [class*="job-card"]',
        title: '.job-card-list__title, .job-card-container__link, h3',
        company: '.job-card-container__company-name, .job-card-list__company-name',
        snippet: '.job-card-container__job-insight, .job-card-list__footer-wrapper',
        inject: '.job-card-container__footer-item:last-child, .job-card-container__link',
      };
    }
    if (url.includes('indeed.com') || url.includes('ca.indeed.com')) {
      return {
        cards: '[class*="job_seen_beacon"], .resultWithShelf, [class*="jobsearch-SerpJobCard"]',
        title: '[class*="jobTitle"], h2 a, .title',
        company: '[class*="companyName"], .company',
        snippet: '[class*="job-snippet"], .summary',
        inject: '[class*="jobTitle"]',
      };
    }
    if (url.includes('jobright.ai')) {
      return {
        cards: '[class*="job-card"], [class*="JobCard"], [class*="job-item"]',
        title: 'h3, h2, [class*="title"]',
        company: '[class*="company"]',
        snippet: '[class*="description"], [class*="snippet"], p',
        inject: 'h3, h2',
      };
    }
    if (url.includes('glassdoor.com')) {
      return {
        cards: '[class*="JobCard"], li[class*="react-job-listing"]',
        title: '[class*="job-title"], [class*="jobTitle"]',
        company: '[class*="employer-name"], [class*="companyName"]',
        snippet: '[class*="job-snippet"]',
        inject: '[class*="job-title"]',
      };
    }
    return null;
  }

  function injectScoreBadge(card, score, matchLabel, reasons, salaryEstimate) {
    card.querySelector(`.${AYN_BADGE_CLASS}`)?.remove();

    const isGood = score >= 8, isFair = score >= 6, isOk = score >= 4;
    const color = isGood ? '#15803d' : isFair ? '#92400e' : isOk ? '#6b7280' : '#991b1b';
    const bg    = isGood ? '#f0fdf4' : isFair ? '#fffbeb' : isOk ? '#f9fafb' : '#fef2f2';
    const border= isGood ? '#86efac' : isFair ? '#fde68a' : isOk ? '#e5e7eb' : '#fecaca';

    const badge = document.createElement('div');
    badge.className = AYN_BADGE_CLASS;
    badge.style.cssText = `
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 999px;
      background: ${bg}; border: 1px solid ${border};
      font-size: 11px; font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      font-weight: 600; color: ${color}; line-height: 1.4;
      cursor: pointer; margin: 4px 0; white-space: nowrap;
      user-select: none; z-index: 100; position: relative;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    `;
    const salaryStr = salaryEstimate ? `<span style="font-weight:400;color:#888;margin-left:2px">· ${salaryEstimate}</span>` : '';
    badge.innerHTML = `
      <span style="font-size:9px;font-weight:700;letter-spacing:.02em">AYN</span>
      <span style="font-size:12px;font-weight:700">${score}/10</span>
      <span style="font-weight:500">${matchLabel}</span>
      ${salaryStr}
    `;

    // Tooltip with reasons
    if (reasons && reasons.length) {
      const tip = document.createElement('div');
      tip.style.cssText = `
        position: absolute; top: 100%; left: 0; z-index: 9999;
        background: #fff; border: 1px solid #e8e8e8;
        border-radius: 8px; padding: 8px 11px;
        font-size: 11px; color: #333; min-width: 170px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.10);
        display: none; margin-top: 5px;
        font-weight: 400; line-height: 1.5;
      `;
      tip.innerHTML = reasons.map(r => `<div style="padding:2px 0">· ${r}</div>`).join('');
      badge.appendChild(tip);
      badge.addEventListener('mouseenter', () => tip.style.display = 'block');
      badge.addEventListener('mouseleave', () => tip.style.display = 'none');
    }

    // Inject into card
    const sel = getJobCardSelectors();
    const target = sel ? (card.querySelector(sel.inject) || card) : card;
    target.style.position = 'relative';
    target.insertAdjacentElement('afterend', badge);
  }

  function extractCardData(card) {
    const sel = getJobCardSelectors();
    if (!sel) return null;
    const title = card.querySelector(sel.title)?.innerText?.trim() || '';
    const company = card.querySelector(sel.company)?.innerText?.trim() || '';
    const snippet = card.querySelector(sel.snippet)?.innerText?.trim() || '';
    return { title, company, snippet: snippet.slice(0, 500) };
  }

  function scoreCard(card) {
    const data = extractCardData(card);
    if (!data || !data.title) return;

    const key = `${data.title}|${data.company}`;
    if (scoreCache.has(key)) {
      const cached = scoreCache.get(key);
      injectScoreBadge(card, cached.score, cached.matchLabel, cached.reasons);
      return;
    }

    if (userCardSkills.length === 0 && userCardRoleTerms.length === 0) return;

    const title = data.title.toLowerCase();
    const text = (data.title + ' ' + data.company + ' ' + data.snippet).toLowerCase();

    let titleHits = 0;
    const seenRole = new Set();
    for (const term of userCardRoleTerms) {
      if (!term || seenRole.has(term)) continue;
      if (title.includes(term)) { titleHits++; seenRole.add(term); }
    }

    const matched = [];
    const seenSkill = new Set();
    for (const skill of userCardSkills) {
      if (!skill || seenSkill.has(skill)) continue;
      if (text.includes(skill)) { seenSkill.add(skill); if (matched.length < 4) matched.push(skill); }
    }
    const skillHits = seenSkill.size;

    let score = Math.round(2 + Math.min(titleHits * 2.5, 5) + Math.min(skillHits * 0.8, 3));
    score = Math.max(1, Math.min(10, score));
    const label = score >= 8 ? 'Strong' : score >= 6 ? 'Good' : score >= 4 ? 'Fair' : 'Low';
    const reasons = matched.length
      ? ['Matches: ' + matched.join(', '), 'Open job for full AI score']
      : ['Quick keyword match', 'Open job for full AI score'];

    const cached = { score, matchLabel: label, reasons };
    scoreCache.set(key, cached);
    injectScoreBadge(card, score, label, reasons);
  }

  function scoreSiblingCards() {
    const sel = getJobCardSelectors();
    if (!sel || !scoringEnabled) return;
    const cards = document.querySelectorAll(sel.cards);
    cards.forEach(card => {
      if (!card.querySelector(`.${AYN_BADGE_CLASS}`)) {
        scoreCard(card);
      }
    });
  }

  // MutationObserver to catch dynamically loaded job cards
  const cardObserver = new MutationObserver(() => {
    if (scoringEnabled) scoreSiblingCards();
  });

  function startCardScoring() {
    if (!AYN_IS_TOP) return;
    scoringEnabled = true;
    scoreSiblingCards();
    cardObserver.observe(document.body, { childList: true, subtree: true });
  }

  function stopCardScoring() {
    scoringEnabled = false;
    cardObserver.disconnect();
    document.querySelectorAll(`.${AYN_BADGE_CLASS}`).forEach(el => el.remove());
    scoreCache.clear();
  }

  // ══════════════════════════════════════════════════════════════════
  // v1.4.0: EXPAND REPEATING SECTIONS
  // Click "Add another experience", "Show more", section toggles BEFORE scanning.
  // Greenhouse, Workday, Lever, Ashby all use a button to reveal more fields.
  // ══════════════════════════════════════════════════════════════════
  // v1.9.56 — Pass A: force lazy-mounted / virtualized form sections to render.
  // Some ATS forms (Workday, custom React apps) only mount fields when their
  // container scrolls into view. Sweep the form top-to-bottom in 500px steps,
  // then restore. Best-effort; failures are silent.
  async function aynLazyScrollMount() {
    try {
      const form = document.querySelector('form, [role="form"], main, [class*="application"], body');
      if (!form) return;
      const originalY = window.scrollY;
      const height = Math.min(document.documentElement.scrollHeight, 15000);
      const step = 500;
      for (let y = 0; y < height; y += step) {
        window.scrollTo({ top: y, behavior: 'auto' });
        await aynSleep(40);
      }
      window.scrollTo({ top: originalY, behavior: 'auto' });
      await aynSleep(80);
    } catch (_) {}
  }

  // v1.9.56 — Pass B: visual-neighbor resolver. When no accessible label exists,
  // find the nearest text node above or to the left of the field within 140px
  // using getBoundingClientRect. Handles CSS-grid forms where DOM order ≠ visual.
  function aynVisualNeighbor(el) {
    try {
      if (!el || !el.getBoundingClientRect) return '';
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return '';
      const root = el.closest('form, [role="form"], main, body') || document.body;
      const nodes = root.querySelectorAll('label, legend, span, div, p, h1, h2, h3, h4, h5, strong');
      let best = null; let bestDist = Infinity;
      for (const n of nodes) {
        if (n === el || n.contains(el)) continue;
        if (n.querySelector && n.querySelector('input, textarea, select')) continue;
        const txt = (n.innerText || n.textContent || '').trim();
        if (!txt || txt.length < 2 || txt.length > 180) continue;
        const nr = n.getBoundingClientRect();
        if (!nr.width && !nr.height) continue;
        // Prefer text ABOVE (nr.bottom <= r.top+8) or LEFT (nr.right <= r.left+8) of the field
        const above = nr.bottom <= r.top + 8 && Math.abs(nr.left - r.left) < 260;
        const left  = nr.right  <= r.left + 8 && Math.abs(nr.top - r.top) < 60;
        if (!above && !left) continue;
        const dx = Math.max(0, Math.abs((nr.left + nr.right)/2 - (r.left + r.right)/2) - r.width/2);
        const dy = above ? (r.top - nr.bottom) : Math.abs(nr.top - r.top);
        const dist = dx + dy * 1.2;
        if (dist < bestDist && dist < 160) { bestDist = dist; best = txt.split('\n')[0].trim().slice(0, 160); }
      }
      return best || '';
    } catch (_) { return ''; }
  }

  function expandRepeatingSections() {
    const ADD_RE = /^\s*(\+\s*)?(add\s+(another|more|new)?|add (experience|education|employment|work|position)|show more|see more|expand)/i;
    const buttons = Array.from(document.querySelectorAll('button, a[role="button"], [class*="add-row"], [data-automation-id*="add"], [aria-label*="Add"]'));
    let clicked = 0;
    buttons.forEach(btn => {
      const txt = (btn.innerText || btn.getAttribute('aria-label') || '').trim();
      if (!txt || txt.length > 60) return;
      if (!ADD_RE.test(txt)) return;
      // Don't expand "add comment" / "add note" / "add file"
      if (/comment|note|file|upload|attachment/i.test(txt)) return;
      try {
        btn.click();
        clicked++;
        if (clicked >= 6) return; // cap so we don't spam-click
      } catch { /* ignore */ }
    });
    // v1.9.56 — trigger lazy mounts before scan returns
    try { aynLazyScrollMount(); } catch (_) {}
    return clicked;
  }


  // ══════════════════════════════════════════════════════════════════
  // v1.4.0: PROGRAMMATIC RESUME ATTACH (DataTransfer)
  // Tries to attach the user's AYN resume to a Resume / CV file input.
  // Many sites block this for security (Workday, some Greenhouse), so we
  // return { attached: false, reason } and the side panel falls back to
  // the manual download flow.
  // ══════════════════════════════════════════════════════════════════
  function tryAttachResume({ base64, filename, mime }) {
    try {
      const fileInputs = [];
      collectScannableDocs().forEach(({ doc }) => {
        doc.querySelectorAll('input[type="file"]').forEach(el => {
          if (el.disabled) return;
          const isResume = aynIsResumeFileInput(el);
          if (isResume) fileInputs.push(el);
        });
      });
      if (fileInputs.length === 0) return { attached: false, reason: 'no_file_input' };

      // Decode base64
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], filename, { type: mime || 'text/plain' });

      let attachedCount = 0;
      fileInputs.forEach(input => {
        try {
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('input', { bubbles: true }));
          // Verify the assignment actually stuck (some sites use a hidden replacement input)
          if (input.files && input.files.length > 0) {
            attachedCount++;
            input.style.outline = '2px solid #16a34a';
            input.style.outlineOffset = '2px';
            setTimeout(() => { input.style.outline = ''; input.style.outlineOffset = ''; }, 3000);
          }
        } catch (e) { /* per-input failure, keep going */ }
      });
      if (attachedCount === 0) return { attached: false, reason: 'blocked_by_site' };
      return { attached: true, count: attachedCount };
    } catch (e) {
      return { attached: false, reason: e.message || 'unknown_error' };
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // v1.4.0: AUTO-TRACKER — listen for form submission on apply pages
  // and notify background so it can save the job to the tracker.
  // ══════════════════════════════════════════════════════════════════
  let submitNotified = false;
  function attachSubmitListener() {
    // v2.8.1 — only arm the auto-tracker on real apply pages. On youtube.com,
    // gmail, reddit search, clicking a "Send" button used to save junk to the
    // Applications tracker. classifyPage gates it.
    const isApplyKind = () => {
      try { const c = classifyPage(); return c && c.kind === 'apply'; } catch { return false; }
    };
    const handler = () => {
      if (submitNotified) return;
      if (!isApplyKind()) return;
      submitNotified = true;
      const job = extractJobText();
      sendQuiet({
        type: 'AUTO_TRACK_SUBMIT',
        title: job.title, company: job.company, url: window.location.href, kind: 'apply',
      });
      // Reset after a while in case the submit failed
      setTimeout(() => { submitNotified = false; }, 8000);
    };
    document.addEventListener('submit', handler, true);
    // Also catch single-page-app submit buttons that don't fire a form submit
    document.addEventListener('click', e => {
      const btn = e.target.closest('button, [role="button"]');
      if (!btn) return;
      const txt = (btn.innerText || btn.getAttribute('aria-label') || '').trim();
      if (/^(submit application|submit|apply now|send application)$/i.test(txt)) handler();
    }, true);
  }
  attachSubmitListener();


  // ══════════════════════════════════════════════════════════════════
  // 4B. VISION FALLBACK (v1.9.30, Phase 3) — used ONLY when the normal
  //     autofill pass leaves option-style questions unresolved.
  // ══════════════════════════════════════════════════════════════════

  const AYN_OPTION_WORD_RE = /^(us|u\.?s\.?a?\.?|united states|canada|ireland|uk|united kingdom|male|female|non[- ]?binary|agender|other gender|asian|black|white|hispanic|latino|indigenous|native hawaiian|middle eastern|two or more|yes|no|maybe|prefer not|decline|i identify as|i am not|i do not wish|i currently reside|i am authorized|i require|i will require|i will not require|will not require|no, i am not|yes, i am)/i;

  function aynIsVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = (el.ownerDocument && el.ownerDocument.defaultView || window).getComputedStyle(el);
    if (!s) return true;
    return s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity || '1') > 0.05;
  }

  function aynCollectVisionCandidates(unresolvedFields) {
    const out = { questions: [], options: [] };
    unresolvedFields.forEach(f => {
      if (f && f.label) out.questions.push(String(f.label).slice(0, 240));
    });
    try {
      const seen = new Set();
      const sel = 'label, button, [role="radio"], [role="checkbox"], [role="option"], [role="button"], li, div, span';
      const nodes = Array.from(document.querySelectorAll(sel));
      for (const el of nodes) {
        if (out.options.length >= 40) break;
        if (!aynIsVisible(el)) continue;
        if (el.children && el.children.length > 3) continue;
        const t = (el.innerText || el.textContent || '').trim();
        if (!t || t.length > 80) continue;
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        // Keep short option-looking words OR anything that looks like an option in a form question area
        if (t.length <= 60 && (AYN_OPTION_WORD_RE.test(t) || /^[A-Z][^.?!]{1,60}$/.test(t))) {
          seen.add(key);
          out.options.push(t);
        }
      }
    } catch (_) {}
    return out;
  }

  function aynFindClickableByText(chosenOptionText) {
    if (!chosenOptionText) return null;
    const want = String(chosenOptionText);
    let best = null;
    let bestScore = -1;
    try {
      const nodes = Array.from(document.querySelectorAll('label, [role="radio"], [role="checkbox"], [role="option"], [role="button"], button, li, div, span, a'));
      for (const el of nodes) {
        if (!aynIsVisible(el)) continue;
        const t = (el.innerText || el.textContent || '').trim();
        if (!t || t.length > 200) continue;
        if (!aynOptionMatches(t, want)) continue;
        const kids = el.children ? el.children.length : 0;
        // Prefer LABEL, small elements, exact match
        let score = 100;
        if (el.tagName === 'LABEL') score += 40;
        if (t.length === want.length) score += 30;
        score -= kids * 5;
        if (score > bestScore) { bestScore = score; best = el; }
      }
    } catch (_) {}
    return best;
  }

  function aynLooksSelected(el) {
    if (!el) return false;
    try {
      if (el.getAttribute && el.getAttribute('aria-checked') === 'true') return true;
      if (el.getAttribute && el.getAttribute('aria-selected') === 'true') return true;
      const cn = String((el.className && el.className.baseVal) || el.className || '');
      if (/selected|checked|active|primary|-on\b|is-on\b/i.test(cn)) return true;
      // sibling native input became checked
      const parent = el.parentElement;
      if (parent) {
        const nativeChecked = parent.querySelector('input[type="radio"]:checked, input[type="checkbox"]:checked');
        if (nativeChecked) return true;
      }
    } catch (_) {}
    return false;
  }

  // v2.5.9 — vision fallback writer removed. Vision no longer has an independent
  // page-writing capability; injectValues is the only writer.

  async function aynFuseVisionIntoFields(fields, controlCount) {
    try {
      if (!AYN_VISION_ENABLED || !window.__AYN_VISION_DISCOVER__ || typeof window.__AYN_VISION_DISCOVER__.run !== 'function') {
        return { fields, diag: null };
      }
      const weak = (fields || []).filter(f => !f.label || (typeof f.confidence === 'number' && f.confidence < 0.68)).length;
      const shouldRun = (fields || []).length < Math.max(2, Math.floor((controlCount || 0) * 0.6)) || weak > 0;
      if (!shouldRun) return { fields, diag: null };
      const vr = await window.__AYN_VISION_DISCOVER__.run();
      const qs = vr && Array.isArray(vr.questions) ? vr.questions : [];
      if (!qs.length) return { fields, diag: { visionDiscover: vr || { questions: [] } } };
      const used = new Set();
      for (const q of qs) {
        const label = String(q.label || '').trim();
        if (!label) continue;
        let best = null, bestScore = 0;
        for (const f of fields) {
          if (!f || used.has(f.id)) continue;
          const current = String(f.label || '').trim();
          let score = current ? aynQuestionScore(current, label) : 0.45;
          const fKind = String(f.kind || f.type || '').toLowerCase();
          const qKind = String(q.kind || '').toLowerCase();
          if ((qKind.includes('choice') || qKind === 'boolean') && /(radio|checkbox|buttongroup|select)/.test(fKind)) score += 0.25;
          if (qKind === 'text' && /text|textarea/.test(fKind)) score += 0.2;
          if (score > bestScore) { bestScore = score; best = f; }
        }
        if (best && (bestScore >= 0.5 || !best.label)) {
          best.label = label;
          best.labelSource = 'vision+engine';
          if ((!best.options || !best.options.length) && Array.isArray(q.options) && q.options.length) {
            best.options = q.options.map(o => ({ label: String(o), value: String(o) }));
          }
          used.add(best.id);
        }
      }
      return { fields, diag: { visionDiscover: { zones: vr.zones || 0, questions: qs.length, fused: used.size } } };
    } catch (e) {
      return { fields, diag: { visionDiscoverError: String(e && e.message || e) } };
    }
  }


  // ══════════════════════════════════════════════════════════════════
  // v2.8.1 — Page classifier gate. classifyPage() returns
  //   { kind: 'apply' | 'listing' | 'other', confidence, signals }
  // Prevents AYN from treating any page with inputs (youtube.com, gmail,
  // reddit search…) as a job application. Consumer denylist is EXACT-host so
  // careers subdomains (careers.google.com, www.amazon.jobs) still pass.
  // ══════════════════════════════════════════════════════════════════
  const AYN_ATS_HOST_RE = /(ashbyhq\.com|greenhouse\.io|boards\.greenhouse|lever\.co|myworkdayjobs\.com|workday\.com|icims\.com|smartrecruiters\.com|gem\.com|bamboohr\.com|workable\.com|jazzhr\.com|taleo\.net|recruitee\.com|teamtailor\.com|breezy\.hr|jobvite\.com|dover\.com|rippling-ats\.com|pinpointhq\.com)/i;
  const AYN_APPLY_PATH_RE = /\/(apply|application|job|jobs|careers|career|position)s?(\/|$|\?)/i;
  const AYN_CONSUMER_DENY = new Set([
    'www.youtube.com','m.youtube.com','youtube.com',
    'mail.google.com','www.google.com','google.com',
    'www.facebook.com','facebook.com',
    'www.instagram.com','instagram.com',
    'x.com','twitter.com','www.twitter.com',
    'www.reddit.com','reddit.com',
    'www.netflix.com','netflix.com',
    'www.tiktok.com','tiktok.com',
    'web.whatsapp.com',
    'open.spotify.com',
    'www.amazon.com','amazon.com',
  ]);

  function classifyPage() {
    const signals = [];
    const add = (name, weight, target) => signals.push({ name, weight, target: target || 'apply' });
    let text = '';
    try { text = (document.body && (document.body.innerText || '')).slice(0, 60000); } catch {}

    // STRONG APPLY (+3 each)
    // File input for resume/CV
    try {
      const files = document.querySelectorAll('input[type="file"]');
      for (const fi of files) {
        const accept = String(fi.getAttribute('accept') || '').toLowerCase();
        const hasResumeAccept = /pdf|doc|docx/.test(accept);
        let nearby = '';
        try {
          const lbl = fi.id ? document.querySelector(`label[for="${CSS.escape(fi.id)}"]`) : null;
          nearby = ((lbl && lbl.textContent) || fi.closest('label')?.textContent || fi.getAttribute('aria-label') || fi.name || '').slice(0, 200);
        } catch {}
        if (hasResumeAccept || /resume|cv/i.test(nearby)) { add('file_resume', 3); break; }
      }
    } catch {}
    // Submit-style button copy
    try {
      const btns = document.querySelectorAll('button, [role="button"], input[type="submit"]');
      for (const b of btns) {
        const t = ((b.innerText || b.value || b.getAttribute('aria-label') || '')).trim();
        if (/submit application|apply now|apply for this (job|position|role)|send application/i.test(t)) { add('submit_button', 3); break; }
      }
    } catch {}
    // EEO block (>=2 phrases)
    try {
      const eeoRe = /gender identity|race|ethnicity|veteran status|disability|voluntary self.identification/i;
      let hits = 0;
      const parts = text.split(/\n+/);
      const seen = new Set();
      for (const line of parts) {
        const m = line.match(eeoRe);
        if (m && !seen.has(m[0].toLowerCase())) { seen.add(m[0].toLowerCase()); hits++; if (hits >= 2) break; }
      }
      if (hits >= 2) add('eeo_block', 3);
    } catch {}

    // MEDIUM (+2 each)
    let host = '', pathname = '';
    try { const u = new URL(location.href); host = u.hostname.toLowerCase(); pathname = u.pathname; } catch {}
    if (host && AYN_ATS_HOST_RE.test(host)) add('ats_host', 2);
    if (pathname && AYN_APPLY_PATH_RE.test(pathname)) add('apply_path', 2);
    // Contact-field cluster: at least 3 of first name, last name, email, phone in one form/fieldset
    let hasContactCluster = false;
    try {
      const scopes = Array.from(document.querySelectorAll('form, fieldset, [role="form"]'));
      if (!scopes.length) scopes.push(document.body);
      const rxs = [/first.?name|given.?name/i, /last.?name|family.?name|surname/i, /e.?mail/i, /phone|mobile|tel/i];
      for (const scope of scopes) {
        if (!scope) continue;
        const labels = Array.from(scope.querySelectorAll('label, [aria-label], input[placeholder]'))
          .map(el => (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim())
          .filter(Boolean);
        let hit = 0;
        for (const rx of rxs) { if (labels.some(l => rx.test(l))) hit++; }
        if (hit >= 3) { hasContactCluster = true; break; }
      }
      if (hasContactCluster) add('contact_cluster', 2);
    } catch {}

    // LISTING signals (+2 each, target 'listing')
    let hasResumeFileInput = false;
    try { hasResumeFileInput = signals.some(s => s.name === 'file_resume'); } catch {}
    try {
      const jd = extractJobText();
      const jdLen = String(jd && jd.text || '').length;
      const jdQual = jdLen > 600 && /responsibilit|requirement|qualif|what you.?ll do|we.?re looking/i.test(jd.text || '');
      if (jdQual && !hasContactCluster && !hasResumeFileInput) add('jd_no_form', 2, 'listing');
    } catch {}
    try {
      const applyLinks = Array.from(document.querySelectorAll('a[href]')).filter(a => /apply|application/i.test(a.textContent || '') || /apply|application/i.test(a.getAttribute('aria-label') || ''));
      for (const a of applyLinks) {
        const href = a.getAttribute('href') || '';
        if (!href || href.startsWith('#')) continue;
        try {
          const u = new URL(href, location.href);
          if (u.origin !== location.origin || u.pathname !== location.pathname) { add('apply_link_away', 2, 'listing'); break; }
        } catch {}
      }
    } catch {}

    // NEGATIVE (-4): consumer denylist exact host, unless a STRONG APPLY fired.
    // LinkedIn: denylist EXCEPT /jobs paths.
    let denylist = false;
    if (host && AYN_CONSUMER_DENY.has(host)) denylist = true;
    if (host && /(^|\.)linkedin\.com$/i.test(host) && !/^\/jobs/i.test(pathname)) denylist = true;
    const strongApply = signals.some(s => s.weight >= 3);
    if (denylist && !strongApply) add('consumer_deny', -4);

    // Aggregate
    let applyScore = 0, listingScore = 0;
    for (const s of signals) {
      if (s.target === 'listing') listingScore += s.weight;
      else applyScore += s.weight;
    }
    const total = applyScore + listingScore;
    let kind = 'other';
    if (applyScore >= 5 && (hasContactCluster || hasResumeFileInput)) kind = 'apply';
    else if (listingScore >= 2) kind = 'listing';
    else if (total >= 4) kind = 'listing';
    const confidence = Math.max(0, Math.min(100, total * 10));
    return { kind, confidence, signals, applyScore, listingScore };
  }
  // expose for background gates and debugging
  try { window.__AYN_CLASSIFY__ = classifyPage; } catch {}

  // ══════════════════════════════════════════════════════════════════
  // 5. MESSAGE LISTENER
  // ══════════════════════════════════════════════════════════════════

  // v2.10.0 — apply cached adapter config on boot so the first scan uses the
  // most recent server-driven selectors, then listen for live updates.
  function aynApplyAtsConfig(p) {
    try {
      if (!p || !p.config) return;
      if (window.AYNQuestionEngine && window.AYNQuestionEngine.applyAdapterConfig) {
        window.AYNQuestionEngine.applyAdapterConfig(p.config, p.version || 0);
      }
      const hosts = (p.config && Array.isArray(p.config.humanTypingHosts)) ? p.config.humanTypingHosts : null;
      if (hosts) window.__AYN_HUMAN_TYPING_HOSTS__ = hosts.slice();
      window.__AYN_ATS_CFG_VERSION__ = Number(p.version || 0);
    } catch (_) {}
  }
  try {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get('ayn_ats_config', (d) => { aynApplyAtsConfig(d && d.ayn_ats_config); });
    }
  } catch (_) {}

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

    // v2.10.0 — background pushes an updated ats_config payload.
    if (message && message.type === 'SET_ATS_CONFIG') {
      aynApplyAtsConfig(message.payload || null);
      try { sendResponse({ ok: true, version: window.__AYN_ATS_CFG_VERSION__ || 0 }); } catch (_) {}
      return false;
    }




    if (message.type === 'EXTRACT_JOB_TEXT') {
      extractJobTextDeep().then(res => sendResponse(res)).catch(() => { try { sendResponse(extractJobText()); } catch {} });
      return true;
    }

    // v2.8.0 — parse a raw HTML string fetched by the background (listing page)
    // and return {text,title,company} using the same site selector map used live.
    if (message.type === 'PARSE_JOB_HTML') {
      try { sendResponse(parseBodyFromHtml(message.html || '', message.url || '')); }
      catch (e) { sendResponse({ text: '', title: '', company: '', error: e?.message || 'parse_failed' }); }
      return true;
    }


    if (message.type === 'DETECT_PAGE') {
      if (!AYN_IS_TOP) return false;
      const job = extractJobText();
      const fields = scanFormFieldsHybrid();
      const fileFields = fields._fileFields || [];
      const url = window.location.href;
      const isJobHost = JOB_PAGE_RE.test(url);
      const isAynHost = /aynn\.io|lovableproject\.com|lovable\.app|localhost/i.test(url);
      const hasJD = (job.text || '').length > 120;
      // Check for modal/popup forms — Indeed SmartApply, LinkedIn Easy Apply etc.
      const modalForm = document.querySelector(
        '.jobs-easy-apply-modal, [data-test-modal], .indeed-apply-widget, ' +
        '.ia-BasePage, [class*="SmartApply"], [class*="easy-apply"], ' +
        'dialog form, [role="dialog"] form, [role="dialog"] input'
      );
      const hasForm = fields.length >= 2 || fileFields.length > 0 || !!modalForm;
      const needsResume = fileFields.some(f => f.isResume);
      // v2.8.1 — classifier is the source of truth for kind. Legacy heuristics
      // (isJobHost/hasJD) are preserved as fallbacks only for AYN-hosted pages.
      const classification = (() => { try { return classifyPage(); } catch { return { kind: 'other', confidence: 0, signals: [] }; } })();
      let kind = classification.kind; // 'apply' | 'listing' | 'other'
      if (isAynHost) kind = 'ayn';
      sendResponse({
        kind, classification,
        hasForm, hasJD, fieldCount: fields.length + (modalForm ? 1 : 0),
        fileFieldCount: fileFields.length, needsResume,
        title: job.title, company: job.company,
        jdLength: (job.text || '').length, url,
      });
      return true;
    }


    if (message.type === 'SCAN_FORM') {
      // v2.5.7 — collapse rapid duplicate SCAN_FORM requests
      const nowTs = Date.now();
      if (window.__aynScanInFlight) {
        try { sendResponse({ fields: [], fileFields: [], jobText: {}, ats: '', url: window.location.href, scanDiag: [{ note: 'scan-inflight-skip' }] }); } catch (_) {}
        return true;
      }
      window.__aynScanInFlight = true;
      (async () => {
        const restore = await aynEnsureRendered();
        try {
          const countCtrls = () => {
            try { return document.querySelectorAll('input,textarea,select,[role="radio"],[role="checkbox"],[role="combobox"]').length; }
            catch { return 0; }
          };
          const before = countCtrls();
          let fields = scanFormFieldsHybrid();
          // v1.9.65 — one extra pass if new controls mounted late (React Suspense / lazy sections)
          try {
            await new Promise(r => setTimeout(r, 400));
            if (countCtrls() > before) {
              const extra = scanFormFieldsHybrid();
              const seen = new Set((fields || []).map(f => f && f.id).filter(Boolean));
              for (const f of (extra || [])) {
                if (f && f.id && !seen.has(f.id)) { fields.push(f); seen.add(f.id); }
              }
            }
          } catch (_) {}
          const jobText = extractJobText();
          let scanDiag = [];
          try { scanDiag = aynScanDiag(); } catch (_) { scanDiag = []; }
          try {
            const fused = await aynFuseVisionIntoFields(fields, countCtrls());
            fields = fused.fields || fields;
            if (fused.diag) scanDiag.push(fused.diag);
          } catch (_) {}
          try { if (window.__AYN_COVERAGE__) scanDiag.push({ note: 'coverage', cov: window.__AYN_COVERAGE__ }); } catch (_) {}
          // v1.9.43 — cache id -> label so injectValues can rehydrate .label when missing
          try {
            const map = new Map();
            (fields || []).forEach(f => { if (f && f.id) map.set(f.id, f.label || ''); });
            window.__AYN_FIELD_LABELS__ = map;
          } catch (_) {}
          let classification = null; try { classification = classifyPage(); } catch {}
          sendResponse({ fields, fileFields: fields._fileFields || [], jobText, ats: detectATS(), url: window.location.href, scanDiag, classification, kind: classification ? classification.kind : 'other' });
        } finally {
          try { restore && restore(); } catch (_) {}
          window.__aynScanInFlight = false;
        }
      })();
      return true;
    }

    if (message.type === 'INJECT_VALUES') {
      (async () => {
        aynShowActivityGlow(true);
        window.__aynFillSessionActive = true;
        // v2.10.0 — reset human-typing telemetry counters per session and record
        // the total field count so aynTypeKeystrokes can skip chunk pauses in
        // big-batch fills (>40 fields).
        window.__aynHumanTypingUsed = false;
        window.__aynHumanTypedCount = 0;
        window.__aynFillFieldCount = Array.isArray(message.values) ? message.values.length : 0;
        const fs = window.AYN_FILL_SESSION ? window.AYN_FILL_SESSION.start(location.href) : null;
        let injectResult;
        const fillValues = aynMergeRestoredValues(message.values || []);
        try {
          const t0 = Date.now();
          try {
            injectResult = await injectValues(fillValues);
          } catch (e) {
            sendResponse({ filled: 0, total: 0, results: [], error: e.message });
            return;
          }
          if (fs) {
            try {
              (injectResult.results || []).forEach((r) => fs.recordWrite(r && r.id, r && r.ok, 'inject', r && r.reason));
              fs.recordStage('execution', { ok: (injectResult.results || []).every((r) => r && r.ok !== false), count: (injectResult.results || []).length, ms: Date.now() - t0 });
            } catch (_) {}
          }
          // v2.5.9 — single verification pass; report-only.
          // v2.6.2 — followed by exactly ONE content-anchored recovery pass
          // (aynRecoverWipedAnswers) for answers verification confirmed were
          // wiped by a mid-fill partial rebuild. Nothing loops.
          try { aynPostInjectVerify(fillValues, injectResult); } catch (_) {}
          if (fs) {
            try {
              (injectResult.results || []).forEach((r) => fs.recordVerification(r && r.id, r && r.verified !== false, 'postverify', r && r.reason));
              fs.recordStage('verification', { ok: !(injectResult.unverifiedIds && injectResult.unverifiedIds.length), count: injectResult.filled || 0, note: injectResult.unverifiedIds && injectResult.unverifiedIds.length ? (injectResult.unverifiedIds.length + ' unverified') : null });
            } catch (_) {}
          }
          try { await aynRecoverWipedAnswers(fillValues, injectResult); } catch (_) {}
          if (fs) {
            try {
              fs.recordStage('recovery', { ok: !(injectResult.unverifiedIds && injectResult.unverifiedIds.length), count: injectResult.recovered || 0, note: injectResult.recovered ? (injectResult.recovered + ' recovered after rebuild') : 'nothing to recover' });
            } catch (_) {}
          }
          // v2.4 — record verified/unverified outcomes to learning memory (not
          // a page-writer; only persists to the backend memory store).
          try { aynRecordLearnedAnswers(fillValues, injectResult); } catch (_) {}
          try { if (fs) fs.printReport(); } catch (_) {}
          // v2.10.0 — surface human-typing telemetry to background.
          try {
            injectResult.humanTypingUsed = !!window.__aynHumanTypingUsed;
            injectResult.humanTypedCount = Number(window.__aynHumanTypedCount || 0);
          } catch (_) {}
          sendResponse(injectResult);

        } finally {
          aynShowActivityGlow(false);
          window.__aynFillSessionActive = false;
        }
      })();
      return true;
    }

    if (message.type === 'HIGHLIGHT_FIELDS') {
      try {
        (message.fieldIds || []).forEach(id => {
          const el = aynResolveFieldEl(id, '');
          if (!el || !el.style) return;
          el.style.outline = '2px solid #f59e0b';
          el.style.outlineOffset = '2px';
          setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 2500);
        });
      } catch {}
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === 'START_CARD_SCORING') {
      userCardSkills = Array.isArray(message.skills) ? message.skills : [];
      userCardRoleTerms = Array.isArray(message.roleTerms) ? message.roleTerms : [];
      startCardScoring();
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === 'STOP_CARD_SCORING') {
      stopCardScoring();
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === 'INJECT_SCORE_RESULT') {
      // Called back from background with a score result for a card
      const cached = scoreCache.get(message.key);
      if (!cached) {
        scoreCache.set(message.key, { score: message.score, matchLabel: message.matchLabel, reasons: message.reasons });
      }
      const sel = getJobCardSelectors();
      if (sel) {
        document.querySelectorAll(sel.cards).forEach(card => {
          const data = extractCardData(card);
          if (data && `${data.title}|${data.company}` === message.key) {
            card.querySelector(`.${AYN_BADGE_CLASS}`)?.remove();
            injectScoreBadge(card, message.score, message.matchLabel, message.reasons);
          }
        });
      }
      sendResponse({ ok: true });
      return true;
    }

    // v1.4.0: expand "Add another experience" / "Show more" buttons before scanning
    if (message.type === 'EXPAND_SECTIONS') {
      const clicked = expandRepeatingSections();
      sendResponse({ ok: true, clicked });
      return true;
    }

    // v1.4.0: programmatic resume attach (best-effort)
    if (message.type === 'TRY_ATTACH_RESUME') {
      sendResponse(tryAttachResume(message.payload || {}));
      return true;
    }

    // v2.8.4 — Find and click the page's apply link/button from a listing page.
    if (message.type === 'CLICK_APPLY_LINK') {
      try {
        const APPLY_RE = /^(apply(\s+now)?|easy\s*apply|start\s+application|apply\s+for\s+this\s+job)$/i;
        const NEG_RE = /submit\s+application|submitting|already\s+applied/i;
        const nodes = Array.from(document.querySelectorAll('a, button, [role="button"]'));
        let hit = null;
        for (const el of nodes) {
          try {
            const txt = (el.innerText || el.textContent || '').trim();
            if (!txt || txt.length > 40) continue;
            if (NEG_RE.test(txt)) continue;
            if (!APPLY_RE.test(txt)) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) continue;
            const style = getComputedStyle(el);
            if (style.visibility === 'hidden' || style.display === 'none') continue;
            hit = el; break;
          } catch {}
        }
        if (!hit) { sendResponse({ ok: false, reason: 'no_apply_link' }); return true; }
        try { hit.scrollIntoView({ block: 'center' }); } catch {}
        try { hit.click(); } catch {}
        sendResponse({ ok: true });
      } catch (e) { sendResponse({ ok: false, reason: String(e && e.message || e) }); }
      return true;
    }
  });


  aynScheduleRestoredReplay();

  // ══════════════════════════════════════════════════════════════════
  // 6. AUTO-DETECT JOB PAGES
  // ══════════════════════════════════════════════════════════════════

  const JOB_PAGE_RE = /linkedin\.com\/jobs|indeed\.com|ca\.indeed\.com|greenhouse\.io|boards\.greenhouse\.io|jobs\.lever\.co|ashbyhq\.com|glassdoor\.com\/job|myworkdayjobs\.com|smartrecruiters\.com|jobright\.ai\/jobs|csod\.com|icims\.com|bamboohr\.com|taleo\.net|workable\.com|dover\.com|recruitee\.com|jazz\.co|pinpointhq\.com|loxo\.co/;
  const ATS_APPLY_RE = /ashbyhq\.com|greenhouse\.io|boards\.greenhouse|jobs\.lever\.co|myworkdayjobs\.com|smartrecruiters\.com|jobs\.ashbyhq\.com|workable\.com|icims\.com|bamboohr\.com|recruitee\.com|jazz\.co|pinpointhq\.com|jobright\.ai|taleo\.net|csod\.com/;

  // PART B: lightweight form probe so the sidepanel knows instantly when a form exists.
  let _lastFormReportKey = '';
  function probeFormOnce() {
    try {
      const url = location.href;
      const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select');
      let fieldCount = 0;
      let hasResumeUpload = false;
      inputs.forEach(el => {
        try {
          if (el.disabled) return;
          if (el.type === 'file') {
            if (aynIsResumeFileInput(el)) hasResumeUpload = true;
            return;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0 && el.type !== 'radio' && el.type !== 'checkbox') return;
          fieldCount++;
        } catch {}
      });
      // Cheap buttongroup count (just role=radio so we don't pay the full scan cost)
      try { fieldCount += document.querySelectorAll('[role="radio"]').length; } catch {}
      const isApplyHost = ATS_APPLY_RE.test(url);
      const hasForm = fieldCount >= 2 || hasResumeUpload || (isApplyHost && !!document.querySelector('form, [role="form"]'));
      if (!hasForm) return false;
      const key = `${url}|${fieldCount}|${hasResumeUpload}`;
      if (key === _lastFormReportKey) return true;
      _lastFormReportKey = key;
      let __kind = 'other'; try { __kind = (classifyPage() || {}).kind || 'other'; } catch {}
      if (AYN_IS_TOP) sendQuiet({ type: 'FORM_DETECTED', hasForm: true, fieldCount, hasResumeUpload, url, kind: __kind });
      return true;
    } catch { return false; }
  }

  function probeFormWithBackoff(attempt = 0) {
    if (probeFormOnce()) return;
    if (attempt < 4) setTimeout(() => probeFormWithBackoff(attempt + 1), 250 * (attempt + 1));
  }

  // Try to detect & report the current job with retry, because SPA content
  // typically renders AFTER the URL changes.
  let _lastDetectedUrl = '';
  function detectAndReport(attempt = 0) {
    // PART B: probe for a form regardless of job-page status (Ashby apply pages aren't matched by JOB_PAGE_RE)
    if (attempt === 0) probeFormWithBackoff(0);
    if (!JOB_PAGE_RE.test(location.href)) return;
    expandSeeMore();
    const result = extractJobText();
    if (result.text && result.text.length > 100) {
      if (location.href === _lastDetectedUrl) return; // already reported
      _lastDetectedUrl = location.href;
      let __kind = 'other'; try { __kind = (classifyPage() || {}).kind || 'other'; } catch {}
      if (AYN_IS_TOP) sendQuiet({
        type: 'JOB_DETECTED',
        text: result.text,
        title: result.title,
        company: result.company || '',
        kind: __kind,
      });
      // Card scoring will keep itself fresh via its MutationObserver
      return;
    }
    if (attempt < 5) {
      setTimeout(() => detectAndReport(attempt + 1), 350 * (attempt + 1));
    }
  }

  // First-load detection — kick off immediately; detectAndReport retries
  // with backoff (up to 5x) until the JD actually renders.
  detectAndReport(0);

  // v2.8.1 — push initial classification to background so the "not-a-job-page"
  // gate can reject SCORE_JOB_CARD / JD_REGISTRY on pages that never emit
  // FORM_DETECTED or JOB_DETECTED (youtube.com, gmail, etc.).
  if (AYN_IS_TOP) {
    const pushKind = () => {
      try { const c = classifyPage(); sendQuiet({ type: 'SET_TAB_KIND', kind: c.kind }); } catch {}
      try { aynSyncFab(); } catch {}
    };
    setTimeout(pushKind, 800);
    setTimeout(pushKind, 3000);
  }


  // SPA navigation hooks — patch history + listen popstate so we re-detect
  // when LinkedIn / Indeed / Workday change job without a full reload.
  let _routeDebounce = null;
  function onRouteChange() {
    if (_routeDebounce) { clearTimeout(_routeDebounce); }
    _routeDebounce = setTimeout(() => {
      _routeDebounce = null;
      _lastDetectedUrl = '';   // new URL gets a fresh report
      _expandedFor.clear();    // allow re-expanding "See more" on the new page
      _lastFormReportKey = '';
      submitNotified = false;
      detectAndReport(0);
    }, 120);
  }
  try {
    const _push = history.pushState;
    history.pushState = function () {
      const r = _push.apply(this, arguments);
      try { window.dispatchEvent(new Event('ayn:locationchange')); } catch {}
      return r;
    };
    const _replace = history.replaceState;
    history.replaceState = function () {
      const r = _replace.apply(this, arguments);
      try { window.dispatchEvent(new Event('ayn:locationchange')); } catch {}
      return r;
    };
    window.addEventListener('popstate', onRouteChange);
    window.addEventListener('ayn:locationchange', onRouteChange);
  } catch (e) {
    try { console.warn('[AYN] SPA hooks failed:', e?.message); } catch {}
  }

})();
