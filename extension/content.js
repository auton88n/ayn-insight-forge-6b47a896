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
  const AYN_BUILD = '1.5.2';
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

  function extractJobText() {
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
        desc: '.jobs-description__content, .jobs-box__html-content, [class*="description__content"], [class*="jobs-description"]',
        title: '.job-details-jobs-unified-top-card__job-title, h1',
        company: '.job-details-jobs-unified-top-card__company-name, [class*="company-name"]',
      };
      const liDesc = combinedText(liSel.desc);
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
    if (/why\s+(this|do you want|are you interested|are you applying|.*role|.*company|.*position)/.test(l)) return 'open.why';
    if (/cover\s+letter|message\s+to\s+(hiring|recruiter)/.test(l)) return 'open.cover';
    if (/heard.*about|where.*find|how.*hear|source/.test(l)) return 'open.source';
    return 'other';
  }


  function getOptions(el) {
    if (el.tagName === 'SELECT') {
      return Array.from(el.options).filter(o => o.value).map(o => o.text.trim()).slice(0, 20);
    }
    if ((el.type === 'radio' || el.type === 'checkbox') && el.name) {
      return Array.from(document.querySelectorAll(`input[name="${CSS.escape(el.name)}"]`))
        .map(s => getLabelFor(s) || s.value).filter(Boolean).slice(0, 15);
    }
    return [];
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
    const SKIP_TYPES = new Set(['hidden','submit','button','file','image','reset','search']);
    const SKIP_RE = /captcha|honeypot|csrf|token|utm_|_ga|bot|trap/i;
    const fields = [];
    const fileFields = [];
    const seenNames = new Set();

    collectScannableDocs().forEach(({ doc, prefix }) => {
      doc.querySelectorAll('input, textarea, select').forEach((el, idx) => {
        try {
        if (el.disabled) return;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0 && el.type !== 'file') return;
        const label = getLabelFor(el);

        if (el.type === 'file') {
          const lbl = (label || el.name || '').toLowerCase();
          const accept = (el.accept || '').toLowerCase();
          const isResume = /resume|cv|curriculum/.test(lbl) || /\.pdf|\.docx?|\.rtf/.test(accept);
          fileFields.push({ label: label || el.name || 'File upload', isResume, accept: el.accept || '' });
          return;
        }

        if (SKIP_TYPES.has(el.type)) return;
        const key = prefix + (el.name || '') + '|' + label;
        if (el.type === 'radio' && seenNames.has(key)) return;
        seenNames.add(key);
        if (SKIP_RE.test(label + (el.name||'') + (el.id||''))) return;
        if (!label && (!el.name || el.name.length < 2)) return;

        const ftype = el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : (el.type || 'text');
        fields.push({
          id: prefix + (el.id || el.name || `f${idx}`),
          label: label || `Field ${idx}`,
          type: ftype,
          name: el.name || '',
          currentValue: isFilled(el) ? (el.value || '') : '',
          options: getOptions(el),
          required: el.required || el.getAttribute('aria-required') === 'true',
          group: classifyField(label, el.name || '', ftype),
          _idx: idx,
          _frame: prefix,
        });
        } catch { /* skip a single bad node, keep scanning */ }
      });
    });
    fields._fileFields = fileFields;
    return fields;
  }


  // ══════════════════════════════════════════════════════════════════
  // 3. VALUE INJECTION
  // ══════════════════════════════════════════════════════════════════

  function injectValues(values) {
    let filled = 0;
    const results = [];

    values.forEach(({ id, value, _idx, _frame }) => {
      if (!value || !value.trim()) return;

      // Resolve doc: top-level or iframe
      let doc = document;
      let rawId = id;
      const m = /^frame(\d+):(.*)$/.exec(id);
      if (m) {
        const frame = document.querySelectorAll('iframe')[parseInt(m[1],10)];
        try { if (frame?.contentDocument) doc = frame.contentDocument; } catch { /* ignore */ }
        rawId = m[2];
      } else if (_frame) {
        const fm = /^frame(\d+):$/.exec(_frame);
        if (fm) {
          const frame = document.querySelectorAll('iframe')[parseInt(fm[1],10)];
          try { if (frame?.contentDocument) doc = frame.contentDocument; } catch { /* ignore */ }
        }
      }

      let el = (rawId && doc.getElementById(rawId)) || (rawId && doc.querySelector(`[name="${CSS.escape(rawId)}"]`));
      if (!el && _idx != null) {
        const all = doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="image"]):not([type="reset"]), textarea, select');
        el = all[_idx];
      }

      if (!el || el.disabled || el.readOnly) { results.push({ id, ok: false, reason: 'not found or disabled' }); return; }
      if (isFilled(el) && el.type !== 'radio' && el.type !== 'checkbox') { results.push({ id, ok: false, reason: 'already filled' }); return; }

      try {
        if (el.tagName === 'SELECT') {
          const opt = Array.from(el.options).find(o =>
            o.text.toLowerCase().includes(value.toLowerCase()) || o.value.toLowerCase() === value.toLowerCase()
          );
          if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); filled++; results.push({ id, ok: true }); }
          else results.push({ id, ok: false, reason: 'option not found' });
        } else if (el.type === 'radio') {
          const match = Array.from(document.querySelectorAll(`input[name="${CSS.escape(el.name)}"]`)).find(r =>
            (getLabelFor(r) || r.value).toLowerCase().includes(value.toLowerCase())
          );
          if (match) { match.checked = true; match.dispatchEvent(new Event('change', { bubbles: true })); filled++; results.push({ id, ok: true }); }
          else results.push({ id, ok: false, reason: 'radio option not matched' });
        } else if (el.type === 'checkbox') {
          el.checked = /yes|true|1|agree|consent/i.test(value);
          el.dispatchEvent(new Event('change', { bubbles: true })); filled++; results.push({ id, ok: true });
        } else {
          const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (setter) setter.call(el, value); else el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          filled++; results.push({ id, ok: true });
        }
      } catch (e) { results.push({ id, ok: false, reason: e.message }); }
    });

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
      sendResponse(injectValues(message.values));
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

  // Try to detect & report the current job with retry, because SPA content
  // typically renders AFTER the URL changes.
  let _lastDetectedUrl = '';
  function detectAndReport(attempt = 0) {
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
