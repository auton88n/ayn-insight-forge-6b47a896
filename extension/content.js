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
  const AYN_BUILD = '1.8.1';
  const MAX_JD_CHARS = 20000;

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
    if (/smartrecruiters\.com/i.test(url)) return 'smartrecruiters';
    if (/cornerstoneondemand|csod\.com/i.test(url)) return 'cornerstone';
    if (/linkedin\.com\/jobs/i.test(url) && document.querySelector('[data-test-modal], .jobs-easy-apply-modal')) return 'linkedin_easy_apply';
    return 'unknown';
  }

  // Walk up the DOM and harvest the nearest visible question text near the input.
  // Tightened: only accept text that actually looks like a question/prompt,
  // not any capitalized blob — stops autofill from mislabeling fields.
  const QUESTION_RE = /\?\s*$|^(what|how|are|do|did|have|has|why|when|where|which|please|describe|tell|list|provide|select|choose|enter|specify)\b/i;
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
    return el.placeholder?.trim() || el.name?.replace(/[_\-]/g, ' ').trim() || '';
  }

  // Classify a field into a semantic group so the AI can reason about it
  function classifyField(label, name, type) {
    const l = ((label || '') + ' ' + (name || '')).toLowerCase();
    if (/\bfirst\s*name|given\s*name|forename\b/.test(l)) return 'identity.first_name';
    if (/\blast\s*name|surname|family\s*name\b/.test(l)) return 'identity.last_name';
    if (/\bfull\s*name|legal\s*name\b/.test(l) || /^name$/i.test((label||'').trim())) return 'identity.full_name';
    if (/\bemail\b/.test(l)) return 'identity.email';
    if (/\bphone|mobile|cell\b/.test(l)) return 'identity.phone';
    if (/\baddress|street\b/.test(l)) return 'identity.address';
    if (/\bcity|town\b/.test(l)) return 'identity.city';
    if (/\bstate|province|region\b/.test(l)) return 'identity.state';
    if (/\bzip|postal\s*code|postcode\b/.test(l)) return 'identity.postal_code';
    if (/\bcountry\b/.test(l)) return 'identity.country';
    if (/linkedin/.test(l)) return 'link.linkedin';
    if (/portfolio|website|personal\s*site/.test(l)) return 'link.portfolio';
    if (/github/.test(l)) return 'link.github';
    if (/authoriz(e|ed)\s+to\s+work|work\s+authorization|legally\s+(authorized|allowed)|right\s+to\s+work/.test(l)) return 'logic.work_auth';
    if (/sponsor|visa|require.*sponsorship/.test(l)) return 'logic.sponsorship';
    if (/relocat/.test(l)) return 'logic.relocate';
    if (/remote|hybrid|on[\s-]?site/.test(l) && type !== 'text') return 'logic.work_mode';
    if (/years?\s+of\s+experience|experience\s+(level|years)|how\s+many\s+years/.test(l)) return 'logic.years_experience';
    if (/highest\s+(degree|education|level)|education\s+level|degree/.test(l) && type !== 'text') return 'logic.education_level';
    if (/salary\s+(expectation|expected|range|requirement)|expected\s+salary|compensation/.test(l)) return 'logic.salary';
    if (/notice\s+period|when\s+can\s+you\s+start|start\s+date|available/.test(l)) return 'logic.start_date';
    if (/gender|sex\b/.test(l)) return 'eeo.gender';
    if (/ethnic|race|hispanic/.test(l)) return 'eeo.ethnicity';
    if (/veteran/.test(l)) return 'eeo.veteran';
    if (/disab(ility|led)/.test(l)) return 'eeo.disability';
    if (/pronoun/.test(l)) return 'eeo.pronouns';
    if (/tell\s+(us|me)\s+about|about\s+yourself|introduce\s+yourself/.test(l)) return 'open.about';
    if (/motivat|why\s+(this|do you want|are you interested|are you applying|.*role|.*company|.*position)|why\s+(does|do)\s+\w+|explore\s+a\s+new/.test(l)) return 'open.why';
    if (/cover\s+letter|message\s+to\s+(hiring|recruiter)/.test(l)) return 'open.cover';
    if (/heard.*about|where.*find|how.*hear|source/.test(l)) return 'open.source';
    return 'other';
  }


  // Return options as {label, value} pairs for select/radio/checkbox groups.
  function getOptionPairs(el) {
    if (el.tagName === 'SELECT') {
      return Array.from(el.options)
        .filter(o => o.value || o.text)
        .map(o => ({ label: (o.text || '').trim(), value: o.value || (o.text || '').trim() }))
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

  function collectScannableDocs() {
    const docs = [{ doc: document, prefix: '' }];
    document.querySelectorAll('iframe').forEach((frame, i) => {
      try {
        const fdoc = frame.contentDocument;
        if (fdoc && fdoc.querySelector('input, textarea, select')) {
          docs.push({ doc: fdoc, prefix: `frame${i}:` });
        }
      } catch { /* cross-origin, ignore */ }
    });
    return docs;
  }

  function scanFormFields() {
    const SKIP_TYPES = new Set(['hidden','submit','button','image','reset']);
    const SKIP_RE = /captcha|honeypot|csrf|token|utm_|_ga|bot|trap/i;
    const fields = [];
    const fileFields = [];
    const seenGroupKeys = new Set(); // dedupe radio/checkbox groups by name+frame
    let bgCounter = 0;

    collectScannableDocs().forEach(({ doc, prefix }) => {
      const elements = Array.from(doc.querySelectorAll('input, textarea, select'));
      elements.forEach((el, idx) => {
        try {
          if (el.disabled) return;
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
                  let qLabel = '';
                  const lblEl = container.querySelector('label, [class*="question"], [class*="label"], legend, h3, h4, strong');
                  if (lblEl && !lblEl.contains(el)) qLabel = safeText(lblEl).trim();
                  if (!qLabel) qLabel = getLabelFor(el) || el.name;
                  qLabel = (qLabel || '').slice(0, 240);
                  const optionTexts = uniqBtns.map(b => (safeText(b) || '').trim());
                  const bgId = `${prefix}__buttongroup__:bcx${bgCounter++}:${qLabel.slice(0, 60).replace(/\s+/g, '_')}`;
                  window.__AYN_BG_MAP__ = window.__AYN_BG_MAP__ || new Map();
                  window.__AYN_BG_MAP__.set(bgId, { qLabel, optionTexts });
                  fields.push({
                    id: bgId, kind: 'buttongroup', label: qLabel, type: 'buttongroup', name: el.name,
                    currentValue: '', options: optionTexts.map(t => ({ label: t, value: t })),
                    required: el.required || el.getAttribute('aria-required') === 'true',
                    group: classifyField(qLabel, el.name || '', 'buttongroup'), _frame: prefix,
                  });
                  return;
                }
              }
            }

            // Question label = nearest fieldset legend / label group; fall back to this input's label.
            let qLabel = '';
            const fs = el.closest('fieldset');
            if (fs) {
              const lg = fs.querySelector('legend, [class*="label"], [class*="question"]');
              if (lg) qLabel = safeText(lg).trim();
            }
            if (!qLabel) {
              const wrap = el.closest('[role="radiogroup"], [role="group"], [class*="question"], [class*="field"], [class*="form-group"]');
              if (wrap) {
                const h = wrap.querySelector('legend, label, [class*="label"], [class*="question"], h3, h4, strong');
                if (h && !h.contains(el)) qLabel = safeText(h).trim();
              }
            }
            if (!qLabel) qLabel = getLabelFor(el) || el.name;
            qLabel = (qLabel || '').slice(0, 240);
            const options = getOptionPairs(el);
            const checkedOpt = options.find(o => {
              const match = Array.from(doc.querySelectorAll(`input[type="${el.type}"][name="${CSS.escape(el.name)}"]`))
                .find(r => r.checked && ((getLabelFor(r) || r.value).trim() === o.label || r.value === o.value));
              return !!match;
            });
            fields.push({
              id: `${prefix}__${el.type}__:${el.name}`,
              kind: el.type, // 'radio' | 'checkbox'
              label: qLabel,
              type: el.type,
              name: el.name,
              currentValue: checkedOpt ? checkedOpt.label : '',
              options,
              required: el.required || el.getAttribute('aria-required') === 'true',
              group: classifyField(qLabel, el.name || '', el.type),
              _frame: prefix,
            });
            return;
          }

          const label = getLabelFor(el);
          if (!label && (!el.name || el.name.length < 2)) return;
          if (SKIP_RE.test(label)) return;

          let kind;
          if (el.tagName === 'SELECT') kind = 'select';
          else if (el.tagName === 'TEXTAREA') kind = 'textarea';
          else if (isTypeahead(el)) kind = 'typeahead';
          else kind = 'text';

          fields.push({
            id: prefix + (el.id || el.name || `f${idx}`),
            kind,
            label: label || `Field ${idx}`,
            type: kind === 'select' ? 'select' : (el.tagName === 'TEXTAREA' ? 'textarea' : (el.type || 'text')),
            name: el.name || '',
            currentValue: isFilled(el) ? (el.value || '') : '',
            options: getOptionPairs(el),
            required: el.required || el.getAttribute('aria-required') === 'true',
            group: classifyField(label, el.name || '', kind),
            _idx: idx,
            _frame: prefix,
          });
        } catch { /* skip a single bad node, keep scanning */ }
      });
    });

    // ── PART A: Detect custom button-style single-choice toggles (Ashby/Jerry/etc.) ──
    try {
      const buttonGroups = scanButtonGroups();
      buttonGroups.forEach(g => fields.push(g));
    } catch { /* never fail the scan */ }

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
      });
    }
    return out;
  }





  // ══════════════════════════════════════════════════════════════════
  // 3. VALUE INJECTION
  // ══════════════════════════════════════════════════════════════════

  function resolveDoc(id, _frame) {
    let doc = document;
    let rawId = id;
    const m = /^frame(\d+):(.*)$/.exec(id || '');
    if (m) {
      const frame = document.querySelectorAll('iframe')[parseInt(m[1],10)];
      try { if (frame?.contentDocument) doc = frame.contentDocument; } catch {}
      rawId = m[2];
    } else if (_frame) {
      const fm = /^frame(\d+):$/.exec(_frame);
      if (fm) {
        const frame = document.querySelectorAll('iframe')[parseInt(fm[1],10)];
        try { if (frame?.contentDocument) doc = frame.contentDocument; } catch {}
      }
    }
    return { doc, rawId };
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
      let exact = null, contains = null;
      for (const el of choices) {
        const txt = norm(safeText(el) || el.getAttribute('aria-label') || '');
        if (!txt) continue;
        const isOption = optionTexts.length === 0
          || optionTexts.some(o => { const on = norm(o); return on === txt || on.includes(txt) || txt.includes(on); });
        if (!isOption) continue;
        if (txt === wantN) { exact = el; break; }
        if (!contains && (txt.includes(wantN) || wantN.includes(txt))) contains = el;
      }
      return exact || contains;
    };

    // 2. Walk UP from the label (up to 7 ancestors). The first ancestor that contains
    // a clickable option whose text matches one of meta.optionTexts is the scope.
    // This works regardless of CSS-module hashed class names.
    let scope = null;
    if (labelEl && optionTexts.length) {
      const wantedSet = optionTexts.map(o => norm(o)).filter(Boolean);
      let node = labelEl.parentElement;
      for (let i = 0; i < 7 && node; i++, node = node.parentElement) {
        const choices = node.querySelectorAll('button, [role="radio"], [role="button"], [role="option"], a, label');
        let found = false;
        for (const b of choices) {
          const txt = norm(safeText(b) || b.getAttribute('aria-label') || '');
          if (!txt) continue;
          if (wantedSet.some(w => w === txt)) { found = true; break; }
        }
        if (found) { scope = node; break; }
      }
    }

    let target = scope ? pickIn(scope) : null;
    if (!target) {
      // Fallback: search whole document but only if a SINGLE match exists (avoid wrong question)
      const all = document.querySelectorAll('button, [role="radio"], [role="button"], [role="option"], a[role="button"]');
      const matches = [];
      for (const el of all) {
        const txt = norm(safeText(el) || el.getAttribute('aria-label') || '');
        if (!txt) continue;
        if (txt === wantN || (txt.includes(wantN) && wantN.length >= 2) || (wantN.includes(txt) && txt.length >= 2)) {
          matches.push(el);
          if (matches.length > 1) break;
        }
      }
      if (matches.length === 1) target = matches[0];
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

  // Main-world click fallback — injects a <script> into the page to run the click
  // outside the extension's isolated world (so React listeners on the page can react).
  function mainWorldClickByText(qLabel, optionText) {
    try {
      const q = JSON.stringify(String(qLabel || '').slice(0, 40));
      const o = JSON.stringify(String(optionText || '').trim());
      const code = `(function(){try{
        var qKey=${q}.trim().toLowerCase();
        var want=${o}.trim().toLowerCase();
        if(!qKey||!want)return;
        var all=document.querySelectorAll('label,legend,p,h2,h3,h4,strong,div,span');
        var labelEl=null;
        for(var i=0;i<all.length;i++){
          var c=all[i];var t=(c.textContent||'').trim().toLowerCase();
          if(!t||t.length>=260)continue;
          if(t.indexOf(qKey)!==-1){labelEl=c;break;}
        }
        if(!labelEl)return;
        var node=labelEl.parentElement;
        for(var j=0;j<7&&node;j++,node=node.parentElement){
          var btns=node.querySelectorAll('button,[role="radio"],[role="button"],[role="option"]');
          for(var k=0;k<btns.length;k++){
            var b=btns[k];var bt=(b.textContent||'').trim().toLowerCase();
            if(bt===want){b.click();return;}
          }
        }
      }catch(e){}})();`;
      const s = document.createElement('script');
      s.textContent = code;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
      return true;
    } catch (e) {
      console.log('[AYN-BG] mainWorld blocked', e && e.message);
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

  async function injectValues(values) {
    let filled = 0;
    const results = [];

    try {
      console.log('[AYN-BG] injecting', values.length, 'values; buttongroups=',
        values.filter(v => /^__buttongroup__:/.test(v.id || '')).length);
    } catch {}

    for (const v of values) {
      const { id, value, optionValue, optionLabel, optionValues, optionLabels, skip, _idx, _frame } = v;
      if (skip) { results.push({ id, ok: false, reason: 'skipped' }); continue; }

      const { doc, rawId } = resolveDoc(id, _frame);


      // Radio/checkbox group ids look like "__radio__:<name>" or "frame0:__checkbox__:<name>"
      const groupMatch = /^(?:frame\d+:)?__(radio|checkbox)__:(.+)$/.exec(id);
      if (groupMatch) {
        const kind = groupMatch[1];
        const name = groupMatch[2];
        const radios = Array.from(doc.querySelectorAll(`input[type="${kind}"][name="${CSS.escape(name)}"]`));
        if (!radios.length) { results.push({ id, ok: false, reason: 'group not found' }); continue; }

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
          const tries = [norm(wantRaw), wantTrue ? 'yes' : 'no'].filter(Boolean);
          let btn = null;
          for (const tnorm of tries) { btn = btns.find(b => norm(safeText(b) || b.getAttribute('aria-label') || '') === tnorm); if (btn) break; }
          const qLabel = getLabelFor(firstInput) || name;
          try { console.log('[AYN-BG] proxy detected; hiddenCheckbox; btnFound=', !!btn, 'want=', wantRaw); } catch {}
          if (btn) {
            const okv = await clickOptionButton(btn, qLabel, norm(safeText(btn)));
            if (okv) { filled++; results.push({ id, ok: true, verified: true }); continue; }
          }
        }

        let any = false;
        targets.forEach(tRaw => {
          const t = norm(tRaw);
          if (!t) return;
          const m = radios.find(r => {
            const lbl = norm(getLabelFor(r) || r.value);
            const val = norm(r.value);
            return lbl === t || val === t || lbl.includes(t) || t.includes(lbl);
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
          // role=radio: set aria-checked manually & unset siblings within scope
          if ((target.getAttribute('role') || '').toLowerCase() === 'radio') {
            try { target.setAttribute('aria-checked', 'true'); } catch {}
            const root = scope || document;
            root.querySelectorAll('[role="radio"]').forEach(r => {
              if (r !== target) { try { r.setAttribute('aria-checked', 'false'); } catch {} }
            });
          }

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

      // Resolve a single element
      let el = (rawId && doc.getElementById(rawId)) || (rawId && doc.querySelector(`[name="${CSS.escape(rawId)}"]`));
      if (!el && _idx != null) {
        const all = doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="image"]):not([type="reset"]), textarea, select');
        el = all[_idx];
      }
      if (!el || el.disabled || el.readOnly) { results.push({ id, ok: false, reason: 'not found or disabled' }); continue; }
      if (isFilled(el) && el.type !== 'radio' && el.type !== 'checkbox') { results.push({ id, ok: false, reason: 'already filled' }); continue; }

      const chosen = optionValue || optionLabel || value;
      if (!chosen || !String(chosen).trim()) { results.push({ id, ok: false, reason: 'no value' }); continue; }

      try {
        if (el.tagName === 'SELECT') {
          const want = norm(chosen);
          const opt = Array.from(el.options).find(o => norm(o.value) === want || norm(o.text) === want)
                   || Array.from(el.options).find(o => norm(o.text).includes(want) || norm(o.value).includes(want));
          if (opt) {
            el.value = opt.value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            filled++; results.push({ id, ok: true });
          } else results.push({ id, ok: false, reason: 'option not found' });
        } else if (el.type === 'radio') {
          const want = norm(chosen);
          const match = Array.from(doc.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`))
            .find(r => { const lbl = norm(getLabelFor(r) || r.value); return lbl === want || lbl.includes(want); });
          if (match) {
            match.checked = true; try { match.click(); } catch {}
            match.dispatchEvent(new Event('change', { bubbles: true }));
            filled++; results.push({ id, ok: true });
          } else results.push({ id, ok: false, reason: 'radio option not matched' });
        } else if (el.type === 'checkbox') {
          const wantTrue = /^(yes|true|1|agree|consent|i agree|checked)$/i.test(String(chosen).trim());
          el.checked = wantTrue;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          filled++; results.push({ id, ok: true });
        } else {
          const isTA = isTypeahead(el);
          el.focus();
          setNativeValue(el, String(chosen));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          if (isTA) {
            // Try to commit a suggestion from an open listbox
            try {
              el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
              setTimeout(() => {
                try {
                  const want = norm(chosen);
                  const lbId = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
                  const root = (lbId && doc.getElementById(lbId)) || doc;
                  const opts = root.querySelectorAll('[role="option"], li[role="option"], [class*="option"]');
                  let pick = null;
                  opts.forEach(o => { if (pick) return; if (norm(safeText(o)).includes(want)) pick = o; });
                  if (pick) pick.click();
                  else el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                } catch {}
              }, 250);
            } catch {}
          }
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          filled++; results.push({ id, ok: true });
        }
      } catch (e) { results.push({ id, ok: false, reason: e.message }); }
    }

    return { filled, total: values.length, results };
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
  // 5. MESSAGE LISTENER
  // ══════════════════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

    if (message.type === 'EXTRACT_JOB_TEXT') {
      sendResponse(extractJobText());
      return true;
    }

    if (message.type === 'DETECT_PAGE') {
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
      const fields = scanFormFields();
      const jobText = extractJobText();
      sendResponse({ fields, fileFields: fields._fileFields || [], jobText, ats: detectATS(), url: window.location.href });
      return true;
    }

    if (message.type === 'INJECT_VALUES') {
      injectValues(message.values).then(sendResponse).catch(e => sendResponse({ filled: 0, total: 0, results: [], error: e.message }));
      return true;
    }

    if (message.type === 'HIGHLIGHT_FIELDS') {
      const all = document.querySelectorAll('input, textarea, select');
      all.forEach((el, idx) => {
        const id = el.id || el.name || `f${idx}`;
        if (message.fieldIds?.includes(id)) {
          el.style.outline = '2px solid #f59e0b';
          el.style.outlineOffset = '2px';
          setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 2500);
        }
      });
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
      sendQuiet({ type: 'FORM_DETECTED', hasForm: true, fieldCount, hasResumeUpload, url });
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
      sendQuiet({
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
