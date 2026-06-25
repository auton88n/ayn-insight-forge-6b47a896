// content.js — AYN Resume Tailor
// Handles: job text extraction, form scanning, value injection,
//          job card scoring on search pages, role suggestions

(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════
  // 1. JOB TEXT EXTRACTION
  // ══════════════════════════════════════════════════════════════════

  function extractJobText() {
    const url = window.location.href;

    const map = {
      'linkedin.com/jobs/view': {
        desc: '.jobs-description__content, .jobs-box__html-content, [class*="description__content"]',
        title: '.job-details-jobs-unified-top-card__job-title, h1',
        company: '.job-details-jobs-unified-top-card__company-name, [class*="company-name"]',
      },
      'indeed.com/viewjob': {
        desc: '#jobDescriptionText, [class*="jobsearch-JobComponent-description"]',
        title: '[class*="jobsearch-JobInfoHeader-title"], h1',
        company: '[class*="jobsearch-CompanyInfoContainer"], [data-testid="inlineHeader-companyName"]',
      },
      'ca.indeed.com/viewjob': {
        desc: '#jobDescriptionText',
        title: 'h1',
        company: '[data-testid="inlineHeader-companyName"]',
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

    for (const [pattern, sel] of Object.entries(map)) {
      if (url.includes(pattern)) {
        const desc = document.querySelector(sel.desc);
        const title = document.querySelector(sel.title);
        const company = document.querySelector(sel.company);
        return {
          text: desc?.innerText?.trim() || '',
          title: title?.innerText?.trim() || document.title,
          company: company?.innerText?.trim() || '',
        };
      }
    }

    // Generic fallback
    const candidates = Array.from(document.querySelectorAll(
      'article, main, [class*="description"], [class*="job"], [id*="description"]'
    ));
    const best = candidates.reduce((p, el) => el.innerText.length > (p?.innerText?.length || 0) ? el : p, null);
    return { text: best?.innerText?.trim() || '', title: document.title, company: '' };
  }

  // ══════════════════════════════════════════════════════════════════
  // 2. FORM SCANNING
  // ══════════════════════════════════════════════════════════════════

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
    const section = el.closest('fieldset, [class*="field"], [class*="question"], [class*="form-group"], li, div');
    if (section) {
      const h = section.querySelector('legend, label, [class*="label"], [class*="question"], h3, h4, strong');
      if (h && !h.contains(el)) return h.innerText.trim();
    }
    return el.placeholder?.trim() || el.name?.replace(/[_\-]/g, ' ').trim() || '';
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

  function scanFormFields() {
    const SKIP_TYPES = new Set(['hidden','submit','button','file','image','reset','search']);
    const SKIP_RE = /captcha|honeypot|csrf|token|utm_|_ga|bot|trap/i;
    const fields = [];
    const seenNames = new Set();

    document.querySelectorAll('input, textarea, select').forEach((el, idx) => {
      if (SKIP_TYPES.has(el.type)) return;
      if (el.disabled) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const label = getLabelFor(el);
      const key = (el.name || '') + '|' + label;
      if (el.type === 'radio' && seenNames.has(key)) return;
      seenNames.add(key);
      if (SKIP_RE.test(label + (el.name||'') + (el.id||''))) return;
      if (!label && (!el.name || el.name.length < 2)) return;

      fields.push({
        id: el.id || el.name || `f${idx}`,
        label: label || `Field ${idx}`,
        type: el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : (el.type || 'text'),
        name: el.name || '',
        currentValue: isFilled(el) ? (el.value || '') : '',
        options: getOptions(el),
        required: el.required || el.getAttribute('aria-required') === 'true',
        _idx: idx,
      });
    });
    return fields;
  }

  // ══════════════════════════════════════════════════════════════════
  // 3. VALUE INJECTION
  // ══════════════════════════════════════════════════════════════════

  function injectValues(values) {
    let filled = 0;
    const results = [];

    values.forEach(({ id, value, _idx }) => {
      if (!value || !value.trim()) return;

      let el = document.getElementById(id) || document.querySelector(`[name="${CSS.escape(id)}"]`);
      if (!el && _idx != null) {
        const all = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="image"]):not([type="reset"]), textarea, select');
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

  function getJobCardSelectors() {
    const url = window.location.href;
    if (url.includes('linkedin.com')) {
      return {
        cards: '.job-card-container, .jobs-search-results__list-item, [class*="job-card"]',
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
    // Remove existing badge
    card.querySelector(`.${AYN_BADGE_CLASS}`)?.remove();

    const color = score >= 8 ? '#22c55e' : score >= 6 ? '#f59e0b' : score >= 4 ? '#94a3b8' : '#ef4444';
    const bg = score >= 8 ? 'rgba(34,197,94,0.12)' : score >= 6 ? 'rgba(245,158,11,0.12)' : score >= 4 ? 'rgba(148,163,184,0.10)' : 'rgba(239,68,68,0.10)';

    const badge = document.createElement('div');
    badge.className = AYN_BADGE_CLASS;
    badge.style.cssText = `
      display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 8px; border-radius: 999px;
      background: ${bg}; border: 1px solid ${color}40;
      font-size: 11px; font-family: -apple-system, system-ui, sans-serif;
      font-weight: 600; color: ${color}; line-height: 1.4;
      cursor: pointer; margin: 4px 0; white-space: nowrap;
      user-select: none; z-index: 100; position: relative;
    `;
    const salaryStr = salaryEstimate ? ` · ${salaryEstimate}` : '';
    badge.innerHTML = `
      <span style="width:7px;height:7px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>
      <span>AYN ${score}/10</span>
      <span style="font-weight:400;opacity:0.8">${matchLabel}${salaryStr}</span>
    `;

    // Tooltip with reasons
    if (reasons && reasons.length) {
      const tip = document.createElement('div');
      tip.style.cssText = `
        position: absolute; top: 100%; left: 0; z-index: 9999;
        background: #0a0a0f; border: 1px solid #272730;
        border-radius: 6px; padding: 7px 10px;
        font-size: 11px; color: #eeeef5; min-width: 160px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.5);
        display: none; margin-top: 4px;
        font-weight: 400;
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

  async function scoreCard(card) {
    const data = extractCardData(card);
    if (!data || !data.title) return;

    const key = `${data.title}|${data.company}`;
    if (scoreCache.has(key)) {
      const cached = scoreCache.get(key);
      injectScoreBadge(card, cached.score, cached.matchLabel, cached.reasons, cached.salaryEstimate);
      return;
    }

    // Show loading badge
    const loadBadge = document.createElement('div');
    loadBadge.className = AYN_BADGE_CLASS;
    loadBadge.style.cssText = `
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 8px; border-radius: 999px;
      background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.3);
      font-size: 11px; color: #818cf8; margin: 4px 0;
    `;
    loadBadge.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:#6366f1;display:inline-block"></span> AYN...`;
    const sel = getJobCardSelectors();
    const target = sel ? (card.querySelector(sel.inject) || card) : card;
    target.insertAdjacentElement('afterend', loadBadge);

    // Ask sidepanel to score (it has auth)
    chrome.runtime.sendMessage({
      type: 'SCORE_JOB_CARD',
      jobTitle: data.title,
      company: data.company,
      jobSnippet: data.snippet,
      key,
    }, response => {
      loadBadge.remove();
      if (chrome.runtime.lastError || !response?.score) return;
      scoreCache.set(key, response);
      injectScoreBadge(card, response.score, response.matchLabel, response.reasons, response.salaryEstimate);
    });
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
  // 5. MESSAGE LISTENER
  // ══════════════════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

    if (message.type === 'EXTRACT_JOB_TEXT') {
      sendResponse(extractJobText());
      return true;
    }

    if (message.type === 'SCAN_FORM') {
      const fields = scanFormFields();
      const jobText = extractJobText();
      sendResponse({ fields, jobText });
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
  });

  // ══════════════════════════════════════════════════════════════════
  // 6. AUTO-DETECT JOB PAGES
  // ══════════════════════════════════════════════════════════════════

  const JOB_PAGE_RE = /linkedin\.com\/jobs\/(view|search)|indeed\.com\/(viewjob|jobs)|ca\.indeed\.com\/(viewjob|jobs)|greenhouse\.io|jobs\.lever\.co|ashbyhq\.com|glassdoor\.com\/job|myworkdayjobs\.com|smartrecruiters\.com|jobright\.ai\/jobs/;

  if (JOB_PAGE_RE.test(window.location.href)) {
    setTimeout(() => {
      const result = extractJobText();
      if (result.text.length > 100) {
        chrome.runtime.sendMessage({
          type: 'JOB_DETECTED',
          text: result.text,
          title: result.title,
          company: result.company || '',
        });
      }
    }, 1500);
  }

})();
