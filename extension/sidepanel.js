// sidepanel.js — AYN Resume Tailor (one-click sign-in via background)

const S = {
  user: null,
  tab: 'fill',
  resume: '', job: '', jobTitle: '', company: '',
  keywords: [], tailoredText: '', changes: [],
};

const $ = id => document.getElementById(id);
function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2600);
}

const VIEWS = ['v-login','v-fill','v-jobs','v-contact','v-cover','v-tracker','v-t1','v-t2','v-t3'];
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

function switchTab(tab) {
  S.tab = tab;
  ['fill','jobs','contact','cover','tracker','tailor'].forEach(t => $(`tab-${t}`)?.classList.toggle('active', t===tab));
  if (tab === 'fill')    { show('v-fill');    detectForFill(); }
  if (tab === 'jobs')    { show('v-jobs'); }
  if (tab === 'contact') { show('v-contact'); detectForContacts(); }
  if (tab === 'cover')   { show('v-cover');   detectForCover(); }
  if (tab === 'tracker') { show('v-tracker'); loadTracker(); }
  if (tab === 'tailor')  { show('v-t1');      detectForTailor(); }
}
window.switchTab = switchTab;

// ════════════════════════════════════════════════════════════════
// AUTH — one-click sign-in via aynn.io
// ════════════════════════════════════════════════════════════════

let pollTimer = null;
function clearPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

async function startSignIn() {
  $('login-err').classList.add('hidden');
  $('signin-btn').disabled = true;
  $('signin-btn').innerHTML = '<div class="spinner"></div>Opening AYN...';
  $('login-status').textContent = '';

  // Build a friendly device label
  const platformInfo = await (chrome.runtime.getPlatformInfo?.() || Promise.resolve({ os: 'Chrome' }));
  const deviceLabel = `Chrome — ${platformInfo.os || 'Browser'}`;

  chrome.runtime.sendMessage({ type: 'LINK_START', deviceLabel }, resp => {
    if (!resp?.ok) {
      $('login-err').textContent = resp?.error || 'Could not start sign-in';
      $('login-err').classList.remove('hidden');
      resetSignInBtn();
      return;
    }
    $('signin-btn').innerHTML = '<div class="spinner"></div>Waiting for approval...';
    $('login-status').textContent = 'Approve in the new tab. This page will refresh automatically.';
    pollForApproval(resp.code, Date.now() + 5 * 60 * 1000);
  });
}

function resetSignInBtn() {
  $('signin-btn').disabled = false;
  $('signin-btn').innerHTML = '<i class="ti ti-shield-check"></i>Sign in with AYN';
}

function pollForApproval(code, deadline) {
  clearPoll();
  pollTimer = setInterval(() => {
    if (Date.now() > deadline) {
      clearPoll();
      $('login-err').textContent = 'Sign-in timed out. Try again.';
      $('login-err').classList.remove('hidden');
      $('login-status').textContent = '';
      resetSignInBtn();
      return;
    }
    chrome.runtime.sendMessage({ type: 'LINK_POLL', code }, resp => {
      if (!resp) return;
      if (resp.status === 'approved') {
        clearPoll();
        $('login-status').textContent = 'Approved! Signing in...';
        bootAfterAuth();
      } else if (resp.status === 'expired' || resp.status === 'not_found') {
        clearPoll();
        $('login-err').textContent = 'Approval expired. Try again.';
        $('login-err').classList.remove('hidden');
        $('login-status').textContent = '';
        resetSignInBtn();
      }
    });
  }, 2000);
}

function syncRemoteResume(resp) {
  // Convert structured resume to plain text and cache locally so Cover/Tailor work out of the box
  const c = resp?.resume?.content;
  if (!c) return;
  const basics = c.basics || {};
  const lines = [];
  if (basics.name) lines.push(basics.name);
  const contact = [basics.email, basics.phone, basics.location].filter(Boolean).join(' | ');
  if (contact) lines.push(contact);
  if (basics.summary) lines.push('\nSUMMARY\n' + basics.summary);
  if (Array.isArray(c.work) && c.work.length) {
    lines.push('\nEXPERIENCE');
    c.work.forEach(w => {
      lines.push(`\n${w.title || ''} | ${w.company || ''}  ${w.start || ''} - ${w.end || 'Present'}`);
      (w.bullets || []).forEach(b => lines.push(`- ${b}`));
    });
  }
  if (Array.isArray(c.education) && c.education.length) {
    lines.push('\nEDUCATION');
    c.education.forEach(e => lines.push(`${e.degree || ''} | ${e.school || ''}  ${e.end || ''}`));
  }
  if (Array.isArray(c.skills) && c.skills.length) lines.push('\nSKILLS\n' + c.skills.join(', '));
  const text = lines.join('\n').trim();
  if (text) chrome.storage.local.set({ savedResume: text });
}

function displayEmail(resp) {
  const email = resp?.user?.email || resp?.profile?.email || '';
  const device = resp?.user?.device || '';
  const el = $('user-email');
  el.textContent = email || device || 'Connected';
  el.title = email ? `${email}\nDevice: ${device}` : device;
}

async function bootAfterAuth() {
  chrome.runtime.sendMessage({ type: 'BOOTSTRAP' }, resp => {
    if (resp?.error || !resp?.user) {
      // Stale or invalid token — clear and force fresh sign-in
      chrome.runtime.sendMessage({ type: 'SIGN_OUT' }, () => {
        $('login-err').textContent = resp?.error || 'Sign-in failed';
        $('login-err').classList.remove('hidden');
        resetSignInBtn();
        show('v-login');
      });
      return;
    }
    S.user = resp.user;
    displayEmail(resp);
    syncRemoteResume(resp);
    switchTab('fill');
    loadSavedResume();
    toast('Signed in ✓', 'ok');
  });
}

async function restoreSession() {
  const stored = await chrome.storage.local.get(['ayn_token']);
  if (!stored.ayn_token) { show('v-login'); return; }
  chrome.runtime.sendMessage({ type: 'BOOTSTRAP' }, resp => {
    if (resp?.error || !resp?.user) {
      // Token is stale/invalid — wipe so user can sign in again cleanly
      chrome.runtime.sendMessage({ type: 'SIGN_OUT' }, () => show('v-login'));
      return;
    }
    S.user = resp.user;
    displayEmail(resp);
    syncRemoteResume(resp);
    switchTab('fill');
    loadSavedResume();
  });
}

$('signin-btn').addEventListener('click', startSignIn);
$('sign-out-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'SIGN_OUT' }, () => {
    S.user = null;
    clearPoll();
    resetSignInBtn();
    show('v-login');
    toast('Signed out');
  });
});

// ════════════════════════════════════════════════════════════════
// Helper: call backend via background (handles auth)
// ════════════════════════════════════════════════════════════════
function bg(type, payload) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type, ...payload }, resolve));
}

// ════════════════════════════════════════════════════════════════
// FILL FORM
// ════════════════════════════════════════════════════════════════

const F = { jobTitle: '', company: '', jobUrl: '', kind: 'other' };

function detectForFill() {
  // Reset UI
  $('fill-empty').classList.add('hidden');
  $('fill-job-banner').classList.add('hidden');
  $('fill-result-wrap').classList.add('hidden');
  $('autofill-now-btn').classList.add('hidden');
  $('err-fill').classList.add('hidden');

  getTab(tab => {
    if (!tab) {
      $('fill-empty-title').textContent = 'No active tab';
      $('fill-empty-sub').textContent = 'Open a job application page and try again.';
      $('fill-empty').classList.remove('hidden');
      return;
    }
    F.jobUrl = tab.url || '';
    chrome.tabs.sendMessage(tab.id, { type: 'DETECT_PAGE' }, r => {
      if (chrome.runtime.lastError || !r) {
        $('fill-empty-title').textContent = 'Page not scannable yet';
        $('fill-empty-sub').textContent = 'Refresh this page (Cmd/Ctrl+R), then click Scan again.';
        $('fill-empty').classList.remove('hidden');
        return;
      }

      F.jobTitle = r.title || '';
      F.company = r.company || extractCompanyFromTitle(r.title || '');
      F.kind = r.kind;

      if (r.kind === 'ayn') {
        $('fill-empty-title').textContent = "You're on AYN, not a job page";
        $('fill-empty-sub').textContent = 'Open a job application form in another tab (LinkedIn Easy Apply, Workday, Greenhouse, Lever…) then come back here.';
        $('fill-empty').classList.remove('hidden');
        return;
      }
      if (!r.hasForm) {
        $('fill-empty-title').textContent = r.kind === 'job_listing'
          ? 'This looks like a job listing, not the application form'
          : 'No application form detected on this page';
        $('fill-empty-sub').textContent = r.kind === 'job_listing'
          ? 'Click "Apply" / "Easy Apply" first, then come back here.'
          : 'Open the actual apply form (LinkedIn Easy Apply, Workday, Greenhouse, Lever, Ashby, SmartRecruiters…) and click Scan again.';
        $('fill-empty').classList.remove('hidden');
        return;
      }

      // Form found — show ready state
      if (r.title) {
        $('fill-job-title').textContent = r.title;
        $('fill-job-sub').textContent = F.company || '';
        $('fill-job-logo').textContent = (F.company || r.title || '·').trim().charAt(0) || '·';
        $('fill-job-banner').classList.remove('hidden');
      }
      $('fill-field-count').textContent = r.fieldCount;
      $('autofill-now-btn').classList.remove('hidden');

      // Show resume-attach hint + download button if page asks for a resume file
      const dlWrap = $('fill-resume-dl-wrap');
      if (dlWrap) {
        if (r.needsResume) dlWrap.classList.remove('hidden');
        else dlWrap.classList.add('hidden');
      }
    });
  });
}

// Download AYN resume as ATS plain text (.txt) so the user can attach it manually
document.getElementById('fill-download-resume-btn')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<div class="spinner"></div>Preparing...';
  try {
    const r = await new Promise(res => chrome.runtime.sendMessage({ type: 'BG_FUNC', action: 'ext_download_resume_text', payload: {} }, res));
    if (!r || !r.ok) throw new Error(r?.error || 'Failed');
    const blob = new Blob([r.data.text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = r.data.filename || 'Resume_AYN.txt'; a.click();
    URL.revokeObjectURL(url);
    // Walk the stepper forward
    document.getElementById('dl-step-1')?.classList.add('done');
    document.getElementById('dl-step-2')?.classList.add('now');
    document.getElementById('fill-dl-success')?.classList.remove('hidden');
    toast('Downloaded ✓ — now attach it on the form', 'ok');
  } catch (err) {
    toast(err.message || 'Download failed', 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-check"></i>Re-download';
  }
});

$('fill-rescan-btn')?.addEventListener('click', detectForFill);

$('autofill-now-btn').addEventListener('click', () => {
  const btn = $('autofill-now-btn');
  const err = $('err-fill');
  err.classList.add('hidden');
  $('fill-result-wrap').classList.add('hidden');
  $('fill-save-tracker-btn').classList.add('hidden');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div>Reading form...';

  getTab(tab => {
    if (!tab) { err.textContent = 'No active tab.'; err.classList.remove('hidden'); btn.disabled = false; btn.innerHTML = '<i class="ti ti-bolt"></i>Fill This Form Now'; return; }
    chrome.runtime.sendMessage({ type: 'AUTO_AUTOFILL', tabId: tab.id }, response => {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-bolt"></i>Fill This Form Now';

      if (!response) {
        err.textContent = 'Refresh this page (Cmd+R / Ctrl+R) and try again.';
        err.classList.remove('hidden'); return;
      }
      if (!response.ok) {
        const m = {
          'not_signed_in': 'Sign in first.',
          'no_content_script': 'Refresh this page (Cmd+R / Ctrl+R), then try again.',
          'no_fields': 'No fillable fields here. Open an actual apply form (Easy Apply, Workday, Greenhouse…) and try again.',
          'no_values': "AYN couldn't match any of your saved profile data to these fields. Add a few more answers in Resume Hub → Profile and retry. (Partial profiles still work — these specific fields just didn't match.)",
        };
        err.textContent = m[response.error] || response.error || 'Fill failed. Try again.';
        err.classList.remove('hidden'); return;
      }

      const { filled, total, details } = response;
      const pct = total > 0 ? Math.round(filled/total*100) : 0;
      $('fill-stat-n').textContent = `${filled}/${total}`;
      $('fill-stat-lbl').textContent = `${pct}%`;
      const fillBar = $('fill-progress-fill');
      fillBar.style.width = pct + '%';
      fillBar.className = 'progress-fill' + (pct >= 65 ? '' : ' partial');

      const list = $('fill-result-list');
      list.innerHTML = '';
      (details || []).forEach(d => {
        list.innerHTML += `
          <div class="fi">
            <div class="fd ${d.ok ? 'on' : 'off'}"></div>
            <div class="fl">${esc(d.label || d.id)}</div>
            <div class="fv">${d.ok ? esc((d.value||'').slice(0,22)) : esc(d.reason||'skipped')}</div>
          </div>`;
      });

      $('fill-result-wrap').classList.remove('hidden');
      if (F.jobTitle && F.company) $('fill-save-tracker-btn').classList.remove('hidden');
      toast(`${filled} fields filled ✓`, 'ok');
    });
  });
});

$('fill-save-tracker-btn').addEventListener('click', () => {
  if (!F.jobTitle) { toast('No job detected', 'err'); return; }
  saveApplication({ jobTitle: F.jobTitle, company: F.company || 'Unknown', jobUrl: F.jobUrl, status: 'applied' });
  $('fill-save-tracker-btn').classList.add('hidden');
});

$('fill-retry-btn').addEventListener('click', () => $('autofill-now-btn').click());
$('fill-reset-btn').addEventListener('click', () => {
  $('fill-result-wrap').classList.add('hidden');
  $('err-fill').classList.add('hidden');
});

// ════════════════════════════════════════════════════════════════
// JOB SCORE
// ════════════════════════════════════════════════════════════════

let scoringOn = false;
function toggleScoring() {
  scoringOn = !scoringOn;
  $('score-switch').classList.toggle('on', scoringOn);
  $('score-status-note').textContent = scoringOn
    ? 'ON — AYN scores every job card as you scroll.'
    : 'Turn on to see a 1-10 match score on every job card.';
  getTab(tab => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: scoringOn ? 'START_CARD_SCORING' : 'STOP_CARD_SCORING' });
  });
  toast(scoringOn ? 'Job scoring ON' : 'Job scoring OFF', 'ok');
}
window.toggleScoring = toggleScoring;

// ── Score THIS job (any job page, panel result) ─────────────────
const SJ = { jobTitle: '', company: '', jobText: '' };
function detectForScore() {
  $('score-job-banner').classList.add('hidden');
  $('score-no-job').classList.add('hidden');
  $('score-result').classList.add('hidden');
  $('err-score-job').classList.add('hidden');
  getTab(tab => {
    if (!tab) { $('score-no-job').classList.remove('hidden'); return; }
    chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB_TEXT' }, r => {
      if (chrome.runtime.lastError || !r?.text || r.text.length < 50) {
        $('score-no-job').classList.remove('hidden'); return;
      }
      SJ.jobTitle = r.title || '';
      SJ.company = r.company || extractCompanyFromTitle(r.title || '');
      SJ.jobText = r.text;
      $('score-job-title').textContent = SJ.jobTitle || 'Job detected';
      $('score-job-company').textContent = SJ.company || tab.url;
      $('score-job-logo').textContent = (SJ.company || SJ.jobTitle || '·').trim().charAt(0) || '·';
      $('score-job-banner').classList.remove('hidden');
    });
  });
}

function scoreTier(n) {
  if (n >= 9) return 's-strong'; if (n >= 7) return 's-good';
  if (n >= 4) return 's-fair';   return 's-poor';
}

$('score-this-job-btn')?.addEventListener('click', async () => {
  const btn = $('score-this-job-btn'), err = $('err-score-job');
  err.classList.add('hidden');
  $('score-result').classList.add('hidden');
  if (!SJ.jobText) { err.textContent = 'Open a job posting first, then click Score This Job.'; err.classList.remove('hidden'); return; }
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>Scoring...';
  try {
    const d = await bgFunc('ext_job_score', { jobTitle: SJ.jobTitle, company: SJ.company, jobSnippet: SJ.jobText.slice(0, 2000) });
    const score = d.score || 0;
    const tier = scoreTier(score);
    $('score-num').innerHTML = `${score}<small>/10</small>`;
    $('score-num').className = 'score-num ' + tier;
    $('score-label').textContent = d.matchLabel || '';
    $('score-label').style.color = ({ 's-strong':'#15803d','s-good':'#65a30d','s-fair':'#d97706','s-poor':'#b91c1c' })[tier];
    const sal = $('score-salary');
    if (d.salaryEstimate) { sal.textContent = d.salaryEstimate; sal.classList.remove('hidden'); } else sal.classList.add('hidden');
    const ul = $('score-reasons'); ul.innerHTML = '';
    (d.reasons || []).forEach(rsn => { const li = document.createElement('li'); li.textContent = rsn; ul.appendChild(li); });
    $('score-result').classList.remove('hidden');
  } catch (e) { err.textContent = e.message || 'Score failed.'; err.classList.remove('hidden'); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="ti ti-target-arrow"></i>Score This Job'; }
});

$('suggest-roles-btn').addEventListener('click', async () => {
  const btn = $('suggest-roles-btn'), err = $('err-jobs');
  err.classList.add('hidden');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner dk"></div>Analysing...';
  chrome.runtime.sendMessage({ type: 'SUGGEST_ROLES' }, resp => {
    btn.disabled = false;
    btn.innerHTML = 'Get My Best Job Titles →';
    if (!resp?.roles?.length) {
      err.textContent = 'Could not get suggestions. Make sure your primary resume is saved in AYN.';
      err.classList.remove('hidden'); return;
    }
    renderRoles(resp);
  });
});

function renderRoles({ roles, keywords, summary }) {
  $('suggest-roles-btn').classList.add('hidden');
  $('roles-result').classList.remove('hidden');
  if (summary) $('roles-summary').textContent = summary;
  const rc = $('roles-chips'); rc.innerHTML = '';
  roles.forEach(role => {
    const chip = document.createElement('span');
    chip.className = 'role-chip';
    chip.innerHTML = `${esc(role)} <span style="opacity:.5">⎘</span>`;
    chip.addEventListener('click', () => navigator.clipboard.writeText(role).then(() => toast(`Copied: "${role}"`, 'ok')));
    rc.appendChild(chip);
  });
  const kc = $('kw-search-chips'); kc.innerHTML = '';
  (keywords || []).forEach(kw => {
    const chip = document.createElement('span');
    chip.className = 'kw-chip-s';
    chip.textContent = kw;
    chip.addEventListener('click', () => navigator.clipboard.writeText(kw).then(() => toast(`Copied: "${kw}"`, 'ok')));
    kc.appendChild(chip);
  });
}

// ════════════════════════════════════════════════════════════════
// CONTACTS
// ════════════════════════════════════════════════════════════════

const C = { jobTitle: '', company: '', jobUrl: '', jobSnippet: '' };

function detectForContacts() {
  $('contact-no-job').classList.add('hidden');
  $('contact-job-info').classList.add('hidden');
  getTab(tab => {
    if (!tab) { $('contact-no-job').classList.remove('hidden'); return; }
    chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB_TEXT' }, r => {
      if (chrome.runtime.lastError || !r?.text || r.text.length < 50) {
        $('contact-no-job').classList.remove('hidden'); return;
      }
      C.jobTitle = r.title || ''; C.company = r.company || extractCompanyFromTitle(r.title || '');
      C.jobUrl = tab.url || ''; C.jobSnippet = r.text.slice(0, 800);
      $('contact-job-info').classList.remove('hidden');
      $('contact-job-title').textContent = C.jobTitle || 'Job detected';
      $('contact-company-name').textContent = C.company ? `at ${C.company}` : tab.url;
    });
  });
}

function extractCompanyFromTitle(title) {
  const parts = title.split(/\s+at\s+|\s+[-|@]\s+/i);
  if (parts.length > 1) return parts[1].replace(/linkedin|indeed|glassdoor|jobright|greenhouse/gi,'').trim();
  return '';
}

$('find-contacts-btn').addEventListener('click', async () => {
  const btn = $('find-contacts-btn'), err = $('err-contact');
  err.classList.add('hidden');
  $('contact-results').classList.add('hidden');
  if (!C.company && !C.jobTitle) {
    err.textContent = 'Navigate to a job posting first, then try again.';
    err.classList.remove('hidden'); return;
  }
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>Finding contacts...';
  try {
    const data = await bgFunc('ext_find_contacts', { company: C.company, jobTitle: C.jobTitle, jobUrl: C.jobUrl, jobSnippet: C.jobSnippet });
    if (data.error) throw new Error(data.error);
    renderContacts(data);
    $('contact-results').classList.remove('hidden');
  } catch (e) {
    err.textContent = e.message || 'Could not find contacts. Try again.';
    err.classList.remove('hidden');
  } finally { btn.disabled = false; btn.innerHTML = 'Find Who to Contact →'; }
});

function renderContacts({ contacts = [], emailFormats = [], companyDomain = '', coldOutreach = '', subjectLine = '' }) {
  const cards = $('contact-cards'); cards.innerHTML = '';
  contacts.forEach(c => {
    const titles = (c.titles || [c.role]).join(', ');
    const liSearch = c.linkedinSearchUrl ||
      `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(c.role)}&currentCompany=%5B%22${encodeURIComponent(C.company)}%22%5D`;
    cards.innerHTML += `
      <div class="contact-card">
        <div class="contact-card-title">${esc(c.role)}</div>
        <div class="contact-card-why">${esc(c.why || '')} <span style="color:#aaa;font-size:10px">${esc(titles)}</span></div>
        <div class="contact-actions">
          <a class="contact-link linkedin" href="${liSearch}" target="_blank" rel="noopener noreferrer">Search on LinkedIn</a>
          <button class="contact-link copy" data-link="${liSearch}">Copy Link</button>
        </div>
      </div>`;
  });
  cards.querySelectorAll('button.copy').forEach(b => {
    b.addEventListener('click', () => copyToClip(b.dataset.link, 'LinkedIn search link copied'));
  });

  const domain = companyDomain || (C.company || '').toLowerCase().replace(/\s+/g,'')+'.com';
  $('domain-name').textContent = domain;
  const fmts = $('email-fmts'); fmts.innerHTML = '';
  const exampleFormats = emailFormats.length ? emailFormats : ['firstname.lastname@' + domain, 'f.lastname@' + domain, 'firstname@' + domain];
  exampleFormats.forEach(fmt => {
    const btn = document.createElement('button');
    btn.className = 'email-fmt';
    btn.textContent = fmt;
    btn.addEventListener('click', () => copyToClip(fmt, `Copied: ${fmt}`));
    fmts.appendChild(btn);
  });

  $('subject-line').textContent = subjectLine || `Re: ${C.jobTitle} at ${C.company}`;
  $('outreach-text').textContent = coldOutreach || '';
}

function copyToClip(text, msg) { navigator.clipboard.writeText(text).then(() => toast(msg || 'Copied', 'ok')); }
window.copySubject = () => { const t = $('subject-line').textContent; if (t) copyToClip(t, 'Subject copied'); };
window.copyOutreach = () => { const t = $('outreach-text').textContent; if (t) copyToClip(t, 'Message copied'); };

// ════════════════════════════════════════════════════════════════
// COVER LETTER
// ════════════════════════════════════════════════════════════════

const CL = { jobTitle: '', company: '', jobText: '', resumeText: '' };

function detectForCover() {
  $('cover-no-job').classList.add('hidden');
  $('cover-job-banner').classList.add('hidden');
  getTab(tab => {
    if (!tab) { $('cover-no-job').classList.remove('hidden'); return; }
    chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB_TEXT' }, r => {
      if (chrome.runtime.lastError || !r?.text || r.text.length < 50) {
        $('cover-no-job').classList.remove('hidden'); return;
      }
      CL.jobTitle = r.title || ''; CL.company = r.company || extractCompanyFromTitle(r.title || '');
      CL.jobText = r.text;
      $('cover-job-banner').classList.remove('hidden');
      $('cover-job-title').textContent = CL.jobTitle || 'Job detected';
      $('cover-job-sub').textContent = CL.company ? `at ${CL.company}` : '';
    });
  });
  chrome.storage.local.get(['savedResume'], d => { CL.resumeText = d.savedResume || ''; });
}

async function generateCoverLetter() {
  const err = $('err-cover');
  err.classList.add('hidden');
  if (!CL.jobText) { err.textContent = 'Navigate to a job posting first.'; err.classList.remove('hidden'); return; }
  if (!CL.resumeText) { err.textContent = 'No saved resume. Paste your resume in the Tailor tab first.'; err.classList.remove('hidden'); return; }
  const btn = $('gen-cover-btn'); btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>Writing...';
  try {
    const tone = $('cover-tone').value;
    const data = await bgFunc('ext_cover_letter_text', {
      resumeText: CL.resumeText, jdText: CL.jobText, tone, company: CL.company,
    });
    if (data.error) throw new Error(data.error);
    $('cover-out').textContent = data.body || '';
    $('cover-result').classList.remove('hidden');
  } catch (e) {
    err.textContent = e.message || 'Failed to generate.'; err.classList.remove('hidden');
  } finally { btn.disabled = false; btn.innerHTML = 'Generate Cover Letter →'; }
}

$('gen-cover-btn').addEventListener('click', generateCoverLetter);
$('cover-regen-btn').addEventListener('click', generateCoverLetter);
$('cover-copy-btn').addEventListener('click', () => {
  const text = $('cover-out').textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => { $('cover-copy-btn').textContent = '✓ Copied!'; toast('Copied','ok'); setTimeout(()=>$('cover-copy-btn').textContent='Copy',1800); });
});
$('cover-save-btn').addEventListener('click', () => {
  if (!CL.company || !CL.jobTitle) { toast('No job detected', 'err'); return; }
  saveApplication({ jobTitle: CL.jobTitle, company: CL.company, jobUrl: '', status: 'saved' });
});

// ════════════════════════════════════════════════════════════════
// TRACKER
// ════════════════════════════════════════════════════════════════

let trackerApps = [];

function saveApplication(app) {
  chrome.runtime.sendMessage({ type: 'SAVE_APPLICATION', payload: app }, r => {
    if (r?.ok) { toast('Saved to tracker ✓','ok'); loadTracker(); }
    else toast(r?.error || 'Could not save','err');
  });
}

function loadTracker() {
  $('tracker-loading').classList.remove('hidden');
  $('tracker-empty').classList.add('hidden');
  $('tracker-list').innerHTML = '';
  chrome.runtime.sendMessage({ type: 'GET_APPLICATIONS', payload: {} }, r => {
    $('tracker-loading').classList.add('hidden');
    if (!r?.applications) { $('tracker-empty').classList.remove('hidden'); return; }
    trackerApps = r.applications;
    if (trackerApps.length === 0) { $('tracker-empty').classList.remove('hidden'); return; }
    renderTracker(trackerApps);
  });
}

function renderTracker(apps) {
  const list = $('tracker-list'); list.innerHTML = '';
  const statusOrder = ['offer','interview','applied','saved','rejected'];
  const sorted = [...apps].sort((a,b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
  sorted.forEach(app => {
    const date = app.applied_at ? new Date(app.applied_at).toLocaleDateString('en-CA',{month:'short',day:'numeric'}) :
                 new Date(app.updated_at || app.created_at).toLocaleDateString('en-CA',{month:'short',day:'numeric'});
    const div = document.createElement('div');
    div.className = 'app-card';
    div.dataset.id = app.id;
    div.innerHTML = `
      <div class="app-card-top">
        <div>
          <div class="app-card-title">${esc(app.job_title)}</div>
          <div class="app-card-company">${esc(app.company)}</div>
        </div>
        <span class="app-status ${app.status}" data-id="${app.id}" data-status="${app.status}">${app.status}</span>
      </div>
      <div class="app-meta">
        <span>${date}</span>
        ${app.match_score ? `<span style="color:#F97316">⬡ ${app.match_score}/10</span>` : ''}
        ${app.salary_estimate ? `<span>${esc(app.salary_estimate)}</span>` : ''}
        ${app.job_url ? `<a href="${esc(app.job_url)}" target="_blank" style="color:#F97316;text-decoration:none;font-size:11px">View ↗</a>` : ''}
      </div>`;
    list.appendChild(div);
  });
  list.querySelectorAll('.app-status').forEach(el => el.addEventListener('click', () => cycleStatus(el.dataset.id, el.dataset.status)));
}

const STATUS_CYCLE = ['saved','applied','interview','offer','rejected'];
function cycleStatus(id, current) {
  const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
  chrome.runtime.sendMessage({ type: 'UPDATE_APPLICATION', payload: { id, status: next } }, r => {
    if (r?.ok) loadTracker();
  });
}

$('tracker-save-current-btn').addEventListener('click', () => {
  getTab(tab => {
    if (!tab) { toast('No active tab','err'); return; }
    chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB_TEXT' }, r => {
      if (chrome.runtime.lastError || !r?.text) { toast('No job detected','err'); return; }
      const company = r.company || extractCompanyFromTitle(r.title || '');
      const jobTitle = (r.title || '').split(/at|\s[-|]\s/i)[0].trim() || 'Job';
      saveApplication({ jobTitle, company, jobUrl: tab.url, status: 'saved' });
    });
  });
});

// ════════════════════════════════════════════════════════════════
// TAILOR
// ════════════════════════════════════════════════════════════════

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
      $('t-job-banner').style.display = '';
      $('t-job-title').textContent = r.title || 'Job detected';
      $('t-job-sub').textContent = `${r.text.length.toLocaleString()} chars`;
      $('t-job-banner').dataset.text = r.text;
    });
  });
}

$('use-job-btn').addEventListener('click', () => {
  const text = $('t-job-banner').dataset.text || '';
  $('job-input').value = text; $('job-chars').textContent = text.length;
  $('t-job-banner').style.display = 'none'; toast('Job loaded ✓','ok');
});

$('analyze-btn').addEventListener('click', async () => {
  const resume = $('resume-input').value.trim(), job = $('job-input').value.trim();
  const err = $('err-t1'); err.classList.add('hidden');
  if (resume.length < 50) { err.textContent = 'Paste your resume first.'; err.classList.remove('hidden'); return; }
  if (job.length < 50) { err.textContent = 'Load or paste the job description first.'; err.classList.remove('hidden'); return; }
  S.resume = resume; S.job = job;
  const btn = $('analyze-btn'); btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>Analysing...';
  try {
    const d = await bgFunc('smart_tailor', { resumeText: resume, jdText: job, jobTitle: S.jobTitle, company: S.company });
    if (d.error) throw new Error(d.error);
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
  if (S.tailoredText) { renderResult(S.tailoredText, S.changes); show('v-t3'); return; }
  const btn = $('tailor-btn'); btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>Tailoring...';
  try {
    const d = await bgFunc('smart_tailor', { resumeText: S.resume, jdText: S.job, jobTitle: S.jobTitle, company: S.company });
    if (d.error) throw new Error(d.error);
    S.tailoredText = d.tailoredText||''; S.changes = d.changes||[];
    renderResult(S.tailoredText, S.changes); show('v-t3');
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
  navigator.clipboard.writeText(S.tailoredText).then(() => { $('copy-btn').textContent = '✓ Copied!'; toast('Copied','ok'); setTimeout(()=>$('copy-btn').textContent='Copy Resume',1800); });
});
$('new-job-btn').addEventListener('click', () => {
  S.keywords=[]; S.tailoredText=''; S.changes=[]; S.jobTitle=''; S.company='';
  $('job-input').value=''; $('job-chars').textContent='0';
  $('t-job-banner').style.display = 'none';
  show('v-t1'); detectForTailor();
});

// ════════════════════════════════════════════════════════════════
// Backend call helper — routes through background.js (handles 401)
// Returns the function payload directly, throws on auth/network errors.
// ════════════════════════════════════════════════════════════════
function bgFunc(action, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'BG_FUNC', action, payload: payload || {} }, resp => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp) return reject(new Error('No response from background. Reload the extension.'));
      if (!resp.ok) {
        if (/Not signed in|Invalid token|Token revoked/i.test(resp.error || '')) {
          show('v-login');
          return reject(new Error('Session expired. Please sign in again.'));
        }
        return reject(new Error(resp.error || 'Request failed'));
      }
      resolve(resp.data);
    });
  });
}

// ── Helpers ──
function getTab(cb) { chrome.tabs.query({ active:true, currentWindow:true }, tabs => cb(tabs[0]||null)); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function cleanTitle(t) {
  return String(t||'').replace(/\s*[|\-–—]\s*Lovable\s*$/i, '').trim();
}
window.cleanTitle = cleanTitle;

// ── Re-detect on tab change / navigation ──
function refreshForActiveTab() {
  if (!S.user) return;
  // Clear stale banners before re-detect so previous tab's data never lingers
  const fb = $('fill-job-banner'); if (fb) fb.style.display = 'none';
  $('contact-no-job')?.classList.add('hidden');
  $('contact-job-info')?.classList.add('hidden');
  $('cover-no-job')?.classList.add('hidden');
  $('cover-job-banner')?.classList.add('hidden');
  $('err-fill')?.classList.add('hidden');
  $('fill-result-wrap')?.classList.add('hidden');

  if (S.tab === 'fill')    detectForFill();
  if (S.tab === 'contact') detectForContacts();
  if (S.tab === 'cover')   detectForCover();
  if (S.tab === 'tailor' && typeof detectForTailor === 'function') detectForTailor();
}

chrome.tabs.onActivated.addListener(() => refreshForActiveTab());
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'complete') {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0] && tabs[0].id === tabId) refreshForActiveTab();
    });
  }
});

// ── Boot ──
restoreSession();
