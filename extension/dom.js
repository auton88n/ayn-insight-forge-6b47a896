// dom.js — AYN v2.0.0 DOM intelligence module.
// One brain for question resolution and option-group coverage. Loaded before
// content.js in every frame. Attaches self.AYN_DOM.
//
// Why this module exists (v2.0 architecture):
//   1. Question labels were resolved per group with only that group's own
//      option texts excluded, so option text from NEIGHBOR groups (a phone
//      country selector's "US", another question's answers) could win as the
//      "label". AYN_DOM builds a page-global option-text index once per scan
//      and excludes ALL of it everywhere.
//   2. Distant page headings ("Ready to apply?") outscored the real adjacent
//      question ("Gender") because scoring was flat. AYN_DOM applies proximity
//      decay: text next to the group beats text far from it.
//   3. Scan coverage had no guarantee: whatever the grouping passes dropped
//      was silently gone (Veteran Status, Disability Status on Gem).
//      AYN_DOM.coverageScan sweeps leftover radios into groups and emits a
//      diagnostic record that rides scanDiag into telemetry, so any remaining
//      miss shows us its own DOM.
(function () {
  'use strict';
  if (self.AYN_DOM) return;

  const normLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  function textOf(el) {
    try { return (el.innerText != null ? el.innerText : el.textContent) || ''; } catch (_) { return ''; }
  }

  // Visible-ish: the atom itself is laid out, OR its label/wrapper is.
  // Custom radio patterns hide the native input and style a sibling, which
  // made offsetParent-only filters drop real questions.
  function visibleish(el) {
    try {
      if (!el) return false;
      if (el.offsetParent !== null) return true;
      if (el.getClientRects && el.getClientRects().length > 0) return true;
      const lab = el.closest && el.closest('label');
      if (lab && (lab.offsetParent !== null || (lab.getClientRects && lab.getClientRects().length > 0))) return true;
      const p = el.parentElement;
      if (p && p.offsetParent !== null) {
        const r = p.getBoundingClientRect();
        if (r.width > 1 && r.height > 1) return true;
      }
      return false;
    } catch (_) { return false; }
  }

  function optionAtomLabel(el) {
    try {
      const lab = (el.closest && el.closest('label')) || el.parentElement;
      const t = normLine(lab ? textOf(lab) : textOf(el)) || normLine(el.getAttribute && el.getAttribute('aria-label'));
      return t;
    } catch (_) { return ''; }
  }

  // ── Page-global option-text index ──────────────────────────────────
  // Every text that IS an answer option anywhere on the page. A question
  // label must never be one of these.
  function buildOptionIndex(doc) {
    const idx = new Set();
    const add = (t) => { const n = normLine(t).toLowerCase(); if (n && n.length <= 80) idx.add(n); };
    try {
      const atoms = doc.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], [role="option"]');
      atoms.forEach(a => {
        add(optionAtomLabel(a));
        try { if (a.value && a.value !== 'on') add(a.value); } catch (_) {}
      });
      // Short option-style labels not wrapping an input (label-group pattern).
      doc.querySelectorAll('label').forEach(l => {
        const t = normLine(textOf(l));
        if (t && t.length <= 60 && !t.includes('?')) add(t);
      });
      // Native select options.
      doc.querySelectorAll('select option').forEach(o => add(o.label || o.textContent));
    } catch (_) {}
    return idx;
  }

  let __scanSeq = 0;
  function beginScan(doc) {
    __scanSeq += 1;
    const idx = buildOptionIndex(doc || document);
    try { self.__AYN_OPT_IDX__ = { seq: __scanSeq, idx }; } catch (_) {}
    return idx;
  }
  function currentOptionIndex() {
    try { return (self.__AYN_OPT_IDX__ && self.__AYN_OPT_IDX__.idx) || null; } catch (_) { return null; }
  }

  function optionTextSet(optionsOrEls) {
    const set = new Set();
    try {
      (optionsOrEls || []).forEach(o => {
        let t = '';
        if (typeof o === 'string') t = o;
        else if (o && typeof o.label === 'string') t = o.label;
        else if (o && o.nodeType === 1) t = textOf(o) || (o.getAttribute && o.getAttribute('aria-label')) || '';
        t = normLine(t).toLowerCase();
        if (t) set.add(t);
      });
    } catch (_) {}
    return set;
  }

  function badQuestionLine(line, optTexts, globalIdx) {
    const t = normLine(line);
    const l = t.toLowerCase();
    if (!t || t.length < 2 || t.length > 180) return true;
    if (/^(question|select one|choose one|required|optional)$/i.test(t)) return true;
    if (/^(what\s+(is|are|do|does)\b|please\s+(select|choose|note)|for\s+(the\s+)?purpose|this\s+(question|section)|for\s+more\s+information|see\s+(below|above)|note[:\s]|learn more|description[:\s])/i.test(t)) return true;
    if (/^(asian|black|hispanic|latino|white|male|female|non[- ]?binary|decline to self|prefer not|yes|no|oui|non|i identify as|i am not a|i do not wish)/i.test(t)) return true;
    if (optTexts && optTexts.has(l)) return true;
    // v2.0.0 — page-global exclusion: an option text ANYWHERE on the page can
    // never be a question label (kills phone-country "US", neighbor answers).
    if (globalIdx && globalIdx.has(l)) return true;
    if (optTexts) {
      let hits = 0;
      optTexts.forEach(o => { if (o && l.includes(o)) hits++; });
      if (hits >= 2) return true;
    }
    return false;
  }

  function scoreCandidate(el, text, optTexts, anchor, globalIdx) {
    const t = normLine(text);
    if (badQuestionLine(t, optTexts, globalIdx)) return -1;
    const tag = (el && el.tagName || '').toLowerCase();
    const cls = String((el && el.className) || '');
    const role = String((el && el.getAttribute && el.getAttribute('role')) || '').toLowerCase();
    let score = 10;
    if (/^(legend|h1|h2|h3|h4|h5)$/.test(tag) || role === 'heading') score += 60;
    if (tag === 'label' || tag === 'strong') score += 38;
    if (/question|label|title|heading|field/i.test(cls)) score += 30;
    if (/\b(disability|veteran|gender|race|ethnic|self[- ]?identif|pronoun|authorization|sponsor|reside|relocat)/i.test(t)) score += 35;
    if (/[?]$/.test(t)) score += 8;
    try {
      if (anchor && el && el.compareDocumentPosition) {
        const pos = el.compareDocumentPosition(anchor);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) score += 12;
      }
    } catch (_) {}
    if (t.length <= 45) score += 10;
    if (t.length > 110) score -= 20;
    return score;
  }

  function collectLines(el, optTexts, anchor, out, globalIdx, bonus) {
    if (!el || !out) return;
    const b = typeof bonus === 'number' ? bonus : 0;
    try {
      const candidates = [];
      if (el.matches && el.matches('legend, label, h1, h2, h3, h4, h5, strong, [role="heading"], [class*="question" i], [class*="label" i], [class*="title" i], [class*="heading" i]')) candidates.push(el);
      if (el.querySelectorAll) candidates.push(...Array.from(el.querySelectorAll('legend, label, h1, h2, h3, h4, h5, strong, [role="heading"], [class*="question" i], [class*="label" i], [class*="title" i], [class*="heading" i]')).slice(0, 20));
      for (const c of candidates) {
        if (!c || (anchor && c.contains && c.contains(anchor))) continue;
        if (c.querySelector && c.querySelector('input:not([type="hidden"]), textarea, select, [role="radio"], [role="checkbox"]')) continue;
        const raw = textOf(c) || (c.getAttribute && c.getAttribute('aria-label')) || '';
        const lines = String(raw).split(/[\n\r]+/).map(normLine).filter(Boolean);
        for (const line of lines.slice(0, 4)) {
          const score = scoreCandidate(c, line, optTexts, anchor, globalIdx);
          if (score >= 0) out.push({ text: line, score: score + b, source: 'heading' });
        }
      }
      const rawLines = String(textOf(el) || '').split(/[\n\r]+/).map(normLine).filter(Boolean).slice(0, 10);
      for (const line of rawLines) {
        const score = scoreCandidate(el, line, optTexts, anchor, globalIdx);
        if (score >= 0) out.push({ text: line, score: score - 12 + b, source: 'text-line' });
      }
    } catch (_) {}
  }

  // ── Question resolution with proximity decay ───────────────────────
  // Adjacent text must beat distant page headings. Bonuses:
  //   direct child of the group container:        +50
  //   preceding sibling at ancestor depth d:      +50 - d*10 - sibIdx*3
  //   plain ancestor sweep at depth d:            -d*8
  function findQuestion(container, optionsOrEls, fallbackEl, doc) {
    const anchor = fallbackEl || container;
    const optTexts = optionTextSet(optionsOrEls);
    const globalIdx = currentOptionIndex() || buildOptionIndex(doc || (container && container.ownerDocument) || document);
    // v2.2.0 — Priority 0: aria-labelledby on the group container or any atom.
    // Ashby/Super gender/race groups label the question with an aria-labelledby
    // pointer, not adjacent DOM text. This branch wins before proximity scoring.
    try {
      const d = (doc || (container && container.ownerDocument) || document);
      const candSources = [];
      if (container && container.getAttribute) candSources.push(container.getAttribute('aria-labelledby'));
      if (fallbackEl && fallbackEl.getAttribute) candSources.push(fallbackEl.getAttribute('aria-labelledby'));
      const ids = new Set();
      candSources.filter(Boolean).forEach(s => String(s).split(/\s+/).forEach(id => id && ids.add(id)));
      for (const id of ids) {
        const ref = d.getElementById(id);
        if (!ref) continue;
        const t = normLine(textOf(ref));
        if (t && !badQuestionLine(t, optTexts, globalIdx)) {
          return { label: t.slice(0, 240), source: 'aria-labelledby' };
        }
      }
    } catch (_) {}
    const cands = [];
    try {
      const direct = container && container.querySelector && container.querySelector(':scope > legend, :scope > label, :scope > [role="heading"], :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > strong');
      if (direct && !(anchor && direct.contains(anchor))) collectLines(direct, optTexts, anchor, cands, globalIdx, 50);
    } catch (_) {}
    try {
      let node = container;
      for (let d = 0; d < 7 && node; d++, node = node.parentElement) {
        let sib = node.previousElementSibling;
        for (let guard = 0; sib && guard < 8; guard++, sib = sib.previousElementSibling) {
          if (sib.querySelector && sib.querySelector('input:not([type="hidden"]), textarea, select, [role="radio"], [role="checkbox"]')) continue;
          collectLines(sib, optTexts, anchor, cands, globalIdx, Math.max(-10, 50 - d * 10 - guard * 3));
        }
      }
    } catch (_) {}
    try {
      let node = container;
      for (let d = 0; d < 7 && node; d++, node = node.parentElement) {
        collectLines(node, optTexts, anchor, cands, globalIdx, -(d * 8));
      }
    } catch (_) {}
    if (!cands.length) return { label: '', source: '' };
    const seen = new Set();
    const best = cands
      .filter(c => { const k = c.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => b.score - a.score)[0];
    return { label: best ? best.text.slice(0, 240) : '', source: best ? best.source : '' };
  }

  // ── Coverage sweep ──────────────────────────────────────────────────
  // After all grouping passes: every radio atom that no pass claimed gets
  // grouped here. Nothing visible is allowed to fall off the scan silently.
  function coverageScan(doc, usedNative, usedCustom) {
    const out = { nativeGroups: [], customGroups: [], diag: { atoms: 0, claimed: 0, swept: 0, singles: 0, samples: [] } };
    try {
      const claimedN = usedNative || { has: () => false };
      const claimedC = usedCustom || { has: () => false };
      const natives = Array.from(doc.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled);
      const customs = Array.from(doc.querySelectorAll('[role="radio"]')).filter(e => e.tagName !== 'INPUT' && !e.hasAttribute('disabled') && e.getAttribute('aria-disabled') !== 'true');
      out.diag.atoms = natives.length + customs.length;

      const leftoverN = natives.filter(r => !claimedN.has(r) && visibleish(r));
      const leftoverC = customs.filter(e => !claimedC.has(e) && visibleish(e));
      out.diag.claimed = out.diag.atoms - leftoverN.length - leftoverC.length;

      const groupLeftovers = (atoms) => {
        const set = new Set(atoms);
        const containerOf = (a) => {
          let node = a.parentElement;
          for (let d = 0; d < 12 && node; d++, node = node.parentElement) {
            let cnt = 0;
            for (const b of set) { if (node.contains(b)) cnt++; if (cnt >= 2) break; }
            if (cnt >= 2) return node;
          }
          return null;
        };
        const groups = new Map();
        const singles = [];
        atoms.forEach(a => {
          const c = containerOf(a);
          if (!c) { singles.push(a); return; }
          if (!groups.has(c)) groups.set(c, []);
          groups.get(c).push(a);
        });
        return { groups, singles };
      };

      const gn = groupLeftovers(leftoverN);
      gn.groups.forEach((radios, container) => {
        if (radios.length >= 2) { out.nativeGroups.push({ container, radios }); out.diag.swept += radios.length; }
      });
      const gc = groupLeftovers(leftoverC);
      gc.groups.forEach((els, container) => {
        if (els.length >= 2) { out.customGroups.push({ container, els }); out.diag.swept += els.length; }
      });
      out.diag.singles = gn.singles.length + gc.singles.length;

      // Diagnostics for anything still unexplained: a trimmed DOM sample of up
      // to 2 leftover atoms' surroundings rides scanDiag into telemetry, so a
      // future miss debugs itself on the next run.
      const sampleFrom = [...gn.singles, ...gc.singles].slice(0, 2);
      sampleFrom.forEach(a => {
        try {
          const p = a.parentElement && a.parentElement.parentElement ? a.parentElement.parentElement : a.parentElement;
          let html = (p && p.outerHTML) ? p.outerHTML : (a.outerHTML || '');
          html = String(html).replace(/\s+/g, ' ').slice(0, 320);
          out.diag.samples.push(html);
        } catch (_) {}
      });
    } catch (_) {}
    return out;
  }

  // ── Canonical React Bypass ──────────────────────────────────────────
  // One write primitive that safely sets values on controlled inputs
  // (React 16+, Vue 3, Angular) without being wiped on the next render.
  function writeControlled(el, value) {
    if (!el) return;
    try {
      const type = String(el.type || '').toLowerCase();
      const isCheckable = type === 'checkbox' || type === 'radio';
      
      const proto = isCheckable ? HTMLInputElement.prototype : 
                    (el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype);
      
      const propName = isCheckable ? 'checked' : 'value';
      const desc = Object.getOwnPropertyDescriptor(proto, propName);
      const prev = el[propName];
      
      if (desc && desc.set) {
        desc.set.call(el, value);
      } else {
        el[propName] = value;
      }
      
      try {
        if (el._valueTracker && typeof el._valueTracker.setValue === 'function') {
          el._valueTracker.setValue(prev);
        }
      } catch (_) {}
      
      if (isCheckable) {
        el.dispatchEvent(new Event('click', { bubbles: true }));
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    } catch (_) {}
  }

  self.AYN_DOM = Object.freeze({
    VERSION: '2.0.0',
    beginScan,
    findQuestion,
    coverageScan,
    buildOptionIndex,
    visibleish,
    writeControlled,
  });
})();
