// content.js — AYN Resume Tailor
// Handles: job text extraction, form scanning, value injection,
//          job card scoring on search pages, role suggestions

(function () {
  'use strict';

  // ── Install guard: prevent double-injection from registering duplicate listeners ──
  if (window.__AYN_CONTENT_LOADED__) {
    try { console.log('[AYN] content script already loaded, skipping re-init'); } catch {}
    return;
  }
  window.__AYN_CONTENT_LOADED__ = true;
  const AYN_BUILD = '2.2.1';
  const MAX_JD_CHARS = 20000;
  const AYN_VISION_ENABLED = true;
  const AYN_QE_ENABLED = false; // v2.3.1 — when true, prefer Question Engine output over the legacy scanner
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
    try { const url = new URL(u); url.search=''; url.hash=''; url.pathname = url.pathname.replace(/\/(application|apply)\/?$/i, ''); const out = url.toString(); return out === u ? null : out; } catch { return null; }
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

  function aynVisibleText(node) {
    if (!node) return '';
    const t = (node.innerText != null ? node.innerText : node.textContent) || '';
    return t.replace(/\s+/g, ' ').trim();
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
    if (el.id) {
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
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
    if (el.id) {
      try {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
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
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
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
  function scanFormFieldsHybrid() {
    if (AYN_QE_ENABLED) {
      try {
        const qs = window.__AYN_QUESTIONS_LEGACY__;
        if (Array.isArray(qs) && qs.length) {
          return qs.map(function (q) {
            return {
              id: q.id,
              kind: q.kind,
              type: q.type,
              label: q.label,
              name: q.name || '',
              options: Array.isArray(q.options) ? q.options : [],
              required: !!q.required,
              group: q.group || '',
              section: q.section || '',
              placeholder: q.placeholder || '',
              _frame: q._frame || '',
              labelSource: q.labelSource || 'engine',
              _engine: true
            };
          });
        }
      } catch (e) { /* fall through to legacy */ }
    }
    return scanFormFields();
  }

  function scanFormFields() {
    const SKIP_TYPES = new Set(['hidden','submit','button','image','reset']);
    const SKIP_RE = /captcha|honeypot|csrf|token|utm_|_ga|bot|trap/i;
    let fields = [];
    const fileFields = [];
    const seenGroupKeys = new Set(); // dedupe radio/checkbox groups by name+frame
    let bgCounter = 0;
    // v1.9.44 — reset per-scan used-radio tracker so stale state doesn't persist
    window.__AYN_USED_RADIOS__ = new WeakSet();
    // v1.9.67 — PERSISTENT registries, never reset between scans. Ids come from
    // aynFid() stamped on the node itself, so a rescan re-registers the same
    // element under the same id instead of repointing ids to different controls.
    window.__AYN_STRUCTRADIO_MAP__ = window.__AYN_STRUCTRADIO_MAP__ || new Map();
    window.__AYN_TEXT_FIELD_MAP__ = window.__AYN_TEXT_FIELD_MAP__ || new Map();

    const registerTextField = (prefix, el, idx) => {
      // v1.9.61 — hard guard: never allow non-text-like controls to be registered as
      // text fields. Radios/checkboxes/file/hidden/submit/etc. reaching this path was
      // the root cause of Yes/No options being answered as free-text (BioRender/Gem).
      try {
        const tag = (el && el.tagName || '').toUpperCase();
        const typ = (el && el.type || '').toLowerCase();
        const BAD = new Set(['radio','checkbox','file','hidden','submit','button','image','reset']);
        if (tag === 'INPUT' && BAD.has(typ)) return null;
        const role = (el && el.getAttribute && (el.getAttribute('role') || '')).toLowerCase();
        if (role === 'radio' || role === 'checkbox') return null;
      } catch (_) {}
      const raw = `__textfield__:tf${aynFid(el)}`;
      const fid = prefix + raw;
      try {
        if (window.__AYN_TEXT_FIELD_MAP__) {
          window.__AYN_TEXT_FIELD_MAP__.set(fid, el);
          window.__AYN_TEXT_FIELD_MAP__.set(raw, el);
        }
      } catch (_) {}
      return fid;
    };


    collectScannableDocs().forEach(({ doc, prefix }) => {
      // v2.0.0 — page-global option-text index for this document's scan.
      try { if (self.AYN_DOM && self.AYN_DOM.beginScan) self.AYN_DOM.beginScan(doc); } catch (_) {}
      // ── PRE-PASS: group native radios by shared name into ONE field per group ──
      const processedRadios = new WeakSet();
      try {
        const allRadios = Array.from(doc.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled);
        const byName = new Map();
        let anonIdx = 0;
        allRadios.forEach(r => {
          let key;
          if (r.name) key = 'name::' + r.name;
          else {
            const g = r.closest('[role="radiogroup"], [role="group"], fieldset');
            if (!g) return;
            if (!g.__aynGroupKey) g.__aynGroupKey = 'grp::' + (++anonIdx);
            key = g.__aynGroupKey;
          }
          if (!byName.has(key)) byName.set(key, []);
          byName.get(key).push(r);
        });
        byName.forEach((radios, key) => {
          if (radios.length < 2) return;
          const first = radios[0];
          const groupName = first.name || key;
          const groupKey = `${prefix}radio:${groupName}`;
          if (seenGroupKeys.has(groupKey)) { radios.forEach(r => processedRadios.add(r)); return; }
          seenGroupKeys.add(groupKey);
          radios.forEach(r => processedRadios.add(r));

          // Build options
          const options = radios.map(r => {
            const accLbl = aynAccName(r);
            const lbl = (accLbl || getLabelFor(r) || r.value || '').trim();
            return { label: lbl, value: r.value || lbl };
          });
          const optionLabelsLC = new Set(options.map(o => (o.label || '').toLowerCase()).filter(Boolean));

          // Resolve question (NOT an option label). v1.9.62 centralizes this
          // so helper blocks cannot overwrite real EEO titles.
          const container = first.closest('fieldset, [role="radiogroup"], [role="group"], [class*="question"], [class*="field"], [class*="form-group"]')
            || (first.parentElement && first.parentElement.parentElement) || first.parentElement;
          const resolvedQ = aynFindQuestionForOptionGroup(container, options, first);
          let qLabel = resolvedQ.label || aynGroupName(first);
          let labelSrc = resolvedQ.source || (qLabel ? 'accname' : '');
          if (!qLabel || optionLabelsLC.has(String(qLabel).toLowerCase()) || /^question$/i.test(qLabel)) {
            qLabel = getLabelFor(first) || groupName || 'Question';
            labelSrc = labelSrc || 'legacy';
          }
          qLabel = qLabel.slice(0, 240);
          const classifyText = `${qLabel} ${options.map(o => o.label).join(' ')}`;

          const checked = radios.find(r => r.checked);
          const required = radios.some(r => r.required || r.getAttribute('aria-required') === 'true')
            || /\*|required/i.test(aynGroupName(first) || '');

          fields.push({
            id: `${prefix}__radio__:${groupName}`,
            kind: 'radio',
            label: qLabel,
            type: 'radio',
            name: first.name || '',
            currentValue: checked ? ((getLabelFor(checked) || checked.value || '').trim()) : '',
            options,
            required,
            group: classifyField(classifyText, first.name || '', 'radio'),
            accRole: 'radio',
            labelSource: labelSrc || 'legacy',
            _frame: prefix,
          });
        });
      } catch { /* never fail the scan */ }

      // v1.9.44 — STRUCTURAL grouping for native radios where names are unique/absent (e.g. Gem)
      try {
        const usedRadios = window.__AYN_USED_RADIOS__;
        // mirror shared-name pass results into the window set
        try { Array.from(doc.querySelectorAll('input[type="radio"]')).forEach(r => { if (processedRadios.has(r)) usedRadios.add(r); }); } catch (_) {}
        // v1.9.66 — only group radios that are actually laid out. Hidden/template
        // radios must be excluded or groups get polluted and the wrong option is clicked.
        // Lazy below-fold radios are mounted by aynEnsureRendered() and then have a
        // non-null offsetParent, so this still catches Veteran / Disability on Gem.
        const allRadios = Array.from(doc.querySelectorAll('input[type="radio"]')).filter(r => !usedRadios.has(r) && !r.disabled && (self.AYN_DOM ? self.AYN_DOM.visibleish(r) : r.offsetParent !== null));
        const containerOf = (r) => {
          let node = r.parentElement;
          for (let d = 0; d < 10 && node; d++, node = node.parentElement) {
            if (node.querySelectorAll('input[type="radio"]').length >= 2) return node;
          }
          return null;
        };
        const groups = new Map();
        allRadios.forEach(r => { const c = containerOf(r); if (!c) return; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(r); });
        groups.forEach((radios, container) => {
          if (radios.length < 2) return;
          const options = radios.map(r => {
            const lbl = ((r.closest('label') || r.parentElement)?.innerText || '').replace(/\s+/g,' ').trim();
            return { label: lbl, value: (r.value && r.value !== 'on') ? r.value : lbl };
          });
          const rq = aynFindQuestionForOptionGroup(container, options, radios[0]);
          const q = (rq.label || 'Question').slice(0, 240);
          const classifyText = `${q} ${options.map(o => o.label).join(' ')}`;
          const gid = `${prefix}__structradio__:g${aynFid(container)}`;
          window.__AYN_STRUCTRADIO_MAP__.set(gid, { container, radios });
          radios.forEach(r => { usedRadios.add(r); processedRadios.add(r); });
          fields.push({
            id: gid,
            kind: 'radio',
            type: 'radio',
            name: '',
            label: q,
            options,
            required: /\*|required/i.test((container.innerText||'').slice(0,300)),
            group: classifyField(classifyText, '', 'radio'),
            accRole: 'radio',
            labelSource: 'structradio',
            _frame: prefix,
          });
        });
      } catch (_) { /* never fail the scan */ }



      // ── PRE-PASS: group CUSTOM (ARIA) radios by enclosing radiogroup/group ──
      const processedCustomRadios = new WeakSet();
      try {
        if (!window.__AYN_CUSTOM_RADIO_MAP__) window.__AYN_CUSTOM_RADIO_MAP__ = new Map();
        const customRadios = Array.from(doc.querySelectorAll('[role="radio"]'))
          .filter(el => el.tagName !== 'INPUT' && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true');
        const byGroup = new Map();
        customRadios.forEach(el => {
          // v2.2.0 — three-tier grouping:
          //   1. explicit ARIA/HTML group container (radiogroup/group/fieldset)
          //   2. shared aria-labelledby target (Ashby/Super scattered radios)
          //   3. shared parent element that contains ≥2 role=radio siblings
          let g = el.closest('[role="radiogroup"]') || el.closest('[role="group"], fieldset');
          if (!g) {
            const lb = el.getAttribute('aria-labelledby');
            if (lb) {
              const ref = doc.getElementById(lb);
              if (ref) {
                // group by all custom radios that share this labelledby id
                g = ref.closest('div, section, form') || ref.parentElement || null;
                if (g) g.__aynGroupKey = 'lb::' + lb;
              }
            }
          }
          if (!g) {
            let p = el.parentElement;
            for (let d = 0; d < 6 && p; d++, p = p.parentElement) {
              const kids = p.querySelectorAll(':scope [role="radio"]');
              if (kids.length >= 2) { g = p; break; }
            }
          }
          if (!g) return;
          if (!g.__aynCustomGroupKey) g.__aynCustomGroupKey = g.__aynGroupKey || ('cgrp::' + aynFid(g));
          const key = g.__aynCustomGroupKey;
          if (!byGroup.has(key)) byGroup.set(key, { group: g, els: [] });
          byGroup.get(key).els.push(el);
        });
        byGroup.forEach(({ group, els }) => {
          if (els.length < 2) return;
          const first = els[0];
          const fieldId = `${prefix}__radio__:custom:g${aynFid(group)}`;
          const groupKey = fieldId;
          if (seenGroupKeys.has(groupKey)) { els.forEach(e => processedCustomRadios.add(e)); return; }
          seenGroupKeys.add(groupKey);
          els.forEach(e => processedCustomRadios.add(e));

          const options = els.map(e => {
            const lbl = (aynAccName(e) || aynResolveLabel(e).name || safeText(e) || e.getAttribute('aria-label') || '').trim();
            return { label: lbl, value: e.getAttribute('value') || lbl };
          });
          const optionLabelsLC = new Set(options.map(o => (o.label || '').toLowerCase()).filter(Boolean));

          const rq = aynFindQuestionForOptionGroup(group, options, first);
          let qLabel = rq.label || aynGroupName(first);
          let labelSrc = rq.source || (qLabel ? 'accname' : '');
          if (optionLabelsLC.has(String(qLabel).toLowerCase()) || /^question$/i.test(qLabel)) qLabel = '';
          if (!qLabel) { qLabel = 'Question'; labelSrc = labelSrc || 'legacy'; }
          qLabel = qLabel.slice(0, 240);
          const classifyText = `${qLabel} ${options.map(o => o.label).join(' ')}`;

          const checked = els.find(e => e.getAttribute('aria-checked') === 'true');
          const groupTxt = ((group.innerText || '') + ' ' + (aynGroupName(first) || ''));
          const required = /\*|required/i.test(groupTxt) || els.some(e => e.getAttribute('aria-required') === 'true');

          window.__AYN_CUSTOM_RADIO_MAP__.set(fieldId, els);

          fields.push({
            id: fieldId,
            kind: 'radio',
            label: qLabel,
            type: 'radio',
            name: '',
            currentValue: checked ? ((aynAccName(checked) || safeText(checked) || '').trim()) : '',
            options,
            required,
            group: classifyField(classifyText, '', 'radio'),
            accRole: 'radio',
            labelSource: labelSrc || 'legacy',
            _frame: prefix,
          });
        });
      } catch { /* never fail the scan */ }

      // ── PRE-PASS: label-based custom option groups (generalized from Gem adapter, v1.9.39) ──
      // Runs on ALL sites, but only for genuine custom option clusters. Safety guards:
      //   - LABEL elements only (no native input/select/textarea inside, no role=radio/checkbox)
      //   - 2..12 options; each <=60 chars, no '?'
      //   - Container has NO native radio/checkbox and NO role=radio/checkbox (already handled elsewhere)
      //   - Uses tight nearest-common-ancestor via containerFor
      try {
        if (!window.__AYN_LABELGROUP_MAP__) window.__AYN_LABELGROUP_MAP__ = new Map();
        const allLabels = Array.from(doc.querySelectorAll('label')).filter(l => {
          if (l.querySelector('input, select, textarea, [role="radio"], [role="checkbox"]')) return false;
          // If the label points via htmlFor to a native form control, skip (native pass owns it).
          const forId = l.getAttribute('for');
          if (forId) {
            const target = doc.getElementById(forId);
            if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName || '')) return false;
          }
          const t = (l.innerText || '').trim();
          return t && t.length <= 60 && !t.includes('?');
        });
        const labelSet = new Set(allLabels);
        const containerFor = (l) => {
          let node = l.parentElement;
          for (let i = 0; i < 6 && node; i++, node = node.parentElement) {
            const cnt = Array.from(node.querySelectorAll('label')).filter(x => labelSet.has(x)).length;
            if (cnt >= 2) return node;
          }
          return null;
        };
        const groups = new Map();
        allLabels.forEach(l => { const c = containerFor(l); if (!c) return; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(l); });
        groups.forEach((labs, container) => {
          if (labs.length < 2 || labs.length > 12) return;
          // Skip if container already covered by native/role checkables (owned by earlier passes)
          if (container.querySelector('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]')) return;
          const lgId = `${prefix}__labelgroup__:g${aynFid(container)}`;
          const groupKey = lgId;
          if (seenGroupKeys.has(groupKey)) return;
          seenGroupKeys.add(groupKey);
          const options = labs.map(l => { const t = (l.innerText || '').trim(); return { label: t, value: t }; });
          let qLabel = '';
          const rq = aynFindQuestionForOptionGroup(container, options, labs[0]);
          qLabel = rq.label || '';
          if (!qLabel) qLabel = 'Question';
          qLabel = qLabel.slice(0, 240);
          const classifyText = `${qLabel} ${options.map(o => o.label).join(' ')}`;
          window.__AYN_LABELGROUP_MAP__.set(lgId, labs);
          fields.push({
            id: lgId, kind: 'radio', label: qLabel, type: 'radio', name: '',
            currentValue: '', options,
            required: /\*|required/i.test((container.innerText || '').slice(0, 300)),
            group: classifyField(classifyText, '', 'radio'), accRole: 'radio', labelSource: rq.source || 'labelgroup', _frame: prefix,
          });
        });
      } catch { /* never fail the scan */ }


      // ── v2.0.0 COVERAGE PASS: no radio left behind ──────────────────
      // Sweeps every visible radio atom the passes above did not claim into a
      // group, and records a diagnostic that rides scanDiag into telemetry.
      try {
        if (self.AYN_DOM && self.AYN_DOM.coverageScan) {
          const cov = self.AYN_DOM.coverageScan(doc, window.__AYN_USED_RADIOS__, processedCustomRadios);
          cov.nativeGroups.forEach(({ container, radios }) => {
            const options = radios.map(r => {
              const lbl = ((r.closest('label') || r.parentElement)?.innerText || '').replace(/\s+/g, ' ').trim();
              return { label: lbl, value: (r.value && r.value !== 'on') ? r.value : lbl };
            });
            const rq = aynFindQuestionForOptionGroup(container, options, radios[0]);
            const q = (rq.label || 'Question').slice(0, 240);
            const gid = `${prefix}__structradio__:g${aynFid(container)}`;
            if (seenGroupKeys.has(gid)) return;
            seenGroupKeys.add(gid);
            window.__AYN_STRUCTRADIO_MAP__.set(gid, { container, radios });
            radios.forEach(r => { window.__AYN_USED_RADIOS__.add(r); processedRadios.add(r); });
            fields.push({
              id: gid, kind: 'radio', type: 'radio', name: '', label: q, options,
              required: /\*|required/i.test((container.innerText || '').slice(0, 300)),
              group: classifyField(`${q} ${options.map(o => o.label).join(' ')}`, '', 'radio'),
              accRole: 'radio', labelSource: 'coverage', _frame: prefix,
            });
          });
          cov.customGroups.forEach(({ container, els }) => {
            const options = els.map(e => {
              const lbl = (aynAccName(e) || safeText(e) || e.getAttribute('aria-label') || '').trim();
              return { label: lbl, value: e.getAttribute('value') || lbl };
            });
            const rq = aynFindQuestionForOptionGroup(container, options, els[0]);
            const q = (rq.label || 'Question').slice(0, 240);
            const fieldId = `${prefix}__radio__:custom:g${aynFid(container)}`;
            if (seenGroupKeys.has(fieldId)) return;
            seenGroupKeys.add(fieldId);
            window.__AYN_CUSTOM_RADIO_MAP__ = window.__AYN_CUSTOM_RADIO_MAP__ || new Map();
            window.__AYN_CUSTOM_RADIO_MAP__.set(fieldId, els);
            els.forEach(e => processedCustomRadios.add(e));
            fields.push({
              id: fieldId, kind: 'radio', type: 'radio', name: '', label: q, options,
              required: /\*|required/i.test((container.innerText || '').slice(0, 300)),
              group: classifyField(`${q} ${options.map(o => o.label).join(' ')}`, '', 'radio'),
              accRole: 'radio', labelSource: 'coverage', _frame: prefix,
            });
          });
          window.__AYN_COVERAGE__ = cov.diag;
        }
      } catch (_) { /* never fail the scan */ }

      // v2.2.0 — multi-select EEO checkbox groups (Ashby race/ethnicity).
      // Each option is an <input type="checkbox"> with its own unique `name`,
      // so the same-name grouping never fires and each was emitted individually
      // → AI returned a single yes/no per box instead of an optionLabels[] array.
      // Detect containers with ≥3 sibling visible unique-name checkboxes and
      // emit them as one multi-select field. Marks them as processed so the
      // individual loop below skips them.
      const processedCheckboxes = new WeakSet();
      try {
        const allBoxes = Array.from(doc.querySelectorAll('input[type="checkbox"]')).filter(b => {
          if (b.disabled || isElHidden(b)) return false;
          const r = b.getBoundingClientRect();
          return (r.width > 0 || r.height > 0);
        });
        const containerToBoxes = new Map();
        for (const b of allBoxes) {
          const c = b.closest('fieldset, [role="group"], [class*="field" i], [data-field-path], [class*="question" i]');
          if (!c) continue;
          if (!containerToBoxes.has(c)) containerToBoxes.set(c, []);
          containerToBoxes.get(c).push(b);
        }
        containerToBoxes.forEach((boxes, container) => {
          if (boxes.length < 3) return;
          const names = new Set(boxes.map(b => b.name || ''));
          // require unique names (or all-blank) — that's the pattern the per-name path can't handle
          if (names.size < boxes.length - 1) return;
          const options = boxes.map(b => {
            const lbl = (getLabelFor(b) || aynAccName(b) || b.value || b.name || '').trim().slice(0, 100);
            return { label: lbl, value: b.value || lbl };
          }).filter(o => o.label);
          if (options.length < 3) return;
          const rq = aynFindQuestionForOptionGroup(container, options, boxes[0]);
          let qLabel = (rq.label || '').slice(0, 240);
          if (!qLabel) qLabel = 'Select all that apply';
          const fieldId = `${prefix}__checkbox__:multi:g${aynFid(container)}`;
          if (seenGroupKeys.has(fieldId)) return;
          seenGroupKeys.add(fieldId);
          boxes.forEach(b => processedCheckboxes.add(b));
          window.__AYN_MULTICHECK_MAP__ = window.__AYN_MULTICHECK_MAP__ || new Map();
          window.__AYN_MULTICHECK_MAP__.set(fieldId, boxes);
          fields.push({
            id: fieldId, kind: 'checkbox', type: 'checkbox', name: '', label: qLabel, options,
            required: boxes.some(b => b.required || b.getAttribute('aria-required') === 'true'),
            currentValue: '', multi: true,
            group: classifyField(`${qLabel} ${options.map(o => o.label).join(' ')}`, '', 'checkbox'),
            accRole: 'group', labelSource: rq.source || 'multi-checkbox',
            _frame: prefix,
          });
        });
      } catch (_) { /* never fail the scan */ }

      const elements = Array.from(doc.querySelectorAll('input, textarea, select'));
      elements.forEach((el, idx) => {
        try {
          if (el.disabled) return;
          if (el.type === 'radio' && processedRadios.has(el)) return;
          if (el.type === 'checkbox' && processedCheckboxes.has(el)) return;
          const rect = el.getBoundingClientRect();
          // PART A: never skip zero-size radio/checkbox — they're often hidden behind styled labels.
          const isCheckable = (el.type === 'radio' || el.type === 'checkbox');
          if (rect.width === 0 && rect.height === 0 && el.type !== 'file' && !isCheckable) return;

          if (el.type === 'file') {
            const lbl = (getLabelFor(el) || el.name || '').toLowerCase();
            const accept = (el.accept || '').toLowerCase();
            const isResume = /resume|cv|curriculum/.test(lbl) || /\.pdf|\.docx?|\.rtf/.test(accept);
            fileFields.push({ label: getLabelFor(el) || el.name || 'File upload', isResume, accept: el.accept || '' });
            return;
          }

          if (SKIP_TYPES.has(el.type)) return;
          if (el.type === 'search' && !el.name && !el.id) return;
          if (SKIP_RE.test((el.name||'') + (el.id||''))) return;

          // Radio/checkbox: one descriptor per group (by name)
          if ((el.type === 'radio' || el.type === 'checkbox') && el.name) {
            const groupKey = `${prefix}${el.type}:${el.name}`;
            if (seenGroupKeys.has(groupKey)) return;
            seenGroupKeys.add(groupKey);

            // Ashby/custom: hidden checkbox proxied by visible option buttons (Yes/No). Emit as a buttongroup
            // so the AI answers a single-choice question (its work-auth/sponsorship logic applies), not a checkbox.
            if (el.type === 'checkbox' && isElHidden(el)) {
              const container = el.closest('[data-field-path],[class*="fieldEntry"],[class*="field-entry"],fieldset,[class*="field"]') || el.parentElement;
              if (container) {
                const optBtns = Array.from(container.querySelectorAll('button,[role="button"],[role="radio"],[role="option"]')).filter(b => {
                  if (b.disabled) return false;
                  if ((b.type || '').toLowerCase() === 'submit') return false;
                  const r = b.getBoundingClientRect();
                  if (r.width === 0 && r.height === 0) return false;
                  const t = (safeText(b) || b.getAttribute('aria-label') || '').trim();
                  if (!t || t.length > 24 || t.split(/\s+/).length > 4) return false;
                  if (/^(submit|next|back|continue|apply|cancel|close|save|upload|attach)$/i.test(t)) return false;
                  return true;
                });
                const seenT = new Set();
                const uniqBtns = optBtns.filter(b => { const k = (safeText(b) || '').trim().toLowerCase(); if (seenT.has(k)) return false; seenT.add(k); return true; });
                if (uniqBtns.length >= 2 && uniqBtns.length <= 6) {
                  const optionTexts = uniqBtns.map(b => (safeText(b) || '').trim());
                  const rq = aynFindQuestionForOptionGroup(container, optionTexts, el);
                  let qLabel = rq.label || getLabelFor(el) || el.name;
                  qLabel = (qLabel || '').slice(0, 240);
                  const bgId = `${prefix}__buttongroup__:bcx${bgCounter++}:${qLabel.slice(0, 60).replace(/\s+/g, '_')}`;
                  window.__AYN_BG_MAP__ = window.__AYN_BG_MAP__ || new Map();
                  window.__AYN_BG_MAP__.set(bgId, { qLabel, optionTexts });
                  const __accBG = aynResolveLabel(el);
                  fields.push({
                    id: bgId, kind: 'buttongroup', label: qLabel, type: 'buttongroup', name: el.name,
                    currentValue: '', options: optionTexts.map(t => ({ label: t, value: t })),
                    required: el.required || el.getAttribute('aria-required') === 'true',
                    group: classifyField(`${qLabel} ${optionTexts.join(' ')}`, el.name || '', 'buttongroup'),
                    accRole: __accBG.role || 'buttongroup',
                    labelSource: rq.source || ((__accBG.name && __accBG.name.length >= 2) ? 'accname' : 'legacy'),
                    _frame: prefix,
                  });
                  return;
                }
              }
            }

            // v1.9.52 — visible custom checkbox pair (Yes/No). Gem-style forms render
            // Yes/No as visible clickable option elements; emit as buttongroup so the AI
            // returns a single-choice answer and the existing buttongroup injector fires.
            if (el.type === 'checkbox' && !isElHidden(el)) {
              const container = el.closest('[data-field-path],[class*="fieldEntry"],[class*="field-entry"],fieldset,[class*="field"]') || el.parentElement;
              if (container) {
                const optBtns = Array.from(container.querySelectorAll('button,[role="button"],[role="radio"],[role="option"],[role="checkbox"]')).filter(b => {
                  if (b.disabled) return false;
                  if ((b.type || '').toLowerCase() === 'submit') return false;
                  const r = b.getBoundingClientRect();
                  if (r.width === 0 && r.height === 0) return false;
                  const t = (safeText(b) || b.getAttribute('aria-label') || '').trim();
                  if (!t || t.length > 24 || t.split(/\s+/).length > 4) return false;
                  if (/^(submit|next|back|continue|apply|cancel|close|save|upload|attach)$/i.test(t)) return false;
                  return true;
                });
                const texts = [];
                const seenY = new Set();
                optBtns.forEach(b => { const t = (safeText(b) || b.getAttribute('aria-label') || '').trim(); const k = t.toLowerCase(); if (t && !seenY.has(k)) { seenY.add(k); texts.push(t); } });
                const lowered = texts.map(t => t.toLowerCase());
                const isYesNoPair = texts.length === 2 && lowered.includes('yes') && lowered.includes('no');
                if (isYesNoPair) {
                  const rq = aynFindQuestionForOptionGroup(container, ['Yes', 'No'], el);
                  let qLabel = rq.label || getLabelFor(el) || el.name;
                  qLabel = (qLabel || '').slice(0, 240);
                  const bgId = `${prefix}__buttongroup__:bcv${bgCounter++}:${qLabel.slice(0, 60).replace(/\s+/g, '_')}`;
                  window.__AYN_BG_MAP__ = window.__AYN_BG_MAP__ || new Map();
                  window.__AYN_BG_MAP__.set(bgId, { qLabel, optionTexts: ['Yes', 'No'] });
                  const __accBG2 = aynResolveLabel(el);
                  fields.push({
                    id: bgId, kind: 'buttongroup', label: qLabel, type: 'buttongroup', name: el.name,
                    currentValue: '', options: [{ label: 'Yes', value: 'Yes' }, { label: 'No', value: 'No' }],
                    required: el.required || el.getAttribute('aria-required') === 'true',
                    group: classifyField(`${qLabel} Yes No`, el.name || '', 'buttongroup'),
                    accRole: __accBG2.role || 'buttongroup',
                    labelSource: rq.source || ((__accBG2.name && __accBG2.name.length >= 2) ? 'accname' : 'legacy'),
                    _frame: prefix,
                  });
                  return;
                }
              }
            }

            // Question label = shared resolver, then fieldset/wrapper fallbacks.
            let qLabel = '';
            const options = getOptionPairs(el);
            const wrap = el.closest('fieldset, [role="radiogroup"], [role="group"], [class*="question"], [class*="field"], [class*="form-group"]') || el.parentElement;
            const rq = aynFindQuestionForOptionGroup(wrap, options, el);
            qLabel = rq.label || '';
            if (!qLabel) {
              const __acc0 = aynResolveLabel(el);
              qLabel = (__acc0.name && __acc0.name.length >= 2) ? __acc0.name : (getLabelFor(el) || el.name);
            }
            qLabel = (qLabel || '').slice(0, 240);
            const classifyText = `${qLabel} ${options.map(o => o.label).join(' ')}`;
            const checkedOpt = options.find(o => {
              const match = Array.from(doc.querySelectorAll(`input[type="${el.type}"][name="${CSS.escape(el.name)}"]`))
                .find(r => r.checked && ((getLabelFor(r) || r.value).trim() === o.label || r.value === o.value));
              return !!match;
            });
            const __accRC = aynResolveLabel(el);
            const _rcGroup = classifyField(classifyText, el.name || '', el.type);
            const _singleChoice = (el.type === 'checkbox') && (_rcGroup === 'logic.preferred_city');
            fields.push({
              id: `${prefix}__${el.type}__:${el.name}`,
              kind: el.type,
              label: qLabel,
              type: el.type,
              name: el.name,
              currentValue: checkedOpt ? checkedOpt.label : '',
              options,
              required: el.required || el.getAttribute('aria-required') === 'true',
              group: _rcGroup,
              singleChoice: _singleChoice || undefined,
              accRole: __accRC.role || '',
              labelSource: rq.source || ((__accRC.name && __accRC.name.length >= 2) ? 'accname' : 'legacy'),
              _frame: prefix,
              _el: el, // v1.9.59 — stripped before payload emit; used by Yes/No merge pass
            });
            return;
          }

          const __accT = aynResolveLabel(el);
          let label = (__accT.name && __accT.name.length >= 2) ? __accT.name : getLabelFor(el);
          if (!label && (el.tagName === 'TEXTAREA' || ((__accT.role || '').toLowerCase() === 'textbox'))) {
            label = aynNearbyPrompt(el) || aynFieldQuestion(el) || '';
          }
          if (!label && (!el.name || el.name.length < 2)) return;
          if (SKIP_RE.test(label)) return;

          let kind;
          if (el.tagName === 'SELECT') kind = 'select';
          else if (el.tagName === 'TEXTAREA') kind = 'textarea';
          else if (isTypeahead(el)) kind = 'typeahead';
          else kind = 'text';

          let _group = classifyField(label, el.name || '', kind);
          // Salary-range pair detection via DOM (when label alone didn't classify)
          if (kind === 'text' && (_group === 'other' || _group === 'logic.salary')) {
            const salaryRole = resolveSalaryRole(el);
            if (salaryRole === 'min') _group = 'logic.salary_min';
            else if (salaryRole === 'max') _group = 'logic.salary_max';
          }
          const __ctx = aynCaptureContext(el);
          const stableTextId = registerTextField(prefix, el, idx);
          if (!stableTextId) return; // v1.9.61 — non-text control leaked into text pass; skip.
          fields.push({
            id: stableTextId,
            kind,
            label: label || `Field ${idx}`,
            type: kind === 'select' ? 'select' : (el.tagName === 'TEXTAREA' ? 'textarea' : (el.type || 'text')),
            name: el.name || '',
            currentValue: isFilled(el) ? (el.value || '') : '',
            options: getOptionPairs(el),
            required: el.required || el.getAttribute('aria-required') === 'true' || !!(el.__aynProxLabel && el.__aynProxLabel.required) || aynNearbyRequired(el),
            group: _group,
            accRole: (el.tagName === 'SELECT') ? 'combobox' : (__accT.role || ''),
            labelSource: (__accT.name && __accT.name.length >= 2) ? 'accname' : ((el.__aynProxLabel && el.__aynProxLabel.label === label) ? 'proximity' : (aynLooksLikePromptText(label) ? 'nearby-prompt' : 'legacy')),
            section: __ctx.section,
            siblingLabels: __ctx.siblingLabels,
            helperText: __ctx.helperText,
            placeholder: __ctx.placeholder,
            _idx: idx,
            _frame: prefix,
          });
          try { el.__aynEmitted = true; } catch (_) {}
        } catch { /* skip a single bad node, keep scanning */ }
      });

      // ── SUPPLEMENTAL TEXT-INPUT PASS (v1.9.39): recover phone/salary/masked/wrapped
      //    inputs and contenteditable textboxes the main pass dropped (missing/short label,
      //    non-standard wrapping). Never double-emits.
      try {
        const emittedIds = new Set(fields.map(f => f.id));
        const cands = Array.from(doc.querySelectorAll(
          'input[type="tel"], input[type="number"], input[inputmode], [contenteditable="true"], [contenteditable=""]'
        ));
        let sIdx = 0;
        cands.forEach(el => {
          try {
            if (el.disabled) return;
            const tag = (el.tagName || '').toUpperCase();
            // Skip inputs already inside a native form control chain we cannot type into.
            if (tag === 'INPUT' && SKIP_TYPES.has((el.type || '').toLowerCase())) return;
            // Element already handled by rich-editor pass emits kind:'text' with __richedit__ id;
            // that pass runs next, so tie-break by tracking DOM identity here.
            if (el.__aynEmitted) return;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return;
            const acc = (typeof aynResolveLabel === 'function') ? aynResolveLabel(el) : { name: '', role: '' };
            let label = (acc.name && acc.name.length >= 2) ? acc.name : (getLabelFor(el) || '');
            if (!label) {
              // Fallback: placeholder or aria-label
              label = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('placeholder'))) || '';
            }
            if (!label) label = aynNearbyPrompt(el) || aynFieldQuestion(el) || '';
            if (!label) return;
            if (SKIP_RE.test(label) || SKIP_RE.test((el.name || '') + (el.id || ''))) return;
            const guessId = `${prefix}__textfield__:sup${sIdx++}`;
            try {
              if (window.__AYN_TEXT_FIELD_MAP__ && guessId.includes('__textfield__:')) {
                window.__AYN_TEXT_FIELD_MAP__.set(guessId, el);
                window.__AYN_TEXT_FIELD_MAP__.set(guessId.replace(prefix, ''), el);
              }
            } catch (_) {}
            if (emittedIds.has(guessId)) return;
            emittedIds.add(guessId);
            const isCE = el.isContentEditable || /^(true|)$/i.test(el.getAttribute && el.getAttribute('contenteditable') || '');
            let current = '';
            try { current = (typeof aynReadValue === 'function') ? aynReadValue(el) : (el.value || el.innerText || ''); } catch {}
            const __ctx = (typeof aynCaptureContext === 'function') ? aynCaptureContext(el) : { section:'', siblingLabels:[], helperText:'', placeholder:'' };
            fields.push({
              id: guessId,
              kind: 'text',
              label: label.slice(0, 240),
              type: 'text',
              name: el.name || '',
              currentValue: current || '',
              options: [],
              required: (el.required || (el.getAttribute && el.getAttribute('aria-required') === 'true') || aynNearbyRequired(el)) || false,
              group: classifyField(label, el.name || '', 'text'),
              accRole: 'textbox',
              labelSource: (acc.name && acc.name.length >= 2) ? 'accname' : (aynLooksLikePromptText(label) ? 'nearby-prompt' : 'legacy'),
              section: __ctx.section,
              siblingLabels: __ctx.siblingLabels,
              helperText: __ctx.helperText,
              placeholder: __ctx.placeholder,
              _supplemental: true,
              _idx: sIdx,
              _frame: prefix,
            });
            el.__aynEmitted = true;
          } catch {}
        });
      } catch { /* never fail the scan */ }



      // ── RICH-EDITOR PASS: contenteditable / role=textbox / ProseMirror / TipTap / Slate / Draft / Quill / Lexical / CodeMirror / Monaco ──
      try {
        window.__AYN_RICH_EDITOR_MAP__ = window.__AYN_RICH_EDITOR_MAP__ || new Map();
        const RICH_SEL = [
          '[contenteditable=""]',
          '[contenteditable="true"]',
          '[contenteditable="plaintext-only"]',
          '[role="textbox"]',
          '[data-slate-editor="true"]',
          '[data-lexical-editor="true"]',
          '[data-editor]',
          '.ProseMirror',
          '.tiptap',
          '.ql-editor',
          '.DraftEditor-root',
          '.public-DraftEditor-content',
          '.cm-content',
          '.monaco-editor .view-lines',
        ].join(',');
        const seenEditables = new WeakSet();
        Array.from(doc.querySelectorAll(RICH_SEL)).forEach(cand => {
          try {
            const info = aynResolveRichEditor(cand);
            const editable = info.editable;
            if (!editable || seenEditables.has(editable)) return;
            if (editable.closest && editable.closest('input,textarea,select')) return;
            const rect = editable.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return;
            seenEditables.add(editable);
            const __accR = (typeof aynResolveLabel === 'function') ? aynResolveLabel(editable) : { name: '', role: '' };
            const label = (__accR.name && __accR.name.length >= 2) ? __accR.name : (getLabelFor(editable) || aynNearbyPrompt(editable) || '');
            if (!label) return;
            if (SKIP_RE.test(label)) return;
            const rid = `${prefix}__richedit__:re${aynFid(editable)}`;
            window.__AYN_RICH_EDITOR_MAP__.set(rid, editable);
            let current = '';
            try { current = (typeof aynReadValue === 'function') ? aynReadValue(editable) : (editable.innerText || ''); } catch {}
            const __ctxR = (typeof aynCaptureContext === 'function') ? aynCaptureContext(editable) : { section:'', siblingLabels:[], helperText:'', placeholder:'' };
            fields.push({
              id: rid,
              kind: 'text',
              label: label.slice(0, 240),
              type: 'text',
              name: '',
              currentValue: current || '',
              options: [],
              required: (editable.getAttribute && editable.getAttribute('aria-required') === 'true') || aynNearbyRequired(editable),
              group: classifyField(label, '', 'text'),
              accRole: 'textbox',
              labelSource: (__accR.name && __accR.name.length >= 2) ? 'accname' : (aynLooksLikePromptText(label) ? 'nearby-prompt' : 'legacy'),
              section: __ctxR.section,
              siblingLabels: __ctxR.siblingLabels,
              helperText: __ctxR.helperText,
              placeholder: __ctxR.placeholder,
              richEditor: true,
              richDetector: info.detector,
              _frame: prefix,
            });
            try { editable.__aynEmitted = true; } catch (_) {}
          } catch {}
        });
      } catch { /* never fail the scan */ }

      // v1.9.57 — final recovery pass for open-answer boxes missed by normal selectors.
      // This specifically catches large ATS answer boxes where the editable is inside a
      // decorative wrapper and the prompt is only visual text above it.
      try {
        window.__AYN_OPEN_TEXT_MAP__ = window.__AYN_OPEN_TEXT_MAP__ || new Map();
        const seenEditables = new WeakSet();
        fields.forEach(f => {
          try {
            if (f && f.id && /__(richedit|opentext)__:/.test(f.id)) {
              const e = window.__AYN_RICH_EDITOR_MAP__?.get(f.id) || window.__AYN_OPEN_TEXT_MAP__?.get(f.id);
              if (e) seenEditables.add(e);
            }
          } catch (_) {}
        });
        const OPEN_SEL = [
          'textarea',
          '[role="textbox"]',
          '[contenteditable=""]',
          '[contenteditable="true"]',
          '[contenteditable="plaintext-only"]',
          '.ProseMirror', '.tiptap', '.ql-editor', '.DraftEditor-root', '.public-DraftEditor-content',
          '[data-slate-editor="true"]', '[data-lexical-editor="true"]', '[data-editor]'
        ].join(',');
        Array.from(doc.querySelectorAll(OPEN_SEL)).forEach(cand => {
          try {
            const info = aynResolveRichEditor(cand);
            const editable = info.editable || cand;
            if (!editable || seenEditables.has(editable) || editable.__aynEmitted) return;
            if (editable.disabled || editable.readOnly) return;
            if (editable.closest && editable.closest('input,select')) return;
            const rect = editable.getBoundingClientRect && editable.getBoundingClientRect();
            if (rect && rect.width === 0 && rect.height === 0) return;
            const acc = aynResolveLabel(editable);
            const prompt = ((acc.name && acc.name.length >= 2) ? acc.name : '') || getLabelFor(editable) || aynNearbyPrompt(editable) || aynFieldQuestion(editable) || '';
            if (!prompt || SKIP_RE.test(prompt)) return;
            const current = (typeof aynReadValue === 'function') ? aynReadValue(editable) : (editable.value || editable.innerText || '');
            const rid = `${prefix}__opentext__:ot${aynFid(editable)}`;
            window.__AYN_OPEN_TEXT_MAP__.set(rid, editable);
            seenEditables.add(editable);
            const ctx = aynCaptureContext(editable);
            fields.push({
              id: rid,
              kind: editable.tagName === 'TEXTAREA' ? 'textarea' : 'text',
              label: prompt.slice(0, 300),
              type: editable.tagName === 'TEXTAREA' ? 'textarea' : 'text',
              name: editable.name || '',
              currentValue: current || '',
              options: [],
              required: aynNearbyRequired(editable),
              group: classifyField(prompt, editable.name || '', editable.tagName === 'TEXTAREA' ? 'textarea' : 'text'),
              accRole: 'textbox',
              labelSource: (acc.name && acc.name.length >= 2) ? 'accname' : 'nearby-prompt',
              section: ctx.section,
              siblingLabels: ctx.siblingLabels,
              helperText: ctx.helperText,
              placeholder: ctx.placeholder,
              richEditor: !!info.editable || !!editable.isContentEditable,
              richDetector: info.detector || (editable.isContentEditable ? 'contenteditable' : ''),
              _frame: prefix,
            });
            try { editable.__aynEmitted = true; } catch (_) {}
          } catch (_) {}
        });
      } catch { /* never fail the scan */ }
    });

    // ── PART A: Detect custom button-style single-choice toggles (Ashby/Jerry/etc.) ──
    try {
      const buttonGroups = scanButtonGroups();
      buttonGroups.forEach(g => fields.push(g));
    } catch { /* never fail the scan */ }

    // ── DEDUPE: option-style fields can be detected through multiple scan paths ──
    const DEDUP_TYPES = new Set(['checkbox', 'radio', 'buttongroup']);
    const dedupedFields = [];
    const seenSigs = new Set();
    for (const field of fields) {
      const ftype = field.type || field.kind || '';
      if (DEDUP_TYPES.has(ftype)) {
        const sig = `${ftype}|${norm(field.label || '').slice(0, 80)}|${Array.isArray(field.options) ? field.options.length : 0}`;
        if (seenSigs.has(sig)) continue;
        seenSigs.add(sig);
      }
      dedupedFields.push(field);
    }
    fields = dedupedFields;

    // ── v1.9.59: MERGE ORPHAN YES/NO OPTION FIELDS INTO A BUTTONGROUP ──
    // Gem/Talentpool-style forms give each Yes/No option its own DOM element with a
    // unique name, so the checkbox/radio pass emits them as two separate fields with
    // labels 'Yes' and 'No'. The AI backend has no context and skips both.
    // Detect pairs by shared ancestor + differing Yes/No labels; emit one buttongroup.
    try {
      const YESNO_RE = /^(yes|no|oui|non|true|false)$/i;
      const isYN = (f) => (f.kind === 'checkbox' || f.kind === 'radio')
        && YESNO_RE.test(String(f.label || '').trim())
        && f._el && f._el.isConnected;
      const cands = fields.filter(isYN);
      const toRemove = new Set();
      const usedContainers = new WeakSet();
      const merged = [];
      for (let i = 0; i < cands.length; i++) {
        const a = cands[i];
        if (toRemove.has(a)) continue;
        const aLbl = String(a.label).trim().toLowerCase();
        let matchB = null;
        let sharedAnc = null;
        let anc = a._el.parentElement;
        for (let up = 0; up < 6 && anc && !matchB; up++, anc = anc.parentElement) {
          const other = cands.find(o => o !== a && !toRemove.has(o)
            && anc.contains(o._el)
            && String(o.label).trim().toLowerCase() !== aLbl);
          if (other) { matchB = other; sharedAnc = anc; }
        }
        if (!matchB || !sharedAnc || usedContainers.has(sharedAnc)) continue;
        usedContainers.add(sharedAnc);
        const rq = aynFindQuestionForOptionGroup(sharedAnc, ['Yes', 'No'], a._el);
        let qLabel = rq.label || '';
        if (!qLabel) qLabel = a.name || matchB.name || 'Yes/No question';
        const prefix = a._frame || '';
        const bgId = `${prefix}__buttongroup__:merge${bgCounter++}:${qLabel.slice(0, 40).replace(/\s+/g, '_')}`;
        window.__AYN_BG_MAP__ = window.__AYN_BG_MAP__ || new Map();
        window.__AYN_BG_MAP__.set(bgId, { qLabel, optionTexts: ['Yes', 'No'] });
        merged.push({
          id: bgId, kind: 'buttongroup', label: qLabel, type: 'buttongroup', name: '',
          currentValue: '', options: [{ label: 'Yes', value: 'Yes' }, { label: 'No', value: 'No' }],
          required: !!(a.required || matchB.required),
          group: classifyField(`${qLabel} Yes No`, '', 'buttongroup'),
          accRole: 'buttongroup', labelSource: rq.source || 'yesno-merge', _frame: prefix,
        });
        toRemove.add(a); toRemove.add(matchB);
      }
      if (toRemove.size) fields = fields.filter(f => !toRemove.has(f));
      if (merged.length) fields.push(...merged);
      try { console.log('[AYN] yesno-merge: merged', merged.length, 'pairs; removed', toRemove.size, 'orphan option fields'); } catch (_) {}
    } catch (_) { /* never fail the scan */ }

    // v1.9.62 — stable identity for scan → AI → inject → telemetry.
    for (const f of fields) {
      try {
        if (!f.fingerprint) f.fingerprint = aynFingerprintField(f);
        if (!f.label || /^question$/i.test(f.label)) {
          const stronger = (f.group && /^eeo\.disability$/.test(f.group)) ? 'Disability Status'
            : (f.group && /^eeo\.veteran$/.test(f.group)) ? 'Veteran Status'
            : (f.group && /^eeo\.gender$/.test(f.group)) ? 'Gender'
            : (f.group && /^eeo\.ethnicity$/.test(f.group)) ? 'Race or Ethnicity'
            : '';
          if (stronger) f.label = stronger;
        }
      } catch (_) {}
    }

    // Strip transient DOM refs so payload serializes cleanly.
    for (const f of fields) { try { delete f._el; } catch (_) {} }

    fields._fileFields = fileFields;
    return fields;
  }


  // Find groups of 2-6 sibling clickable choices (button / role=radio|button|option / a)
  // that share a parent container with a question label. Conservative.
  function scanButtonGroups() {
    const out = [];
    const SKIP_BTN_RE = /^(submit|next|back|continue|apply|cancel|close|save|edit|delete|remove|upload|attach|sign\s*in|log\s*in|register)$/i;
    const QUESTION_HINT = /[?]\s*$|^\s*(are|do|did|have|has|will|would|can|could|is|may|should|what|how|why|when|where|which|please)\b/i;

    const CHOICE_SEL = 'button, [role="radio"], [role="option"], [role="button"], a[role="button"]';
    const all = Array.from(document.querySelectorAll(CHOICE_SEL));
    // Group by parent (the direct parent that holds siblings)
    const byParent = new Map();
    for (const el of all) {
      try {
        if (el.disabled) continue;
        // Skip if it's actually wrapping a native input (those are handled as radio/checkbox already)
        if (el.querySelector('input[type="radio"], input[type="checkbox"]')) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const txt = (safeText(el) || el.getAttribute('aria-label') || '').trim();
        if (!txt) continue;
        const wc = txt.split(/\s+/).length;
        if (wc < 1 || wc > 4 || txt.length > 32) continue;
        if (SKIP_BTN_RE.test(txt)) continue;
        // Skip submit-like buttons by type/role attribute
        if (el.tagName === 'BUTTON' && (el.type || '').toLowerCase() === 'submit') continue;
        const parent = el.parentElement;
        if (!parent) continue;
        if (!byParent.has(parent)) byParent.set(parent, []);
        byParent.get(parent).push({ el, text: txt });
      } catch { /* skip */ }
    }

    const usedQuestions = new Set();
    for (const [parent, items] of byParent) {
      if (items.length < 2 || items.length > 6) continue;
      // Dedupe by text
      const seen = new Set();
      const uniq = items.filter(i => {
        const k = i.text.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
      if (uniq.length < 2 || uniq.length > 6) continue;

      // Skip nav-bar / pagination / submit-row containers
      const parentCls = ((parent.className || '') + ' ' + (parent.getAttribute('role') || '')).toLowerCase();
      if (/\b(nav|navigation|toolbar|pagination|breadcrumb|footer|header|menubar)\b/.test(parentCls)) continue;

      // Find the nearest question label by walking ancestors
      let qLabel = '';
      let node = parent;
      for (let i = 0; i < 4 && node; i++) {
        const h = node.querySelector('legend, label, [class*="label"], [class*="question"], h2, h3, h4, strong, p');
        if (h && !h.contains(items[0].el)) {
          const t = safeText(h).trim().split(/\n+/)[0].trim();
          if (t && t.length >= 3 && t.length <= 240) {
            const required = /\*|required/i.test(safeText(node).slice(0, 280));
            if (QUESTION_HINT.test(t) || required) { qLabel = t; break; }
          }
        }
        node = node.parentElement;
      }
      if (!qLabel) continue;
      if (usedQuestions.has(qLabel)) continue;
      usedQuestions.add(qLabel);

      const id = `__buttongroup__:${out.length}:${qLabel.slice(0, 60).replace(/\s+/g, '_')}`;
      const options = uniq.map(i => ({ label: i.text, value: i.text }));
      // PART 1: Store DATA (qLabel + option texts), not live element refs
      window.__AYN_BG_MAP__ = window.__AYN_BG_MAP__ || new Map();
      window.__AYN_BG_MAP__.set(id, { qLabel, optionTexts: uniq.map(i => i.text) });

      out.push({
        id,
        kind: 'buttongroup',
        label: qLabel,
        type: 'buttongroup',
        name: '',
        currentValue: '',
        options,
        required: /\*|required/i.test(safeText(parent).slice(0, 280)),
        group: classifyField(qLabel, '', 'buttongroup'),
        accRole: 'buttongroup',
        labelSource: 'legacy',
      });
    }
    return out;
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
  function aynResolveFieldEl(id, _frame) {
    try {
      const { doc, rawId } = resolveDoc(id, _frame);
      if (!doc || !rawId) return null;
      let el = null;
      if (!el && rawId.includes('__textfield__:')) {
        try {
          const map = window.__AYN_TEXT_FIELD_MAP__;
          el = (map && (map.get(id) || map.get(rawId))) || null;
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
        el = (window.__AYN_OPEN_TEXT_MAP__ && (window.__AYN_OPEN_TEXT_MAP__.get(id) || window.__AYN_OPEN_TEXT_MAP__.get(rawId))) || null;
      }
      if (!el && rawId.includes('__richedit__:')) {
        el = (window.__AYN_RICH_EDITOR_MAP__ && (window.__AYN_RICH_EDITOR_MAP__.get(id) || window.__AYN_RICH_EDITOR_MAP__.get(rawId))) || null;
      }
      return el || null;
    } catch (_) { return null; }
  }

  // v2.1.0 — post-inject read-back verification. Independent of
  // aynSettleReapply (which only handles text reversion). This function
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
      (values || []).forEach(v => {
        if (!v || !v.id) return;
        const want = v.optionLabel || v.optionValue || v.value || '';
        wantById.set(v.id, String(want || '').trim());
      });
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
  async function aynRetryUnverified(values, injectResult) {
    try {
      const ids = (injectResult && injectResult.unverifiedIds) || [];
      if (!ids.length) return;
      const valById = new Map((values || []).filter(v => v && v.id).map(v => [v.id, v]));
      for (const id of ids) {
        const v = valById.get(id);
        if (!v) continue;
        const rawId = String(id);
        try {
          if (rawId.includes('__buttongroup__:')) {
            const meta = window.__AYN_BG_MAP__ && window.__AYN_BG_MAP__.get(rawId);
            const want = v.optionLabel || v.optionValue || v.value;
            if (meta && want) {
              const { target } = findButtongroupOption(meta, want);
              if (target) { try { fireFullClick(target); await aynSleep(120); } catch (_) {} }
            }
          } else if (rawId.includes('__radio__:custom:')) {
            const els = (window.__AYN_CUSTOM_RADIO_MAP__ && window.__AYN_CUSTOM_RADIO_MAP__.get(rawId)) || [];
            const want = v.optionLabel || v.optionValue || v.value;
            const target = els.find(e => aynOptionMatches((e.innerText || e.getAttribute('aria-label') || ''), String(want || '')));
            if (target) { try { fireFullClick(target.closest('label') || target); await aynSleep(120); } catch (_) {} }
          } else {
            const el = aynResolveFieldEl(id, v._frame);
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && typeof v.value === 'string') {
              try { await aynFillViaPageWorld(el, v.value); await aynSleep(80); } catch (_) {}
            }
          }
        } catch (_) {}
      }
      // Re-run verification to update flags with post-retry state.
      try { aynPostInjectVerify(values, injectResult); } catch (_) {}
    } catch (_) {}
  }


  async function aynSettleReapply(values, injectResult) {
    try {
      const byId = new Map((values || []).filter(v => v && v.id && typeof v.value === 'string' && v.value.trim()).map(v => [v.id, v.value]));
      if (!byId.size) return;
      const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
      const digits = (s) => String(s || '').replace(/\D+/g, '');
      // v1.9.56 — 3 verification passes at 250 / 900 / 1800 ms handles Workday &
      // slow-hydrating React forms that wipe values after our first reapply.
      const DELAYS = [250, 900, 1800];
      for (let pass = 0; pass < DELAYS.length; pass++) {
        await aynSleep(DELAYS[pass]);
        let reverted = 0;
        for (const res of (injectResult.results || [])) {
          if (!res || !res.ok || !byId.has(res.id)) continue;
          const want = byId.get(res.id);
          const el = aynResolveFieldEl(res.id, res._frame);
          if (!el) continue;
          const tag = (el.tagName || '').toUpperCase();
          if (tag !== 'INPUT' && tag !== 'TEXTAREA') continue;
          const cur = el.value || '';
          const wantDigits = digits(want);
          const stillThere = norm(cur) === norm(want) || (wantDigits.length >= 7 && digits(cur) === wantDigits) || (norm(want).length >= 6 && norm(cur).includes(norm(want)));
          if (stillThere) continue;
          reverted++;
          try {
            const r2 = await aynFillTextbox(el, want);
            res.reapplied = true;
            res.verified = !!(r2 && r2.verified);
            if (!r2 || !r2.ok) res.reason = 'reverted after render, reapply failed';
          } catch (_) { res.reason = 'reverted after render, reapply threw'; }
        }
        if (!reverted) break;
      }
    } catch (_) { /* never break the fill */ }
  }

  function norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

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
    try { btn.scrollIntoView({ block: 'center' }); } catch {}
    try { btn.focus && btn.focus(); } catch {}
    btn.click();
    await sleep(60);
    let ok = bgIsSelected(btn);
    if (!ok) { await sleep(140); ok = bgIsSelected(btn); }
    if (!ok) {
      fireFullClick(btn);
      await sleep(60); ok = bgIsSelected(btn);
      if (!ok) { await sleep(140); ok = bgIsSelected(btn); }
    }
    if (!ok) {
      mainWorldClickByText(qLabel, wantText);
      await sleep(150); ok = bgIsSelected(btn);
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

  function aynShowActivityGlow(on) {
    if (!AYN_IS_TOP) return;
    try {
      const ID = 'ayn-activity-glow';
      let el = document.getElementById(ID);
      if (on) {
        if (!document.getElementById('ayn-activity-glow-style')) {
          const st = document.createElement('style');
          st.id = 'ayn-activity-glow-style';
          st.textContent = '@keyframes aynGlowPulse{0%,100%{opacity:.5}50%{opacity:1}}#ayn-activity-glow{position:fixed;inset:0;pointer-events:none;z-index:2147483646;box-shadow:inset 0 0 0 3px rgba(34,197,94,.75), inset 0 0 26px 7px rgba(34,197,94,.32);animation:aynGlowPulse 1.4s ease-in-out infinite;transition:opacity .2s}';
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


  async function aynTypeKeystrokes(el, value) {
    el.focus();
    // clear existing
    aynSetNativeValue(el, '');
    for (const ch of String(value)) {
      const opts = { bubbles: true, cancelable: true, key: ch };
      el.dispatchEvent(new KeyboardEvent('keydown', opts));
      el.dispatchEvent(new KeyboardEvent('keypress', opts));
      // append char via native setter so frameworks observe each step
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      const next = (el.value || '') + ch;
      if (desc && desc.set) desc.set.call(el, next); else el.value = next;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
      el.dispatchEvent(new KeyboardEvent('keyup', opts));
      await aynSleep(8);
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


  async function aynFillTypeahead(el, value) {
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
    for (let i = 0; i < 13; i++) {
      await aynSleep(i < 4 ? 150 : 250);
      optionEls = Array.from(document.querySelectorAll('[role="option"], [role="listbox"] [role="option"], [role="listbox"] li, [class*="option" i], [class*="menu" i] li, [id*="option" i]'))
        .filter(o => isVisibleOpt(o) && nrm(o.textContent).length && nrm(o.textContent).length < 200);
      if (optionEls.length) break;
    }
    if (optionEls.length) {
      const match = optionEls.find(o => aynOptionMatches(o.textContent, val));
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
        return await aynFillTypeahead(el, wantText || wantLabel);
      }
      return await aynFillTextbox(el, wantText);
    } catch (e) {
      return { ok: false, reason: 'exception: ' + (e && e.message ? e.message : 'unknown') };
    }
  }

  async function injectValues(values) {
    let filled = 0;
    const results = [];

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



    for (const v of values) {
      const { id, value, optionValue, optionLabel, optionValues, optionLabels, skip, _idx, _frame } = v;
      if (skip) { results.push({ id, ok: false, reason: 'skipped' }); continue; }

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
        let target = null;
        outer:
        for (const want of cands) {
          for (const r of radios) {
            const lbl = ((r.closest('label') || r.parentElement)?.innerText || '').replace(/\s+/g,' ').trim();
            if (aynOptionMatches(lbl, want) || (r.value && r.value !== 'on' && aynOptionMatches(r.value, want))) { target = r; break outer; }
          }
        }
        let ok = false;
        if (target) {
          try {
            const lab = target.closest('label') || (target.id && doc.querySelector(`label[for="${CSS.escape(target.id)}"]`)) || target.parentElement;
            target.click(); await aynSleep(30);
            if (!target.checked && lab) { lab.click(); await aynSleep(30); }
            if (!target.checked) { target.checked = true; target.dispatchEvent(new Event('input',{bubbles:true})); target.dispatchEvent(new Event('change',{bubbles:true})); await aynSleep(20); }
            ok = !!target.checked;
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
              if (!box.checked) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
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
              if (!m.checked) { m.checked = true; m.click(); }
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
        const meta = window.__AYN_BG_MAP__ && window.__AYN_BG_MAP__.get(id);
        if (!meta || !meta.qLabel) { results.push({ id, ok: false, reason: 'buttongroup meta missing' }); continue; }
        const wantRaw = optionLabel || optionValue || value;
        if (!wantRaw) { results.push({ id, ok: false, reason: 'no option' }); continue; }

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
          let verified = bgIsSelected(target);
          if (!verified) { await sleep(140); verified = bgIsSelected(target); }
          try {
            console.log('[AYN-BG] afterPlainClick verified=', verified, 'class=',
              (target && typeof target.className === 'string' ? target.className : ''));
          } catch {}
          if (!verified) {
            // Fallback 1: full pointer/mouse sequence
            fireFullClick(target);
            await sleep(60);
            verified = bgIsSelected(target);
            if (!verified) { await sleep(140); verified = bgIsSelected(target); }
            try { console.log('[AYN-BG] afterFallback verified=', verified); } catch {}
          }
          if (!verified) {
            // Fallback 2: click parent / label
            const fallback = target.closest('label') || target.parentElement;
            if (fallback && fallback !== target) {
              fireFullClick(fallback);
              await sleep(60);
              verified = bgIsSelected(target) || bgIsSelected(fallback);
              if (!verified) { await sleep(140); verified = bgIsSelected(target) || bgIsSelected(fallback); }
              try { console.log('[AYN-BG] afterFallback verified=', verified); } catch {}
            }
          }
          if (!verified) {
            // Fallback 3: main-world click (isolated-world click may not reach React)
            mainWorldClickByText(meta.qLabel, optionLabel || optionValue || value);
            await sleep(150);
            verified = bgIsSelected(target);
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
          const lbl = (getLabelFor(el) || el.name || '').toLowerCase();
          const accept = (el.accept || '').toLowerCase();
          const isResume = /resume|cv|curriculum|attach/.test(lbl) || /\.pdf|\.docx?|\.rtf|\.txt/.test(accept) || !el.accept;
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
    const handler = () => {
      if (submitNotified) return;
      submitNotified = true;
      const job = extractJobText();
      sendQuiet({
        type: 'AUTO_TRACK_SUBMIT',
        title: job.title, company: job.company, url: window.location.href,
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

  async function aynRunVisionFallback(injectResult) {
    const results = (injectResult && injectResult.results) || [];
    const vdiag = { enabled: AYN_VISION_ENABLED, scanned: 0, unresolved: 0, candQ: 0, candOpt: 0, sent: false, resp: 'none', captured: '', captureError: '', backendError: '', decisions: 0, clicks: 0 };
    const pushDiag = () => {
      try {
        // v1.9.67 — diagnostics ride as metadata, never as a fake failed result row.
        if (injectResult) { injectResult.visionDiag = vdiag; injectResult.results = results; }
      } catch (_) {}
    };
    try {
      if (!AYN_VISION_ENABLED) return;
      let fields;
      try { fields = scanFormFields(); } catch { fields = []; }
      if (!Array.isArray(fields) || !fields.length) return;
      vdiag.scanned = fields.length;

      const resolvedIds = new Set(results.filter(r => r && (r.ok || r.verified)).map(r => r.id));
      const unresolved = fields.filter(f => {
        if (!f) return false;
        const isOption = f.kind === 'radio' || f.kind === 'checkbox' || f.kind === 'buttongroup'
          || (!f.kind && typeof f.label === 'string' && f.label.length < 48 && AYN_OPTION_WORD_RE.test(f.label));
        if (!isOption) return false;
        return !resolvedIds.has(f.id);
      });
      vdiag.unresolved = unresolved.length;
      if (unresolved.length === 0) return;

      const cand = aynCollectVisionCandidates(unresolved);
      vdiag.candQ = cand.questions.length;
      vdiag.candOpt = cand.options.length;
      if (!cand.questions.length && !cand.options.length) return;
      const candidates = { questions: cand.questions, options: cand.options };

      let job;
      try { job = extractJobText(); } catch { job = {}; }

      let __img = '';
      try {
        const __url = chrome.runtime.getURL('vendor/html2canvas.esm.js');
        const __mod = await import(__url);
        const __h2c = __mod.default || __mod.html2canvas || (typeof html2canvas !== 'undefined' ? html2canvas : null);
        if (__h2c) {
          const __canvas = await __h2c(document.body, {
            scale: 0.5, useCORS: true, allowTaint: false, logging: false,
            backgroundColor: '#ffffff', windowWidth: document.documentElement.clientWidth,
            height: Math.min(document.body.scrollHeight, 4000),
            ignoreElements: (node) => node && node.id === 'ayn-activity-glow',
          });
          __img = __canvas.toDataURL('image/jpeg', 0.7);
          vdiag.captured = 'html2canvas';
        } else {
          vdiag.captureError = 'html2canvas not loaded';
        }
      } catch (e) {
        vdiag.captureError = 'html2canvas: ' + String((e && e.message) || 'render failed');
      }

      let vres;
      try {
        vres = await new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage({
              type: 'AYN_VISION_FILL',
              image: __img,
              candidates,
              url: location.href,
              jobTitle: job?.title || '',
              company: job?.company || '',
            }, (r) => { void chrome.runtime.lastError; resolve(r); });
          } catch { resolve(null); }
        });
      } catch { vres = null; }


      vdiag.sent = true;
      vdiag.resp = vres ? 'got' : 'null';
      if (vres && vres.diag) {
        vdiag.captured = String(vres.diag.captured);
        vdiag.captureError = vres.diag.captureError || '';
        vdiag.backendError = vres.diag.backendError || '';
      }
      const decisions = (vres && Array.isArray(vres.decisions)) ? vres.decisions : [];
      vdiag.decisions = decisions.length;
      if (!decisions.length) return;

      for (const d of decisions) {
        const chosen = d && d.chosenOptionText;
        if (!chosen) continue;
        vdiag.clicks += 1;
        let landed = false;
        try {
          const el = aynFindClickableByText(chosen);
          if (el) {
            try { el.scrollIntoView({ block: 'center' }); } catch {}
            const target = (el.closest && el.closest('label')) || el;
            try { target.click(); } catch {}
            await new Promise(r => setTimeout(r, 60));
            if (!aynLooksSelected(target) && !aynLooksSelected(el)) {
              try { fireFullClick(target); } catch {}
              await new Promise(r => setTimeout(r, 60));
            }
            landed = aynLooksSelected(target) || aynLooksSelected(el);
          }
        } catch (_) { landed = false; }

        results.push({
          id: 'vision:' + chosen,
          ok: !!landed,
          verified: !!landed,
          reason: landed ? 'vision-click' : 'vision-click-unverified',
        });
      }
      if (injectResult) {
        injectResult.results = results;
        // v1.9.52 — recompute using unified rule
        injectResult.total = results.length;
        injectResult.filled = results.filter(r => r && r.ok === true).length;
      }
    } catch (_) {
      /* swallow */
    } finally {
      pushDiag();
    }
  }


  // ══════════════════════════════════════════════════════════════════
  // 5. MESSAGE LISTENER
  // ══════════════════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

    if (message.type === 'EXTRACT_JOB_TEXT') {
      extractJobTextDeep().then(res => sendResponse(res)).catch(() => { try { sendResponse(extractJobText()); } catch {} });
      return true;
    }

    if (message.type === 'DETECT_PAGE') {
      if (!AYN_IS_TOP) return false;
      const job = extractJobText();
      const fields = scanFormFields();
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
      let kind = 'other';
      if (isAynHost) kind = 'ayn';
      else if (hasForm && (hasJD || isJobHost)) kind = 'application';
      else if (hasJD || isJobHost) kind = 'job_listing';
      sendResponse({
        kind, hasForm, hasJD, fieldCount: fields.length + (modalForm ? 1 : 0),
        fileFieldCount: fileFields.length, needsResume,
        title: job.title, company: job.company,
        jdLength: (job.text || '').length, url,
      });
      return true;
    }

    if (message.type === 'SCAN_FORM') {
      (async () => {
        const restore = await aynEnsureRendered();
        try {
          const countCtrls = () => {
            try { return document.querySelectorAll('input,textarea,select,[role="radio"],[role="checkbox"],[role="combobox"]').length; }
            catch { return 0; }
          };
          const before = countCtrls();
          let fields = scanFormFields();
          // v1.9.65 — one extra pass if new controls mounted late (React Suspense / lazy sections)
          try {
            await new Promise(r => setTimeout(r, 400));
            if (countCtrls() > before) {
              const extra = scanFormFields();
              const seen = new Set((fields || []).map(f => f && f.id).filter(Boolean));
              for (const f of (extra || [])) {
                if (f && f.id && !seen.has(f.id)) { fields.push(f); seen.add(f.id); }
              }
            }
          } catch (_) {}
          const jobText = extractJobText();
          let scanDiag = [];
          try { scanDiag = aynScanDiag(); } catch (_) { scanDiag = []; }
          try { if (window.__AYN_COVERAGE__) scanDiag.push({ note: 'coverage', cov: window.__AYN_COVERAGE__ }); } catch (_) {}
          // v1.9.43 — cache id -> label so injectValues can rehydrate .label when missing
          try {
            const map = new Map();
            (fields || []).forEach(f => { if (f && f.id) map.set(f.id, f.label || ''); });
            window.__AYN_FIELD_LABELS__ = map;
          } catch (_) {}
          sendResponse({ fields, fileFields: fields._fileFields || [], jobText, ats: detectATS(), url: window.location.href, scanDiag });
        } finally {
          try { restore && restore(); } catch (_) {}
        }
      })();
      return true;
    }

    if (message.type === 'INJECT_VALUES') {
      (async () => {
        aynShowActivityGlow(true);
        let injectResult;
        try {
          try {
            injectResult = await injectValues(message.values);
          } catch (e) {
            sendResponse({ filled: 0, total: 0, results: [], error: e.message });
            return;
          }
          try { await aynSettleReapply(message.values, injectResult); } catch (_) {}
          try { aynPostInjectVerify(message.values, injectResult); } catch (_) {}
          try { await aynRetryUnverified(message.values, injectResult); } catch (_) {}
          try {
            if (AYN_VISION_ENABLED) {
              await aynRunVisionFallback(injectResult);
            }
          } catch (_) { /* swallow — never break normal fill */ }
          sendResponse(injectResult);
        } finally {
          aynShowActivityGlow(false);
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
  });

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
            const lbl = (getLabelFor(el) || el.name || '').toLowerCase();
            const accept = (el.accept || '').toLowerCase();
            if (/resume|cv|curriculum|attach/.test(lbl) || /\.pdf|\.docx?|\.rtf/.test(accept) || !el.accept) hasResumeUpload = true;
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
      if (AYN_IS_TOP) sendQuiet({ type: 'FORM_DETECTED', hasForm: true, fieldCount, hasResumeUpload, url });
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
      if (AYN_IS_TOP) sendQuiet({
        type: 'JOB_DETECTED',
        text: result.text,
        title: result.title,
        company: result.company || '',
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
