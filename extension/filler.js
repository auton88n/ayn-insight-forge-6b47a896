// filler.js — AYN Resume Tailor two-lane resolver (v1.9.67)
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
  const MEMORY_BLOCK_RE = /linkedin|work authorization|authorized to work|legally authorized|right to work|visa sponsorship|sponsor|currently reside|currently based|currently located|location eligibility|relocat|motivat|why.*role|why.*company|resume|cv|curriculum|upload|attach|cover letter/i;
  function isSensitive(field) {
    const g = (String((field && field.group) || '') + ' ' + String((field && field.section) || '')).toLowerCase();
    if (/eeo|demograph|self.?identif|voluntary|diversity/.test(g)) return true;
    return SENSITIVE_RE.test((field && field.label) || '') || SENSITIVE_RE.test((field && field.group) || '') || SENSITIVE_RE.test((field && field.section) || '');
  }

  function isMemoryBlocked(field) {
    const blob = [field && field.label, field && field.group, field && field.section, field && field.name, field && field.placeholder].filter(Boolean).join(' ');
    const kind = String((field && (field.kind || field.type)) || '').toLowerCase();
    if (/file|textarea|opentext|richedit/.test(kind)) return true;
    if (isSensitive(field)) return true;
    return MEMORY_BLOCK_RE.test(blob);
  }

  function canReuseMemory(field, row) {
    if (!row || isMemoryBlocked(field)) return false;
    const kind = String((field && (field.kind || field.type)) || '').toLowerCase();
    if (/select|dropdown|structradio|labelgroup|buttongroup|radio|checkbox/.test(kind)) {
      const opts = Array.isArray(field && field.options) ? field.options : [];
      const want = norm(row.optionLabel || row.optionValue || row.value || '');
      if (!opts.length || !want) return false;
      return opts.some(o => norm(o.label || o.value) === want || norm(o.label || o.value).includes(want) || want.includes(norm(o.label || o.value)));
    }
    const val = String(row.value || row.optionLabel || '').trim();
    if (/linkedin/i.test(String((field && field.label) || '')) && !/^https:\/\/(www\.)?linkedin\.com\/in\/[a-z0-9][a-z0-9\-_%]+\/?$/i.test(val)) return false;
    return !!val && val.length >= 2;
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

  // v2.5.0 — deterministic format validators. AI must not be trusted to
  // format URLs/emails/phones; regex is cheap and unambiguous.
  const FORMAT_VALIDATORS = {
    linkedin: (v) => /^https?:\/\/(www\.)?linkedin\.com\/(in|pub)\/[\w\-%.]+\/?/i.test(String(v || '').trim()),
    email:    (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()),
    url:      (v) => /^https?:\/\/[^\s]+\.[^\s]+/i.test(String(v || '').trim()),
    phone:    (v) => String(v || '').replace(/\D+/g, '').length >= 7,
  };
  function validateFormat(kind, value) {
    const fn = FORMAT_VALIDATORS[String(kind || '').toLowerCase()];
    return fn ? fn(value) : true;
  }
  function detectFormatKind(field) {
    const label = String((field && field.label) || '').toLowerCase();
    const name  = String((field && field.name)  || '').toLowerCase();
    const ph    = String((field && field.placeholder) || '').toLowerCase();
    const blob  = label + ' ' + name + ' ' + ph;
    if (/linkedin/.test(blob)) return 'linkedin';
    if (/email/.test(blob)) return 'email';
    if (/phone|mobile|tel(?!l)/.test(blob)) return 'phone';
    if (/website|portfolio|url|http/.test(blob)) return 'url';
    return null;
  }

  // v2.5.0 — deterministic polarity for compliance questions the AI keeps
  // getting wrong. Returns { answer: 'Yes'|'No', confidence } or null.
  // Facts shape (from mergedBasics/profile):
  //   work_auth: { countries: ['CA','US',...], authorized: true }
  //   requires_sponsorship: boolean
  const COUNTRY_TOKENS = {
    us: ['us','usa','u.s.','u.s.a','united states','america','american'],
    ca: ['ca','canada','canadian'],
    uk: ['uk','u.k.','united kingdom','britain','british','england'],
    eu: ['eu','european union','europe'],
    au: ['au','australia','australian'],
  };
  function labelMentionsCountry(label, iso2) {
    const l = String(label || '').toLowerCase();
    const toks = COUNTRY_TOKENS[String(iso2 || '').toLowerCase()] || [];
    return toks.some(t => new RegExp('\\b' + t.replace(/\./g,'\\.') + '\\b', 'i').test(l));
  }
  function resolveWorkAuthAnswer(field, facts) {
    if (!field || !facts) return null;
    const label = String(field.label || '').toLowerCase();
    if (!/authoriz|legal(ly)?\s+(entitled|able)|right to work|eligible to work/i.test(label)) return null;
    const wa = facts.work_auth || {};
    const authorizedCountries = Array.isArray(wa.countries) ? wa.countries.map(c => String(c).toLowerCase()) : [];
    if (!wa.authorized || !authorizedCountries.length) return null;
    // Determine which countries the question is about
    const mentioned = ['us','ca','uk','eu','au'].filter(c => labelMentionsCountry(label, c));
    if (!mentioned.length) return null;
    const overlap = mentioned.some(c => authorizedCountries.includes(c));
    return { answer: overlap ? 'Yes' : 'No', confidence: 0.95, source: 'polarity:work_auth' };
  }
  function resolveSponsorshipAnswer(field, facts) {
    if (!field || !facts) return null;
    const label = String(field.label || '').toLowerCase();
    if (!/sponsor|visa|work permit/i.test(label)) return null;
    if (typeof facts.requires_sponsorship !== 'boolean') return null;
    // Label polarity: "require sponsorship" => Yes if requires; "willing to sponsor" flipped
    const flipped = /will(ing)? to sponsor|company sponsor|provide sponsorship/i.test(label);
    const requires = !!facts.requires_sponsorship;
    const yes = flipped ? !requires : requires;
    return { answer: yes ? 'Yes' : 'No', confidence: 0.9, source: 'polarity:sponsorship' };
  }

  self.AYN_RESOLVER = {
    norm, isSensitive, isMemoryBlocked, canReuseMemory, fingerprint, optionsSignature, matchProfile,
    validateFormat, detectFormatKind, resolveWorkAuthAnswer, resolveSponsorshipAnswer,
  };
})();
