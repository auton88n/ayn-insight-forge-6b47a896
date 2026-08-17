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
  const AYN_BUILD = (() => { try { return chrome.runtime.getManifest().version; } catch (_) { return '3.4.8'; } })();
  // v2.11.2 — hard cap the JD payload we ship out to backend/scoring. Bigger
  // payloads were mostly boilerplate (nav/footer/cookie banners) and pushed
  // real role signal out of the model's window.
  const MAX_JD_CHARS = 12000;
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

  function cleanTitle(t) {
    return String(t || '').replace(/\s*[|\-–—]\s*Lovable\s*$/i, '').trim();
  }

  // v2.11.2 — shared JD noise cleaners. Used by BOTH the live extractor
  // (combinedText) and the parsed-HTML extractor (parseBodyFromHtml).
  // Rule of thumb: strip anything a human reading the JD would ignore
  // (chrome, cookie/consent, "share this job", legal footers) BEFORE we
  // measure length or ship the text to the model.
  const AYN_JD_NOISE_SEL = [
    'script','style','noscript','svg','iframe','template','link','meta',
    'nav','header','footer','aside','form',
    '[role="navigation"]','[role="banner"]','[role="contentinfo"]','[role="search"]',
    '[aria-hidden="true"]',
    '[class*="cookie" i]','[id*="cookie" i]',
    '[class*="consent" i]','[id*="consent" i]',
    '[class*="banner" i]','[class*="skip-link" i]',
    '[class*="social" i][class*="share" i]',
  ].join(',');
  const AYN_JD_NOISE_LINE_RE = /^(cookies?|we use cookies|privacy (notice|policy)|terms( of (service|use))?|accept all|manage preferences|share (this )?job|apply now|back to (jobs|search|listings)|©\s*\d{4}|all rights reserved|equal (employment )?opportunity employer|powered by)/i;
  function aynStripNoiseFromNode(node) {
    if (!node) return null;
    let clone;
    try { clone = node.cloneNode(true); } catch { return node; }
    try { clone.querySelectorAll(AYN_JD_NOISE_SEL).forEach(el => { try { el.remove(); } catch {} }); } catch {}
    return clone;
  }
  function aynCleanJdText(raw) {
    let s = String(raw || '').replace(/\r/g, '');
    // Drop pure-noise lines and collapse dupes.
    const lines = s.split(/\n+/).map(l => l.trim());
    const kept = [];
    let prev = '';
    for (const line of lines) {
      if (!line) { if (prev !== '') kept.push(''); prev = ''; continue; }
      if (AYN_JD_NOISE_LINE_RE.test(line)) continue;
      if (line === prev) continue;
      kept.push(line);
      prev = line;
    }
    return kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  }

  // Concatenate text from ALL matching nodes, dropping nodes nested inside another
  // match, stripping chrome/cookie noise per node, and running a final line cleaner.
  function combinedText(selector) {
    if (!selector) return '';
    let nodes;
    try { nodes = Array.from(document.querySelectorAll(selector)); } catch { return ''; }
    if (!nodes.length) return '';
    const top = nodes.filter(n => !nodes.some(o => o !== n && o.contains(n)));
    const seen = new Set();
    const parts = [];
    let total = 0;
    for (const n of top) {
      const cleanNode = aynStripNoiseFromNode(n) || n;
      const t = safeText(cleanNode).trim();
      if (!t) continue;
      const key = t.slice(0, 120).toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(t);
      total += t.length + 2;
      if (total >= MAX_JD_CHARS * 1.5) break; // give the cleaner some slack
    }
    const cleaned = aynCleanJdText(parts.join('\n\n'));
    return cleaned.length > MAX_JD_CHARS ? cleaned.slice(0, MAX_JD_CHARS) : cleaned;
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
      // v3.37.0 — signed-out LinkedIn (the public /jobs/search view) renders
      // a completely different DOM (description__text, top-card-layout__title,
      // topcard__org-name-link) from the signed-in unified pane. Both sets
      // are listed so whichever one is actually on the page gets picked up.
      ['linkedin.com/jobs', { desc: '#job-details, .jobs-description-content__text, .jobs-description__content, .jobs-box__html-content, [class*="jobs-description"], .description__text', title: '.job-details-jobs-unified-top-card__job-title, .top-card-layout__title, h1', company: '.job-details-jobs-unified-top-card__company-name, [class*="company-name"], .topcard__org-name-link' }],
      ['greenhouse.io', { desc: '.job__description, .app-body [class*="description"], .content-intro, #content .prose', title: 'h1', company: '.company-name, [class*="company"]' }],
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
      // v2.11.2 — descendant-drop + noise-strip + line cleaner. Same rules
      // as the live combinedText, so a Greenhouse page fetched by the
      // listing-fetch branch scores the same as one read live.
      const pickText = (selList) => {
        try {
          const nodes = [];
          (selList || '').split(',').forEach(s => {
            const q = s.trim(); if (!q) return;
            doc.querySelectorAll(q).forEach(el => nodes.push(el));
          });
          if (!nodes.length) return '';
          const top = nodes.filter(n => !nodes.some(o => o !== n && o.contains(n)));
          const seen = new Set();
          const parts = [];
          for (const n of top) {
            const cleanNode = aynStripNoiseFromNode(n) || n;
            const t = (cleanNode.textContent || '').trim();
            if (!t || t.length <= 20) continue;
            const key = t.slice(0, 120).toLowerCase().replace(/\s+/g, ' ');
            if (seen.has(key)) continue;
            seen.add(key);
            parts.push(t);
          }
          return aynCleanJdText(parts.join('\n\n'));
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
      // v3.37.0 — signed-in unified pane selectors first, signed-out public
      // /jobs/search selectors (description__text, top-card-layout__title,
      // topcard__org-name-link) appended so either DOM shape is caught.
      const liSel = {
        desc: '#job-details, .jobs-description-content__text, .jobs-description__content, .jobs-box__html-content, .jobs-details__main-content, [class*="jobs-description"], .description__text',
        title: '.job-details-jobs-unified-top-card__job-title, .top-card-layout__title, h1',
        company: '.job-details-jobs-unified-top-card__company-name, [class*="company-name"], .topcard__org-name-link',
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
        desc: '.job__description, .app-body [class*="description"], .content-intro, #content .prose',
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

  // v2.8.1 — Page classifier gate. classifyPage() returns
  //   { kind: 'job' | 'other', confidence, signals }
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
    // v3.0.0 — apply-vs-listing only ever mattered for filling. Collapsed to
    // "a job page we can read" ('job') versus everything else ('other').
    let kind = 'other';
    if ((applyScore >= 5 && (hasContactCluster || hasResumeFileInput)) || listingScore >= 2 || total >= 4) kind = 'job';
    const confidence = Math.max(0, Math.min(100, total * 10));
    return { kind, confidence, signals, applyScore, listingScore };
  }
  // expose for background gates and debugging
  try { window.__AYN_CLASSIFY__ = classifyPage; } catch {}

  // ══════════════════════════════════════════════════════════════════
  // 5. MESSAGE LISTENER
  // ══════════════════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return false;

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

    // v3.0.0 — read-only page report. No form scanning: the extension no longer
    // writes to pages, so all the sidepanel needs is "can we read a JD here".
    if (message.type === 'DETECT_PAGE') {
      if (!AYN_IS_TOP) return false;
      const job = extractJobText();
      const url = window.location.href;
      const isAynHost = /aynn\.io|lovableproject\.com|lovable\.app|localhost/i.test(url);
      const hasJD = (job.text || '').length > 120;
      const classification = (() => { try { return classifyPage(); } catch { return { kind: 'other', confidence: 0, signals: [] }; } })();
      let kind = classification.kind; // 'job' | 'other'
      if (isAynHost) kind = 'ayn';
      sendResponse({
        kind, classification, hasJD,
        ats: detectATS(),
        title: job.title, company: job.company,
        jdLength: (job.text || '').length, url,
      });
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

    return false;
  });

  // ══════════════════════════════════════════════════════════════════
  // 6. AUTO-DETECT JOB PAGES
  // ══════════════════════════════════════════════════════════════════

  const JOB_PAGE_RE = /linkedin\.com\/jobs|indeed\.com|ca\.indeed\.com|greenhouse\.io|boards\.greenhouse\.io|jobs\.lever\.co|ashbyhq\.com|glassdoor\.com\/job|myworkdayjobs\.com|smartrecruiters\.com|jobright\.ai\/jobs|csod\.com|icims\.com|bamboohr\.com|taleo\.net|workable\.com|dover\.com|recruitee\.com|jazz\.co|pinpointhq\.com|loxo\.co/;

  let _lastDetectedUrl = '';
  let _lastDetectedText = '';
  function detectAndReport(attempt = 0) {
    if (!JOB_PAGE_RE.test(location.href)) return;
    expandSeeMore();
    const result = extractJobText();
    if (result.text && result.text.length > 100) {
      if (location.href === _lastDetectedUrl) return; // already reported
      // v3.37.0 — on a master/detail SPA (LinkedIn's job list, Indeed's
      // split view) the URL updates the instant a new job is clicked, but
      // the right-hand pane keeps showing the PREVIOUS job's DOM until its
      // own fetch + re-render finishes, which can take longer than this
      // debounce. Reading byte-identical text to what we last reported for
      // a different URL means the pane hasn't caught up yet — retry with
      // backoff instead of reporting the wrong job.
      if (result.text === _lastDetectedText && attempt < 8) {
        setTimeout(() => detectAndReport(attempt + 1), 250 * (attempt + 1));
        return;
      }
      _lastDetectedUrl = location.href;
      _lastDetectedText = result.text;
      let __kind = 'other'; try { __kind = (classifyPage() || {}).kind || 'other'; } catch {}
      if (AYN_IS_TOP) sendQuiet({
        type: 'JOB_DETECTED',
        text: result.text,
        title: result.title,
        company: result.company || '',
        kind: __kind,
      });
      return;
    }
    if (attempt < 5) {
      setTimeout(() => detectAndReport(attempt + 1), 350 * (attempt + 1));
    }
  }

  detectAndReport(0);

  // v2.8.1 — push initial classification to background so the "not-a-job-page"
  // gate can reject SCORE_JOB_CARD / JD_REGISTRY on pages we cannot read.
  if (AYN_IS_TOP) {
    const pushKind = () => {
      try { const c = classifyPage(); sendQuiet({ type: 'SET_TAB_KIND', kind: c.kind }); } catch {}
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
