// sidepanel.js — AYN Resume Tailor (one-click sign-in via background)

const S = {
  user: null,
  tab: 'fill',
  resume: '', job: '', jobTitle: '', company: '', jobUrl: '',
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

const VIEWS = ['v-login','v-fill','v-jobs','v-ask','v-contact','v-cover','v-tracker','v-t1','v-t2','v-t3'];
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
  ['fill','jobs','ask','contact','cover','tracker','tailor'].forEach(t => $(`tab-${t}`)?.classList.toggle('active', t===tab));
  if (tab === 'fill')    { show('v-fill');    detectForFill(); }
  if (tab === 'jobs')    { show('v-jobs');    detectForScore(); }
  if (tab === 'ask')     { show('v-ask');     detectForAsk(); }
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
  if (Array.isArray(c.skills) && c.skills.length) {
    lines.push('\nSKILLS\n' + c.skills.join(', '));
    window.__aynResumeSkills = c.skills.slice();
  }
  const text = lines.join('\n').trim();
  if (text) chrome.storage.local.set({ savedResume: text });
}

function displayUser(resp) {
  const p = resp?.profile || {};
  const email = resp?.user?.email || p.email || '';
  const device = resp?.user?.device || '';
  let name = p.full_name || p.name || p.display_name || p.first_name || '';
  if (!name && email) {
    const local = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
    name = local.split(/\s+/).map(s => s ? s[0].toUpperCase() + s.slice(1) : '').join(' ');
  }
  const el = $('user-email');
  el.textContent = name || 'Signed in';
  el.title = email ? `${email}${device ? `\nDevice: ${device}` : ''}` : (device || '');
}
// Alias kept for any callers referencing the old name.
const displayEmail = displayUser;

// Strip raw URLs from any string before showing as a label.
function cleanLabel(s) {
  return (s || '').replace(/https?:\/\/\S+/g, '').replace(/\s{2,}/g, ' ').trim();
}

// v1.9.7: derive a human company name from a URL when DOM extraction fails.
// Examples:
//   boards.greenhouse.io/acme/jobs/123     → "Acme"
//   jobs.lever.co/acme/uuid                → "Acme"
//   acme.bamboohr.com/careers/12           → "Acme"
//   jobs.ashbyhq.com/Acme/uuid             → "Acme"
//   acme.wd1.myworkdayjobs.com/...         → "Acme"
//   acme.com/careers/...                   → "Acme"
function hostToCompany(urlOrHost) {
  let host = '', path = '';
  try {
    const u = new URL(urlOrHost.startsWith('http') ? urlOrHost : 'https://' + urlOrHost);
    host = u.hostname.replace(/^www\./, '');
    path = u.pathname || '';
  } catch { host = String(urlOrHost || '').replace(/^www\./, ''); }
  const titleize = s => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
  // Path-based ATS slugs
  const segs = path.split('/').filter(Boolean);
  if (/greenhouse\.io$/.test(host) && segs[0])  return titleize(segs[0]);
  if (/lever\.co$/.test(host) && segs[0])       return titleize(segs[0]);
  if (/ashbyhq\.com$/.test(host) && segs[0])    return titleize(segs[0]);
  if (/smartrecruiters\.com$/.test(host) && segs[0] === 'jobs' && segs[1]) return titleize(segs[1]);
  if (/workable\.com$/.test(host) && segs[0])   return titleize(segs[0]);
  if (/recruitee\.com$/.test(host) && segs[0])  return titleize(segs[0]);
  // Subdomain-based
  const sub = host.split('.')[0];
  if (/bamboohr\.com$/.test(host) && sub)       return titleize(sub);
  if (/myworkdayjobs\.com$/.test(host)) {
    const parts = host.split('.');
    if (parts[0]) return titleize(parts[0]);
  }
  if (/icims\.com$/.test(host) && sub)          return titleize(sub);
  if (/jobvite\.com$/.test(host) && sub && sub !== 'jobs') return titleize(sub);
  // LinkedIn / Indeed → use page-detected company only; fall back to host
  if (/linkedin\.com$/.test(host)) return '';
  if (/indeed\.com$/.test(host))   return '';
  // Generic: strip 'careers.' / 'jobs.' / 'apply.' and use the registrable part
  const stripped = host.replace(/^(careers|jobs|apply|join|hire|work)\./, '');
  const base = stripped.split('.')[0];
  return base ? titleize(base) : '';
}

// v1.9.7: best-effort company resolver — tries DOM value, then URL.
function deriveCompany(company, url, fallbackTitle) {
  const c = cleanLabel(company);
  if (c) return c;
  const fromUrl = hostToCompany(url || '');
  if (fromUrl) return fromUrl;
  return cleanLabel(extractCompanyFromTitle(fallbackTitle || '')) || '';
}


// Render a company logo into the .job-hero-logo slot. Falls back to initial on error.
function setCompanyLogo(elId, companyName, fallbackTitle) {
  const el = $(elId);
  if (!el) return;
  const name = cleanLabel(companyName);
  const initial = (name || fallbackTitle || '·').trim().charAt(0).toUpperCase() || '·';
  if (!name) { el.textContent = initial; return; }
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!slug) { el.textContent = initial; return; }
  el.innerHTML = '';
  const img = document.createElement('img');
  img.alt = name;
  img.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:inherit;';
  img.referrerPolicy = 'no-referrer';
  img.onerror = () => { el.textContent = initial; };
  img.src = `https://logo.clearbit.com/${slug}.com`;
  el.appendChild(img);
}

// v1.9.4: animate a circular match ring (0-100). Pass null to hide.
function setHeroRing(wrapId, numId, pct) {
  const wrap = $(wrapId);
  if (!wrap) return;
  if (pct == null || isNaN(pct)) { wrap.classList.add('hidden'); return; }
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  const bar = wrap.querySelector('.hr-bar');
  const circ = 2 * Math.PI * 17; // 106.81
  if (bar) {
    bar.setAttribute('stroke-dasharray', circ.toFixed(2));
    bar.setAttribute('stroke-dashoffset', (circ * (1 - v / 100)).toFixed(2));
    // tier-tinted stroke
    const stroke = v >= 75 ? '#16a34a' : v >= 50 ? '#f97316' : v >= 30 ? '#d97706' : '#b91c1c';
    bar.setAttribute('stroke', stroke);
  }
  const n = $(numId); if (n) n.textContent = v;
  wrap.classList.remove('hidden');
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

// v2.7.0 — surface the dashboard handoff arrival so the user knows context
// was restored and which tailored resume version is preselected.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'HANDOFF_ARRIVED') {
    const label = msg.resumeId ? 'Tailored resume selected · ready to fill' : 'Context restored · ready to fill';
    try { toast(label, 'ok'); } catch {}
  }
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

// v1.9.5: always show the Fill hero card the moment a form is detected,
// using whatever job context we have (or tab fallbacks).
function renderFillHero({ title, company, fieldCount, host, url, kind } = {}) {
  const t = cleanLabel(title) || 'Job application detected';
  // v1.9.7: never fall back to a raw host like "boards.greenhouse.io" — derive a real name.
  const derived = deriveCompany(company, url || host, title);
  const c = derived || cleanLabel(company) || 'Company';
  $('fill-job-title').textContent = t;
  $('fill-job-sub').textContent = c;
  setCompanyLogo('fill-job-logo', c, title);
  // v2.8.4 — fields-ready badge is meaningless on listing pages and confusing at 0.
  const countWrap = $('fill-field-count-wrap');
  const showCount = kind !== 'listing' && typeof fieldCount === 'number' && fieldCount > 0;
  if (typeof fieldCount === 'number') $('fill-field-count').textContent = fieldCount;
  if (countWrap) countWrap.classList.toggle('hidden', !showCount);
  // v2.8.4 — listing extras (JD status + Open button) only render on listing.
  const extras = $('fill-listing-extras');
  if (extras) extras.classList.toggle('hidden', kind !== 'listing');
  const banner = $('fill-job-banner');
  banner.classList.remove('hidden');
  banner.style.display = ''; // clear any stale inline display:none from refreshForActiveTab
}



function applyFormReady(r, tab) {
  // PART B: instant UI reflection from a lightweight FORM_DETECTED probe
  if (!r || !r.hasForm) return false;
  $('fill-empty').classList.add('hidden');
  $('fill-field-count').textContent = r.fieldCount || '?';
  $('autofill-now-btn').classList.remove('hidden');
  // v1.9.5: surface the hero card immediately, even before DETECT_PAGE returns
  let host = '';
  try { host = tab && tab.url ? new URL(tab.url).hostname.replace(/^www\./, '') : ''; } catch {}
  renderFillHero({
    title: F.jobTitle || cleanLabel(tab && tab.title),
    company: F.company,
    fieldCount: r.fieldCount,
    host, url: tab && tab.url,

  });
  const dlWrap = $('fill-resume-dl-wrap');
  if (dlWrap) dlWrap.classList.add('hidden');
  return true;
}


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
    // PART B: fast path — show ready state immediately from cached probe
    chrome.runtime.sendMessage({ type: 'GET_FORM_DETECTED', tabId: tab.id }, cached => {
      void chrome.runtime.lastError;
      if (cached) applyFormReady(cached, tab);
    });
    // v1.9.7: route through background so content.js auto-injects on rescan
    chrome.runtime.sendMessage(
      { type: 'TAB_SEND', tabId: tab.id, payload: { type: 'DETECT_PAGE' } },
      r => {
        void chrome.runtime.lastError;
        if (!r) {
          $('fill-empty-title').textContent = 'Page not scannable yet';
          $('fill-empty-sub').textContent = 'Refresh this page (Cmd/Ctrl+R), then click Scan again.';
          $('fill-empty').classList.remove('hidden');
          return;
        }

        F.jobTitle = r.title || '';
        F.company = deriveCompany(r.company, tab.url, r.title);
        F.kind = r.kind;
        // v2.8.1 — mirror kind into background so SCORE_JOB_CARD/JD_REGISTRY
        // gates see the same classification the sidepanel is showing.
        try { chrome.runtime.sendMessage({ type: 'SET_TAB_KIND', tabId: tab.id, kind: r.kind }, () => void chrome.runtime.lastError); } catch {}

        // v2.8.1 — honor a prior "Scan anyway" override. Without this, clicking
        // Scan anyway would re-run DETECT_PAGE, classify as 'other' again, and
        // loop forever on the empty state.
        chrome.runtime.sendMessage({ type: 'GET_TAB_KIND', tabId: tab.id }, ov => {
          void chrome.runtime.lastError;
          if (ov && ov.override === true && r.kind === 'other') {
            r.kind = 'apply';
            F.kind = 'apply';
          }
          renderKindBranches(r, tab);
        });
        return;



      });
    });


  function renderKindBranches(r, tab) {
      if (r.kind === 'ayn') {
        $('fill-empty-title').textContent = "You're on AYN, not a job page";
        $('fill-empty-sub').textContent = 'Open a job application form in another tab (LinkedIn Easy Apply, Workday, Greenhouse, Lever…) then come back here.';
        $('fill-empty').classList.remove('hidden');
        return;
      }
      // v2.8.1 — page classifier gate. On pages classified as 'other'
      // (youtube.com, gmail, reddit…) hide the company card, score ring,
      // fields-ready count, and Fill button. Offer "Scan anyway" as an
      // explicit per-tab bypass for edge cases where classifier misfires.
      if (r.kind === 'other') {
        $('fill-job-banner').classList.add('hidden');
        $('autofill-now-btn').classList.add('hidden');
        $('fill-empty-title').textContent = "This doesn't look like a job application page.";
        $('fill-empty-sub').innerHTML = 'AYN is designed for job applications. <a href="#" id="fill-scan-anyway" style="color:var(--ayn-orange);text-decoration:underline;cursor:pointer">Scan anyway</a>';
        $('fill-empty').classList.remove('hidden');
        setTimeout(() => {
          const a = document.getElementById('fill-scan-anyway');
          if (a) a.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.runtime.sendMessage({ type: 'SET_KIND_OVERRIDE', tabId: tab.id, on: true }, () => {
              void chrome.runtime.lastError;
              // Treat this tab as apply and re-run the fill flow.
              F.kind = 'apply';
              detectForFill();
            });
          });
        }, 0);
        return;
      }
      if (r.kind === 'listing' || !r.hasForm) {
        // Listing page: allow scoring/JD banner but replace fill CTA.
        let host = '';
        try { host = new URL(F.jobUrl).hostname.replace(/^www\./, ''); } catch {}
        renderFillHero({ title: r.title, company: F.company, fieldCount: r.fieldCount || 0, host, url: tab.url });
        $('autofill-now-btn').classList.add('hidden');
        $('fill-empty-title').textContent = 'This looks like a job listing, not the application form';
        $('fill-empty-sub').textContent = 'Open the application first (Apply or Easy Apply), then come back here to fill.';
        $('fill-empty').classList.remove('hidden');
        try { window.aynResolveJdBanner && window.aynResolveJdBanner(tab.id); } catch {}
        return;
      }

      // Form found — show hero (always) + ready state
      let host = '';
      try { host = new URL(F.jobUrl).hostname.replace(/^www\./, ''); } catch {}
      renderFillHero({ title: r.title, company: F.company, fieldCount: r.fieldCount, host, url: tab.url });
      $('autofill-now-btn').classList.remove('hidden');
      // v2.8.0 — kick off the JD Resolver so the provenance banner shows
      // where the JD came from BEFORE the user clicks Autofill.
      try { window.aynResolveJdBanner && window.aynResolveJdBanner(tab.id); } catch {}


      // v1.9.8: default hidden; only revealed as a fallback after Fill fails to auto-attach
      const dlWrap = $('fill-resume-dl-wrap');
      if (dlWrap) dlWrap.classList.add('hidden');
  }
}



// Helpers to fetch the AYN resume text + base filename and save a Blob
async function fetchAynResume() {
  const r = await new Promise(res => chrome.runtime.sendMessage(
    { type: 'BG_FUNC', action: 'ext_download_resume_text', payload: {} }, res));
  if (!r || !r.ok) throw new Error(r?.error || 'Failed to load resume');
  const filename = r.data?.filename || 'Resume_AYN.txt';
  const fileBase = filename.replace(/\.[a-z0-9]+$/i, '') || 'Resume_AYN';
  return { text: r.data?.text || '', fileBase };
}
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function markDownloadDone() {
  document.getElementById('dl-step-1')?.classList.add('done');
  document.getElementById('dl-step-2')?.classList.add('now');
  document.getElementById('fill-dl-success')?.classList.remove('hidden');
}

async function downloadResumeAs(kind, btn) {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner dk"></div>Preparing...';
  try {
    const { text, fileBase } = await fetchAynResume();
    if (!window.AYNResumeFormat) throw new Error('Formatter not loaded');
    const blob = kind === 'pdf'
      ? window.AYNResumeFormat.buildResumePdfBlob(text, fileBase)
      : await window.AYNResumeFormat.buildResumeDocxBlob(text, fileBase);
    saveBlob(blob, `${fileBase}.${kind === 'pdf' ? 'pdf' : 'docx'}`);
    markDownloadDone();
    toast(`${kind === 'pdf' ? 'PDF' : 'Word'} downloaded ✓ — attach it on the form`, 'ok');
  } catch (err) {
    toast(err.message || 'Download failed', 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

document.getElementById('fill-download-pdf-btn')?.addEventListener('click', (e) => downloadResumeAs('pdf', e.currentTarget));
document.getElementById('fill-download-docx-btn')?.addEventListener('click', (e) => downloadResumeAs('docx', e.currentTarget));

// v1.9.8: reusable resume attach — builds PDF + sends to background. UI-free.
async function aynAttachResume(tabId) {
  try {
    if (!window.AYNResumeFormat) return { ok: false, error: 'formatter_not_loaded' };
    const { text, fileBase } = await fetchAynResume();
    const blob = await window.AYNResumeFormat.buildResumeDocxBlob(text, fileBase);
    const base64 = await window.AYNResumeFormat.blobToBase64(blob);
    const filename = `${fileBase}.docx`;
    const r = await new Promise(res => chrome.runtime.sendMessage({
      type: 'ATTACH_RESUME_FILE',
      tabId,
      payload: { base64, filename, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    }, res));
    return r || { ok: false, error: 'no_response' };
  } catch (err) {
    return { ok: false, error: err?.message || 'attach_failed' };
  }
}

// Manual retry — same as before, just delegates to aynAttachResume + renders status.
document.getElementById('fill-auto-attach-btn')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const status = document.getElementById('fill-attach-status');
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<div class="spinner"></div>Attaching…';
  status.classList.add('hidden');
  try {
    const tab = await new Promise(res => chrome.tabs.query({ active: true, currentWindow: true }, t => res(t[0])));
    if (!tab?.id) throw new Error('No active tab');
    const r = await aynAttachResume(tab.id);
    if (r?.ok) {
      status.innerHTML = `<i class="ti ti-check" style="color:var(--ayn-green)"></i><span style="color:var(--ayn-green)">PDF attached (${r.filename}) to ${r.count} field${r.count>1?'s':''} ✓ Now click Submit.</span>`;
      status.classList.remove('hidden');
      toast('PDF resume attached ✓', 'ok');
    } else {
      const reason = r?.error === 'blocked' || r?.error === 'blocked_by_site' ? 'This site blocks programmatic upload — use the PDF download below.'
                    : r?.error === 'no_file_input' ? 'No file upload field detected on this page.'
                    : r?.error || 'Could not auto-attach. Use the manual download below.';
      status.innerHTML = `<i class="ti ti-info-circle" style="color:var(--ayn-orange)"></i><span style="color:var(--ayn-muted)">${reason}</span>`;
      status.classList.remove('hidden');
    }
  } catch (err) {
    status.innerHTML = `<i class="ti ti-x" style="color:var(--ayn-red)"></i><span style="color:var(--ayn-red)">${err.message || 'Failed'}</span>`;
    status.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
});

$('fill-rescan-btn')?.addEventListener('click', detectForFill);
$('score-rescan-btn')?.addEventListener('click', detectForScore);


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
    chrome.runtime.sendMessage({ type: 'AUTO_AUTOFILL', tabId: tab.id }, async response => {
      const reenable = () => { btn.disabled = false; btn.innerHTML = '<i class="ti ti-bolt"></i>Fill This Form Now'; };

      if (!response) {
        reenable();
        err.textContent = 'Refresh this page (Cmd+R / Ctrl+R) and try again.';
        err.classList.remove('hidden'); return;
      }
      if (!response.ok) {
        reenable();
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
      const answered = typeof response.answered === 'number' ? response.answered : (details || []).length;
      const verified = typeof response.verified === 'number' ? response.verified : filled;
      const needsReview = typeof response.needsReview === 'number'
        ? response.needsReview
        : Math.max(0, answered - verified) + ((response.skipped || []).length);
      const pct = total > 0 ? Math.round(verified/total*100) : 0;
      const needsReviewCount = typeof response.needsReviewCount === 'number' ? response.needsReviewCount : 0;
      const reviewSuffix = needsReviewCount > 0 ? `, ${needsReviewCount} to review` : '';
      $('fill-stat-n').textContent = `${verified}/${total} filled${reviewSuffix}`;
      $('fill-stat-lbl').textContent = `${needsReview} review`;
      const fillBar = $('fill-progress-fill');
      fillBar.style.width = pct + '%';
      fillBar.className = 'progress-fill' + (pct >= 65 ? '' : ' partial');
      setHeroRing('fill-hero-ring', 'fill-hero-ring-num', pct);

      const list = $('fill-result-list');
      list.innerHTML = '';
      const SOURCE_LABEL = { profile: 'Profile', memory: 'Memory', ai: 'AI', inferred: 'AI', computed: 'AI', canonical: 'AI', resume: 'AI' };
      (details || []).forEach(d => {
        const conf = typeof d.confidence === 'number' ? Math.round(d.confidence * 100) : null;
        const confBadge = conf != null
          ? `<span class="conf-pill ${conf>=80?'hi':conf>=50?'md':'lo'}" title="AI confidence">${conf}%</span>`
          : '';
        const srcLbl = d.source ? (SOURCE_LABEL[d.source] || d.source) : '';
        const srcBadge = srcLbl ? `<span style="margin-left:6px;font-size:10px;color:var(--ayn-muted,#6b7280);font-weight:600;">${esc(srcLbl)}</span>` : '';
        const reviewBadge = d.needsReview ? `<span style="margin-left:6px;font-size:10px;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:999px;font-weight:600;">Review</span>` : '';
        const reason = d.reasoning ? `<div class="fr">${esc(String(d.reasoning).slice(0,90))}</div>` : '';
        list.innerHTML += `
          <div class="fi">
            <div class="fd ${d.ok ? 'on' : 'off'}"></div>
            <div class="fl">${esc(fillDisplayLabel(d))} ${confBadge}${srcBadge}${reviewBadge}</div>
            <div class="fv">${d.ok ? esc((d.value||'').slice(0,28)) : esc(d.reason||'skipped')}</div>
            ${reason}
          </div>`;
      });

      const skippedFields = response.skipped || [];
      if (skippedFields.length) {
        list.innerHTML += `<div class="fi" style="border-top:1px solid var(--ayn-border);margin-top:8px;padding-top:10px;"><div class="fl" style="font-weight:700;color:#92400e;display:flex;align-items:center;gap:6px;"><i class="ti ti-bulb"></i>Couldn't answer ${skippedFields.length} — add to your profile</div></div>`;
        skippedFields.forEach(s => {
          list.innerHTML += `
            <div class="fi">
              <div class="fd off"></div>
              <div class="fl">${esc(s.label || '')}</div>
              <div class="fv" style="color:#b45309">${esc(s.suggestion || s.reason || 'add to your profile')}</div>
            </div>`;
        });
      }

      $('fill-result-wrap').classList.remove('hidden');
      if (F.jobTitle && F.company) $('fill-save-tracker-btn').classList.remove('hidden');

      // v1.9.8: auto-attach resume right after fill, reveal manual fallback only on failure
      btn.innerHTML = '<div class="spinner"></div>Attaching resume…';
      const dlWrap = $('fill-resume-dl-wrap');
      const status = $('fill-attach-status');
      const a = await aynAttachResume(tab.id).catch(() => ({ ok: false, error: 'attach_failed' }));
      if (a?.ok) {
        toast(`${filled} fields filled and resume attached ✓`, 'ok');
        if (dlWrap) dlWrap.classList.add('hidden');
        if (status) status.classList.add('hidden');
      } else if (a?.error === 'no_file_input') {
        toast(`${filled} fields filled ✓`, 'ok');
        if (dlWrap) dlWrap.classList.add('hidden');
        if (status) status.classList.add('hidden');
      } else if (a?.error === 'blocked' || a?.error === 'blocked_by_site') {
        toast(`${filled} fields filled. This site blocks the file upload — download below and drop it in.`, 'ok');
        if (dlWrap) dlWrap.classList.remove('hidden');
        if (status) {
          status.innerHTML = `<i class="ti ti-info-circle" style="color:var(--ayn-orange)"></i><span style="color:var(--ayn-orange-2)">This site blocked the one-click upload. Use the download below and attach it manually.</span>`;
          status.classList.remove('hidden');
        }
      } else {
        toast(`${filled} fields filled. Could not attach the resume automatically — use the download below.`, 'ok');
        if (dlWrap) dlWrap.classList.remove('hidden');
        if (status) {
          status.innerHTML = `<i class="ti ti-info-circle" style="color:var(--ayn-orange)"></i><span style="color:var(--ayn-orange-2)">Could not attach the resume automatically. Use the download below and attach it manually.</span>`;
          status.classList.remove('hidden');
        }
      }
      reenable();
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
const CARD_STOPWORDS = new Set(['senior','junior','lead','staff','the','of','and','for','an','to','in']);
function tokenizeRole(s) {
  return String(s || '').toLowerCase().split(/[^a-z0-9+#.]+/).filter(w => w.length >= 3 && !CARD_STOPWORDS.has(w));
}
async function toggleScoring() {
  scoringOn = !scoringOn;
  $('score-switch').classList.toggle('on', scoringOn);
  $('score-status-note').textContent = scoringOn
    ? 'ON — AYN scores every job card as you scroll.'
    : 'Turn on to see a 1-10 match score on every job card.';
  if (!scoringOn) {
    getTab(tab => { if (tab) chrome.tabs.sendMessage(tab.id, { type: 'STOP_CARD_SCORING' }); });
    toast('Job scoring OFF', 'ok');
    return;
  }
  let skills = [], roleTerms = [];
  try {
    const r = await bgFunc('ext_profile_canonical_get', {}, { silent: true });
    const canonical = r?.canonical || r?.profile || r || {};
    const skillNames = Array.isArray(canonical.skills) ? canonical.skills.map(s => s?.name).filter(Boolean) : [];
    const derived = canonical.derived || {};
    const topSkills = Array.isArray(derived.top_skills) ? derived.top_skills : [];
    skills = Array.from(new Set([...skillNames, ...topSkills].map(s => String(s).toLowerCase().trim()).filter(Boolean)));
    const prefs = canonical.preferences || {};
    const desired = Array.isArray(prefs.desired_titles) ? prefs.desired_titles : [];
    const roleSrc = [derived.current_title, derived.primary_function, ...desired].filter(Boolean).join(' ');
    roleTerms = Array.from(new Set(tokenizeRole(roleSrc)));
  } catch (_e) {}
  if (!skills.length && Array.isArray(window.__aynResumeSkills)) {
    skills = Array.from(new Set(window.__aynResumeSkills.map(s => String(s).toLowerCase().trim()).filter(Boolean)));
  }
  getTab(tab => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: 'START_CARD_SCORING', skills, roleTerms });
  });
  toast('Job scoring ON', 'ok');
}
window.toggleScoring = toggleScoring;

// ── Score THIS job (any job page, panel result) ─────────────────
const SJ = { jobTitle: '', company: '', jobText: '', jobUrl: '' };

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function normalizeUrlForHash(raw) {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    const keep = ['jk','currentJobId','gh_jid','lever-source','jobId','job_id'];
    const qs = [];
    u.searchParams.forEach((v, k) => { if (keep.includes(k)) qs.push(`${k}=${v}`); });
    qs.sort();
    return `${host}${path}${qs.length ? '?' + qs.join('&') : ''}`;
  } catch { return (raw || '').slice(0, 400); }
}
// v1.4.6: track which job URLs we've auto-scored this panel session (no loops, no spam).
const _autoScoredUrls = new Set();

function detectForScore() {
  $('score-job-banner').classList.add('hidden');
  $('score-no-job').classList.add('hidden');
  // do NOT hide score-result here — if we already have a fresh score for this URL,
  // we keep it visible; runScoreFlow will overwrite when it runs.
  $('err-score-job').classList.add('hidden');
  getTab(tab => {
    if (!tab) { $('score-no-job').classList.remove('hidden'); return; }
    // v1.9.7: route via background so content.js auto-injects on rescan
    chrome.runtime.sendMessage(
      { type: 'TAB_SEND', tabId: tab.id, payload: { type: 'EXTRACT_JOB_TEXT' } },
      r => {
        void chrome.runtime.lastError;
        if (!r?.text || r.text.length < 50) {
          $('score-no-job').classList.remove('hidden');
          $('score-result').classList.add('hidden');
          return;
        }
        const prevUrl = SJ.jobUrl;
        SJ.jobTitle = r.title || '';
        SJ.company = deriveCompany(r.company, tab.url, r.title);
        SJ.jobText = r.text;
        SJ.jobUrl = tab.url || '';
        $('score-job-title').textContent = SJ.jobTitle || 'Job detected';
        $('score-job-company').textContent = SJ.company || 'Unknown company';
        setCompanyLogo('score-job-logo', SJ.company, SJ.jobTitle);

      $('score-job-banner').classList.remove('hidden');

      // If the URL changed since last detection, clear the old result.
      if (prevUrl && prevUrl !== SJ.jobUrl) {
        $('score-result').classList.add('hidden');
      }

      // v1.4.6: AUTO-SCORE — fire the same flow as the manual button, but only
      // once per URL per panel session. job_cache (24h) makes repeats free.
      const key = SJ.jobUrl || (SJ.jobTitle + '|' + SJ.company);
      if (key && !_autoScoredUrls.has(key)) {
        _autoScoredUrls.add(key);
        runScoreFlow({ auto: true }).catch(() => { /* surfaced via err element */ });
      }
    });
  });
}

function scoreTier(n) {
  if (n >= 8) return 's-strong';
  if (n >= 6) return 's-good';
  if (n >= 4) return 's-fair';
  return 's-poor';
}

async function runScoreFlow({ auto = false } = {}) {
  const btn = $('score-this-job-btn'), err = $('err-score-job');
  err.classList.add('hidden');
  if (!SJ.jobText) {
    if (!auto) { err.textContent = 'Open a job posting first, then click Score This Job.'; err.classList.remove('hidden'); }
    return;
  }
  if (!auto) $('score-result').classList.add('hidden');
  btn.disabled = true;
  btn.innerHTML = auto ? '<div class="spinner"></div>Scoring…' : '<div class="spinner"></div>Scoring...';
  try {
    // Phase 2: single AI call — ext_job_score inline-ingests fullJd when no cache hit.
    const urlHash = await sha256Hex(normalizeUrlForHash(SJ.jobUrl || ''));

    const d = await bgFunc('ext_job_score', {
      urlHash, url: SJ.jobUrl,
      jobTitle: SJ.jobTitle, company: SJ.company,
      fullJd: SJ.jobText.slice(0, 20000),
      jobSnippet: SJ.jobText.slice(0, 2000), // card-badge fallback
    }, { silent: auto });

    // v2.8.2 — backend refuses to guess from tiny snippets. Ask for JD.
    if (d && d.needsJd) {
      $('score-num').innerHTML = `<small style="font-size:14px;font-weight:600">Needs JD</small>`;
      $('score-num').className = 'score-num s-fair';
      setHeroRing('score-hero-ring', 'score-hero-ring-num', 0);
      $('score-label').textContent = 'Score needs the job description';
      $('score-label').style.color = '#b45309';
      // Reset downstream sections.
      ['score-legend','score-verdict','score-meta-row','score-matched-kw','score-missing-kw','score-grounding']
        .forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
      const reqEl = $('score-requirements'); if (reqEl) reqEl.classList.add('hidden');
      const sal = $('score-salary'); if (sal) sal.classList.add('hidden');
      let ndc = $('score-needs-jd');
      if (!ndc) { ndc = document.createElement('div'); ndc.id = 'score-needs-jd'; $('score-result').appendChild(ndc); }
      ndc.style.cssText = 'margin-top:12px;padding:12px;border:1px solid #fde68a;border-radius:10px;background:#fffbeb;color:#78350f;font-size:12px;line-height:1.5;';
      ndc.innerHTML = `
        <div style="font-weight:700;color:#92400e;margin-bottom:4px;">Paste the job description to score honestly</div>
        <div style="margin-bottom:8px;">AYN cannot score fairly from a short snippet. Paste the full JD and we will rescore automatically.</div>
        <button class="btn btn-primary" id="score-open-paste" style="padding:6px 12px;font-size:12px"><i class="ti ti-clipboard"></i>Paste JD</button>`;
      ndc.style.display = '';
      $('score-result').classList.remove('hidden');
      const openBtn = $('score-open-paste');
      if (openBtn) openBtn.onclick = () => {
        const w = $('jd-paste-wrap');
        if (w) { w.classList.remove('hidden'); $('jd-paste-input')?.focus(); }
      };
      return;
    }
    // Hide the needs-JD prompt if it was shown previously.
    { const ndc = $('score-needs-jd'); if (ndc) ndc.style.display = 'none'; }

    const score = d.score || 0;
    const tier = scoreTier(score);
    $('score-num').innerHTML = `${score}<small>/10</small>`;
    $('score-num').className = 'score-num ' + tier;
    setHeroRing('score-hero-ring', 'score-hero-ring-num', score * 10);
    $('score-label').textContent = d.matchLabel || '';
    $('score-label').style.color = ({ 's-strong':'#15803d','s-good':'#65a30d','s-fair':'#d97706','s-poor':'#b91c1c' })[tier];
    const sal = $('score-salary');
    if (d.salaryEstimate) { sal.textContent = d.salaryEstimate; sal.classList.remove('hidden'); } else sal.classList.add('hidden');

    // v2.8.2 — grounding line: what we actually scored (JD size, source, resume used).
    let gWrap = $('score-grounding');
    if (!gWrap) { gWrap = document.createElement('div'); gWrap.id = 'score-grounding'; $('score-result').appendChild(gWrap); }
    const sa = d.scoredAgainst || null;
    if (sa) {
      const jt = (sa.jobTitle || SJ.jobTitle || 'This role').trim();
      const co = (sa.company || SJ.company || 'Unknown company').trim();
      const jdKind = sa.jdSource === 'full' ? 'full' : 'snippet';
      const parts = [`${jt} at ${co}`, `JD ${Number(sa.jdChars || 0).toLocaleString()} chars (${jdKind})`, `vs ${sa.resumeLabel || 'Primary resume'}`];
      const warn = jdKind === 'snippet'
        ? ` <span style="color:#b45309;font-weight:600">· partial JD</span>` : '';
      gWrap.style.cssText = 'margin-top:6px;font-size:11px;color:#6b7280;line-height:1.4;';
      gWrap.innerHTML = parts.map(p => p.replace(/</g,'&lt;')).join(' · ') + warn;
      gWrap.style.display = '';
    } else {
      gWrap.style.display = 'none';
    }


    // v1.9.11: Score legend — spell out what the number means
    let legend = $('score-legend');
    if (!legend) { legend = document.createElement('div'); legend.id = 'score-legend'; $('score-result').appendChild(legend); }
    const tierCopy = {
      's-strong': { title: 'Strong match — apply with confidence', body: 'Your profile covers most must-haves. You are competitive for this role.' },
      's-good':   { title: 'Good match — worth applying',          body: 'You hit the core requirements. Tailoring your resume will lift this further.' },
      's-fair':   { title: 'Fair match — apply if interested',     body: 'You meet some requirements but a few key skills are missing or weak.' },
      's-poor':   { title: 'Low match — likely a stretch',         body: 'Several must-haves are missing. Consider tailoring heavily or skipping.' },
    }[tier] || { title: '', body: '' };
    legend.style.cssText = 'margin-top:10px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;font-size:12px;line-height:1.5;color:#374151;';
    legend.innerHTML = `
      <div style="font-weight:700;color:#111827;margin-bottom:4px;">${tierCopy.title}</div>
      <div style="color:#4b5563;margin-bottom:6px;">${tierCopy.body}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:10px;color:#6b7280;">
        <span><b style="color:#15803d">8–10</b> Strong</span>
        <span>·</span>
        <span><b style="color:#65a30d">6–7</b> Good</span>
        <span>·</span>
        <span><b style="color:#d97706">4–5</b> Fair</span>
        <span>·</span>
        <span><b style="color:#b91c1c">0–3</b> Low</span>
      </div>`;
    const ul = $('score-reasons'); ul.innerHTML = '';
    (d.reasons || []).forEach(rsn => { const li = document.createElement('li'); li.textContent = rsn; ul.appendChild(li); });

    // v1.4.6: VERDICT FIRST — render the one-sentence fit verdict prominently right under the score.
    let vWrap = $('score-verdict');
    if (!vWrap) { vWrap = document.createElement('div'); vWrap.id = 'score-verdict'; $('score-result').appendChild(vWrap); }
    vWrap.style.cssText = 'margin-top:10px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;font-size:13px;font-weight:600;color:#111827;line-height:1.45;';
    vWrap.innerHTML = d.verdict ? aynFormatAiText(d.verdict) : '';
    vWrap.style.display = d.verdict ? 'block' : 'none';

    // Phase 2: seniority fit + scoring source badge (placed right after verdict)
    let metaWrap = $('score-meta-row');
    if (!metaWrap) { metaWrap = document.createElement('div'); metaWrap.id = 'score-meta-row'; $('score-result').appendChild(metaWrap); }
    metaWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;';
    metaWrap.innerHTML = '';
    const senFit = d.seniorityFit && d.seniorityFit !== 'unknown' ? d.seniorityFit : '';
    if (senFit) {
      const sLabel = { under:'Under-leveled', match:'Seniority match', over:'Over-qualified' }[senFit] || senFit;
      const sBg = { under:'#fef3c7', match:'#dcfce7', over:'#e0e7ff' }[senFit] || '#f1f5f9';
      const sFg = { under:'#92400e', match:'#166534', over:'#3730a3' }[senFit] || '#334155';
      const b = document.createElement('span');
      b.style.cssText = `display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;background:${sBg};color:${sFg};`;
      b.textContent = sLabel;
      metaWrap.appendChild(b);
    }
    if (d.source) {
      const sourceLabel = { full:'Scored vs. full JD', snippet:'Scored vs. snippet only', approximate_keyword_overlap:'Approximate (AI offline)' }[d.source] || d.source;
      const sourceFg = d.source === 'full' ? '#0f766e' : d.source === 'snippet' ? '#92400e' : '#7c2d12';
      const sourceBg = d.source === 'full' ? '#ccfbf1' : d.source === 'snippet' ? '#fef3c7' : '#fee2e2';
      const sb = document.createElement('span');
      sb.style.cssText = `display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;background:${sourceBg};color:${sourceFg};`;
      sb.textContent = sourceLabel;
      metaWrap.appendChild(sb);
    }

    // Matched skills (green chips)
    let msWrap = $('score-matched-kw');
    if (!msWrap) { msWrap = document.createElement('div'); msWrap.id = 'score-matched-kw'; msWrap.style.cssText = 'margin-top:12px'; $('score-result').appendChild(msWrap); }
    msWrap.innerHTML = '';
    if (d.matchedSkills && d.matchedSkills.length) {
      msWrap.innerHTML = '<div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Skills you match</div>';
      d.matchedSkills.forEach(kw => {
        const chip = document.createElement('span');
        chip.style.cssText = 'display:inline-flex;padding:3px 9px;border-radius:999px;font-size:11px;border:1px solid #bbf7d0;background:#f0fdf4;color:#166534;margin:2px;';
        chip.textContent = kw;
        msWrap.appendChild(chip);
      });
    }

    // v1.9.11: Missing skills reframed as actionable "add these to score higher"
    const missing = (d.missingSkills && d.missingSkills.length) ? d.missingSkills : (d.missingKeywords || []);
    let mkWrap = $('score-missing-kw');
    if (!mkWrap) { mkWrap = document.createElement('div'); mkWrap.id = 'score-missing-kw'; mkWrap.style.cssText = 'margin-top:14px;padding:12px;border:1px solid #fde68a;border-radius:10px;background:#fffbeb;'; $('score-result').appendChild(mkWrap); }
    mkWrap.innerHTML = '';
    if (missing.length) {
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
      header.innerHTML = `<i class="ti ti-bulb" style="color:#b45309;font-size:14px"></i><div style="font-size:12px;font-weight:700;color:#92400e">Add these to your resume to score higher</div>`;
      mkWrap.appendChild(header);
      const help = document.createElement('div');
      help.style.cssText = 'font-size:11px;color:#78350f;margin-bottom:8px;line-height:1.45;';
      help.textContent = 'The job asks for these skills but they are not on your resume. Add the ones you actually have (in Skills, a bullet, or a project). Each one you add can lift your match score.';
      mkWrap.appendChild(help);
      const chipRow = document.createElement('div');
      missing.forEach(kw => {
        const chip = document.createElement('span');
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;font-size:11px;border:1px solid #fcd34d;background:#fff;color:#92400e;margin:2px;font-weight:600;';
        chip.innerHTML = `<i class="ti ti-plus" style="font-size:10px"></i>${kw}`;
        chipRow.appendChild(chip);
      });
      mkWrap.appendChild(chipRow);
      const tip = document.createElement('div');
      tip.style.cssText = 'font-size:10px;color:#78350f;margin-top:8px;font-style:italic;';
      tip.textContent = 'Tip: open the Resume tab and run “Tailor” — AYN will weave the ones you have into your bullets automatically.';
      mkWrap.appendChild(tip);
      mkWrap.style.display = '';
    } else {
      mkWrap.style.display = 'none';
    }

    // v1.4.0: Must-have / Nice-to-have requirements breakdown
    const reqEl = $('score-requirements');
    if (reqEl) {
      const mh = Array.isArray(d.mustHaves) ? d.mustHaves : [];
      const nh = Array.isArray(d.niceToHaves) ? d.niceToHaves : [];
      if (mh.length || nh.length) {
        const renderList = (items, title) => {
          if (!items.length) return '';
          const rows = items.map(it => {
            const met = !!it.met;
            return `<div class="req-row ${met?'met':'miss'}">
              <div class="req-icon ${met?'met':'miss'}">${met?'<i class="ti ti-check" style="font-size:12px"></i>':'—'}</div>
              <div class="req-text">${(it.text || '').replace(/</g,'&lt;')}</div>
            </div>`;
          }).join('');
          return `<div class="req-card"><div class="req-title">${title}</div>${rows}</div>`;
        };
        reqEl.innerHTML = renderList(mh, 'Must-have requirements') + renderList(nh, 'Nice to have');
        reqEl.classList.remove('hidden');
      } else {
        reqEl.classList.add('hidden');
      }
    }

    $('score-result').classList.remove('hidden');
  } catch (e) {
    if (!auto) { err.textContent = e.message || 'Score failed.'; err.classList.remove('hidden'); }
    else { try { console.warn('[AYN] auto-score failed:', e?.message); } catch {} }
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-target-arrow"></i>Re-score This Job';
  }
}

$('score-this-job-btn')?.addEventListener('click', () => {
  // v1.5.1: manual click ALWAYS targets the currently visible job. Re-extract
  // from the active tab first so SJ never holds stale data from a prior job,
  // then force a fresh score (bypasses the once-per-session auto guard).
  const err = $('err-score-job');
  err.classList.add('hidden');
  getTab(tab => {
    if (!tab) {
      err.textContent = 'Open a job posting first, then click Score This Job.';
      err.classList.remove('hidden');
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB_TEXT' }, r => {
      if (chrome.runtime.lastError || !r?.text || r.text.length < 50) {
        err.textContent = 'Open a job posting first, then click Score This Job.';
        err.classList.remove('hidden');
        return;
      }
      SJ.jobTitle = r.title || '';
      SJ.company = deriveCompany(r.company, tab.url, r.title);
      SJ.jobText = r.text;
      SJ.jobUrl = tab.url || '';
      $('score-job-title').textContent = SJ.jobTitle || 'Job detected';
      $('score-job-company').textContent = cleanLabel(SJ.company) || 'Unknown company';
      setCompanyLogo('score-job-logo', SJ.company, SJ.jobTitle);
      $('score-job-banner').classList.remove('hidden');
      $('score-no-job').classList.add('hidden');
      runScoreFlow({ auto: false });
    });
  });
});


$('suggest-roles-btn').addEventListener('click', async () => {
  const btn = $('suggest-roles-btn'), err = $('err-jobs');
  err.classList.add('hidden');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner dk"></div>Analysing...';
  try {
    const resp = await bgFunc('ext_suggest_roles', {});
    btn.disabled = false;
    btn.innerHTML = 'Get My Best Job Titles →';
    if (!resp?.roles?.length) {
      err.textContent = resp?.summary || 'No resume found. Upload your resume at aynn.io first.';
      err.classList.remove('hidden'); return;
    }
    renderRoles(resp);
  } catch(e) {
    btn.disabled = false;
    btn.innerHTML = 'Get My Best Job Titles →';
    err.textContent = e.message || 'Failed. Make sure you are signed in.';
    err.classList.remove('hidden');
  }
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
let _lastContactUrl = '';

function detectForContacts() {
  $('contact-no-job').classList.add('hidden');
  $('contact-job-info').classList.add('hidden');
  getTab(tab => {
    if (!tab) { $('contact-no-job').classList.remove('hidden'); return; }
    chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB_TEXT' }, r => {
      if (chrome.runtime.lastError || !r?.text || r.text.length < 50) {
        $('contact-no-job').classList.remove('hidden'); return;
      }
      C.jobTitle = r.title || ''; C.company = deriveCompany(r.company, tab.url, r.title);
      C.jobUrl = tab.url || ''; C.jobSnippet = r.text.slice(0, 800);
      $('contact-job-info').classList.remove('hidden');
      $('contact-job-title').textContent = C.jobTitle || 'Job detected';
      $('contact-company-name').textContent = C.company ? `at ${C.company}` : 'this company';
      // v1.5.1: when the active job URL changes, clear previously rendered
      // contacts so the prior job's people never linger. User re-clicks
      // "Find Who to Contact" for the new job.
      if (_lastContactUrl && _lastContactUrl !== C.jobUrl) {
        const cr = $('contact-results'); if (cr) cr.classList.add('hidden');
        const cards = $('contact-cards'); if (cards) cards.innerHTML = '';
      }
      _lastContactUrl = C.jobUrl;
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
    err.textContent = e.message || 'Could not find contacts. Make sure you are on a job posting page.';
    err.classList.remove('hidden');
  } finally { btn.disabled = false; btn.innerHTML = '<i class="ti ti-search"></i>Find Who to Contact'; }
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

const CL = { jobTitle: '', company: '', jobText: '', resumeText: '', jobUrl: '' };

function detectForCover() {
  $('cover-no-job').classList.add('hidden');
  $('cover-job-banner').classList.add('hidden');
  getTab(tab => {
    if (!tab) { $('cover-no-job').classList.remove('hidden'); return; }
    chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB_TEXT' }, r => {
      if (chrome.runtime.lastError || !r?.text || r.text.length < 50) {
        $('cover-no-job').classList.remove('hidden'); return;
      }
      CL.jobTitle = r.title || ''; CL.company = deriveCompany(r.company, tab.url, r.title);
      CL.jobText = r.text;
      CL.jobUrl = tab.url || '';
      $('cover-job-banner').classList.remove('hidden');
      $('cover-job-title').textContent = cleanLabel(CL.jobTitle) || 'Job detected';
      $('cover-job-sub').textContent = cleanLabel(CL.company) ? `at ${cleanLabel(CL.company)}` : 'Unknown company';
      setCompanyLogo('cover-job-logo', CL.company, CL.jobTitle);
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
      resumeText: CL.resumeText, jdText: CL.jobText, tone, company: CL.company, url: CL.jobUrl,
    });
    if (data.error) throw new Error(data.error);
    { const out = $('cover-out'); out.dataset.raw = data.body || ''; out.innerHTML = aynFormatAiText(data.body || ''); }
    $('cover-result').classList.remove('hidden');
  } catch (e) {
    err.textContent = e.message || 'Failed to generate. Make sure your resume is saved at aynn.io.';
    err.classList.remove('hidden');
  } finally { btn.disabled = false; btn.innerHTML = 'Generate Cover Letter →'; }
}

$('gen-cover-btn').addEventListener('click', generateCoverLetter);
$('cover-regen-btn').addEventListener('click', generateCoverLetter);
$('cover-copy-btn').addEventListener('click', () => {
  const text = $('cover-out').dataset.raw || $('cover-out').textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => { $('cover-copy-btn').textContent = '✓ Copied!'; toast('Copied','ok'); setTimeout(()=>$('cover-copy-btn').textContent='Copy',1800); });
});
$('cover-save-btn').addEventListener('click', () => {
  if (!CL.company || !CL.jobTitle) { toast('No job detected', 'err'); return; }
  saveApplication({ jobTitle: CL.jobTitle, company: CL.company, jobUrl: '', status: 'saved' });
});

function coverHeaderFromResume(resumeText) {
  const lines = String(resumeText || '').split('\n').map(s => s.trim()).filter(Boolean);
  const name = lines[0] || '';
  let contact = '';
  for (let i = 1; i < Math.min(lines.length, 5); i++) {
    if (/@|\d{3}[^\d]*\d{4}|\|/.test(lines[i])) { contact = lines[i]; break; }
  }
  return { name, contact };
}

$('cover-download-pdf-btn').addEventListener('click', async () => {
  const body = $('cover-out').dataset.raw || $('cover-out').textContent || '';
  if (!body.trim()) { toast('Generate a cover letter first', 'err'); return; }
  const btn = $('cover-download-pdf-btn'); const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<div class="spinner dk"></div>PDF...';
  try {
    if (!window.AYNResumeFormat || !window.AYNResumeFormat.buildCoverLetterPdfBlob) throw new Error('Formatter not loaded');
    const { name, contact } = coverHeaderFromResume(CL.resumeText);
    const blob = window.AYNResumeFormat.buildCoverLetterPdfBlob(body, { name, contact, company: CL.company });
    const co = (cleanLabel(CL.company) || 'Company').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Company';
    saveBlob(blob, `Cover_Letter_${co}.pdf`);
    toast('Cover letter PDF downloaded ✓', 'ok');
  } catch (e) { toast(e.message || 'Download failed', 'err'); }
  finally { btn.disabled = false; btn.innerHTML = orig; }
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
  const errEl = $('err-tracker');
  if (errEl) errEl.classList.add('hidden');
  chrome.runtime.sendMessage({ type: 'GET_APPLICATIONS', payload: {} }, r => {
    $('tracker-loading').classList.add('hidden');
    if (chrome.runtime.lastError) {
      if (errEl) { errEl.textContent = 'Could not load tracker. Reload the extension.'; errEl.classList.remove('hidden'); }
      return;
    }
    if (r?.error) {
      if (errEl) { errEl.textContent = r.error; errEl.classList.remove('hidden'); }
      $('tracker-empty').classList.remove('hidden'); return;
    }
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
      const company = deriveCompany(r.company, tab.url, r.title);
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
      S.jobUrl = tab.url || '';
      $('t-job-banner').style.display = '';
      $('t-job-title').textContent = r.title || 'Job detected';
      $('t-job-sub').textContent = `${r.text.length.toLocaleString()} chars · click to load`;
      $('t-job-banner').dataset.text = r.text;
      // Auto-load JD if user has a resume but no JD yet
      const resume = $('resume-input').value.trim();
      const job = $('job-input').value.trim();
      if (resume.length >= 50 && job.length < 50) {
        $('job-input').value = r.text;
        $('job-chars').textContent = r.text.length;
        $('t-job-banner').style.display = 'none';
      }
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
    const d = await bgFunc('smart_tailor', { resumeText: resume, jdText: job, jobTitle: S.jobTitle, company: S.company, url: S.jobUrl });
    if (d.error) throw new Error(d.error);
    S.keywords = d.keywords||[]; S.tailoredText = d.tailoredText||''; S.changes = d.changes||[];
    S.atsScore = typeof d.atsScore === 'number' ? d.atsScore : null;
    S.scoreReasoning = d.scoreReasoning || '';
    renderKw(S.keywords); show('v-t2');
  } catch(e) { err.textContent = e.message; err.classList.remove('hidden'); }
  finally { btn.disabled = false; btn.innerHTML = 'See My Keyword Match →'; }
});

function renderKw(kws) {
  const m = kws.filter(k=>k.inResume).length;
  const total = kws.length || 1;
  const keywordPct = Math.round(m / total * 100);
  const pct = (typeof S.atsScore === 'number' && S.atsScore > 0) ? S.atsScore : keywordPct;
  $('kw-count').textContent = `${m}/${kws.length} matched`;
  const tier = pct >= 80 ? 's-strong' : pct >= 60 ? 's-good' : pct >= 35 ? 's-fair' : 's-poor';
  const ring = $('ats-ring');
  if (ring) { ring.textContent = pct + '%'; ring.className = 'ats-ring ' + tier; }
  const sub = $('ats-sub');
  if (sub) sub.textContent = S.scoreReasoning || `${m} of ${kws.length} key terms already in your resume. Tailor to lift this above 80%.`;
  const wrap = $('kw-chips'); wrap.innerHTML = '';
  // Sort: high-importance missing first, then matched
  const sorted = [...kws].sort((a,b) => {
    const imp = { high: 3, medium: 2, low: 1 };
    const ai = imp[a.importance] || 2, bi = imp[b.importance] || 2;
    if (a.inResume !== b.inResume) return a.inResume ? 1 : -1;
    return bi - ai;
  });
  sorted.forEach(kw => {
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
    const d = await bgFunc('smart_tailor', { resumeText: S.resume, jdText: S.job, jobTitle: S.jobTitle, company: S.company, url: S.jobUrl });
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
$('tailor-download-docx-btn')?.addEventListener('click', async (e) => {
  if (!S.tailoredText) { toast('Tailor a resume first', 'err'); return; }
  const btn = e.currentTarget; const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>DOCX...';
  try {
    if (!window.AYNResumeFormat || !window.AYNResumeFormat.buildResumeDocxBlob) throw new Error('Formatter not loaded');
    const co = (S.company || 'AYN').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'AYN';
    const fileBase = `Tailored_Resume_${co}`;
    const blob = await window.AYNResumeFormat.buildResumeDocxBlob(S.tailoredText, fileBase);
    saveBlob(blob, `${fileBase}.docx`);
    toast('Tailored resume downloaded ✓', 'ok');
  } catch (err) { toast(err.message || 'Download failed', 'err'); }
  finally { btn.disabled = false; btn.innerHTML = orig; }
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
function bgFunc(action, payload, opts = {}) {
  const { silent = false } = opts;
  console.log('[AYN] →', action, payload, silent ? '(silent)' : '');
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'BG_FUNC', action, payload: payload || {} }, async resp => {
      if (chrome.runtime.lastError) {
        console.warn('[AYN] runtime err', action, chrome.runtime.lastError.message);
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (!resp) {
        console.warn('[AYN] no response', action);
        return reject(new Error('No response from background. Reload the extension at chrome://extensions.'));
      }
      if (!resp.ok) {
        console.warn('[AYN] err', action, resp.error);
        const isAuthErr = /Not signed in|Invalid token|Token revoked|HTTP 401/i.test(resp.error || '');
        if (isAuthErr) {
          // Silent/background calls never bounce to login.
          if (silent) return reject(new Error(resp.error || 'auth_error'));
          // Single silent re-verify before logging the user out.
          try {
            const verify = await new Promise(r => chrome.runtime.sendMessage({ type: 'BOOTSTRAP' }, r));
            if (verify && !verify.error && verify.user) {
              // Token still valid — keep session, just reject this call.
              return reject(new Error(resp.error || 'Request failed'));
            }
          } catch { /* fallthrough to logout */ }
          chrome.runtime.sendMessage({ type: 'SIGN_OUT' }, () => show('v-login'));
          return reject(new Error('Session expired. Please sign in again.'));
        }
        return reject(new Error(resp.error || 'Request failed'));
      }
      console.log('[AYN] ←', action, resp.data);
      resolve(resp.data);
    });
  });
}

// ── Helpers ──
function getTab(cb) { chrome.tabs.query({ active:true, currentWindow:true }, tabs => cb(tabs[0]||null)); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function fillDisplayLabel(d={}) {
  const raw = String(d.label || '').trim();
  if (raw && !/^question$/i.test(raw)) return raw;
  const group = String(d.group || '').trim();
  const labels = {
    'eeo.disability': 'Disability status',
    'eeo.veteran': 'Veteran status',
    'eeo.gender': 'Gender',
    'eeo.ethnicity': 'Race or ethnicity',
    'logic.work_auth': 'Work authorization',
    'logic.sponsorship': 'Visa sponsorship',
    'logic.relocate': 'Relocation',
    'consent.agree': 'Required consent',
  };
  return labels[group] || group || raw || d.id || 'Field';
}
function cleanTitle(t) {
  return String(t||'').replace(/\s*[|\-–—]\s*Lovable\s*$/i, '').trim();
}
window.cleanTitle = cleanTitle;

// ── Re-detect on tab change / navigation ──
function refreshForActiveTab() {
  if (!S.user) return;
  // Clear stale banners before re-detect so previous tab's data never lingers
  const fb = $('fill-job-banner'); if (fb) { fb.classList.add('hidden'); fb.style.display = ''; }
  $('contact-no-job')?.classList.add('hidden');
  $('contact-job-info')?.classList.add('hidden');
  $('cover-no-job')?.classList.add('hidden');
  $('cover-job-banner')?.classList.add('hidden');
  $('err-fill')?.classList.add('hidden');
  $('fill-result-wrap')?.classList.add('hidden');

  if (S.tab === 'fill')    detectForFill();
  if (S.tab === 'jobs')    detectForScore();
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

// ═══════════════════════════════════════════════════════════════════
// v1.4.0: ASK AYN — context-aware chat copilot
// ═══════════════════════════════════════════════════════════════════
const ASK = { sessionId: null, jobText: '', jobTitle: '', company: '', url: '', loaded: false, busy: false };

async function detectForAsk() {
  // Pull current page context (job + form) once per page load
  const pill = $('ask-context-pill-wrap');
  pill.innerHTML = `<div class="ask-context-pill"><i class="ti ti-loader-2 spin"></i>Reading the page…</div>`;
  try {
    const tab = await new Promise(res => chrome.tabs.query({ active: true, currentWindow: true }, t => res(t[0])));
    if (!tab?.id) throw new Error('no_tab');
    const scan = await new Promise(res => chrome.tabs.sendMessage(tab.id, { type: 'SCAN_FORM' }, r => res(r || null)));
    ASK.url = tab.url || '';
    ASK.jobText  = scan?.jobText?.text  || '';
    ASK.jobTitle = scan?.jobText?.title || '';
    ASK.company  = scan?.jobText?.company || '';
    if (ASK.jobTitle || ASK.company) {
      pill.innerHTML = `<div class="ask-context-pill"><i class="ti ti-target-arrow"></i>${[ASK.jobTitle, ASK.company].filter(Boolean).join(' · ').slice(0, 80)}</div>`;
    } else {
      pill.innerHTML = `<div class="ask-context-pill" style="background:#f3f4f6;border-color:#e5e7eb;color:#6b7280"><i class="ti ti-info-circle"></i>No job detected — I'll answer using your resume only.</div>`;
    }
    ASK.loaded = true;
  } catch {
    pill.innerHTML = `<div class="ask-context-pill" style="background:#f3f4f6;border-color:#e5e7eb;color:#6b7280"><i class="ti ti-info-circle"></i>Reload the page if I can't see it.</div>`;
  }
}

// v2.8.3 — Render AI text safely: HTML-escape, then apply markdown-lite
// (bold, bullet lists, paragraphs). No external libraries.
function aynFormatAiText(text) {
  const raw = String(text == null ? '' : text);
  const esc = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = esc.split(/\r?\n/);
  const out = [];
  let listBuf = [];
  const flushList = () => {
    if (listBuf.length) {
      out.push('<ul style="margin:6px 0 6px 18px;padding:0">' +
        listBuf.map(li => `<li style="margin:2px 0">${li}</li>`).join('') + '</ul>');
      listBuf = [];
    }
  };
  let paraBuf = [];
  const flushPara = () => {
    if (paraBuf.length) {
      out.push('<p style="margin:0 0 8px 0">' + paraBuf.join('<br>') + '</p>');
      paraBuf = [];
    }
  };
  for (const line of lines) {
    const m = line.match(/^\s*(?:\*|-|•)\s+(.*)$/);
    if (m) { flushPara(); listBuf.push(m[1]); continue; }
    if (line.trim() === '') { flushList(); flushPara(); continue; }
    flushList();
    paraBuf.push(line);
  }
  flushList();
  flushPara();
  return out.join('').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function askAddBubble(role, text, opts = {}) {
  $('ask-empty')?.classList.add('hidden');
  const msgs = $('ask-msgs');
  const b = document.createElement('div');
  b.className = `ask-bubble ${role}` + (opts.thinking ? ' thinking' : '');
  if (opts.thinking) {
    b.innerHTML = `<div class="spinner"></div>${aynFormatAiText(text)}`;
  } else if (role === 'assistant') {
    b.innerHTML = aynFormatAiText(text);
  } else {
    b.textContent = text;
  }
  msgs.appendChild(b);

  if (role === 'assistant' && !opts.thinking && text) {
    const actions = document.createElement('div');
    actions.className = 'ask-bubble-actions';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'ask-mini-btn';
    copyBtn.innerHTML = '<i class="ti ti-copy"></i> Copy';
    copyBtn.onclick = () => { navigator.clipboard.writeText(text); copyBtn.innerHTML = '<i class="ti ti-check"></i> Copied'; setTimeout(()=>{ copyBtn.innerHTML='<i class="ti ti-copy"></i> Copy'; }, 1500); };
    actions.appendChild(copyBtn);
    b.appendChild(actions);
  }
  msgs.scrollTop = msgs.scrollHeight;
  return b;
}

// v1.9.12: fixed allowlist of card prompts — no free-text input is accepted.
const ASK_ALLOWED = new Set();
function refreshAskAllowed() {
  ASK_ALLOWED.clear();
  document.querySelectorAll('#ask-cards .ask-card[data-q]').forEach(c => ASK_ALLOWED.add(c.dataset.q));
}

function setAskCardsDisabled(disabled) {
  document.querySelectorAll('#ask-cards .ask-card').forEach(b => { b.disabled = disabled; });
}

async function askSend(question) {
  if (!question || ASK.busy) return;
  if (!ASK_ALLOWED.has(question)) return; // hard allowlist — no arbitrary prompts
  ASK.busy = true;
  setAskCardsDisabled(true);
  $('ask-cards')?.classList.add('hidden');
  $('ask-intro')?.classList.add('hidden');

  // Show the short card label (not the long prompt) as the user bubble
  const card = Array.from(document.querySelectorAll('#ask-cards .ask-card')).find(c => c.dataset.q === question);
  const label = card?.querySelector('.ask-card-title')?.textContent?.trim() || 'Question';
  askAddBubble('user', label);
  const thinking = askAddBubble('assistant', 'Thinking…', { thinking: true });

  try {
    const r = await bgFunc('ext_ask', {
      sessionId: ASK.sessionId,
      question,
      jobTitle: ASK.jobTitle,
      company: ASK.company,
      jobText: (ASK.jobText || '').slice(0, 3500),
      url: ASK.url,
    });
    ASK.sessionId = r.sessionId || ASK.sessionId;
    thinking.remove();
    askAddBubble('assistant', r.answer || '(no answer)');
  } catch (e) {
    thinking.remove();
    askAddBubble('assistant', `Couldn't reach AYN: ${e.message || 'error'}`);
  } finally {
    ASK.busy = false;
    setAskCardsDisabled(false);
    $('ask-reset-row')?.classList.remove('hidden');
  }
}

document.addEventListener('click', (e) => {
  const card = e.target.closest('#ask-cards .ask-card');
  if (card && card.dataset.q) askSend(card.dataset.q);
});

$('ask-reset-btn')?.addEventListener('click', () => {
  $('ask-msgs').innerHTML = '';
  $('ask-cards')?.classList.remove('hidden');
  $('ask-intro')?.classList.remove('hidden');
  $('ask-reset-row')?.classList.add('hidden');
});

refreshAskAllowed();

// Wire inline-handler replacements (MV3 CSP blocks inline on* attributes)
document.querySelectorAll('.tabs [data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
$('score-toggle')?.addEventListener('click', () => toggleScoring());
$('copy-subject-btn')?.addEventListener('click', () => window.copySubject());
$('copy-outreach-btn')?.addEventListener('click', () => window.copyOutreach());

// PART B: react instantly when content.js reports a form on the active tab
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'FORM_DETECTED_PUSH' && S.tab === 'fill') {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const t = tabs && tabs[0];
      if (t && t.id === msg.tabId) applyFormReady(msg);
    });
  }
});

// v1.9.38 — Opt-in high-accuracy vision (screenshot) toggle
(function initVisionHQ() {
  const el = document.getElementById('vision-hq-toggle');
  const note = document.getElementById('vision-hq-note');
  if (!el) return;

  async function hasPerm() {
    try { return await chrome.permissions.contains({ origins: ['<all_urls>'] }); }
    catch { return false; }
  }
  async function reqPerm() {
    try { return await chrome.permissions.request({ origins: ['<all_urls>'] }); }
    catch { return false; }
  }
  async function removePerm() {
    try { await chrome.permissions.remove({ origins: ['<all_urls>'] }); } catch {}
  }
  function showNote(t) {
    if (!note) return;
    if (!t) { note.classList.add('hidden'); note.textContent = ''; return; }
    note.classList.remove('hidden'); note.textContent = t;
  }

  (async () => {
    try {
      const d = await new Promise(r => chrome.storage.local.get(['aynVisionScreenshot'], r));
      const flag = d && d.aynVisionScreenshot === true;
      const perm = await hasPerm();
      if (flag && perm) { el.checked = true; showNote('Enabled'); }
      else {
        el.checked = false; showNote('');
        if (flag && !perm) chrome.storage.local.set({ aynVisionScreenshot: false });
      }
    } catch {}
  })();

  el.addEventListener('change', async () => {
    if (el.checked) {
      const granted = await reqPerm();
      if (granted) {
        chrome.storage.local.set({ aynVisionScreenshot: true });
        showNote('Enabled');
      } else {
        el.checked = false;
        chrome.storage.local.set({ aynVisionScreenshot: false });
        showNote('');
      }
    } else {
      await removePerm();
      chrome.storage.local.set({ aynVisionScreenshot: false });
      showNote('');
    }
  });
})();

// ═══════════════════════════════════════════════════════════════════
// v2.8.0 — JD Provenance banner + manual JD paste
// ═══════════════════════════════════════════════════════════════════
(function aynJdBannerInit() {
  const $ = (id) => document.getElementById(id);
  const SRC_LABEL = {
    manual: 'Using your pasted JD',
    current_page: 'Read from this page',
    opener_tab: 'Read from the tab you came from',
    registry: 'Recalled from a job you viewed earlier',
    listing_fetch: 'Fetched from the listing page',
    backend: 'Loaded from your AYN job history',
  };
  let __jdTabId = null;

  window.aynResolveJdBanner = function (tabId) {
    __jdTabId = tabId;
    const banner = $('jd-provenance');
    const label = $('jd-src-label');
    const meta = $('jd-src-meta');
    const warn = $('jd-src-warn');
    const pasteBtn = $('jd-paste-toggle');
    const replaceLink = $('jd-replace-link');
    if (!banner || !label) return;
    label.textContent = 'Locating the job description…';
    meta.textContent = '';
    warn.classList.add('hidden');
    pasteBtn?.classList.add('hidden');
    replaceLink?.classList.add('hidden');
    banner.classList.remove('hidden');
    chrome.runtime.sendMessage({ type: 'RESOLVE_JD', tabId }, r => {
      void chrome.runtime.lastError;
      if (!r || !r.ok) {
        label.textContent = 'No job description found';
        meta.textContent = 'Paste it manually for a better fill.';
        warn.classList.remove('hidden');
        pasteBtn?.classList.remove('hidden');
        return;
      }
      const chars = (r.text || '').length;
      const quality = r.quality || 0;
      label.textContent = SRC_LABEL[r.source] || 'JD ready';
      meta.textContent = `· ${chars.toLocaleString()} chars · quality ${quality}/100`;
      const lowQuality = quality < 45 || chars < 600;
      if (lowQuality) {
        warn.classList.remove('hidden');
        pasteBtn?.classList.remove('hidden');
      } else {
        replaceLink?.classList.remove('hidden');
      }
    });
  };

  $('jd-replace-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    const w = $('jd-paste-wrap');
    if (!w) return;
    w.classList.remove('hidden');
    $('jd-paste-input')?.focus();
  });

  $('jd-paste-toggle')?.addEventListener('click', () => {
    const w = $('jd-paste-wrap');
    if (!w) return;
    w.classList.toggle('hidden');
    if (!w.classList.contains('hidden')) $('jd-paste-input')?.focus();
  });
  $('jd-paste-cancel')?.addEventListener('click', () => {
    $('jd-paste-wrap')?.classList.add('hidden');
    $('jd-paste-input').value = '';
  });
  $('jd-paste-save')?.addEventListener('click', () => {
    const text = ($('jd-paste-input').value || '').trim();
    if (text.length < 100) { toast('Paste the full job description (100+ chars).', 'err'); return; }
    if (__jdTabId == null) { toast('Open a page first, then paste.', 'err'); return; }
    chrome.runtime.sendMessage({ type: 'SET_MANUAL_JD', tabId: __jdTabId, text }, () => {
      void chrome.runtime.lastError;
      $('jd-paste-wrap')?.classList.add('hidden');
      toast('JD saved · rescoring…', 'ok');
      window.aynResolveJdBanner(__jdTabId);
      // v2.8.2 — use the pasted JD immediately for scoring.
      try { SJ.jobText = text; } catch {}
      try { runScoreFlow({ auto: false }); } catch {}
    });
  });
})();
