// sidepanel.js — AYN (Fill Form | Job Score | Tailor CV)

const SUPABASE_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw';

const S = {
  session: null,
  tab: 'fill',           // fill | jobs | tailor
  scoringOn: false,
  // Tailor state
  resume: '', job: '', jobTitle: '', company: '',
  keywords: [], tailoredText: '', changes: [],
  detectedJob: null,
};

const $ = id => document.getElementById(id);

// ── Toast ──────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// ── View management ───────────────────────────────────────────────
const VIEWS = ['v-login','v-fill','v-jobs','v-t1','v-t2','v-t3'];
function show(id) {
  VIEWS.forEach(v => $(v)?.classList.toggle('active', v === id));
  const li = id !== 'v-login';
  $('user-email').classList.toggle('hidden', !li);
  $('sign-out-btn').classList.toggle('hidden', !li);
  $('tabs').classList.toggle('hidden', !li);
  const inTailor = ['v-t1','v-t2','v-t3'].includes(id);
  $('stepper').classList.toggle('hidden', !inTailor);
  if (inTailor) {
    const n = parseInt(id.replace('v-t',''), 10);
    ['s1','s2','s3'].forEach((sid, i) => {
      const el = $(sid); el.classList.remove('active','done');
      if (i+1===n) el.classList.add('active');
      if (i+1<n) el.classList.add('done');
    });
  }
}

// ── Tab switching ─────────────────────────────────────────────────
function switchTab(tab) {
  S.tab = tab;
  ['fill','jobs','tailor'].forEach(t => $(`tab-${t}`)?.classList.toggle('active', t===tab));
  if (tab === 'fill') { show('v-fill'); detectForFill(); }
  if (tab === 'jobs') { show('v-jobs'); }
  if (tab === 'tailor') { show('v-t1'); detectForTailor(); }
}
window.switchTab = switchTab;

// ── Auth ──────────────────────────────────────────────────────────
async function supaPost(path, body, token) {
  const h = { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY };
  if (token) h['Authorization'] = `Bearer ${token}`;
  const r = await fetch(`${SUPABASE_URL}${path}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  return r.json();
}
async function signIn(email, pw) {
  const d = await supaPost('/auth/v1/token?grant_type=password', { email, password: pw });
  if (d.error || !d.access_token) throw new Error(d.error_description || d.message || 'Sign in failed');
  return d;
}
async function refreshSession(rt) {
  const d = await supaPost('/auth/v1/token?grant_type=refresh_token', { refresh_token: rt });
  if (d.error || !d.access_token) throw new Error('Session expired');
  return d;
}
async function callFn(action, body) {
  if (!S.session) throw new Error('Not signed in');
  const exp = (S.session.expires_at || 0) * 1000;
  if (Date.now() > exp - 60000) {
    try { const r = await refreshSession(S.session.refresh_token); S.session = { ...S.session, ...r }; await chrome.storage.local.set({ session: S.session }); }
    catch { await doSignOut(); throw new Error('Session expired. Please sign in again.'); }
  }
  const r = await fetch(`${SUPABASE_URL}/functions/v1/resume-hub`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${S.session.access_token}` },
    body: JSON.stringify({ action, ...body }),
  });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}
async function restoreSession() {
  const stored = await chrome.storage.local.get(['session']);
  if (!stored.session?.access_token) { show('v-login'); return; }
  try {
    const r = await refreshSession(stored.session.refresh_token);
    S.session = { ...stored.session, ...r };
    await chrome.storage.local.set({ session: S.session });
    onSignedIn();
  } catch { await chrome.storage.local.remove('session'); show('v-login'); }
}
function onSignedIn() {
  $('user-email').textContent = S.session.user?.email || '';
  switchTab('fill');
  loadSavedResume();
}
async function doSignOut() {
  if (S.scoringOn) stopScoring();
  S.session = null;
  await chrome.storage.local.remove('session');
  show('v-login');
}

$('login-btn').addEventListener('click', async () => {
  const email = $('login-email').value.trim(), pw = $('login-password').value;
  const err = $('login-err'); err.classList.add('hidden');
  if (!email || !pw) { err.textContent = 'Enter your email and password.'; err.classList.remove('hidden'); return; }
  const btn = $('login-btn'); btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Signing in...';
  try { S.session = await signIn(email, pw); await chrome.storage.local.set({ session: S.session }); onSignedIn(); toast('Signed in ✓','ok'); }
  catch (e) { err.textContent = e.message; err.classList.remove('hidden'); }
  finally { btn.disabled = false; btn.innerHTML = 'Sign In'; }
});
['login-email','login-password'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key==='Enter') $('login-btn').click(); }));
$('sign-out-btn').addEventListener('click', doSignOut);

// ══════════════════════════════════════════════════════════════════
// FILL FORM TAB
// ══════════════════════════════════════════════════════════════════

function detectForFill() {
  getTab(tab => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB_TEXT' }, r => {
      if (chrome.runtime.lastError || !r?.text || r.text.length < 80) return;
      $('fill-job-banner').classList.remove('hidden');
      $('fill-job-title').textContent = r.title || 'Job detected on this page';
    });
  });
}

// One-click fill — everything happens in background.js
$('autofill-now-btn').addEventListener('click', () => {
  const btn = $('autofill-now-btn');
  const err = $('err-fill');
  err.classList.add('hidden');
  $('fill-result-wrap').classList.add('hidden');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner dk"></div> Reading form...';

  getTab(tab => {
    if (!tab) { err.textContent = 'No active tab.'; err.classList.remove('hidden'); btn.disabled = false; btn.innerHTML = '✦ Fill This Form Now'; return; }

    // Ask background to do everything (scan → AI → inject)
    chrome.runtime.sendMessage({ type: 'AUTO_AUTOFILL', tabId: tab.id }, response => {
      btn.disabled = false;
      btn.innerHTML = '✦ Fill This Form Now';

      if (chrome.runtime.lastError || !response) {
        err.textContent = 'Could not fill the form. Try refreshing the page first.';
        err.classList.remove('hidden');
        return;
      }
      if (!response.ok) {
        err.textContent = response.error || 'Fill failed. Try again.';
        err.classList.remove('hidden');
        return;
      }

      // Show result
      const { filled, total } = response;
      const pct = total > 0 ? Math.round(filled/total*100) : 0;
      $('fill-stat-n').textContent = `${filled}/${total}`;
      $('fill-stat-n').className = `fill-stat ${pct >= 65 ? 'good' : 'partial'}`;
      $('fill-stat-lbl').textContent = `fields filled (${pct}% of form)`;
      $('fill-result-wrap').classList.remove('hidden');
      toast(`${filled} fields filled ✓`, 'ok');
    });
  });
});

$('fill-retry-btn').addEventListener('click', () => $('autofill-now-btn').click());
$('fill-reset-btn').addEventListener('click', () => {
  $('fill-result-wrap').classList.add('hidden');
  $('err-fill').classList.add('hidden');
  toast('Ready to fill again', 'ok');
});

// ══════════════════════════════════════════════════════════════════
// JOB SCORE TAB
// ══════════════════════════════════════════════════════════════════

let scoringOn = false;

function toggleScoring() {
  scoringOn = !scoringOn;
  $('score-switch').classList.toggle('on', scoringOn);
  $('score-status-note').textContent = scoringOn
    ? 'Scoring is ON — AYN will show your match score on every job card as you scroll.'
    : 'Turn on to see a 1–10 match score on every job card as you scroll LinkedIn, Indeed, or Jobright.';

  getTab(tab => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: scoringOn ? 'START_CARD_SCORING' : 'STOP_CARD_SCORING' });
  });
  if (scoringOn) toast('Job scoring ON — scroll to see scores','ok');
  else toast('Job scoring OFF');
}
window.toggleScoring = toggleScoring;

// Role suggestions
$('suggest-roles-btn').addEventListener('click', async () => {
  const btn = $('suggest-roles-btn');
  const err = $('err-jobs');
  err.classList.add('hidden');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Analysing your resume...';

  chrome.runtime.sendMessage({ type: 'SUGGEST_ROLES' }, response => {
    btn.disabled = false;
    btn.innerHTML = 'Get My Best Job Titles →';
    if (!response?.roles?.length) {
      err.textContent = 'Could not get suggestions. Make sure your primary resume is saved in AYN.';
      err.classList.remove('hidden');
      return;
    }
    renderRoles(response);
  });
});

function renderRoles({ roles, keywords, summary }) {
  $('suggest-roles-btn').classList.add('hidden');
  $('roles-result').classList.remove('hidden');
  if (summary) $('roles-summary').textContent = summary;

  const rc = $('roles-chips');
  rc.innerHTML = '';
  roles.forEach(role => {
    const chip = document.createElement('span');
    chip.className = 'role-chip';
    chip.innerHTML = `${esc(role)} <span class="copy-icon">⎘</span>`;
    chip.addEventListener('click', () => {
      navigator.clipboard.writeText(role).then(() => toast(`Copied: "${role}"`, 'ok'));
    });
    rc.appendChild(chip);
  });

  const kc = $('kw-search-chips');
  kc.innerHTML = '';
  (keywords || []).forEach(kw => {
    const chip = document.createElement('span');
    chip.className = 'kw-chip-s';
    chip.textContent = kw;
    chip.style.cursor = 'pointer';
    chip.addEventListener('click', () => {
      navigator.clipboard.writeText(kw).then(() => toast(`Copied: "${kw}"`, 'ok'));
    });
    kc.appendChild(chip);
  });
}

// ══════════════════════════════════════════════════════════════════
// TAILOR CV TAB
// ══════════════════════════════════════════════════════════════════

function loadSavedResume() {
  chrome.storage.local.get(['savedResume'], d => {
    if (d.savedResume) { $('resume-input').value = d.savedResume; $('resume-chars').textContent = d.savedResume.length; }
  });
}
let saveT;
$('resume-input').addEventListener('input', e => {
  $('resume-chars').textContent = e.target.value.length;
  clearTimeout(saveT); saveT = setTimeout(() => chrome.storage.local.set({ savedResume: e.target.value }), 800);
});
$('job-input').addEventListener('input', e => $('job-chars').textContent = e.target.value.length);

function detectForTailor() {
  getTab(tab => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB_TEXT' }, r => {
      if (chrome.runtime.lastError || !r?.text || r.text.length < 80) return;
      const parts = r.title?.split(/\bat\b|\s[-|]\s/i) || [];
      S.jobTitle = parts[0]?.trim() || '';
      S.company = parts[1]?.replace(/linkedin|indeed|glassdoor|jobright/gi,'').trim() || '';
      $('t-job-banner').classList.remove('hidden');
      $('t-job-title').textContent = r.title || 'Job detected';
      $('t-job-sub').textContent = `${r.text.length.toLocaleString()} chars`;
      $('t-job-banner').dataset.text = r.text;
    });
  });
}
$('use-job-btn').addEventListener('click', () => {
  const text = $('t-job-banner').dataset.text || '';
  $('job-input').value = text; $('job-chars').textContent = text.length;
  $('t-job-banner').classList.add('hidden'); toast('Job loaded ✓','ok');
});

$('analyze-btn').addEventListener('click', async () => {
  const resume = $('resume-input').value.trim(), job = $('job-input').value.trim();
  const err = $('err-t1'); err.classList.add('hidden');
  if (resume.length < 50) { err.textContent = 'Paste your resume first.'; err.classList.remove('hidden'); return; }
  if (job.length < 50) { err.textContent = 'Load or paste the job description first.'; err.classList.remove('hidden'); return; }
  S.resume = resume; S.job = job;
  const btn = $('analyze-btn'); btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Analysing...';
  try {
    const d = await callFn('smart_tailor', { resumeText: resume, jdText: job, jobTitle: S.jobTitle, company: S.company });
    S.keywords = d.keywords||[]; S.tailoredText = d.tailoredText||''; S.changes = d.changes||[];
    renderKw(S.keywords); show('v-t2');
  } catch(e) { err.textContent = e.message; err.classList.remove('hidden'); }
  finally { btn.disabled = false; btn.innerHTML = 'See My Keyword Match →'; }
});

function renderKw(kws) {
  const m = kws.filter(k=>k.inResume).length;
  $('kw-count').textContent = `${m}/${kws.length} matched`;
  const wrap = $('kw-chips'); wrap.innerHTML = '';
  kws.forEach(kw => {
    const s = document.createElement('span');
    s.className = `kc ${kw.inResume?'matched':'missing'}`;
    s.textContent = (kw.inResume?'✓ ':'')+kw.text;
    wrap.appendChild(s);
  });
}

$('tailor-btn').addEventListener('click', async () => {
  if (S.tailoredText) { renderResult(S.tailoredText,S.changes); show('v-t3'); return; }
  const btn = $('tailor-btn'); btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Tailoring...';
  try {
    const d = await callFn('smart_tailor', { resumeText: S.resume, jdText: S.job, jobTitle: S.jobTitle, company: S.company });
    S.tailoredText = d.tailoredText||''; S.changes = d.changes||[];
    renderResult(S.tailoredText,S.changes); show('v-t3');
  } catch(e) { $('err-t2').textContent = e.message; $('err-t2').classList.remove('hidden'); }
  finally { btn.disabled = false; btn.innerHTML = 'Tailor My Resume ✦'; }
});

function renderResult(text, changes) {
  $('resume-out').textContent = text;
  const list = $('changes-list'); list.innerHTML = '';
  (changes.length?changes:['Keywords woven in where your experience supported it.']).forEach(c => {
    list.innerHTML += `<li><div class="cdot"></div><span>${esc(c)}</span></li>`;
  });
}

$('back-t1').addEventListener('click', () => show('v-t1'));
$('back-t2').addEventListener('click', () => show('v-t2'));
$('copy-btn').addEventListener('click', () => {
  if (!S.tailoredText) return;
  navigator.clipboard.writeText(S.tailoredText).then(() => { $('copy-btn').textContent = '✓ Copied!'; toast('Copied','ok'); setTimeout(()=>$('copy-btn').textContent='Copy Resume',2000); });
});
$('new-job-btn').addEventListener('click', () => {
  S.keywords=[]; S.tailoredText=''; S.changes=[]; S.jobTitle=''; S.company='';
  $('job-input').value=''; $('job-chars').textContent='0';
  $('t-job-banner').classList.add('hidden');
  show('v-t1'); detectForTailor();
});

// ── Helpers ───────────────────────────────────────────────────────
function getTab(cb) { chrome.tabs.query({ active:true, currentWindow:true }, tabs => cb(tabs[0]||null)); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Boot ──────────────────────────────────────────────────────────
restoreSession();
