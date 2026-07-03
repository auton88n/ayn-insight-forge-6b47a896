// filler.js — AYN Resume Tailor two-lane resolver (v1.9.55)
// Loaded by content scripts AND by the background service worker
// (importScripts). Attaches self.AYN_RESOLVER for both surfaces.
(function () {
  if (self.AYN_RESOLVER) return;

  const norm = (s) => String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\*+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  function jaroWinkler(s1, s2) {
    if (!s1 || !s2) return 0; if (s1 === s2) return 1;
    const m = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    const s1m = new Array(s1.length).fill(false), s2m = new Array(s2.length).fill(false);
    let matches = 0;
    for (let i = 0; i < s1.length; i++) {
      const lo = Math.max(0, i - m), hi = Math.min(i + m + 1, s2.length);
      for (let j = lo; j < hi; j++) {
        if (s2m[j] || s1[i] !== s2[j]) continue;
        s1m[i] = s2m[j] = true; matches++; break;
      }
    }
    if (!matches) return 0;
    let t = 0, k = 0;
    for (let i = 0; i < s1.length; i++) {
      if (!s1m[i]) continue;
      while (!s2m[k]) k++;
      if (s1[i] !== s2[k]) t++;
      k++;
    }
    t /= 2;
    const jaro = (matches / s1.length + matches / s2.length + (matches - t) / matches) / 3;
    let p = 0; while (p < 4 && s1[p] === s2[p]) p++;
    return jaro + p * 0.1 * (1 - jaro);
  }

  const SENSITIVE_RE = /gender|race|ethnic|disab|veteran|sexual|orientation|salary|compensation|desired pay|criminal|felony|conviction|date of birth|\bdob\b|\bage\b|religion|marital|pronoun/i;
  function isSensitive(field) {
    const g = (String((field && field.group) || '') + ' ' + String((field && field.section) || '')).toLowerCase();
    if (/eeo|demograph|self.?identif|voluntary|diversity/.test(g)) return true;
    return SENSITIVE_RE.test((field && field.label) || '') || SENSITIVE_RE.test((field && field.group) || '') || SENSITIVE_RE.test((field && field.section) || '');
  }

  function optionsSignature(field) {
    const opts = Array.isArray(field && field.options)
      ? field.options.map(o => norm((o && (o.label || o.value)) || o)).filter(Boolean).sort()
      : [];
    return opts.join('|');
  }

  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function fingerprint(field, host) {
    return sha256Hex([host || '', norm(field.label), field.kind || field.type || '', optionsSignature(field)].join('|'));
  }

  function matchProfile(field, vector) {
    if (!vector || !vector.aliases || !vector.facts) return null;
    if (isSensitive(field)) return null;
    const kind = field.kind || field.type || '';
    const nlabel = norm(field.label); if (!nlabel) return null;
    let best = null;
    for (const factKey of Object.keys(vector.aliases)) {
      const factVal = vector.facts[factKey];
      if (factVal === undefined || factVal === null || factVal === '') continue;
      for (const alias of (vector.aliases[factKey] || [])) {
        const na = norm(alias); if (!na) continue;
        let score;
        if (na === nlabel) score = 1;
        else if (nlabel.includes(na) || na.includes(nlabel)) score = 0.9;
        else score = jaroWinkler(na, nlabel);
        if (!best || score > best.score) best = { score, factKey, factVal };
      }
    }
    if (!best || best.score < 0.86) return null;
    const conf = best.score >= 0.98 ? 0.95 : 0.78;
    if (/select|dropdown|structradio|labelgroup|buttongroup|radio/.test(kind)) {
      if (!Array.isArray(field.options)) return null;
      const target = norm(String(best.factVal));
      const opt = field.options.find(o => norm(o.label || o.value) === target)
        || field.options.find(o => { const n = norm(o.label || o.value); return n && (n.includes(target) || target.includes(n)); });
      if (!opt) return null;
      return { optionLabel: opt.label || opt.value, optionValue: opt.value || opt.label, confidence: conf, source: 'profile' };
    }
    if (/text|email|tel|phone|url|textarea|opentext|richedit|number/.test(kind) || kind === '') {
      return { value: String(best.factVal), confidence: conf, source: 'profile' };
    }
    return null;
  }

  self.AYN_RESOLVER = { norm, isSensitive, fingerprint, optionsSignature, matchProfile };
  // Legacy stub namespace for any content-script consumer expecting it.
  self.AYN_FILLER = self.AYN_FILLER || {};
})();
