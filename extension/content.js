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
  const AYN_BUILD = '1.9.37';
  const MAX_JD_CHARS = 20000;
  const AYN_VISION_ENABLED = true;

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
    const l = ((stripped || '') + ' ' + (name || '')).toLowerCase();
    if (/middle\s*name/.test(l)) return 'identity.middle_name';
    if (/preferred\s*(first\s*)?name|nick\s*name|name\s+you\s+go\s+by/.test(l)) return 'identity.preferred_name';
    if (/\bfirst\s*name|given\s*name|forename\b/.test(l)) return 'identity.first_name';
    if (/\blast\s*name|surname|family\s*name\b/.test(l)) return 'identity.last_name';
    if (/\bfull\s*name|legal\s*name\b/.test(l) || /^name$/i.test((stripped||'').trim())) return 'identity.full_name';
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
    if (/authoriz(e|ed)\s+to\s+work|work\s+authorization|legally\s+(authorized|allowed|entitled)|right\s+to\s+work/.test(l)) return 'logic.work_auth';
    if (/sponsor|visa|require.*sponsorship/.test(l)) return 'logic.sponsorship';
    if (/relocat/.test(l)) return 'logic.relocate';
    if (/remote|hybrid|on[\s-]?site/.test(l) && type !== 'text') return 'logic.work_mode';
    if (/years?\s+of\s+experience|experience\s+(level|years)|how\s+many\s+years/.test(l)) return 'logic.years_experience';
    if (/highest\s+(degree|education|level)|education\s+level|degree/.test(l) && type !== 'text') return 'logic.education_level';
    // Preferred city (checkbox/radio group of cities) takes precedence over generic preferred_location
    if (/preferred\s+(office|work)?\s*(city|location)|which\s+city.*(work|office)|preferred\s+office\s+location|city\s+.*(prefer|preferred)/.test(l) && (type === 'checkbox' || type === 'radio' || type === 'buttongroup')) return 'logic.preferred_city';
    // Salary min/max detection when label/name signals min|max|from|to and the surrounding context has salary/comp/currency
    if (/(salary|compensation|expectation|\$|€|£|cad|usd)/.test(l) && /\b(min(imum)?|from|à\s*partir|starting|floor|low(er)?)\b/.test(l)) return 'logic.salary_min';
    if (/(salary|compensation|expectation|\$|€|£|cad|usd)/.test(l) && /\b(max(imum)?|to|jusqu|upper|high(er)?|ceiling|top)\b/.test(l)) return 'logic.salary_max';
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
    if (/legal(ly)?\s+(eligible|able|entitled)\s+to\s+work|eligible\s+to\s+work\b|proof\s+of\s+(eligibility|authorization)/.test(l)) return 'logic.work_auth';
    if (/citizen|permanent\s+resident|\bpr\b\s+status|immigration\s+status|status\s+in\s+canada/.test(l)) return 'logic.citizenship';
    if (/\b18\b|over\s+18|at\s+least\s+18|legal\s+working\s+age|age\s+of\s+majority/.test(l)) return 'logic.legal_age';
    if (/security\s+clearance|clearance\s+level|secret\s+clearance/.test(l)) return 'logic.clearance';
    if (/driver'?s?\s+licen[cs]e|valid\s+licen[cs]e/.test(l)) return 'logic.drivers_license';
    if (/willing\s+to\s+travel|able\s+to\s+travel|travel\s+(up\s+to|requirement|percentage|%)/.test(l)) return 'logic.travel';
    // Multi-checkbox languages field (before generic logic.languages)
    if ((type === 'checkbox') && /languages?\s+(you\s+)?(are\s+)?(fluent|speak|proficient|spoken)|which\s+languages?|specify.*languages?|fluent\s+in/.test(l)) return 'logic.languages_multi';
    if (/what\s+languages|languages?\s+(do\s+you|you\s+speak|spoken|proficiency|fluency)|fluent\s+in|bilingual/.test(l)) return 'logic.languages';
    if (/criminal|convicted|felony|background\s+check|drug\s+(test|screen)/.test(l)) return 'logic.background';
    // Company-history specific patterns take precedence over generic prior_relationship
    if (/currently\s+employed\s+by|current\s+employee\s+of|are\s+you\s+.*current(ly)?\s+.*employee/.test(l)) return 'logic.company_current_employee';
    if (/(past|former|previous)\s+.*employee|previously\s+worked\s+(at|for)|ever\s+been\s+an\s+employee/.test(l)) return 'logic.company_past_employee';
    if (/current(ly)?\s+(employed|employee).*(here|us|company)|former\s+employee|previously\s+(employed|worked|applied)|ever\s+(worked|applied)\s+(at|for|here|with\s+us)/.test(l)) return 'logic.prior_relationship';
    if (/non[\s-]?compete|non[\s-]?disclosure|\bnda\b|restrictive\s+covenant/.test(l)) return 'logic.noncompete';
    if (/accommodat/.test(l)) return 'logic.accommodation';
    if (/referr?ed\s+by|referral\s+(name|source)|who\s+referred/.test(l)) return 'open.referral';
    if (/reference|referee/.test(l)) return 'logic.references';
    if (/preferred\s+(location|office)|which\s+(location|office)|work\s+location/.test(l)) return 'logic.preferred_location';
    if (/employment\s+type|full[\s-]?time|part[\s-]?time|contract|desired\s+(employment|job\s+type)/.test(l) && type !== 'text') return 'logic.employment_type';
    if (/subscribe|newsletter|marketing|keep\s+me\s+(updated|informed)|opt[\s-]?in/.test(l)) return 'consent.marketing';
    if (/agree\b|consent|terms|privacy\s+policy|i\s+certify|i\s+acknowledge|i\s+confirm|gdpr|data\s+(processing|protection)/.test(l)) return 'consent.agree';
    if (/describe\s+a\s+time|tell\s+(us|me)\s+about\s+a\s+time|give\s+(an|us\s+an)\s+example|situation\s+where/.test(l)) return 'open.behavioral';
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

  function scanFormFields() {
    const SKIP_TYPES = new Set(['hidden','submit','button','image','reset']);
    const SKIP_RE = /captcha|honeypot|csrf|token|utm_|_ga|bot|trap/i;
    let fields = [];
    const fileFields = [];
    const seenGroupKeys = new Set(); // dedupe radio/checkbox groups by name+frame
    let bgCounter = 0;


    collectScannableDocs().forEach(({ doc, prefix }) => {
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

          // Resolve question (NOT an option label)
          let qLabel = aynGroupName(first);
          let labelSrc = qLabel ? 'accname' : '';
          if (!qLabel) {
            const container = first.closest('fieldset, [role="radiogroup"], [role="group"], [class*="question"], [class*="field"], [class*="form-group"]')
              || (first.parentElement && first.parentElement.parentElement) || first.parentElement;
            if (container) {
              const cands = Array.from(container.querySelectorAll('legend, [class*="question"], [class*="label"], h2, h3, h4, strong, p, span'));
              for (const c of cands) {
                if (radios.some(r => c.contains(r))) continue;
                const t = (c.innerText || '').trim();
                if (!t || t.length > 400) continue;
                if (optionLabelsLC.has(t.toLowerCase())) continue;
                qLabel = t;
                labelSrc = 'legacy';
                break;
              }
            }
          }
          if (!qLabel) { qLabel = getLabelFor(first) || groupName || 'Question'; labelSrc = labelSrc || 'legacy'; }
          qLabel = qLabel.slice(0, 240);

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
            group: classifyField(qLabel, first.name || '', 'radio'),
            accRole: 'radio',
            labelSource: labelSrc || 'legacy',
            _frame: prefix,
          });
        });
      } catch { /* never fail the scan */ }

      // ── PRE-PASS: group CUSTOM (ARIA) radios by enclosing radiogroup/group ──
      const processedCustomRadios = new WeakSet();
      try {
        if (!window.__AYN_CUSTOM_RADIO_MAP__) window.__AYN_CUSTOM_RADIO_MAP__ = new Map();
        const customRadios = Array.from(doc.querySelectorAll('[role="radio"]'))
          .filter(el => el.tagName !== 'INPUT' && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true');
        const byGroup = new Map();
        let anonCIdx = 0;
        customRadios.forEach(el => {
          const g = el.closest('[role="radiogroup"]') || el.closest('[role="group"], fieldset');
          if (!g) return;
          if (!g.__aynCustomGroupKey) g.__aynCustomGroupKey = 'cgrp::' + (++anonCIdx);
          const key = g.__aynCustomGroupKey;
          if (!byGroup.has(key)) byGroup.set(key, { group: g, els: [] });
          byGroup.get(key).els.push(el);
        });
        let cCounter = 0;
        byGroup.forEach(({ group, els }) => {
          if (els.length < 2) return;
          const first = els[0];
          const localIdx = ++cCounter;
          const fieldId = `${prefix}__radio__:custom:${localIdx}`;
          const groupKey = `${prefix}radio:custom:${localIdx}`;
          if (seenGroupKeys.has(groupKey)) { els.forEach(e => processedCustomRadios.add(e)); return; }
          seenGroupKeys.add(groupKey);
          els.forEach(e => processedCustomRadios.add(e));

          const options = els.map(e => {
            const lbl = (aynAccName(e) || aynResolveLabel(e).name || safeText(e) || e.getAttribute('aria-label') || '').trim();
            return { label: lbl, value: e.getAttribute('value') || lbl };
          });
          const optionLabelsLC = new Set(options.map(o => (o.label || '').toLowerCase()).filter(Boolean));

          let qLabel = aynGroupName(first);
          let labelSrc = qLabel ? 'accname' : '';
          if (!qLabel) {
            const container = group.parentElement || group;
            const cands = Array.from(container.querySelectorAll('legend, [class*="question"], [class*="label"], h2, h3, h4, strong, p, span'));
            for (const c of cands) {
              if (els.some(e => c.contains(e))) continue;
              const t = (c.innerText || '').trim();
              if (!t || t.length > 400) continue;
              if (optionLabelsLC.has(t.toLowerCase())) continue;
              qLabel = t;
              labelSrc = 'legacy';
              break;
            }
          }
          if (!qLabel) { qLabel = 'Question'; labelSrc = labelSrc || 'legacy'; }
          qLabel = qLabel.slice(0, 240);

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
            group: classifyField(qLabel, '', 'radio'),
            accRole: 'radio',
            labelSource: labelSrc || 'legacy',
            _frame: prefix,
          });
        });
      } catch { /* never fail the scan */ }

      // ── PRE-PASS: Gem (jobs.gem.com) label-based custom option groups ──
      try {
        if (location.hostname.includes('gem.com')) {
          if (!window.__AYN_GEM_MAP__) window.__AYN_GEM_MAP__ = new Map();
          const allLabels = Array.from(doc.querySelectorAll('label')).filter(l => {
            if (l.querySelector('input, select, textarea, [role="radio"], [role="checkbox"]')) return false;
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
          let gemIdx = 0;
          groups.forEach((labs, container) => {
            if (labs.length < 2) return;
            const gemId = `${prefix}__gem__:${++gemIdx}`;
            const groupKey = `${prefix}gem:${gemIdx}`;
            if (seenGroupKeys.has(groupKey)) return;
            seenGroupKeys.add(groupKey);
            const options = labs.map(l => { const t = (l.innerText || '').trim(); return { label: t, value: t }; });
            const optLC = new Set(options.map(o => o.label.toLowerCase()));
            let qLabel = '';
            let scan = container;
            for (let up = 0; up < 4 && scan && !qLabel; up++) {
              let sib = scan.previousElementSibling; let guard = 0;
              while (sib && guard++ < 6) {
                const t = (sib.innerText || '').trim();
                if (t && t.length <= 300 && !optLC.has(t.toLowerCase()) && !labs.some(l => sib.contains(l))) { qLabel = t.split('\n')[0].trim(); break; }
                sib = sib.previousElementSibling;
              }
              scan = scan.parentElement;
            }
            if (!qLabel) qLabel = 'Question';
            qLabel = qLabel.slice(0, 240);
            window.__AYN_GEM_MAP__.set(gemId, labs);
            fields.push({
              id: gemId, kind: 'radio', label: qLabel, type: 'radio', name: '',
              currentValue: '', options,
              required: /\*|required/i.test((container.innerText || '').slice(0, 300)),
              group: classifyField(qLabel, '', 'radio'), accRole: 'radio', labelSource: 'gem', _frame: prefix,
            });
          });
        }
      } catch { /* never fail the scan */ }

      const elements = Array.from(doc.querySelectorAll('input, textarea, select'));
      elements.forEach((el, idx) => {
        try {
          if (el.disabled) return;
          if (el.type === 'radio' && processedRadios.has(el)) return;
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
                  const __accBG = aynResolveLabel(el);
                  fields.push({
                    id: bgId, kind: 'buttongroup', label: qLabel, type: 'buttongroup', name: el.name,
                    currentValue: '', options: optionTexts.map(t => ({ label: t, value: t })),
                    required: el.required || el.getAttribute('aria-required') === 'true',
                    group: classifyField(qLabel, el.name || '', 'buttongroup'),
                    accRole: __accBG.role || 'buttongroup',
                    labelSource: (__accBG.name && __accBG.name.length >= 2) ? 'accname' : 'legacy',
                    _frame: prefix,
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
            if (!qLabel) {
              const __acc0 = aynResolveLabel(el);
              qLabel = (__acc0.name && __acc0.name.length >= 2) ? __acc0.name : (getLabelFor(el) || el.name);
            }
            qLabel = (qLabel || '').slice(0, 240);
            const options = getOptionPairs(el);
            const checkedOpt = options.find(o => {
              const match = Array.from(doc.querySelectorAll(`input[type="${el.type}"][name="${CSS.escape(el.name)}"]`))
                .find(r => r.checked && ((getLabelFor(r) || r.value).trim() === o.label || r.value === o.value));
              return !!match;
            });
            const __accRC = aynResolveLabel(el);
            const _rcGroup = classifyField(qLabel, el.name || '', el.type);
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
              labelSource: (__accRC.name && __accRC.name.length >= 2) ? 'accname' : 'legacy',
              _frame: prefix,
            });
            return;
          }

          const __accT = aynResolveLabel(el);
          const label = (__accT.name && __accT.name.length >= 2) ? __accT.name : getLabelFor(el);
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
          fields.push({
            id: prefix + (el.id || el.name || `f${idx}`),
            kind,
            label: label || `Field ${idx}`,
            type: kind === 'select' ? 'select' : (el.tagName === 'TEXTAREA' ? 'textarea' : (el.type || 'text')),
            name: el.name || '',
            currentValue: isFilled(el) ? (el.value || '') : '',
            options: getOptionPairs(el),
            required: el.required || el.getAttribute('aria-required') === 'true',
            group: _group,
            accRole: (el.tagName === 'SELECT') ? 'combobox' : (__accT.role || ''),
            labelSource: (__accT.name && __accT.name.length >= 2) ? 'accname' : 'legacy',
            _idx: idx,
            _frame: prefix,
          });
        } catch { /* skip a single bad node, keep scanning */ }
      });

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
        let reIdx = 0;
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
            const label = (__accR.name && __accR.name.length >= 2) ? __accR.name : (getLabelFor(editable) || '');
            if (!label) return;
            if (SKIP_RE.test(label)) return;
            const rid = `${prefix}__richedit__:re${reIdx++}`;
            window.__AYN_RICH_EDITOR_MAP__.set(rid, editable);
            let current = '';
            try { current = (typeof aynReadValue === 'function') ? aynReadValue(editable) : (editable.innerText || ''); } catch {}
            fields.push({
              id: rid,
              kind: 'text',
              label: label.slice(0, 240),
              type: 'text',
              name: '',
              currentValue: current || '',
              options: [],
              required: editable.getAttribute && editable.getAttribute('aria-required') === 'true',
              group: classifyField(label, '', 'text'),
              accRole: 'textbox',
              labelSource: (__accR.name && __accR.name.length >= 2) ? 'accname' : 'legacy',
              richEditor: true,
              richDetector: info.detector,
              _frame: prefix,
            });
          } catch {}
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

  // Main-world click fallback — injects a <script> into the page to run the click
  // outside the extension's isolated world (so React listeners on the page can react).
  function mainWorldClickByText(qLabel, optionText) {
    try {
      const q = JSON.stringify(String(qLabel || '').slice(0, 40));
      const o = JSON.stringify(String(optionText || '').trim());
      const code = `(function(){
        function normOpt(s){
          return String(s||'').toLowerCase()
            .replace(/[\\u2010-\\u2015\\u2212]/g,'-')
            .replace(/[.,;:!?'"()]/g,' ')
            .replace(/\\s+/g,' ').trim();
        }
        function optMatches(a,b){
          a=normOpt(a);b=normOpt(b);
          if(!a||!b)return false;
          if(a===b)return true;
          if(a.length>=3 && b.length>=3 && (a.indexOf(b)!==-1 || b.indexOf(a)!==-1)) return true;
          var wa=a.split(' ').filter(function(w){return w.length>2;});
          var wb=b.split(' ').filter(function(w){return w.length>2;});
          var short=wa, long=new Set(wb);
          if(wa.length>wb.length){short=wb;long=new Set(wa);}
          if(short.length>=3){
            var hits=short.filter(function(w){return long.has(w);}).length;
            if(hits/short.length>=0.8)return true;
          }
          return false;
        }
        try{
          var qKey=${q}.trim().toLowerCase();
          var wantRaw=${o};
          if(!qKey||!wantRaw)return;
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
              var b=btns[k];var bt=(b.textContent||'').trim();
              if(optMatches(bt,wantRaw)){b.click();return;}
            }
          }
        }catch(e){}
      })();`;
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

  // ───── Phase 2: verify-and-retry executor ─────
  const aynSleep = (ms) => new Promise(r => setTimeout(r, ms));

  function aynSetNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
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
    const matches = () => { const c = aynReadValue(el); return c === want || (want.length > 12 && c.includes(want.slice(0, Math.min(30, want.length)))); };

    // contenteditable: native .value is useless — use execCommand/paste directly
    if (el.isContentEditable) {
      await aynInsertViaExec(el, value);
      if (matches()) return { ok: true, verified: true };
      await aynInsertViaPaste(el, value);
      return { ok: matches(), verified: matches(), reason: matches() ? '' : 'contenteditable rejected' };
    }

    // real input/textarea
    el.focus();
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

    return { ok: false, verified: false, reason: 'value did not stick (all methods)' };
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
    el.focus();
    el.click();
    aynSetNativeValue(el, value);
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: value.slice(-1) }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value.slice(-1) }));
    let optionEls = [];
    for (let i = 0; i < 8; i++) {
      await aynSleep(150);
      optionEls = Array.from(document.querySelectorAll('[role="option"], [role="listbox"] li, [class*="option"], [class*="menu"] li, [id*="option"]'))
        .filter(o => o.offsetParent !== null && nrm(o.textContent).length);
      if (optionEls.length) break;
    }
    if (optionEls.length) {
      const want = value;
      const match = optionEls.find(o => aynOptionMatches(o.textContent, want));
      const pick = match || optionEls[0];

      if (pick) {
        try { pick.scrollIntoView({ block: 'nearest' }); } catch {}
        pick.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        pick.click();
        await aynSleep(60);
        return { ok: true, verified: true, picked: nrm(pick.textContent) };
      }
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

    for (const v of values) {
      const { id, value, optionValue, optionLabel, optionValues, optionLabels, skip, _idx, _frame } = v;
      if (skip) { results.push({ id, ok: false, reason: 'skipped' }); continue; }

      const { doc, rawId } = resolveDoc(id, _frame);

      // Gem (jobs.gem.com) label-based custom group click
      if (id.includes('__gem__:')) {
        const targets = [optionLabel || optionValue || value].filter(Boolean);
        const labs = (window.__AYN_GEM_MAP__ && window.__AYN_GEM_MAP__.get(id)) || null;
        if (!labs || !labs.length) { results.push({ id, ok: false, reason: 'gem group not found' }); continue; }
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
        results.push({ id, ok: landed, verified: landed, reason: landed ? 'gem-click' : 'gem-click-unverified' });
        if (landed) filled++;
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
            const okv = await clickOptionButton(btn, qLabel, norm(safeText(btn)));
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
              if (!verified) {
                // Manually set aria-checked and unset siblings (last-resort)
                try {
                  target.setAttribute('aria-checked', 'true');
                  customEls.forEach(e => { if (e !== target) { try { e.setAttribute('aria-checked', 'false'); } catch {} } });
                  verified = true;
                } catch {}
              }
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
        const aiVal = { value: chosen, optionLabel, optionValue };
        const field = { kind: el.tagName === 'SELECT' ? 'select' : (el.type || '').toLowerCase(), accRole: (el.getAttribute && el.getAttribute('role')) || '' };
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
        const out = { id, ok: !!res.ok };
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
        results.push({ id: 'visiondiag', ok: (vdiag.clicks > 0), reason: JSON.stringify(vdiag).slice(0, 300) });
        if (injectResult) injectResult.results = results;
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
        if (landed && injectResult && typeof injectResult.filled === 'number') {
          injectResult.filled += 1;
        }
      }
      if (injectResult) injectResult.results = results;
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
      let scanDiag = [];
      try { scanDiag = aynScanDiag(); } catch (_) { scanDiag = []; }
      sendResponse({ fields, fileFields: fields._fileFields || [], jobText, ats: detectATS(), url: window.location.href, scanDiag });
      return true;
    }

    if (message.type === 'INJECT_VALUES') {
      (async () => {
        let injectResult;
        try {
          injectResult = await injectValues(message.values);
        } catch (e) {
          sendResponse({ filled: 0, total: 0, results: [], error: e.message });
          return;
        }
        try {
          if (AYN_VISION_ENABLED) {
            await aynRunVisionFallback(injectResult);
          }
        } catch (_) { /* swallow — never break normal fill */ }
        sendResponse(injectResult);
      })();
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
