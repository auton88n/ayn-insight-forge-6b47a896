// sidepanel.js — AYN Resume Tailor Chrome Extension

const SUPABASE_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw';

// ── State ──
const state = {
  step: 1,
  resume: '',
  job: '',
  jobTitle: '',
  company: '',
  keywords: [],      // { text, inResume }[]
  tailoredText: '',
  changes: [],
  detectedJob: null,
};

const $ = id => document.getElementById(id);

// ── Step navigation ──
function goTo(n) {
  state.step = n;
  ['v1','v2','v3'].forEach((id, i) => {
    $(`v${i+1}`).classList.toggle('active', i+1 === n);
  });
  ['s1','s2','s3','s4'].forEach((id, i) => {
    const el = $(id);
    el.classList.remove('active','done');
    if (i+1 === n) el.classList.add('active');
    if (i+1 < n) el.classList.add('done');
  });
  // s4 is just Export, gets "done" when on step 3
  if (n === 3) $('s4').classList.add('active');
}

// ── Toast ──
function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ── API call to resume-hub ──
async function callHub(body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/resume-hub`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Render keyword chips ──
function renderKeywords(keywords) {
  const matched = keywords.filter(k => k.inResume).length;
  $('kw-count').textContent = `${matched} / ${keywords.length} matched`;
  const wrap = $('kw-chips');
  wrap.innerHTML = '';
  keywords.forEach(kw => {
    const span = document.createElement('span');
    span.className = `kw-chip ${kw.inResume ? 'matched' : 'missing'}`;
    span.textContent = (kw.inResume ? '✓ ' : '') + kw.text;
    wrap.appendChild(span);
  });
}

// ── Detect job from active tab ──
function detectJob() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]?.id) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT_JOB_TEXT' }, result => {
      if (chrome.runtime.lastError || !result?.text || result.text.length < 80) return;
      state.detectedJob = { text: result.text, title: result.title || '', url: tabs[0].url || '' };

      // Try to extract company from title (e.g. "Senior PM at Shopify | LinkedIn")
      const titleParts = result.title?.split(/\bat\b|\bin\b|\|/i) || [];
      state.company = titleParts[1]?.trim().replace(/linkedin|indeed|glassdoor|jobright/gi, '').trim() || '';
      state.jobTitle = titleParts[0]?.trim() || '';

      $('job-banner').classList.remove('hidden');
      $('job-banner-title').textContent = result.title || 'Job detected on this page';
      $('job-banner-sub').textContent = `${result.text.length} characters · click to load`;
    });
  });

  // Also check storage for recently saved job
  chrome.runtime.sendMessage({ type: 'GET_JOB_TEXT' }, data => {
    if (!data?.lastJobText || data.lastJobText.length < 80) return;
    const age = Date.now() - (data.extractedAt || 0);
    if (age > 5 * 60 * 1000) return; // stale after 5 min
    if (state.detectedJob) return; // already got one from the tab
    state.detectedJob = { text: data.lastJobText, title: data.lastJobTitle || '', url: data.lastJobUrl || '' };
    $('job-banner').classList.remove('hidden');
    $('job-banner-title').textContent = data.lastJobTitle || 'Job detected';
    $('job-banner-sub').textContent = `${data.lastJobText.length} chars · click to load`;
  });
}

// ── Load saved resume ──
chrome.storage.local.get(['savedResume'], data => {
  if (data.savedResume) {
    $('resume-input').value = data.savedResume;
    $('resume-chars').textContent = data.savedResume.length;
  }
});

// Debounced save
let saveTimer;
$('resume-input').addEventListener('input', e => {
  $('resume-chars').textContent = e.target.value.length;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ savedResume: e.target.value }), 800);
});
$('job-input').addEventListener('input', e => { $('job-chars').textContent = e.target.value.length; });

// Use detected job
$('use-job-btn').addEventListener('click', () => {
  if (!state.detectedJob) return;
  $('job-input').value = state.detectedJob.text;
  $('job-chars').textContent = state.detectedJob.text.length;
  $('job-banner').classList.add('hidden');
  toast('Job loaded ✓', 'success');
});

// ── Step 1 → 2: Analyze keywords ──
$('analyze-btn').addEventListener('click', async () => {
  const resume = $('resume-input').value.trim();
  const job = $('job-input').value.trim();
  const errEl = $('err1');
  errEl.classList.add('hidden');

  if (resume.length < 50) { errEl.textContent = 'Paste your resume first (50+ chars).'; errEl.classList.remove('hidden'); return; }
  if (job.length < 50) { errEl.textContent = 'Paste or load the job description first.'; errEl.classList.remove('hidden'); return; }

  state.resume = resume;
  state.job = job;

  const btn = $('analyze-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Detecting keywords...';

  try {
    const data = await callHub({
      action: 'smart_tailor',
      resumeText: resume,
      jdText: job,
      jobTitle: state.jobTitle,
      company: state.company,
    });

    state.keywords = data.keywords || [];
    state.tailoredText = data.tailoredText || '';
    state.changes = data.changes || [];

    renderKeywords(state.keywords);
    goTo(2);
  } catch (err) {
    errEl.textContent = err.message || 'Something went wrong. Try again.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Detect Keywords →';
  }
});

// ── Back buttons ──
$('back1-btn').addEventListener('click', () => goTo(1));
$('back2-btn').addEventListener('click', () => goTo(2));

// ── Step 2 → 3: Tailor ──
// We already have the tailored text from step 1 (smart_tailor returns both)
// So just show it immediately — no second API call needed.
$('tailor-btn').addEventListener('click', async () => {
  const errEl = $('err2');
  errEl.classList.add('hidden');

  if (state.tailoredText) {
    // Already got the tailored text in step 1 — show it directly
    renderTailoredResult(state.tailoredText, state.changes);
    goTo(3);
    return;
  }

  // Fallback: call again if somehow missing
  const btn = $('tailor-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Tailoring...';

  try {
    const data = await callHub({
      action: 'smart_tailor',
      resumeText: state.resume,
      jdText: state.job,
      jobTitle: state.jobTitle,
      company: state.company,
    });
    state.tailoredText = data.tailoredText || '';
    state.changes = data.changes || [];
    renderTailoredResult(state.tailoredText, state.changes);
    goTo(3);
  } catch (err) {
    errEl.textContent = err.message || 'Tailoring failed. Try again.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Tailor My Resume ✦';
  }
});

function renderTailoredResult(text, changes) {
  $('resume-out').textContent = text;
  const list = $('changes-list');
  list.innerHTML = '';
  if (changes.length === 0) {
    list.innerHTML = '<li><div class="change-dot"></div><span>Keywords woven in where supported by your experience.</span></li>';
  } else {
    changes.forEach(c => {
      list.innerHTML += `<li><div class="change-dot"></div><span>${c}</span></li>`;
    });
  }
}

// ── Copy ──
$('copy-btn').addEventListener('click', () => {
  if (!state.tailoredText) return;
  navigator.clipboard.writeText(state.tailoredText).then(() => {
    $('copy-btn').textContent = '✓ Copied!';
    toast('Copied to clipboard', 'success');
    setTimeout(() => { $('copy-btn').textContent = 'Copy Resume'; }, 2000);
  });
});

// ── New job ──
$('new-job-btn').addEventListener('click', () => {
  state.keywords = [];
  state.tailoredText = '';
  state.changes = [];
  state.detectedJob = null;
  state.jobTitle = '';
  state.company = '';
  $('job-input').value = '';
  $('job-chars').textContent = '0';
  $('job-banner').classList.add('hidden');
  $('err1').classList.add('hidden');
  $('err2').classList.add('hidden');
  $('err3').classList.add('hidden');
  goTo(1);
  detectJob();
});

// ── Init ──
goTo(1);
detectJob();
