/**
 * AYN Auto-Apply — page detector.
 *
 * v3.326.0 -- declared in manifest.json's content_scripts, so this runs
 * automatically on every real https page load, not click-triggered like
 * the full fill flow it can open. This is the direct answer to a real,
 * plain ask: a real competitor's own extension opens on its own when it
 * recognizes a job application page, AYN previously only ever opened on
 * a manual click. Deliberately the smallest, cheapest thing that can
 * run unconditionally on every page a person visits: it reads the
 * current hostname and, only once that alone already looks confident,
 * a bare count of real fillable controls already on the page. It never
 * reads a field's label, a page's own text, or any value, and nothing
 * here ever reaches AYN's backend or leaves the browser -- the one
 * thing it's allowed to do is ask background.js to run the exact same
 * real fill flow the toolbar icon already triggers. This is a second
 * way to reach that flow, never a second, different one.
 *
 * Scoped to known ATS platforms on purpose, not "every page with a
 * form" -- a login box, a newsletter signup, or a search field would
 * all otherwise qualify, and this must never pop open somewhere that
 * isn't genuinely a job application. The list mirrors frame_agent.js's
 * own detectPlatform() (see that file's own header for which of these
 * have actually been verified live this session, and which are real,
 * correct hostname matches with no deeper behavior tested yet) --
 * duplicated here by hand rather than shared, since a manifest-declared
 * content script can't import from a file only ever injected on
 * demand.
 */
(() => {
  if (!/^https:\/\//.test(location.href)) return;

  const KNOWN_ATS_HOSTS = [
    /(^|\.)greenhouse\.io$/,
    /(^|\.)lever\.co$/,
    /(^|\.)ashbyhq\.com$/,
    /\.myworkdayjobs\.com$/,
    /\.myworkdaysite\.com$/,
    /(^|\.)fa\.[a-z0-9]+\.oraclecloud\.com$/,
    /(^|\.)recruitee\.com$/,
    /(^|\.)eightfold\.ai$/,
    /(^|\.)workable\.com$/,
    /(^|\.)icims\.com$/,
    /(^|\.)smartrecruiters\.com$/,
    /(^|\.)zohorecruit\.com$/,
  ];

  function looksLikeKnownAtsHost() {
    const h = (location.hostname || "").toLowerCase();
    return KNOWN_ATS_HOSTS.some((re) => re.test(h));
  }

  // A real, fillable application form has several distinct real
  // controls on the page at once -- a bare login box or a search field
  // does not. Deliberately generous (3) and cheap (one querySelectorAll,
  // no label reading, no value reading) -- this only ever decides
  // WHETHER to open the real flow, never fills anything itself.
  function realFieldCount() {
    return document.querySelectorAll(
      "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]), textarea, select"
    ).length;
  }

  let triggered = false;
  function maybeTrigger() {
    // window.__aynAutoDismissed -- the person already closed AYN once on
    // this exact page load; never force it back open on them.
    // window.__aynAutoApplyHost -- the real fill flow is already open
    // (a manual click got there first, or an earlier tick of this same
    // interval already triggered it).
    if (triggered || window.__aynAutoDismissed || window.__aynAutoApplyHost) return;
    if (!looksLikeKnownAtsHost()) return;
    if (realFieldCount() < 3) return;
    triggered = true;
    try {
      chrome.runtime.sendMessage({ type: "AYN_AUTO_DETECTED" }).catch(() => {});
    } catch (e) {
      // A torn-down extension context (a reload while this tab was
      // already open) throws synchronously rather than rejecting --
      // never worth surfacing, the person can still click the icon.
    }
  }

  // A known ATS platform is very commonly a client-side-routed SPA --
  // the real Apply step, with its real form, often only exists well
  // after this script's own first run, with no further navigation event
  // for a manifest-declared content script to hear about at all.
  // Checked on a plain, unhurried interval, not a MutationObserver --
  // this file needs to stay the cheapest possible thing running on
  // every single page, not another live watcher on top of the one the
  // real fill flow already runs once it's actually open.
  maybeTrigger();
  const iv = setInterval(() => {
    if (triggered) { clearInterval(iv); return; }
    maybeTrigger();
  }, 2000);
  setTimeout(() => clearInterval(iv), 60000);
})();
