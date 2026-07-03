(function () {
  if (window.__aynPageWorldReady) return;
  window.__aynPageWorldReady = true;
  function setPowerfully(el, value) {
    try {
      el.focus();
      if (el.isContentEditable) {
        try { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (_) {}
        try { document.execCommand('insertText', false, value); } catch (_) {}
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      const prev = el.value;
      if (desc && desc.set) desc.set.call(el, value); else el.value = value;
      try { if (el._valueTracker && el._valueTracker.setValue) el._valueTracker.setValue(prev); } catch (_) {}
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      try {
        const pk = Object.keys(el).find(k => k.startsWith('__reactProps$'));
        if (pk && el[pk] && typeof el[pk].onChange === 'function') {
          el[pk].onChange({ target: el, currentTarget: el, type: 'change', bubbles: true, preventDefault() {}, stopPropagation() {} });
        }
      } catch (_) {}
    } catch (_) {}
  }
  document.addEventListener('ayn-fill-request', function () {
    try {
      const el = document.querySelector('[data-ayn-fill-target="1"]');
      if (!el) return;
      const value = el.getAttribute('data-ayn-fill-value') || '';
      setPowerfully(el, value);
      el.removeAttribute('data-ayn-fill-target');
      el.removeAttribute('data-ayn-fill-value');
    } catch (_) {}
  }, true);

  // v1.9.67 — main-world click bridge. Content script sets data attributes on
  // documentElement and dispatches 'ayn-click-request'; we click from the page
  // world so React listeners fire. Replaces inline <script> injection (CSP).
  document.addEventListener('ayn-click-request', function () {
    try {
      var root = document.documentElement;
      var qKey = (root.getAttribute('data-ayn-click-q') || '').trim().toLowerCase();
      var wantRaw = (root.getAttribute('data-ayn-click-opt') || '').trim();
      root.removeAttribute('data-ayn-click-q');
      root.removeAttribute('data-ayn-click-opt');
      if (!qKey || !wantRaw) return;
      function normOpt(s) {
        return String(s || '').toLowerCase()
          .replace(/[\u2010-\u2015\u2212]/g, '-')
          .replace(/[.,;:!?'"()]/g, ' ')
          .replace(/\s+/g, ' ').trim();
      }
      function optMatches(a, b) {
        a = normOpt(a); b = normOpt(b);
        if (!a || !b) return false;
        if (a === b) return true;
        if (a.length >= 3 && b.length >= 3 && (a.indexOf(b) !== -1 || b.indexOf(a) !== -1)) return true;
        var wa = a.split(' ').filter(function (w) { return w.length > 2; });
        var wb = b.split(' ').filter(function (w) { return w.length > 2; });
        var short = wa, long = new Set(wb);
        if (wa.length > wb.length) { short = wb; long = new Set(wa); }
        if (short.length >= 3) {
          var hits = short.filter(function (w) { return long.has(w); }).length;
          if (hits / short.length >= 0.8) return true;
        }
        return false;
      }
      var all = document.querySelectorAll('label,legend,p,h2,h3,h4,strong,div,span');
      var labelEl = null;
      for (var i = 0; i < all.length; i++) {
        var t = (all[i].textContent || '').trim().toLowerCase();
        if (!t || t.length >= 260) continue;
        if (t.indexOf(qKey) !== -1) { labelEl = all[i]; break; }
      }
      if (!labelEl) return;
      var node = labelEl.parentElement;
      for (var j = 0; j < 7 && node; j++, node = node.parentElement) {
        var btns = node.querySelectorAll('button,[role="radio"],[role="button"],[role="option"]');
        for (var k = 0; k < btns.length; k++) {
          var bt = (btns[k].textContent || '').trim();
          if (optMatches(bt, wantRaw)) { btns[k].click(); return; }
        }
      }
    } catch (e) {}
  }, true);
})();
