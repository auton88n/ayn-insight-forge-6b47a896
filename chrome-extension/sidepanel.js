// sidepanel.js — AYN Resume Tailor
// Auth: Supabase email/password stored in chrome.storage.local
// No tokens, no manual linking — just sign in once and it works.

const SUPABASE_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw';

// ── State ──
const S = {
  session: null,       // { access_token, refresh_token, user }
  resume: '',
  job: '',
  jobTitle: '',
  company: '',
  keywords: [],
  tailoredText: '',
  changes: [],
};

const $ = id => document.getElementById(id);

// ── Toast ──
function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// ── View switching ──
const ALL_VIEWS = ['v-login','v1','v2','v3'];
function show(id) {
  ALL_VIEWS.forEach(v => $(`${v}`)?.classList.toggle('active', v === id));
  const loggedIn = id !== 'v-login';
  $('stepper').classList.toggle('hidden', !loggedIn);
  $('user-email').classList.toggle('hidden', !loggedIn);
  $('sign-out-btn').classList.toggle('hidden', !loggedIn);
  if (loggedIn) {
    ['s1','s2','s3'].forEach((sid, i) => {
      const n = i + 1;
      const stepNum = parseInt(id.replace('v',''), 10);
      const el = $(sid);
      el.classList.remove('active','done');
      if (n === stepNum) el.classList.add('active');
      if (n < stepNum) el.classList.add('done');
    });
  }
}

// ── Supabase API helpers ──
async function supabasePost(path, body, token) {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${SUPABASE_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return res.json();
}

async function signIn(email, password) {
  const data = await supabasePost('/auth/v1/token?grant_type=password', { email, password });
  if (data.error || !data.access_token) throw new Error(data.error_description || data.message || 'Sign in failed');
  return data; // { access_token, refresh_token, user, expires_at }
}

async function refreshSession(refreshToken) {
  const data = await supabasePost('/auth/v1/token?grant_type=refresh_token', { refresh_token: refreshToken });
  if (data.error || !data.access_token) throw new Error('Session expired');
  return data;
}

async function callFunction(action, body) {
  if (!S.session) throw new Error('Not signed in');
  // Check if token is close to expiry (within 60s) and refresh
  const expiresAt = S.session.expires_at * 1000;
  if (Date.now() > expiresAt - 60000) {
    try {
      const refreshed = await refreshSession(S.session.refresh_token);
      S.session = { ...S.session, ...refreshed };
      await chrome.storage.local.set({ session: S.session });
    } catch {
      await signOut();
      throw new Error('Session expired. Please sign in again.');
    }
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/resume-hub`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${S.session.access_token}`,
    },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Auth: restore session on load ──
async function restoreSession() {
  const stored = await chrome.storage.local.get(['session']);
  if (!stored.session?.access_token) { show('v-login'); return; }
  // Try to refresh so it's always fresh
  try {
    const refreshed = await refreshSession(stored.session.refresh_token);
    S.session = { ...stored.session, ...refreshed };
    await chrome.storage.local.set({ session: S.session });
    onSignedIn();
  } catch {
    await chrome.storage.local.remove('session');
    show('v-login');
  }
}

function onSignedIn() {
  $('user-email').textContent = S.session.user?.email || '';
  show('v1');
  loadSavedResume();
  detectJob();
}

async function signOut() {
  S.session = null;
  await chrome.storage.local.remove('session');
  show('v-login');
}

// ── Login form ──
$('login-btn').addEventListener('click', async () => {
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  const errEl = $('login-err');
  errEl.classList.add('hidden');

  if (!email || !password) {
    errEl.textContent = 'Enter your email and password.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = $('login-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Signing in...';

  try {
    const session = await signIn(email, password);
    S.session = session;
    await chrome.storage.local.set({ session });
    onSignedIn();
    toast('Signed in ✓', 'ok');
  } catch (err) {
    errEl.textContent = err.message || 'Sign in failed. Check your email and password.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign In';
  }
});

// Allow Enter key on login fields
['login-email','login-password'].forEach(id => {
  $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('login-btn').click(); });
});

$('sign-out-btn').addEventListener('click', () => signOut());

// ── Load saved resume ──
function loadSavedResume() {
  chrome.storage.local.get(['savedResume'], data => {
    if (data.savedResume) {
      $('resume-input').value = data.savedResume;
      $('resume-chars').textContent = data.savedResume.length;
    }
  });
}

// Debounced auto-save resume
let saveT;
$('resume-input').addEventListener('input', e => {
  $('resume-chars').textContent = e.target.value.length;
  clearTimeout(saveT);
  saveT = setTimeout(() => chrome.storage.local.set({ savedResume: e.target.value }), 800);
});
$('job-input').addEventListener('input', e => { $('job-chars').textContent = e.target.value.length; });

// ── Auto-detect job from page ──
function detectJob() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]?.id) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT_JOB_TEXT' }, result => {
      if (chrome.runtime.lastError || !result?.text || result.text.length < 80) {
        // Fall back to stored
        chrome.runtime.sendMessage({ type: 'GET_JOB' }, d => {
          if (!d?.lastJobText || Date.now() - (d.detectedAt || 0) > 5 * 60 * 1000) return;
          showJobBanner(d.lastJobTitle || 'Job detected', d.lastJobText, d.lastJobCompany || '');
        });
        return;
      }
      // Parse company and role from page title
      const parts = result.title?.split(/\bat\b|\s[-|]\s/i) || [];
      S.jobTitle = parts[0]?.trim() || '';
      S.company = parts[1]?.replace(/linkedin|indeed|glassdoor|jobright/gi, '').trim() || '';
      showJobBanner(result.title || 'Job detected on this page', result.text, S.company);
    });
  });
}

function showJobBanner(title, text, company) {
  S.company = company || S.company;
  $('job-banner').classList.remove('hidden');
  $('job-banner-title').textContent = title;
  $('job-banner-sub').textContent = `${text.length.toLocaleString()} characters detected`;
  $('job-banner').dataset.text = text;
}

$('use-job-btn').addEventListener('click', () => {
  const text = $('job-banner').dataset.text || '';
  $('job-input').value = text;
  $('job-chars').textContent = text.length;
  $('job-banner').classList.add('hidden');
  toast('Job loaded ✓', 'ok');
});

// ── Step 1 → 2: Keyword analysis ──
$('analyze-btn').addEventListener('click', async () => {
  const resume = $('resume-input').value.trim();
  const job = $('job-input').value.trim();
  const errEl = $('err1');
  errEl.classList.add('hidden');

  if (resume.length < 50) { errEl.textContent = 'Paste your resume first (at least 50 characters).'; errEl.classList.remove('hidden'); return; }
  if (job.length < 50) { errEl.textContent = 'Load or paste the job description first.'; errEl.classList.remove('hidden'); return; }

  S.resume = resume;
  S.job = job;

  const btn = $('analyze-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Analysing keywords...';

  try {
    const data = await callFunction('smart_tailor', {
      resumeText: resume,
      jdText: job,
      jobTitle: S.jobTitle,
      company: S.company,
    });
    S.keywords = data.keywords || [];
    S.tailoredText = data.tailoredText || '';
    S.changes = data.changes || [];
    renderKeywords(S.keywords);
    show('v2');
  } catch (err) {
    errEl.textContent = err.message || 'Something went wrong. Try again.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'See My Keyword Match →';
  }
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

// ── Step 2 → 3: Show tailored resume (already computed in step 1) ──
$('tailor-btn').addEventListener('click', async () => {
  if (S.tailoredText) {
    renderResult(S.tailoredText, S.changes);
    show('v3');
    return;
  }
  // Fallback if somehow missing
  const btn = $('tailor-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Tailoring...';
  try {
    const data = await callFunction('smart_tailor', { resumeText: S.resume, jdText: S.job, jobTitle: S.jobTitle, company: S.company });
    S.tailoredText = data.tailoredText || '';
    S.changes = data.changes || [];
    renderResult(S.tailoredText, S.changes);
    show('v3');
  } catch (err) {
    $('err2').textContent = err.message; $('err2').classList.remove('hidden');
  } finally { btn.disabled = false; btn.innerHTML = 'Tailor My Resume ✦'; }
});

function renderResult(text, changes) {
  $('resume-out').textContent = text;
  const list = $('changes-list');
  list.innerHTML = '';
  const items = changes.length ? changes : ['Keywords woven in where your experience supported it.'];
  items.forEach(c => { list.innerHTML += `<li><div class="change-dot"></div><span>${c}</span></li>`; });
}

// ── Navigation ──
$('back1-btn').addEventListener('click', () => show('v1'));
$('back2-btn').addEventListener('click', () => show('v2'));

$('copy-btn').addEventListener('click', () => {
  if (!S.tailoredText) return;
  navigator.clipboard.writeText(S.tailoredText).then(() => {
    $('copy-btn').textContent = '✓ Copied!';
    toast('Copied to clipboard', 'ok');
    setTimeout(() => { $('copy-btn').textContent = 'Copy Resume'; }, 2000);
  });
});

$('new-job-btn').addEventListener('click', () => {
  S.keywords = []; S.tailoredText = ''; S.changes = '';
  S.jobTitle = ''; S.company = '';
  $('job-input').value = ''; $('job-chars').textContent = '0';
  $('job-banner').classList.add('hidden');
  ['err1','err2','err3'].forEach(id => $(`${id}`)?.classList.add('hidden'));
  show('v1');
  detectJob();
});

// ── Boot ──
restoreSession();
