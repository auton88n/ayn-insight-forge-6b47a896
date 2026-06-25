// sidepanel.js — AYN Resume Tailor + Form Autofill

const SUPABASE_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw';

// ── State ──────────────────────────────────────────────────────────────
const S = {
  session: null,
  mode: 'autofill',      // 'autofill' | 'tailor'
  // Autofill
  scannedFields: [],
  jobTextForFill: '',
  fillValues: [],        // { id, value, label }[]
  fillResult: null,
  // Tailor
  resume: '',
  job: '',
  jobTitle: '',
  company: '',
  keywords: [],
  tailoredText: '',
  changes: [],
  detectedJob: null,
};

const $ = id => document.getElementById(id);

// ── Toast ──────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2800);
}

// ── View management ───────────────────────────────────────────────────
const ALL_VIEWS = ['v-login','v-af1','v-af2','v-af3','v-t1','v-t2','v-t3'];

function show(id) {
  ALL_VIEWS.forEach(v => $(v)?.classList.toggle('active', v === id));
  const loggedIn = id !== 'v-login';
  $('user-email').classList.toggle('hidden', !loggedIn);
  $('sign-out-btn').classList.toggle('hidden', !loggedIn);
  $('mode-tabs').classList.toggle('hidden', !loggedIn);

  // Stepper only in tailor mode
  const inTailor = ['v-t1','v-t2','v-t3'].includes(id);
  $('stepper').classList.toggle('hidden', !inTailor);
  if (inTailor) {
    const n = parseInt(id.replace('v-t',''), 10);
    ['s1','s2','s3'].forEach((sid, i) => {
      const el = $(sid);
      el.classList.remove('active','done');
      if (i+1 === n) el.classList.add('active');
      if (i+1 < n) el.classList.add('done');
    });
  }
}

// ── Mode switching ────────────────────────────────────────────────────
function switchMode(mode) {
  S.mode = mode;
  $('tab-autofill').classList.toggle('active', mode === 'autofill');
  $('tab-tailor').classList.toggle('active', mode === 'tailor');
  if (mode === 'autofill') {
    show('v-af1');
    detectJobForAutofill();
  } else {
    show('v-t1');
    detectJobForTailor();
  }
}
window.switchMode = switchMode;

// ── Supabase auth ─────────────────────────────────────────────────────
async function supabasePost(path, body, token) {
  const headers = { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${SUPABASE_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return res.json();
}

async function signIn(email, password) {
  const data = await supabasePost('/auth/v1/token?grant_type=password', { email, password });
  if (data.error || !data.access_token) throw new Error(data.error_description || data.message || 'Sign in failed');
  return data;
}

async function refreshSession(refreshToken) {
  const data = await supabasePost('/auth/v1/token?grant_type=refresh_token', { refresh_token: refreshToken });
  if (data.error || !data.access_token) throw new Error('Session expired');
  return data;
}

async function callFunction(action, body) {
  if (!S.session) throw new Error('Not signed in');
  const expiresAt = (S.session.expires_at || 0) * 1000;
  if (Date.now() > expiresAt - 60000) {
    try {
      const r = await refreshSession(S.session.refresh_token);
      S.session = { ...S.session, ...r };
      await chrome.storage.local.set({ session: S.session });
    } catch { await signOut(); throw new Error('Session expired. Please sign in again.'); }
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/resume-hub`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${S.session.access_token}` },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function restoreSession() {
  const stored = await chrome.storage.local.get(['session']);
  if (!stored.session?.access_token) { show('v-login'); return; }
  try {
    const r = await refreshSession(stored.session.refresh_token);
    S.session = { ...stored.session, ...r };
    await chrome.storage.local.set({ session: S.session });
    onSignedIn();
  } catch {
    await chrome.storage.local.remove('session');
    show('v-login');
  }
}

function onSignedIn() {
  $('user-email').textContent = S.session.user?.email || '';
  switchMode('autofill');
  loadSavedResume();
}

async function signOut() {
  S.session = null;
  await chrome.storage.local.remove('session');
  show('v-login');
}

// ── Login form ────────────────────────────────────────────────────────
$('login-btn').addEventListener('click', async () => {
  const email = $('login-email').value.trim();
  const pw = $('login-password').value;
  const err = $('login-err');
  err.classList.add('hidden');
  if (!email || !pw) { err.textContent = 'Enter your email and password.'; err.classList.remove('hidden'); return; }
  const btn = $('login-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Signing in...';
  try {
    S.session = await signIn(email, pw);
    await chrome.storage.local.set({ session: S.session });
    onSignedIn();
    toast('Signed in ✓', 'ok');
  } catch (e) {
    err.textContent = e.message || 'Sign in failed.';
    err.classList.remove('hidden');
  } finally { btn.disabled = false; btn.innerHTML = 'Sign In'; }
});
['login-email','login-password'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('login-btn').click(); }));
$('sign-out-btn').addEventListener('click', signOut);

// ════════════════════════════════════════════════════════════════════
// AUTOFILL MODE
// ════════════════════════════════════════════════════════════════════

function detectJobForAutofill() {
  getActiveTab(tab => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB_TEXT' }, result => {
      if (chrome.runtime.lastError || !result?.text || result.text.length < 80) return;
      S.jobTextForFill = result.text;
      $('af-job-banner').classList.remove('hidden');
      $('af-job-title').textContent = result.title || 'Job detected on this page';
      $('af-job-sub').textContent = 'Job description will be used to answer screening questions';
    });
  });
}

// AF Step 1: Scan form
$('scan-btn').addEventListener('click', async () => {
  const err = $('err-af1');
  err.classList.add('hidden');
  const btn = $('scan-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner dark"></div> Scanning page...';

  getActiveTab(async tab => {
    if (!tab) {
      err.textContent = 'No active tab found.';
      err.classList.remove('hidden');
      btn.disabled = false; btn.innerHTML = 'Scan This Page\'s Form';
      return;
    }

    try {
      // Ask content script to scan the form
      chrome.tabs.sendMessage(tab.id, { type: 'SCAN_FORM' }, async response => {
        if (chrome.runtime.lastError) {
          err.textContent = 'Could not scan this page. Try refreshing it first.';
          err.classList.remove('hidden');
          btn.disabled = false; btn.innerHTML = 'Scan This Page\'s Form';
          return;
        }

        const { fields = [], jobText = {} } = response || {};

        if (fields.length === 0) {
          err.textContent = 'No form fields found on this page. Navigate to a job application form first.';
          err.classList.remove('hidden');
          btn.disabled = false; btn.innerHTML = 'Scan This Page\'s Form';
          return;
        }

        // Store job text from the page scan too
        if (jobText?.text) S.jobTextForFill = jobText.text;

        // Send fields to AI to get values
        btn.innerHTML = '<div class="spinner dark"></div> AI is reading the form...';

        try {
          const data = await callFunction('ext_autofill', {
            fields: fields.map(f => ({
              id: f.id,
              label: f.label,
              type: f.type,
              options: f.options,
              required: f.required,
              currentValue: f.currentValue,
            })),
            jobText: S.jobTextForFill,
          });

          // Match values back to full field objects for preview
          const valMap = {};
          (data.values || []).forEach(v => { valMap[v.id] = v.value; });

          S.scannedFields = fields;
          S.fillValues = fields.map(f => ({
            id: f.id,
            label: f.label,
            type: f.type,
            value: valMap[f.id] || '',
            _idx: f._idx,
            _selector: f._selector,
          }));

          renderFieldPreview(S.fillValues);
          show('v-af2');
        } catch (e) {
          err.textContent = e.message || 'AI failed to read the form. Try again.';
          err.classList.remove('hidden');
        } finally {
          btn.disabled = false; btn.innerHTML = 'Scan This Page\'s Form';
        }
      });
    } catch (e) {
      err.textContent = e.message;
      err.classList.remove('hidden');
      btn.disabled = false; btn.innerHTML = 'Scan This Page\'s Form';
    }
  });
});

function renderFieldPreview(values) {
  const fillable = values.filter(v => v.value && v.value.trim());
  const skipped = values.filter(v => !v.value || !v.value.trim());
  $('af-field-count').textContent = `${fillable.length} fields ready to fill (${skipped.length} skipped)`;

  const list = $('af-field-list');
  list.innerHTML = '';
  values.forEach(f => {
    const hasFill = f.value && f.value.trim();
    list.innerHTML += `
      <div class="field-item">
        <div class="field-dot ${hasFill ? 'fill' : 'skip'}"></div>
        <div class="field-label">${escHtml(f.label)}</div>
        <div class="field-value">${hasFill ? escHtml(f.value.slice(0, 30)) : '—'}</div>
      </div>`;
  });
}

// AF Step 2: Fill button
$('fill-btn').addEventListener('click', () => {
  const err = $('err-af2');
  err.classList.add('hidden');
  const btn = $('fill-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner dark"></div> Filling form...';

  getActiveTab(tab => {
    if (!tab) { err.textContent = 'No active tab.'; err.classList.remove('hidden'); btn.disabled = false; btn.innerHTML = 'Fill Form Now'; return; }

    const toFill = S.fillValues
      .filter(v => v.value && v.value.trim())
      .map(v => ({ id: v.id, value: v.value, _idx: v._idx }));

    // Highlight fields first briefly
    chrome.tabs.sendMessage(tab.id, {
      type: 'HIGHLIGHT_FIELDS',
      fieldIds: toFill.map(v => v.id),
    });

    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, { type: 'INJECT_VALUES', values: toFill }, result => {
        if (chrome.runtime.lastError) {
          err.textContent = 'Could not fill the form. Try refreshing the page.';
          err.classList.remove('hidden');
          btn.disabled = false; btn.innerHTML = 'Fill Form Now';
          return;
        }

        S.fillResult = result;
        renderFillResult(result, toFill);
        show('v-af3');
        btn.disabled = false; btn.innerHTML = 'Fill Form Now';
      });
    }, 400);
  });
});

function renderFillResult(result, attempted) {
  const filled = result?.filled || 0;
  const total = attempted.length;
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;

  $('fill-stat').textContent = `${filled}/${total}`;
  $('fill-stat').className = `fill-stat ${pct >= 70 ? 'good' : 'partial'}`;
  $('fill-label').textContent = `fields filled (${pct}% success)`;

  const list = $('af-filled-list');
  list.innerHTML = '';
  const resultMap = {};
  (result?.results || []).forEach(r => { resultMap[r.id] = r; });

  attempted.forEach(f => {
    const r = resultMap[f.id];
    const ok = r?.ok;
    list.innerHTML += `
      <div class="field-item">
        <div class="field-dot ${ok ? 'fill' : 'skip'}"></div>
        <div class="field-label">${escHtml(f.label || f.id)}</div>
        <div class="field-value" style="color:${ok ? 'var(--green)' : 'var(--muted)'}">${ok ? escHtml(f.value.slice(0, 25)) : (r?.reason || 'skipped')}</div>
      </div>`;
  });
}

// AF back / reset
$('af-back1-btn').addEventListener('click', () => show('v-af1'));
$('af-back2-btn').addEventListener('click', () => show('v-af2'));
$('refill-btn').addEventListener('click', () => {
  // Filter to only unfilled and try again
  const unfilled = S.fillValues.filter(v => {
    const r = (S.fillResult?.results || []).find(r => r.id === v.id);
    return v.value && v.value.trim() && !r?.ok;
  });
  if (unfilled.length === 0) { toast('All fields already filled ✓', 'ok'); return; }
  S.fillValues = unfilled;
  renderFieldPreview(S.fillValues);
  show('v-af2');
});
$('af-new-btn').addEventListener('click', () => {
  S.scannedFields = []; S.fillValues = []; S.fillResult = null; S.jobTextForFill = '';
  $('af-job-banner').classList.add('hidden');
  $('err-af1').classList.add('hidden');
  show('v-af1');
  detectJobForAutofill();
});

// ════════════════════════════════════════════════════════════════════
// TAILOR MODE
// ════════════════════════════════════════════════════════════════════

function loadSavedResume() {
  chrome.storage.local.get(['savedResume'], data => {
    if (data.savedResume) {
      $('resume-input').value = data.savedResume;
      $('resume-chars').textContent = data.savedResume.length;
    }
  });
}

let saveT;
$('resume-input').addEventListener('input', e => {
  $('resume-chars').textContent = e.target.value.length;
  clearTimeout(saveT);
  saveT = setTimeout(() => chrome.storage.local.set({ savedResume: e.target.value }), 800);
});
$('job-input').addEventListener('input', e => { $('job-chars').textContent = e.target.value.length; });

function detectJobForTailor() {
  getActiveTab(tab => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB_TEXT' }, result => {
      if (chrome.runtime.lastError || !result?.text || result.text.length < 80) return;
      const parts = result.title?.split(/\bat\b|\s[-|]\s/i) || [];
      S.jobTitle = parts[0]?.trim() || '';
      S.company = parts[1]?.replace(/linkedin|indeed|glassdoor|jobright/gi,'').trim() || '';
      showJobBanner(result.title || 'Job detected', result.text);
    });
  });
}

function showJobBanner(title, text) {
  $('t-job-banner').classList.remove('hidden');
  $('t-job-title').textContent = title;
  $('t-job-sub').textContent = `${text.length.toLocaleString()} characters`;
  $('t-job-banner').dataset.text = text;
}

$('use-job-btn').addEventListener('click', () => {
  const text = $('t-job-banner').dataset.text || '';
  $('job-input').value = text;
  $('job-chars').textContent = text.length;
  $('t-job-banner').classList.add('hidden');
  toast('Job loaded ✓', 'ok');
});

$('analyze-btn').addEventListener('click', async () => {
  const resume = $('resume-input').value.trim();
  const job = $('job-input').value.trim();
  const err = $('err-t1');
  err.classList.add('hidden');
  if (resume.length < 50) { err.textContent = 'Paste your resume first (50+ chars).'; err.classList.remove('hidden'); return; }
  if (job.length < 50) { err.textContent = 'Load or paste the job description first.'; err.classList.remove('hidden'); return; }
  S.resume = resume; S.job = job;
  const btn = $('analyze-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Analysing...';
  try {
    const data = await callFunction('smart_tailor', { resumeText: resume, jdText: job, jobTitle: S.jobTitle, company: S.company });
    S.keywords = data.keywords || []; S.tailoredText = data.tailoredText || ''; S.changes = data.changes || [];
    renderKeywords(S.keywords);
    show('v-t2');
  } catch (e) {
    err.textContent = e.message || 'Something went wrong.'; err.classList.remove('hidden');
  } finally { btn.disabled = false; btn.innerHTML = 'See My Keyword Match →'; }
});

function renderKeywords(keywords) {
  const matched = keywords.filter(k => k.inResume).length;
  $('kw-count').textContent = `${matched} / ${keywords.length} matched`;
  const wrap = $('kw-chips');
  wrap.innerHTML = '';
  keywords.forEach(kw => {
    const s = document.createElement('span');
    s.className = `kw-chip ${kw.inResume ? 'matched' : 'missing'}`;
    s.textContent = (kw.inResume ? '✓ ' : '') + kw.text;
    wrap.appendChild(s);
  });
}

$('tailor-btn').addEventListener('click', async () => {
  if (S.tailoredText) { renderResult(S.tailoredText, S.changes); show('v-t3'); return; }
  const btn = $('tailor-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Tailoring...';
  try {
    const data = await callFunction('smart_tailor', { resumeText: S.resume, jdText: S.job, jobTitle: S.jobTitle, company: S.company });
    S.tailoredText = data.tailoredText || ''; S.changes = data.changes || [];
    renderResult(S.tailoredText, S.changes); show('v-t3');
  } catch (e) { $('err-t2').textContent = e.message; $('err-t2').classList.remove('hidden'); }
  finally { btn.disabled = false; btn.innerHTML = 'Tailor My Resume ✦'; }
});

function renderResult(text, changes) {
  $('resume-out').textContent = text;
  const list = $('changes-list');
  list.innerHTML = '';
  (changes.length ? changes : ['Keywords woven in where your experience supported it.']).forEach(c => {
    list.innerHTML += `<li><div class="change-dot"></div><span>${escHtml(c)}</span></li>`;
  });
}

$('back-t1-btn').addEventListener('click', () => show('v-t1'));
$('back-t2-btn').addEventListener('click', () => show('v-t2'));
$('copy-btn').addEventListener('click', () => {
  if (!S.tailoredText) return;
  navigator.clipboard.writeText(S.tailoredText).then(() => {
    $('copy-btn').textContent = '✓ Copied!';
    toast('Copied to clipboard', 'ok');
    setTimeout(() => { $('copy-btn').textContent = 'Copy Resume'; }, 2000);
  });
});
$('new-job-btn').addEventListener('click', () => {
  S.keywords = []; S.tailoredText = ''; S.changes = []; S.jobTitle = ''; S.company = '';
  $('job-input').value = ''; $('job-chars').textContent = '0';
  $('t-job-banner').classList.add('hidden');
  ['err-t1','err-t2','err-t3'].forEach(id => $(id)?.classList.add('hidden'));
  show('v-t1');
  detectJobForTailor();
});

// ── Helpers ───────────────────────────────────────────────────────────
function getActiveTab(cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => cb(tabs[0] || null));
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── Boot ──────────────────────────────────────────────────────────────
restoreSession();
