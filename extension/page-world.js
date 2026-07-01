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
})();
