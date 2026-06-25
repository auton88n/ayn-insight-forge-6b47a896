// content.js — AYN Resume Tailor
// Two jobs:
//   1. Extract job description text from job listing pages
//   2. Scan application forms, send fields to AI, inject values back

(function () {

  // ── 1. JOB TEXT EXTRACTION ────────────────────────────────────────────

  function extractJobText() {
    const url = window.location.href;

    const selectors = {
      'linkedin.com/jobs': {
        desc: '.jobs-description__content, .jobs-box__html-content, [class*="description"]',
        title: '.job-details-jobs-unified-top-card__job-title, h1',
      },
      'jobright.ai': {
        desc: '[class*="description"], [class*="job-desc"], main article',
        title: 'h1, [class*="title"]',
      },
      'indeed.com': {
        desc: '#jobDescriptionText, [class*="jobsearch-JobComponent-description"]',
        title: '[class*="jobsearch-JobInfoHeader-title"], h1',
      },
      'greenhouse.io': {
        desc: '#content, .job__description, [class*="description"]',
        title: 'h1',
      },
      'jobs.lever.co': {
        desc: '.section-wrapper, [class*="description"], .posting-requirements',
        title: 'h2, h1',
      },
      'jobs.ashbyhq.com': {
        desc: '[class*="description"], [class*="job-post"]',
        title: 'h1',
      },
      'glassdoor.com': {
        desc: '[class*="jobDescriptionContent"], [class*="desc"]',
        title: '[class*="title"], h1',
      },
      'myworkdayjobs.com': {
        desc: '[data-automation-id="jobPostingDescription"], [class*="description"]',
        title: '[data-automation-id="jobPostingHeader"], h1',
      },
      'smartrecruiters.com': {
        desc: '.job-description, [class*="description"]',
        title: 'h1',
      },
    };

    for (const [host, sel] of Object.entries(selectors)) {
      if (url.includes(host)) {
        const desc = document.querySelector(sel.desc);
        const title = document.querySelector(sel.title);
        return {
          text: desc?.innerText?.trim() || '',
          title: title?.innerText?.trim() || document.title,
        };
      }
    }

    // Generic fallback
    const candidates = Array.from(document.querySelectorAll(
      'article, main, [class*="description"], [class*="job"], [id*="description"], [id*="job"]'
    ));
    const best = candidates.reduce((prev, el) =>
      el.innerText.length > (prev?.innerText?.length || 0) ? el : prev, null);
    return { text: best?.innerText?.trim() || '', title: document.title };
  }

  // ── 2. FORM FIELD SCANNING ─────────────────────────────────────────────

  // Get the best label text for a form element
  function getLabelFor(el) {
    // aria-label
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();

    // <label for="id">
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) return lbl.innerText.trim();
    }

    // Wrapping <label>
    const wrap = el.closest('label');
    if (wrap) return wrap.innerText.replace(el.value || '', '').trim();

    // aria-labelledby
    const lblId = el.getAttribute('aria-labelledby');
    if (lblId) {
      const lblEl = document.getElementById(lblId);
      if (lblEl) return lblEl.innerText.trim();
    }

    // Closest preceding text / legend / heading
    const section = el.closest('fieldset, [class*="field"], [class*="question"], [class*="form-group"], [class*="input-group"], li, div');
    if (section) {
      const heading = section.querySelector('legend, label, [class*="label"], [class*="question"], h3, h4, strong, p');
      if (heading && heading !== el) return heading.innerText.trim();
    }

    // placeholder
    if (el.placeholder) return el.placeholder.trim();

    // name attribute
    if (el.name) return el.name.replace(/[_\-]/g, ' ').trim();

    return '';
  }

  // Get options for select / radio / checkbox groups
  function getOptions(el) {
    if (el.tagName === 'SELECT') {
      return Array.from(el.options)
        .filter(o => o.value)
        .map(o => o.text.trim())
        .slice(0, 20);
    }
    // Radio/checkbox group — find siblings with same name
    if ((el.type === 'radio' || el.type === 'checkbox') && el.name) {
      const siblings = document.querySelectorAll(`input[name="${CSS.escape(el.name)}"]`);
      return Array.from(siblings).map(s => {
        const lbl = getLabelFor(s) || s.value;
        return lbl;
      }).filter(Boolean).slice(0, 15);
    }
    return [];
  }

  // Check if a field is already filled
  function isFilled(el) {
    if (el.tagName === 'SELECT') return el.value && el.value !== '';
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
    return (el.value || '').trim().length > 0;
  }

  // Check if field is relevant to a job application
  function isRelevantField(el, label) {
    // Skip hidden, disabled, submit, button types
    if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' ||
        el.type === 'file' || el.type === 'image' || el.type === 'reset') return false;
    if (el.disabled || el.readOnly) return false;

    // Skip tiny invisible fields
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;

    // Skip if no label and very short name
    if (!label && (!el.name || el.name.length < 2)) return false;

    // Skip CAPTCHA, honeypot, tracking fields
    const skipPatterns = /captcha|honeypot|csrf|token|utm_|_ga|bot|trap/i;
    if (skipPatterns.test(label + el.name + el.id)) return false;

    return true;
  }

  function scanFormFields() {
    const fields = [];
    const seen = new Set(); // deduplicate by name+label

    const inputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="image"]):not([type="reset"]), textarea, select'
    );

    inputs.forEach((el, idx) => {
      const label = getLabelFor(el);
      if (!isRelevantField(el, label)) return;

      // Deduplicate radio groups — only include once
      const dedupeKey = (el.name || '') + '|' + label;
      if ((el.type === 'radio') && seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      const field = {
        id: el.id || el.name || `field_${idx}`,
        label: label || el.placeholder || el.name || `Field ${idx}`,
        type: el.tagName === 'SELECT' ? 'select' : (el.tagName === 'TEXTAREA' ? 'textarea' : el.type || 'text'),
        name: el.name || '',
        currentValue: isFilled(el) ? (el.value || '') : '',
        options: getOptions(el),
        required: el.required || el.getAttribute('aria-required') === 'true',
        // DOM path to find it later for injection
        _selector: el.id ? `#${CSS.escape(el.id)}` :
                   el.name ? `[name="${CSS.escape(el.name)}"]` :
                   null,
        _idx: idx,
      };

      fields.push(field);
    });

    return fields;
  }

  // ── 3. VALUE INJECTION ─────────────────────────────────────────────────

  function injectValues(values) {
    let filled = 0;
    const results = [];

    values.forEach(({ id, value, _idx }) => {
      if (!value || value.trim() === '') return;

      // Find the element
      let el = null;
      if (id && id !== `field_${_idx}`) {
        el = document.getElementById(id) ||
             document.querySelector(`[name="${CSS.escape(id)}"]`);
      }
      if (!el && _idx !== undefined) {
        const allInputs = document.querySelectorAll(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="image"]):not([type="reset"]), textarea, select'
        );
        el = allInputs[_idx];
      }
      if (!el) { results.push({ id, ok: false, reason: 'not found' }); return; }
      if (el.disabled || el.readOnly) { results.push({ id, ok: false, reason: 'disabled' }); return; }

      // Skip already filled (don't overwrite what the user typed)
      if (isFilled(el) && el.type !== 'radio' && el.type !== 'checkbox') {
        results.push({ id, ok: false, reason: 'already filled' });
        return;
      }

      try {
        if (el.tagName === 'SELECT') {
          // Match by value or text
          const opt = Array.from(el.options).find(o =>
            o.text.toLowerCase().includes(value.toLowerCase()) ||
            o.value.toLowerCase() === value.toLowerCase()
          );
          if (opt) {
            el.value = opt.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
            results.push({ id, ok: true });
          } else {
            results.push({ id, ok: false, reason: 'option not found' });
          }
        } else if (el.type === 'radio') {
          const radios = document.querySelectorAll(`input[name="${CSS.escape(el.name)}"]`);
          const match = Array.from(radios).find(r => {
            const lbl = getLabelFor(r) || r.value;
            return lbl.toLowerCase().includes(value.toLowerCase()) ||
                   r.value.toLowerCase() === value.toLowerCase();
          });
          if (match) {
            match.checked = true;
            match.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
            results.push({ id, ok: true });
          } else {
            results.push({ id, ok: false, reason: 'radio option not matched' });
          }
        } else if (el.type === 'checkbox') {
          const shouldCheck = /yes|true|1|agree|consent/i.test(value);
          el.checked = shouldCheck;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          filled++;
          results.push({ id, ok: true });
        } else {
          // Text / textarea / email / tel / number / url / date
          // Use native input value setter to trigger React/Vue/Angular change detection
          const nativeInputSetter = Object.getOwnPropertyDescriptor(
            el.tagName === 'TEXTAREA'
              ? window.HTMLTextAreaElement.prototype
              : window.HTMLInputElement.prototype,
            'value'
          )?.set;
          if (nativeInputSetter) {
            nativeInputSetter.call(el, value);
          } else {
            el.value = value;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          filled++;
          results.push({ id, ok: true });
        }
      } catch (e) {
        results.push({ id, ok: false, reason: e.message });
      }
    });

    return { filled, total: values.length, results };
  }

  // ── 4. MESSAGE LISTENER ───────────────────────────────────────────────

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
      const result = injectValues(message.values);
      sendResponse(result);
      return true;
    }

    if (message.type === 'HIGHLIGHT_FIELDS') {
      // Visually highlight which fields AYN will fill
      const inputs = document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="image"]):not([type="reset"]), textarea, select'
      );
      inputs.forEach((el, idx) => {
        const id = el.id || el.name || `field_${idx}`;
        const match = message.fieldIds?.includes(id);
        if (match) {
          el.style.outline = '2px solid #f59e0b';
          el.style.outlineOffset = '2px';
          setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 3000);
        }
      });
      sendResponse({ ok: true });
      return true;
    }
  });

  // ── 5. AUTO-DETECT JOB PAGES ──────────────────────────────────────────

  const jobPagePatterns = [
    /linkedin\.com\/jobs/,
    /jobright\.ai\/jobs/,
    /indeed\.com\/(viewjob|jobs)/,
    /greenhouse\.io/,
    /jobs\.lever\.co/,
    /ashbyhq\.com/,
    /glassdoor\.com\/job/,
    /workday\.com.*job/,
    /myworkdayjobs\.com/,
    /smartrecruiters\.com/,
    /icims\.com/,
  ];

  if (jobPagePatterns.some(p => p.test(window.location.href))) {
    setTimeout(() => {
      const result = extractJobText();
      if (result.text.length > 100) {
        chrome.runtime.sendMessage({
          type: 'JOB_DETECTED',
          text: result.text,
          title: result.title,
          company: '',
        });
      }
    }, 1500);
  }

})();
