/**
 * AYN Auto-Apply — content script.
 *
 * v3.276.0 -- rewritten from scratch after direct feedback: the first
 * version had too many screens (pick a job, review, fill, review the
 * fill, then a separate "submit" step the extension clicked for you).
 * "This is not autofill... we want autofill and the user hit submit."
 * Correct call -- an autofill tool fills fields, full stop. It does not
 * click a third-party site's own submit button on someone's behalf.
 * This version does exactly one thing: click the icon, it fills what it
 * can from your real AYN profile, and stops. You review the real page
 * and click Submit yourself, same as any other autofill tool.
 *
 * Runs ONLY when you click the toolbar icon, ONLY in the tab you're
 * looking at. Every value it fills comes from a real backend call
 * (auto_apply_extract) against your own AYN profile -- nothing is
 * invented -- and every field write is read back immediately after
 * being set, so a field that didn't actually take the value is reported
 * as failed, never silently counted as filled.
 *
 * v3.278.0 -- reported directly, a real screenshot: clicking the icon
 * showed a "which saved job is this?" picker on a page that had nothing
 * to do with Saved Jobs. That step never should have existed -- it was
 * only there because auto_apply_extract used to require a real jobId,
 * left over from the server-side Playwright path this same action also
 * serves. jobId is now optional on the backend; this script no longer
 * touches Saved Jobs at all. Click the icon on any application page,
 * signed in or not, and it goes straight to reading the page.
 *
 * v3.332.0 -- reading, not filling, is now where it actually stops until
 * a real click: opening the panel (icon click, detector.js's own auto-
 * open, or a fresh sign-in) lands on showReady(), a real landing screen
 * with the free fit check already loading and, if this page has a resume
 * or cover-letter file field, per-job "Tailor my resume" / "Write cover
 * letter" buttons right there -- fields are only actually written once
 * "Fill this application" is clicked. Full re-brand alongside it (see the
 * CSS block below): AYN's real "Charcoal & Ember" identity, and every
 * result now reads as structured stat pills and chips instead of prose.
 *
 * v3.336.0 -- a "not on file" question can now be answered right in the
 * panel, once, and AYN remembers it. v3.279.0's own history above
 * deliberately removed an inline answer box for a real reason -- it typed
 * an answer into the page with no memory, no reuse, "why does it ask me
 * questions... what's the point of autofilling." This is the same
 * interaction back, but with the actual payoff that was missing then:
 * every answer given here fills the real page field AND saves to the
 * same answer bank "Save what I typed, for next time" already writes to,
 * so it's genuinely on file for the next application, not asked again. A
 * radio-group question (gender identity, veteran status, work
 * authorization) shows its real options as real, clickable choices, never
 * a free-text box standing in for a fixed-choice question. A legal
 * consent line ("I agree to Reddit's Privacy Policy") is deliberately
 * excluded from all of this -- see CONSENT_CHECKBOX_RE -- that's a
 * one-time agreement to one employer's own policy, never reusable profile
 * data, and never something AYN decides for you.
 *
 * v3.341.0 -- reported directly, right after v3.336.0 shipped: having a
 * second place to answer questions, inside the panel, read as confusing
 * rather than helpful -- "let the user fill it in the real page and ayn
 * can know the answers, memorize them." Reversed the inline part of
 * that same interaction: the panel's own text box and clickable choice
 * buttons are gone, a not-on-file question is filled the one and only
 * ordinary way, directly on the real page. The memory half is untouched
 * and unchanged -- "Save what I typed, for next time" (a real button,
 * shown once results are ready) reads back whatever the person actually
 * typed or chose on the page and writes it to the same user_answer_bank
 * every reuse path already draws from, now covering a fixed-choice
 * question too, not just a typed one.
 *
 * v3.342.0/v3.343.0 -- a real, on-page "click for a draft" badge was
 * built and shipped for an open-ended question the batch narrative
 * pass hadn't answered (see resume-hub's own auto_apply_extract), then
 * removed in the very next round of direct feedback: "no i want ai to
 * help to answer and dont get on my way." Read plainly, a clickable
 * control sitting inside a real page's own field is exactly the kind
 * of getting-in-the-way this app has already reversed once before, for
 * the same reason, on the inline answer boxes above. The actual fix
 * lives on the backend, not here: the batch narrative pass's own
 * question cap raised from 4 to 10, so a real open-ended question gets
 * a real, honest, automatically-filled draft as part of the one normal
 * Fill pass, no click, no extra control on the page at all.
 *
 * v3.345.0/v3.346.0 -- reported directly against a screenshot of the real
 * Jobright Chrome extension on a live job page: "you see how the
 * extantion look easy to understand clean cards ayn extantion needs to
 * be the same." The Ready screen's resume/cover-letter row was two
 * same-weight ghost buttons sitting beside the one real primary action
 * ("Fill this application") -- restructured into the pattern actually
 * being pointed at: one dominant primary button, a plain credit count
 * (billing_get, already free, already used by the web app's own Billing
 * page) read right under it, and Tailor/Cover-letter as a calm,
 * chevron-led list card instead of two buttons competing for the same
 * visual weight as the one real decision on this screen. AYN's own
 * branding throughout, not the competitor's colors.
 *
 * v3.348.0 -- asked directly to research 2026 extension design and make
 * the whole panel easier to understand and navigate. Researched Chrome's
 * own extension UX guidance ("purposeful and minimal, single purpose")
 * and this app's own web-sidebar redesign history, then read this panel
 * end to end rather than guessing at fixes. Four real gaps found and
 * closed: the panel had no account/sign-out access anywhere (buildHead()
 * now carries an account row with the signed-in email and a real Sign
 * out, reachable from every screen); the header's own close button and
 * the Ready screen's "Not now" did the exact same thing (removed the
 * duplicate); nothing confirmed which job AYN was reading before Fill
 * was clicked (a plain "On this page" line, the page's own real title,
 * now sits at the top of Ready); and a tailor/cover-letter result screen
 * forced a full reset just to reach the OTHER document-writing action
 * (afterAttach now offers the one genuine remaining sibling action right
 * there, never both, never a repeat).
 *
 * v3.349.0 -- reported directly, a real screenshot, right after v3.348.0
 * shipped: "the extantion looks the same design?" Checked rather than
 * assumed stale -- this was real, not a caching issue: the screen shown
 * after a Fill actually runs (buildHead("Filled"), roughly the back half
 * of autofill()) was never touched by any of the "clean cards" redesign
 * work (v3.330.0 through v3.347.0) -- still hardcoded hex colors
 * (#191919, #8a8a8a, #6f6f6f, #1b7b47, #f0f0f0) instead of this panel's
 * own --ink/--muted/--trust/--border tokens, and the exact "wall of
 * buttons" anti-pattern (Send diagnostics / Save what I typed / Save
 * this job, three stacked full-width ghost buttons) the Ready screen's
 * own v3.345.0 fix was built to move away from. Swept every hardcoded
 * color in this screen onto the real tokens, and grouped the three
 * trailing utility actions into one list-card with real icons, matching
 * the Ready screen's Tailor/Cover-letter card exactly -- no click logic
 * changed, only how it's shown. Verified live end to end (a real local
 * harness driving the actual content.js/frame_agent.js through a real
 * Fill pass), not just read.
 */
(() => {
  // v3.279.0 -- real bug, reported directly: "why it vanish and I can't
  // see it back." The old guard here (`__aynAutoApplyInjected`, a
  // permanent boolean) blocked EVERY future click on the icon once set,
  // forever, for the life of the page -- closing the panel once meant
  // the extension silently did nothing on every click after that, no
  // error, nothing. Fixed by tracking the actual panel element instead:
  // if one is still genuinely open on the page, leave it (don't stack a
  // second one); if it's gone (closed, or never opened), always proceed.
  if (window.__aynAutoApplyHost && document.documentElement.contains(window.__aynAutoApplyHost)) return;

  const SUPABASE_URL = "https://ayn.careers";
  const ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg2ODg5MDQyLCJleHAiOjIxMDIyNDkwNDJ9.AmUVtzKLnrXO_ubBNxSDCBDnI7jJyNkGfK9p7nrzkGI";
  const STORAGE_KEY = "ayn_auto_apply_session";

  // ---------------------------------------------------------------
  // Session storage + auth
  // ---------------------------------------------------------------
  function getSession() {
    return new Promise((resolve) => chrome.storage.local.get([STORAGE_KEY], (r) => resolve(r[STORAGE_KEY] || null)));
  }
  function setSession(session) {
    return new Promise((resolve) => chrome.storage.local.set({ [STORAGE_KEY]: session }, resolve));
  }
  function clearSession() {
    return new Promise((resolve) => chrome.storage.local.remove([STORAGE_KEY], resolve));
  }

  async function signIn(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error_description || d.msg || "Sign-in failed.");
    const session = { access_token: d.access_token, refresh_token: d.refresh_token, user: d.user };
    await setSession(session);
    return session;
  }

  async function refreshSession(session) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const next = { access_token: d.access_token, refresh_token: d.refresh_token, user: d.user };
    await setSession(next);
    return next;
  }

  function isExpired(token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return !payload.exp || payload.exp * 1000 < Date.now() + 15000;
    } catch {
      return true;
    }
  }

  async function ensureSession() {
    let session = await getSession();
    if (!session) return null;
    if (isExpired(session.access_token)) {
      session = await refreshSession(session);
      if (!session) { await clearSession(); return null; }
    }
    return session;
  }

  async function callHub(session, body) {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/resume-hub`, {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status}).`);
    return data;
  }

  // v3.321.0 -- the one real, missing piece between this file's already
  // mature fill engine and "one click, filled and submitted, once
  // they've agreed." content.js was deliberately rebuilt at v3.276.0 to
  // never click a third-party site's own submit button, per direct
  // founder feedback at the time. This is the opposite behavior, built
  // the same way AYN builds every other "acts on your behalf" decision:
  // a real, explicit, server-recorded, revocable opt-in (auto_apply_
  // consent, mirroring talent_pool_consent's own shape exactly), checked
  // fresh every run, never assumed.
  async function getConsent(session) {
    try {
      return await callHub(session, { action: "auto_apply_consent_get" });
    } catch (e) {
      return { opted_in: false };
    }
  }
  async function setConsent(session, opted_in) {
    return callHub(session, { action: "auto_apply_consent_set", opted_in });
  }

  // Phrases real ATS platforms show, in their own words, when they refuse
  // a submission -- the same list, same reasoning, already proven live in
  // job-checker's own server-side fill path (_REJECTION_PHRASES): narrow
  // and literal on purpose, never a broad "error"/"failed" match, which
  // would also catch a genuine field-validation message that has nothing
  // to do with an anti-spam rejection. Only ever used to report a
  // rejection honestly, never to work around one.
  const REJECTION_PHRASES = [
    "flagged as possible spam", "flagged as spam", "couldn't submit your application",
    "could not submit your application", "we couldn't submit", "unable to submit your application",
    "your submission was blocked", "application was not submitted", "suspicious activity detected",
    "automated submission", "bot detection",
  ];
  function findRejectionText(bodyText) {
    if (!bodyText) return null;
    const lower = bodyText.toLowerCase();
    for (const phrase of REJECTION_PHRASES) {
      const idx = lower.indexOf(phrase);
      if (idx === -1) continue;
      const start = Math.max(bodyText.lastIndexOf("\n", idx), bodyText.lastIndexOf(". ", idx) + 1, 0);
      const ends = [bodyText.indexOf("\n", idx), bodyText.indexOf(". ", idx)].filter((e) => e !== -1);
      const end = ends.length ? Math.min(...ends) : bodyText.length;
      const snippet = bodyText.slice(start, end).trim();
      return (snippet || phrase).slice(0, 220);
    }
    return null;
  }

  // A real submit control, not a "Next"/"Continue" step in a multi-page
  // wizard and not the earlier "Apply"/"Apply now" button that only
  // reveals the form in the first place (a completely different control,
  // matched by _click_apply_if_needed's own equivalent pattern on the
  // job-checker side, never this one). type=submit is the one real,
  // unambiguous HTML signal a control IS a form's own final submission;
  // the text fallback stays narrow for the same reason.
  const SUBMIT_TEXT_RE = /^(submit( this)?( application)?|send( my)? application)$/i;

  // v3.332.0 -- hoisted from inside autofill() so the new ready/landing
  // screen can also ask "does this page even have a resume-type file
  // field" before extraction ever runs against the backend -- same two
  // patterns, one definition, used by both.
  const NOT_RESUME_FIELD = /cover\s*letter|portfolio|writing\s*sample|work\s*sample|transcript|reference|id\b|passport|visa|photo|headshot|video|w-?2|w-?4|i-?9|1099/i;
  const IS_COVER_LETTER_FIELD = /cover\s*letter/i;

  // v3.336.0 -- a legal/privacy consent line ("By selecting 'I agree,'
  // I understand my responses will be processed in accordance with
  // Reddit's Candidate Privacy Policy") is not reusable profile data --
  // it's a one-time agreement to THIS employer's own specific policy.
  // Never offered an inline answer box or saved to the answer bank, same
  // as this app has never let AYN tick a consent box on someone's behalf
  // anywhere else. Everything else "not on file" is a real, fair
  // candidate for "answer once here, reuse forever."
  const CONSENT_CHECKBOX_RE = /\bi agree\b|\bi consent\b|\bi acknowledge\b|\bi understand that\b|privacy policy|terms (of|and)/i;

  // Module scope (not local to autofill()) so a fix this file's own
  // history already hit once (a const referenced before its own
  // declaration point further down the same function -- a real,
  // live "Cannot access before initialization" crash) can't recur here.
  const LEGAL_SENSITIVE = /sponsor|work.{0,15}authoriz|legally (eligible|authorized)|visa status|\b18 years|legal drinking age/i;
  function findSubmitButton() {
    const native = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"]')).find(
      (b) => b.offsetParent !== null && !b.disabled
    );
    if (native) return native;
    const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
    return candidates.find((b) => {
      if (b.offsetParent === null || b.disabled || b.getAttribute("aria-disabled") === "true") return false;
      const text = (b.textContent || b.getAttribute("aria-label") || "").trim();
      return SUBMIT_TEXT_RE.test(text);
    }) || null;
  }

  // Clicks the real submit button and verifies honestly afterward -- the
  // exact same discipline job-checker's own server-side fill already
  // proved out live: a URL change alone is never trusted as proof, since
  // some ATS platforms route both a real confirmation AND their own
  // anti-spam rejection to a URL that differs from the posting; only a
  // URL change PLUS no rejection phrase in the resulting page's own
  // visible text counts as a real, honest success.
  async function attemptSubmit() {
    const btn = findSubmitButton();
    // No submit control found is the expected, ordinary outcome on an
    // intermediate step of a multi-step wizard (only a "Next"/"Continue"
    // exists there, deliberately never matched by SUBMIT_TEXT_RE) -- not
    // a failure, so it's worded as a real state, not an error.
    if (!btn) return { submitted: false, reason: "This step doesn't have a submit button yet -- likely more steps to come." };
    const beforeUrl = location.href;
    btn.click();
    await new Promise((r) => setTimeout(r, 2000));
    const rejection = findRejectionText(document.body ? document.body.innerText : "");
    if (rejection) return { submitted: false, reason: `The employer's own application system rejected this: "${rejection}"` };
    if (location.href === beforeUrl) return { submitted: false, reason: "The page didn't change after submit -- likely a validation error still on the page." };
    return { submitted: true };
  }

  // v3.287.0 -- the primary resume's own structured content (the exact
  // same shape resumeDocs.js's ported builder expects), fetched once per
  // panel session and cached so clicking "Attach" on more than one file
  // field doesn't re-fetch it each time. RLS-protected, owner-scoped --
  // the same real read the web app itself already relies on for this
  // table, no new backend surface needed.
  let cachedResumeContent = null;
  async function fetchPrimaryResumeContent(session) {
    if (cachedResumeContent) return cachedResumeContent;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/resumes?select=content&user_id=eq.${session.user.id}&is_primary=eq.true&limit=1`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}` } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    cachedResumeContent = rows[0]?.content || null;
    return cachedResumeContent;
  }

  // The one real, working way to set a file input's value from script --
  // DataTransfer, not blocked by browser security the way an older
  // assumption held. Read back afterward (input.files.length, the real
  // name) rather than trusted blind. Shared by every real caller below
  // (the static resume, a freshly tailored one, a freshly written cover
  // letter) so there is exactly one place that ever touches a file
  // input's own value.
  function attachFileBlob(inputEl, blob, filename, mimeType) {
    const file = new File([blob], filename, { type: mimeType });
    const dt = new DataTransfer();
    dt.items.add(file);
    inputEl.files = dt.files;
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    const landed = inputEl.files.length === 1 && inputEl.files[0].name === filename;
    return { ok: landed };
  }

  // Builds a real resume PDF from the person's own AYN profile (via the
  // vendored, ported resumeDocs.js -- see its own header comment) and
  // attaches it to a real <input type=file>.
  async function attachResumeFile(session, inputEl) {
    if (typeof window.__aynBuildResumePdfBlob !== "function") {
      return { ok: false, reason: "PDF builder didn't load on this page." };
    }
    const content = await fetchPrimaryResumeContent(session);
    if (!content) return { ok: false, reason: "No resume on file in AYN yet." };
    let blob;
    try {
      blob = window.__aynBuildResumePdfBlob(content);
    } catch (e) {
      return { ok: false, reason: "Couldn't build the resume file." };
    }
    const name = (content.basics && content.basics.name ? content.basics.name.replace(/\s+/g, "_") : "Resume") + "_Resume.pdf";
    return attachFileBlob(inputEl, blob, name, "application/pdf");
  }

  // v3.327.0 -- a best-effort read of the job description already on
  // this exact page, the same way the person reading it themselves
  // would -- no site-specific selector, no separate fetch. Real, honest
  // limit disclosed rather than hidden: on a platform whose apply STEP
  // sits on a different page than the job description itself, this
  // reads whatever this one page actually shows, which may be thin or
  // just the form's own labels -- tailor/cover_letter both already
  // refuse to write anything ungrounded rather than invent around a
  // weak JD, so a thin read degrades to an honest refusal, never a
  // fabricated result.
  function getPageJdText() {
    const text = ((document.body && document.body.innerText) || "").trim();
    if (text.length < 200) return null;
    return text.slice(0, 20000);
  }

  // v3.327.0 -- "why does it attach the same resume everywhere instead
  // of tailoring one for this job," asked directly after a real Reddit
  // application showed exactly that. Both tailor and cover_letter
  // already exist and are already proven (the web app's own Jobs tab
  // has called them for a long time) -- this wires the SAME two backend
  // actions into the extension's own file-attach step for the first
  // time, rather than building a second, different resume-writing path.
  // Deliberately does not send a guessed jobTitle: passing one wrong
  // risks corrupting the tailored resume's own title field, and the
  // backend's own resolveTailorTitle already has a careful, real
  // fallback (the candidate's own current title) for when none is
  // given -- the safer choice is to send nothing rather than guess.
  async function tailorAndAttach(session, inputEl) {
    if (typeof window.__aynBuildResumePdfBlob !== "function") {
      return { ok: false, reason: "PDF builder didn't load on this page." };
    }
    const jdText = getPageJdText();
    if (!jdText) return { ok: false, reason: "Couldn't find enough of a real job description on this page to tailor from." };
    // v3.332.0 -- fetched in parallel with the tailor call itself, not
    // after: this is the real, already-on-file resume (before any of
    // today's tailoring), needed so the results screen can show what
    // actually changed rather than just declaring success. Free, cached,
    // and never blocks the tailor call on its own completion.
    const beforePromise = fetchPrimaryResumeContent(session);
    let result;
    try {
      result = await callHub(session, { action: "tailor", jdText });
    } catch (e) {
      return { ok: false, reason: e.message || "Could not tailor a resume for this job." };
    }
    if (!result || !result.resume) return { ok: false, reason: "AYN could not tailor a resume from what's on file." };
    let blob;
    try {
      blob = window.__aynBuildResumePdfBlob(result.resume);
    } catch (e) {
      return { ok: false, reason: "Couldn't build the tailored resume file." };
    }
    const name = (result.resume.basics && result.resume.basics.name ? result.resume.basics.name.replace(/\s+/g, "_") : "Resume") + "_Tailored_Resume.pdf";
    const attached = attachFileBlob(inputEl, blob, name, "application/pdf");
    const before = await beforePromise;
    return { ...attached, credits: result.credits, resume: result.resume, gapAnalysis: result.gapAnalysis, before };
  }

  // Same reasoning as tailorAndAttach -- deliberately no guessed
  // company name sent either, for the same "send nothing rather than
  // guess wrong" reason; cover_letter's own prompt already has a real,
  // separate company-context lookup it uses when none is given.
  async function writeCoverLetterAndAttach(session, inputEl) {
    if (typeof window.__aynBuildCoverLetterPdfBlob !== "function") {
      return { ok: false, reason: "PDF builder didn't load on this page." };
    }
    const jdText = getPageJdText();
    if (!jdText) return { ok: false, reason: "Couldn't find enough of a real job description on this page to write from." };
    let result;
    try {
      result = await callHub(session, { action: "cover_letter", jdText });
    } catch (e) {
      return { ok: false, reason: e.message || "Could not write a cover letter for this job." };
    }
    if (!result || !result.body) return { ok: false, reason: "AYN could not write a cover letter from what's on file." };
    let blob;
    try {
      blob = window.__aynBuildCoverLetterPdfBlob(result.body);
    } catch (e) {
      return { ok: false, reason: "Couldn't build the cover letter file." };
    }
    const attached = attachFileBlob(inputEl, blob, "Cover_Letter.pdf", "application/pdf");
    return { ...attached, credits: result.credits, body: result.body };
  }

  // v3.332.0 -- "more useful": every other real signal AYN has about a job
  // (score, tailor, a real submit) already lives on the web app's own
  // Jobs pipeline (Saved -> Applied -> Interviewing -> ...), but nothing
  // in the extension ever wrote to it -- an application filled here left
  // no trace anywhere in AYN itself. This mirrors the exact same insert
  // BrowseJobs.tsx's own saveJob already does (same table, same columns,
  // same select-then-insert de-dupe on user_id+source_url -- not a new
  // mechanism, the identical one already proven live in the web app),
  // reached the same way this file already reads `resumes` directly: a
  // raw, RLS-scoped REST call, since there is no resume-hub action for
  // this. Never invents a company name or a fact about the role -- title
  // is the real page's own <title>, exactly what a person would see in
  // their own browser tab, never guessed at.
  async function saveJobToPipeline(session, { title, jdText, sourceUrl: explicitUrl }, opts = {}) {
    try {
      // v3.332.0 -- a real submit navigates the page BEFORE this ever
      // runs (attemptSubmit only reports success once the URL has already
      // changed) -- location.href at call time would be the confirmation
      // page, not the job. Every caller that runs after a possible
      // navigation must capture and pass its own sourceUrl from before
      // that happened; this only falls back to the live location for the
      // manual, no-navigation "Save this job" button.
      const sourceUrl = (explicitUrl || location.href).split("#")[0].slice(0, 2000);
      const existingR = await fetch(
        `${SUPABASE_URL}/rest/v1/jobs?select=id,application_status&user_id=eq.${session.user.id}&source_url=eq.${encodeURIComponent(sourceUrl)}&limit=1`,
        { headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}` } }
      );
      const existing = existingR.ok ? await existingR.json() : [];
      let jobId = existing[0] && existing[0].id;
      if (!jobId) {
        const insertR = await fetch(`${SUPABASE_URL}/rest/v1/jobs`, {
          method: "POST",
          headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({
            user_id: session.user.id, source: "extension", source_url: sourceUrl,
            jd_text: jdText ? jdText.slice(0, 20000) : null, title: title || null,
          }),
        });
        if (!insertR.ok) return { ok: false };
        const rows = await insertR.json();
        jobId = rows[0] && rows[0].id;
      }
      if (jobId && opts.markApplied) {
        await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${jobId}`, {
          method: "PATCH",
          headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ application_status: "applied", application_status_changed_at: new Date().toISOString() }),
        });
      }
      return { ok: true };
    } catch (e) {
      return { ok: false };
    }
  }

  // A free, automatic "why you're a good fit" read, shown the moment the
  // panel opens rather than only after a paid tailor. Calls the same
  // `match` action the web app's Jobs tab already uses -- the deterministic
  // gap analysis underneath it (computeGap + semanticGapRecheck) is the
  // exact same one `tailor` grounds itself in, so this card and a tailored
  // resume can never disagree about what's actually missing. Never blocks
  // or delays the real fill: fired in parallel with extraction, and a
  // failure here (thin JD, rate limit, network) just means no card, same
  // as any other best-effort piece of this panel.
  async function fetchFit(session) {
    const jdText = getPageJdText();
    if (!jdText) return null;
    try {
      const r = await callHub(session, { action: "match", jdText });
      if (!r || typeof r.score !== "number") return null;
      return r;
    } catch (e) {
      return null;
    }
  }

  // Deliberately not a bare checkmark/cross the way a competitor's card
  // does it -- every category is labeled with the real percentage behind
  // it, and any real gap the deterministic analysis found is named by
  // skill, not just implied by a red X. Nothing here is generated by the
  // model at render time; score/breakdown/missing_keywords all came back
  // from `match`, which is itself bound by the same HONESTY RULE every
  // other scoring/tailoring action in this app already enforces -- only
  // ever credits a skill that's actually evidenced.
  // v3.332.0 -- score thresholds and their tone are decided ONCE, here, and
  // reused everywhere a score needs a color or a word (the ring, the
  // verdict label, a later "match improved from X to Y" line) -- so a
  // score can never render green in one spot and read as a weak match in
  // another. Nothing here is a guess: every number passed in already came
  // back from a real, grounded `match`/`tailor` call.
  function scoreTone(score) {
    if (score >= 75) return { hex: "#1b7b47", word: "Strong fit" };
    if (score >= 50) return { hex: "#cf8a1d", word: "Worth a look" };
    return { hex: "#b0392a", word: "Real gaps here" };
  }
  function scoreRing(score, size) {
    const s = Math.max(0, Math.min(100, Math.round(score)));
    const tone = scoreTone(s);
    const dim = size || 48;
    const ring = el("div", { class: "fit-ring", style: `width:${dim}px;height:${dim}px;` });
    ring.style.background = `conic-gradient(${tone.hex} ${s * 3.6}deg, #efefef 0deg)`;
    const inner = el("b", { text: String(s), style: `width:${dim - 8}px;height:${dim - 8}px;` });
    ring.appendChild(inner);
    return ring;
  }
  // A single, small, labeled pill -- the "smart card" replacement for a
  // plain-text row. Every value shown here traces back to a real number
  // or a real string AYN's backend returned; nothing is synthesized for
  // display.
  function statPill(label, pct) {
    const ok = typeof pct === "number" && pct >= 60;
    const mid = typeof pct === "number" && pct >= 35 && pct < 60;
    const cls = ok ? "pill-ok" : mid ? "pill-mid" : "pill-warn";
    return el("span", { class: `pill ${cls}`, text: typeof pct === "number" ? `${label} ${pct}%` : label });
  }
  function chip(text, tone) {
    return el("span", { class: `chip${tone ? ` chip-${tone}` : ""}`, text });
  }

  // v3.335.0 -- reported directly against a real screenshot: a gap chip
  // stretching a full requirement sentence ("At least 7+ years of product
  // management experience, with prior focus internal technical products,
  // developer tools...") into a pill shape reads exactly like generic
  // AI-generated UI -- a component built for a short label, forced onto
  // content it was never meant to hold. missing_keywords/gapAnalysis.
  // missing come straight from the deterministic gap analysis's own
  // Requirement.text (see _shared/tailoring.ts), which is the JD's own
  // wording -- sometimes a real short skill name ("Terraform"), sometimes
  // a full requirement clause. The web app's own JobsTab already solved
  // this correctly for its Badge list (truncate long text, full line on
  // hover) -- this is the same fix, but a truncated pill still LOOKS like
  // a short keyword chip even shortened, which is the wrong shape for a
  // real requirement sentence regardless of length. Short items stay
  // chips; long ones become a real, readable list instead.
  const GAP_SHORT_MAX = 30;
  function renderGapItems(container, items) {
    const shortOnes = [], longOnes = [];
    for (const g of items) (g.length <= GAP_SHORT_MAX ? shortOnes : longOnes).push(g);
    const shownShort = shortOnes.slice(0, 6);
    const shownLong = longOnes.slice(0, 3);
    if (shownShort.length) {
      const gapChips = el("div", { class: "chip-list" });
      for (const g of shownShort) gapChips.appendChild(chip(g, "warn"));
      container.appendChild(gapChips);
    }
    if (shownLong.length) {
      const list = el("ul", { class: "gap-list" });
      for (const g of shownLong) list.appendChild(el("li", { text: g }));
      container.appendChild(list);
    }
    const shownCount = shownShort.length + shownLong.length;
    if (items.length > shownCount) {
      container.appendChild(el("p", { class: "gap-more", text: `+${items.length - shownCount} more` }));
    }
  }

  // v3.334.0 -- the course-link chips (v3.333.0) are reverted here, not
  // kept alongside a new consent flow. Reported directly: a course
  // suggestion only belongs once a skill is genuinely ADDED, with the
  // person's own consent, to match a job -- that's the existing web app
  // rule (JobsTab's gapSuggestions warns "add one only if you're
  // genuinely willing to learn it," and only THEN does it land on the
  // Skills to learn page with its own course link). These chips were
  // never that -- they're a purely informational "still missing" read
  // with no add step at all, so a course link here was suggesting
  // learning material for something the person never committed to. The
  // extension has no add-a-missing-skill flow of its own yet (unlike
  // JobsTab); building one is real, separate work, not done here.

  // v3.332.0 -- rebuilt from a paragraph into real, scannable cards.
  // Reported directly against a live screenshot: "why i have a chunk of
  // writing instead of smart cards." The old version rendered m.summary
  // (a real, AI-written 2-3 sentence paragraph) as body text every time --
  // accurate, but the single least scannable thing on the whole panel.
  // The score/breakdown/missing_keywords underneath it are unchanged (this
  // is still the same `match` response, nothing re-requested or
  // reinterpreted) -- only the LAYOUT changed: a verdict word instead of a
  // bare number, three stat pills instead of three text rows, gap chips
  // instead of a joined sentence. m.summary is not deleted -- it is still
  // real, AI-written context -- it just moves to the ring's own title
  // attribute (a native tooltip) so it's one hover away rather than always
  // taking up vertical space.
  function buildFitCard(m) {
    const score = Math.max(0, Math.min(100, Math.round(m.score)));
    const tone = scoreTone(score);
    const ring = scoreRing(score, 50);
    if (m.summary) ring.title = m.summary;

    const right = el("div", { style: "flex: 1; min-width: 0;" });
    const head = el("div", { style: "display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom: 8px;" });
    head.appendChild(el("p", { class: "fit-title", text: tone.word, style: `margin:0; color:${tone.hex};` }));
    right.appendChild(head);

    const b = m.breakdown || {};
    const pills = el("div", { class: "chip-list" }, [
      statPill("Skills", b.skills_match),
      statPill("Experience", b.experience_match),
      statPill("Education", b.education_match),
    ]);
    right.appendChild(pills);

    const missing = m.missing_keywords || [];
    if (missing.length) {
      right.appendChild(el("p", { class: "fit-gaps-label", text: "Real gaps AYN found" }));
      renderGapItems(right, missing);
    }

    return el("div", { class: "fit-card" }, [ring, right]);
  }

  // v3.332.0 -- "we need to have resume tailor and cover letter... with
  // buttons the differences and what will be added to the resume." Before
  // this, a tailor click just flipped a button to "Tailored ✓" -- the
  // actual resume attached to the page was invisible; the person had to
  // download and open it to see what AYN actually did. Everything shown
  // here is a real, structural diff of two real objects (the resume on
  // file before today, and the one `tailor` just returned), never a
  // second AI call describing itself -- the same "code decides facts, the
  // model only phrases them" rule this whole app is built on. `before` can
  // be null (a canonical profile with no `resumes` row yet) and every
  // section here degrades honestly rather than guessing at what changed.
  function buildTailorDiffCard(r, preScore) {
    const card = el("div", {});
    const after = r.resume || {};
    const before = r.before || null;

    if (typeof preScore === "number" && typeof r.gapAnalysis?.matchPct === "number") {
      const preT = scoreTone(preScore);
      const postT = scoreTone(r.gapAnalysis.matchPct);
      const box = el("div", { class: "diff-card" });
      box.appendChild(el("p", { class: "diff-card-label", text: "Match, before and after" }));
      box.appendChild(el("div", { class: "diff-score-row" }, [
        el("span", { class: "diff-score-tag", text: `${Math.round(preScore)}%`, style: `color:${preT.hex};` }),
        el("span", { class: "diff-arrow", text: "→" }),
        el("span", { class: "diff-score-tag", text: `${Math.round(r.gapAnalysis.matchPct)}%`, style: `color:${postT.hex};` }),
      ]));
      card.appendChild(box);
    }

    const beforeSkills = new Set((before && Array.isArray(before.skills) ? before.skills : []).map((s) => String(s).trim().toLowerCase()));
    const afterSkills = Array.isArray(after.skills) ? after.skills : [];
    const addedSkills = before ? afterSkills.filter((s) => !beforeSkills.has(String(s).trim().toLowerCase())) : [];
    if (addedSkills.length) {
      const box = el("div", { class: "diff-card" });
      box.appendChild(el("p", { class: "diff-card-label", text: `${addedSkills.length} skill${addedSkills.length === 1 ? "" : "s"} added to match this job` }));
      const chips = el("div", { class: "chip-list" });
      for (const s of addedSkills.slice(0, 10)) chips.appendChild(chip(s, "ok"));
      box.appendChild(chips);
      card.appendChild(box);
    }

    const beforeSummary = before && before.basics && before.basics.summary ? before.basics.summary : "";
    const afterSummary = after.basics && after.basics.summary ? after.basics.summary : "";
    if (beforeSummary && afterSummary && beforeSummary.trim() !== afterSummary.trim()) {
      const box = el("div", { class: "diff-card" });
      box.appendChild(el("p", { class: "diff-card-label", text: "Summary, reworded for this job" }));
      const stack = el("div", { class: "diff-before-after" });
      stack.appendChild(el("p", { class: "diff-block diff-block-before", text: beforeSummary }));
      stack.appendChild(el("p", { class: "diff-block diff-block-after", text: afterSummary }));
      box.appendChild(stack);
      card.appendChild(box);
    }

    const stillMissing = (r.gapAnalysis && r.gapAnalysis.missing) || [];
    if (stillMissing.length) {
      const box = el("div", { class: "diff-card" });
      box.appendChild(el("p", { class: "diff-card-label", text: "Still not on your resume" }));
      renderGapItems(box, stillMissing);
      card.appendChild(box);
    }

    if (!card.children.length) {
      card.appendChild(el("p", { class: "muted", text: "Tailored for this job -- your skills and wording were already a strong match, so there wasn't much to change." }));
    }
    return card;
  }

  // v3.332.0 -- a cover letter used to attach as a PDF with zero preview:
  // the person could not see a single word of what AYN wrote without
  // downloading it. This is the exact text `cover_letter` returned,
  // rendered plainly -- not summarized, not re-generated.
  function buildCoverLetterPreview(body) {
    const words = body.trim().split(/\s+/).filter(Boolean).length;
    const box = el("div", { class: "diff-card" });
    box.appendChild(el("p", { class: "diff-card-label", text: `What AYN wrote (${words} words)` }));
    box.appendChild(el("p", { class: "letter-preview", text: body }));
    return box;
  }

  // ---------------------------------------------------------------
  // Field extraction
  // ---------------------------------------------------------------
  // v3.294.0 -- extraction, candidate-scan, and fill logic all moved to
  // frame_agent.js so the exact same code can run in every frame of a
  // page (iframe-embedded application forms, not just the top-level
  // page) -- see that file's own header comment. frame_agent.js is
  // injected into every frame BEFORE this file, including the top one,
  // and both are ISOLATED-world content scripts sharing the same
  // per-frame execution context, so these are just local aliases onto
  // what it already exposed on window, not a second implementation.
  const extractFields = window.__aynExtractFields;
  const scanUnrecognizedWidgets = window.__aynScanUnrecognizedWidgets;
  const fillTextLike = window.__aynFillTextLike;
  const fillRadio = window.__aynFillRadio;
  const detectPlatform = window.__aynDetectPlatform;
  // v3.334.0 -- these two were never exposed before; see frame_agent.js's
  // own matching comment on why watchForNewFields() calling them bare
  // (queryDeep(...), visible(...)) was a real, live "not defined" crash.
  const queryDeep = window.__aynQueryDeep;
  const visible = window.__aynVisible;
  function fieldRegistry_() { return window.__aynFieldRegistry(); }


  // ---------------------------------------------------------------
  // Overlay UI -- v3.292.0 redesign. Docked to the right edge, full
  // viewport height, plain white and quiet -- the same "open instantly,
  // read clearly, nothing competing for attention" language a real
  // side-panel-style extension uses, requested directly: "when it open
  // open like claude google chrome open everything is clear and open
  // right away." Deliberately still an in-page overlay, not
  // chrome.sidePanel -- that's an architecture choice (zero extra
  // permission, works the instant the icon is clicked, no page reflow
  // to wait on), this is a visual one; the panel now just reads as one
  // even though it isn't natively docked by Chrome itself. Shadow-DOM
  // isolated, and every dynamic/untrusted value is still set via
  // textContent, never interpolated into markup.
  // ---------------------------------------------------------------
  const host = document.createElement("div");
  window.__aynAutoApplyHost = host;
  host.style.cssText = "all: initial; position: fixed; top: 0; right: 0; height: 100vh; z-index: 2147483647;";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  // v3.330.0 -- full re-brand, reported directly against a real screenshot:
  // "not this ugly design... redesign the extension completely to be
  // better, more useful, easy to navigate, and AYN branded." The v3.292.0
  // pass (see this file's own top comment) deliberately stripped this
  // panel down to plain white and a bare accent dot, in service of a real,
  // separate goal at the time -- "open instantly, read clearly, nothing
  // competing for attention." That goal was correct and stays: nothing
  // below adds a loading delay, a new screen, or visual noise. What it
  // was missing is AYN's own actual identity -- the same warm paper
  // background, ember gradient, and Outfit/Figtree type pairing already
  // proven out across the real web app -- which a flat white panel with
  // one 6px orange dot never carried. Every token here is the same real
  // hex the web app already uses, not a new palette invented for this
  // surface. Fonts load as a pure progressive enhancement (a failed
  // @font-face fetch -- an unreachable CDN, a strict page CSP -- silently
  // falls back to the system stack next to it, never a broken panel).
  // v3.331.0 -- three real, verified-not-guessed fixes from an independent
  // review of the v3.330.0 re-brand, run before that redesign ever shipped
  // to production. (1) Both @font-face src URLs above were hand-typed
  // Google Fonts CDN paths that turned out to 404 -- confirmed live via
  // curl, both by the reviewer and again here before this fix. Replaced
  // with a real @import of Google's own CSS2 endpoint, which content-
  // negotiates the current, correct, versioned asset URL on every real
  // request instead of trusting a hardcoded hash that can (and did) go
  // stale. (2) White text on the primary button's own bright ember
  // gradient measured 3.47:1 at the dark end and 2.32:1 at the light end
  // -- both fail WCAG AA's 4.5:1 floor for 14px/600-weight text, which
  // does not qualify as "large text." Rather than darken the real,
  // brand-verified gradient itself, the button's text switched to --ink
  // instead of white -- 5.13:1 against the dark end, 7.66:1 against the
  // light end, both comfortably compliant, with the actual brand gradient
  // left completely untouched. (3) --dim (#a89484) measured 2.90:1 on
  // --card and 2.70:1 on --bg, well under even the 3:1 floor for bold/
  // large text -- real for three text uses (.close's resting color,
  // .fit-no, .fit-gaps), so those three moved to --muted or --warn as
  // appropriate; --dim's two remaining uses (.btn-ghost:hover's border,
  // .callout-neutral's accent stripe) are borders, not text, and don't
  // carry the same contrast requirement. --muted itself was darkened for
  // real margin (was passing at 4.83:1, a ~7% margin against the 4.5:1
  // floor) rather than left sitting right at the edge, since it's used
  // for real paragraph-length body text. --fit-no also being --warn now
  // (instead of --dim) restores the real semantic meaning a "requirement
  // not met" indicator should carry, which the redesign had accidentally
  // muted into indistinguishable from decorative gray.
  style.textContent = `
    @import url("https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=Figtree:wght@400;500;600&display=swap");
    :host { all: initial; }
    * { box-sizing: border-box; }
    .panel { --ink: #14100c; --muted: #6b5e50; --dim: #a89484; --bg: #fbf6f0; --card: #ffffff;
      --border: #ece1d3; --ember: #e85d3a; --ember2: #ff8a5c;
      --gradient: linear-gradient(135deg, var(--ember) 0%, var(--ember2) 100%);
      --trust: #1b7b47; --warn: #b0392a; --gold: #cf8a1d; --gold-text: #8a5806;
      width: min(392px, 100vw); height: 100vh; background: var(--bg); color: var(--ink);
      box-shadow: -16px 0 40px -20px rgba(28,23,18,0.22);
      font-family: "AYN Figtree", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 14px; line-height: 1.55; display: flex; flex-direction: column; }
    .head-wrap { flex-shrink: 0; }
    .head { padding: 14px 18px; display: flex; align-items: center; justify-content: space-between;
      background: var(--card); border-bottom: 1px solid var(--border); }
    .head-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .mark { width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0; display: block;
      box-shadow: 0 2px 8px -2px rgba(232,93,58,0.45); }
    .head-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
    .head b { font-family: "AYN Outfit", -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14.5px; font-weight: 700; letter-spacing: -0.01em; color: var(--ink); }
    .head-title { font-size: 12px; font-weight: 500; color: var(--muted); overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    .head-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
    .head-btn { cursor: pointer; background: none; border: none; color: var(--muted); line-height: 1;
      padding: 6px 7px; border-radius: 7px; }
    .head-btn:hover { background: var(--bg); color: var(--ink); }
    .close { font-size: 17px; }
    .head-btn.back { font-size: 15px; font-weight: 700; }
    .head-btn.account svg { width: 15px; height: 15px; display: block; }

    /* v3.348.0 -- account row, reachable from every screen via buildHead's
       own account button. A plain toggle, not a portal/popover -- this
       panel has no positioning context worth the complexity for two
       lines of content. */
    .account-menu { display: none; align-items: center; justify-content: space-between; gap: 10px;
      padding: 10px 18px 12px; background: var(--card); border-bottom: 1px solid var(--border); }
    .account-email { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; min-width: 0; }

    /* v3.348.0 -- "what is AYN actually reading right now," a real gap:
       nothing anywhere confirmed which page/job the panel was scoped to
       before you clicked Fill. This is the page's own real <title>,
       never guessed at or parsed into title/company pieces -- most real
       ATS platforms already format it usefully on their own. */
    .page-context-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.04em; color: var(--muted); margin: 0 0 3px; }
    .page-context-title { font-family: "AYN Outfit", sans-serif; font-size: 13.5px; font-weight: 700;
      color: var(--ink); margin: 0 0 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Floating re-open tab -- v3.340.0. Docked to the right edge, only
       ever shown once the panel has been minimized (never alongside it),
       so the person always has a one-click way back in without hunting
       for the toolbar icon again -- the same pattern a real competitor
       (Jobright) already uses, requested directly. */
    .tab { display: none; align-items: center; justify-content: center; width: 46px; height: 60px;
      background: var(--gradient); border: none; border-radius: 16px 0 0 16px; cursor: pointer; padding: 0;
      box-shadow: -3px 3px 16px -5px rgba(28,23,18,0.4), 0 2px 10px -2px rgba(232,93,58,0.45);
      transition: width 0.15s ease, box-shadow 0.15s ease; }
    .tab:hover { width: 54px; box-shadow: -4px 4px 20px -5px rgba(28,23,18,0.45), 0 3px 12px -2px rgba(232,93,58,0.55); }
    .tab:active { width: 46px; }
    .tab-mark-wrap { width: 32px; height: 32px; border-radius: 50%; background: var(--card);
      display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 4px rgba(0,0,0,0.18); flex-shrink: 0; }
    .tab-mark { width: 21px; height: 21px; border-radius: 6px; display: block; }
    .body { padding: 18px; overflow-y: auto; flex: 1; }
    .row { margin-bottom: 14px; }
    label.field-label { display: block; font-size: 12.5px; color: var(--muted); margin-bottom: 6px; font-weight: 500; }
    input { width: 100%; padding: 10px 12px; border-radius: 9px;
      border: 1px solid var(--border); font-size: 14px; background: var(--card); color: var(--ink); }
    input:focus { outline: none; border-color: var(--ember); box-shadow: 0 0 0 3px rgba(232,93,58,0.14); }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 16px;
      border-radius: 9px; border: none; font-weight: 600; font-size: 14px; cursor: pointer;
      transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease; }
    .btn:active:not(:disabled) { transform: scale(0.97); }
    .btn-primary { background: var(--gradient); color: var(--ink); box-shadow: 0 3px 10px -2px rgba(232,93,58,0.45); }
    .btn-primary:hover:not(:disabled) { box-shadow: 0 4px 14px -2px rgba(232,93,58,0.55); }
    .btn-primary:disabled { opacity: 0.5; cursor: default; box-shadow: none; }
    .btn-ghost { background: var(--card); color: var(--ink); border: 1px solid var(--border); }
    .btn-ghost:hover { background: var(--bg); border-color: var(--dim); }
    .muted { color: var(--muted); font-size: 13.5px; line-height: 1.6; margin: 0 0 12px; }
    .warn { color: var(--warn); font-size: 13.5px; line-height: 1.6; margin: 0 0 12px; }
    .ok { font-family: "AYN Outfit", sans-serif; color: var(--ink); font-size: 15.5px; font-weight: 700;
      line-height: 1.5; margin: 0 0 14px; }
    ul.fail-list { margin: 0 0 12px; padding-left: 18px; color: var(--muted); font-size: 13.5px; line-height: 1.75; }
    .callout { background: var(--card); border: 1px solid var(--border); border-left: 3px solid var(--warn);
      border-radius: 10px; padding: 12px 14px; margin: 0 0 14px; box-shadow: 0 1px 3px rgba(28,23,18,0.05); }
    .callout-neutral { background: var(--card); border: 1px solid var(--border); border-left: 3px solid var(--dim);
      border-radius: 10px; padding: 12px 14px; margin: 0 0 14px; box-shadow: 0 1px 3px rgba(28,23,18,0.05); }
    .link-toggle { background: none; border: none; padding: 0; color: var(--ember); font-size: 12.5px;
      font-weight: 600; cursor: pointer; text-decoration: underline; }
    .btn-sm { padding: 6px 12px; font-size: 12.5px; }
    .fit-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 15px;
      margin: 0 0 14px; display: flex; gap: 13px; box-shadow: 0 2px 8px -2px rgba(28,23,18,0.08); cursor: default; }
    .fit-ring { flex-shrink: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .fit-ring b { font-family: "AYN Outfit", sans-serif; font-size: 14px; font-weight: 700; color: var(--ink);
      background: var(--card); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .fit-title { font-family: "AYN Outfit", sans-serif; font-size: 14px; font-weight: 700; margin: 0; }
    .fit-gaps-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
      color: var(--muted); margin: 10px 0 5px; }

    /* Smart cards: stat pills + chips replace prose paragraphs everywhere
       in this panel -- v3.332.0, reported directly: "why i have a chunk of
       writing instead of smart cards shows the differences." */
    .chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .pill { display: inline-flex; align-items: center; padding: 4px 9px; border-radius: 999px;
      font-size: 11.5px; font-weight: 600; border: 1px solid transparent; }
    .pill-ok { background: rgba(27,123,71,0.1); color: var(--trust); border-color: rgba(27,123,71,0.22); }
    .pill-mid { background: rgba(207,138,29,0.12); color: var(--gold-text); border-color: rgba(207,138,29,0.24); }
    .pill-warn { background: rgba(176,57,42,0.1); color: var(--warn); border-color: rgba(176,57,42,0.2); }
    .chip { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 999px;
      font-size: 11.5px; font-weight: 500; background: var(--bg); color: var(--ink); border: 1px solid var(--border); }
    .chip-warn { background: rgba(176,57,42,0.07); color: var(--warn); border-color: rgba(176,57,42,0.18); }
    .chip-ok { background: rgba(27,123,71,0.08); color: var(--trust); border-color: rgba(27,123,71,0.2); }
    .gap-list { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
    .gap-list li { font-size: 12.5px; line-height: 1.5; color: var(--ink); padding-left: 13px; position: relative; }
    .gap-list li::before { content: "•"; position: absolute; left: 0; top: 0; color: var(--warn); font-weight: 700; }
    .gap-more { font-size: 11.5px; color: var(--muted); margin: 6px 0 0; }

    /* Ready/landing screen -- the first thing shown, click required before
       AYN touches the page. */
    .stat-line { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--muted);
      margin: 0 0 14px; }
    .stat-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--trust); flex-shrink: 0; }
    .action-stack { display: flex; flex-direction: column; gap: 9px; margin-bottom: 6px; }
    .action-row { display: flex; gap: 8px; }
    .action-row .btn { flex: 1; }
    .btn-lg { padding: 13px 18px; font-size: 15px; }

    /* v3.345.0 -- "clean cards, easy to understand," reported directly
       against a real competitor extension's own panel: one dominant
       primary action, everything else read as plain, chevron-led list
       rows grouped in one bordered card, not a row of same-weight
       buttons competing for attention. Same AYN colors and copy, just
       the calmer information architecture. */
    .credits-line { text-align: center; font-size: 11.5px; color: var(--muted); margin: 8px 0 2px; }
    .credits-line b { color: var(--ink); font-weight: 700; }
    .list-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px;
      overflow: hidden; margin-bottom: 6px; }
    .list-row { display: flex; align-items: center; gap: 10px; padding: 11px 13px; width: 100%;
      background: none; border: none; text-align: left; cursor: pointer; font-size: 13.5px;
      color: var(--ink); font-weight: 600; transition: background 0.12s ease; }
    .list-row:not(:last-child) { border-bottom: 1px solid var(--border); }
    .list-row:hover:not(:disabled) { background: var(--bg); }
    .list-row:disabled { cursor: default; opacity: 0.65; }
    .list-row-icon { width: 28px; height: 28px; border-radius: 8px; background: var(--bg); flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; color: var(--muted); }
    .list-row-icon svg { width: 14px; height: 14px; display: block; }
    .list-row-text { flex: 1; min-width: 0; }
    .list-row-sub { font-size: 11px; font-weight: 500; color: var(--muted); margin-top: 1px; }
    .list-row-chevron { color: var(--dim); flex-shrink: 0; display: flex; }
    .list-row-chevron svg { width: 13px; height: 13px; display: block; }

    /* Diff cards -- what a tailor/cover-letter action actually changed,
       shown as structured before/after, never a wall of AI prose. */
    .diff-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px;
      padding: 14px 15px; margin: 0 0 12px; box-shadow: 0 2px 8px -2px rgba(28,23,18,0.06); }
    .diff-card-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
      color: var(--muted); margin: 0 0 8px; }
    .diff-score-row { display: flex; align-items: center; gap: 10px; }
    .diff-arrow { color: var(--dim); font-size: 15px; }
    .diff-score-tag { font-family: "AYN Outfit", sans-serif; font-weight: 700; font-size: 17px; }
    .diff-before-after { display: flex; flex-direction: column; gap: 8px; }
    .diff-block { border-radius: 8px; padding: 8px 10px; font-size: 12.5px; line-height: 1.55; }
    .diff-block-before { background: var(--bg); color: var(--muted); text-decoration: line-through; text-decoration-color: rgba(107,94,80,0.35); }
    .diff-block-after { background: rgba(27,123,71,0.06); color: var(--ink); border: 1px solid rgba(27,123,71,0.16); }
    .letter-preview { background: var(--bg); border-radius: 8px; padding: 10px 12px; font-size: 12.5px;
      line-height: 1.6; color: var(--ink); white-space: pre-wrap; max-height: 180px; overflow-y: auto; }
  `;
  root.appendChild(style);
  const panel = document.createElement("div");
  panel.className = "panel";
  root.appendChild(panel);

  // v3.340.0 -- the floating re-open tab. Lives in the same shadow root
  // as the panel, always in the DOM, hidden until minimizePanel() first
  // shows it. Built with the same el() helper as everything else, which
  // is safe to call here even though its own declaration sits a few
  // lines below -- a `function` declaration is hoisted through this
  // whole closure, not just a `const`.
  const tabMark = el("img", { class: "tab-mark", src: chrome.runtime.getURL("icon48.png"), alt: "" });
  const tab = el("button", { class: "tab", "aria-label": "Open AYN" }, [
    el("span", { class: "tab-mark-wrap" }, [tabMark]),
  ]);
  root.appendChild(tab);

  function el(tag, props = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "text") e.textContent = v;
      else if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) e.setAttribute(k, v);
    }
    for (const c of children) if (c) e.appendChild(c);
    return e;
  }
  // v3.345.0 -- three small, fixed, hand-written SVG glyphs (document,
  // envelope, chevron) for the new list-card rows below -- innerHTML is
  // safe here specifically because every string passed in is a literal
  // written in this file, never anything derived from the page or from
  // a server response; nothing dynamic ever flows through this helper.
  function iconEl(pathsHtml) {
    const span = el("span", {});
    span.innerHTML = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">${pathsHtml}</svg>`;
    return span;
  }
  const ICON_DOC = '<rect x="4" y="2" width="12" height="16" rx="1.5" stroke="currentColor" stroke-width="1.4"/><line x1="7" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.4"/><line x1="7" y1="10.5" x2="13" y2="10.5" stroke="currentColor" stroke-width="1.4"/><line x1="7" y1="14" x2="11" y2="14" stroke="currentColor" stroke-width="1.4"/>';
  const ICON_ENVELOPE = '<rect x="2" y="4" width="16" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M3 5.5L10 11L17 5.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  const ICON_CHEVRON = '<path d="M7.5 4L13 10L7.5 16" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  const ICON_USER = '<circle cx="10" cy="6.5" r="3" stroke="currentColor" stroke-width="1.4"/><path d="M4 17c0-3.5 2.8-6 6-6s6 2.5 6 6" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>';
  const ICON_SAVE = '<path d="M10 3v9m0 0l-3-3m3 3l3-3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 14v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>';
  const ICON_INFO = '<circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.4"/><line x1="10" y1="9" x2="10" y2="14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="10" cy="6.5" r="0.9" fill="currentColor"/>';
  const ICON_BOOKMARK = '<path d="M6 3h8a1 1 0 0 1 1 1v13l-5-3-5 3V4a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/>';
  // v3.340.0 -- session is now a second, optional argument so every
  // screen can offer a real "back to the main screen" button, not just
  // a way to dismiss the whole thing. Reported directly: the panel
  // needed to be "easy to navigate" -- before this, "No form found",
  // "Couldn't read your profile", "Filled", and every other deep screen
  // had nothing but a title and a close button; the only way back to
  // anything useful was closing AYN and reopening it from scratch.
  // Omitted on the sign-in screen (no session exists yet) and on Ready
  // to help itself (already home -- a back button there would just
  // reload the same screen it's sitting on).
  // v3.348.0 -- "easy to understand and navigate," researched directly
  // against Chrome's own extension UX guidance (purposeful, minimal,
  // single-purpose) and this app's own web-sidebar redesign history.
  // The one real gap found reading this panel end to end: there was no
  // way, anywhere, to see which account you were signed into or sign
  // out of it -- once signed in, a wrong account had no escape short of
  // clearing the extension's storage by hand. buildHead() is the one
  // function every real screen already routes through (Ready,
  // Autofilling, Filled, both tailor/cover-letter result screens -- see
  // every call site below), so the account row lives here once, not
  // copied onto each screen separately.
  function buildHead(title, session) {
    // The real, already-bundled toolbar icon -- the same image Chrome
    // itself already shows for this extension -- not an invented mark.
    // web_accessible_resources makes chrome.runtime.getURL() loadable as
    // a real <img> from inside the page's own rendering context; a
    // failed load (a stripped-down browser policy, a very unusual page)
    // just leaves an empty 26px square, never a broken panel.
    const mark = el("img", { class: "mark", src: chrome.runtime.getURL("icon48.png"), alt: "" });
    const left = el("div", { class: "head-left" }, [
      mark,
      el("div", { class: "head-text" }, [
        el("b", { text: "AYN" }),
        el("span", { class: "head-title", text: title }),
      ]),
    ]);
    const actions = [];
    let menu = null;
    if (session) {
      const acctBtn = el("button", { class: "head-btn account", "aria-label": "Account", "aria-expanded": "false" }, [iconEl(ICON_USER)]);
      menu = el("div", { class: "account-menu" });
      const email = (session.user && session.user.email) || "Signed in";
      menu.appendChild(el("span", { class: "account-email", text: email, title: email }));
      const signOutBtn = el("button", { class: "btn btn-ghost btn-sm", text: "Sign out" });
      signOutBtn.addEventListener("click", async () => {
        // A stale mutation observer firing after sign-out would try to
        // autofill() with a now-cleared session -- disconnect it first,
        // same cleanup minimizePanel() already does for the same reason.
        if (liveObserver) { liveObserver.disconnect(); liveObserver = null; }
        await clearSession();
        showSignIn();
      });
      menu.appendChild(signOutBtn);
      acctBtn.addEventListener("click", () => {
        const open = menu.style.display !== "flex";
        menu.style.display = open ? "flex" : "none";
        acctBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
      actions.push(acctBtn);
    }
    if (session && title !== "Ready to help") {
      actions.push(el("button", {
        class: "head-btn back", text: "←", "aria-label": "Back to AYN",
        onclick: () => showReady(session),
      }));
    }
    actions.push(el("button", { class: "head-btn close", text: "×", "aria-label": "Minimize AYN", onclick: minimizePanel }));
    const head = el("div", { class: "head" }, [left, el("div", { class: "head-actions" }, actions)]);
    if (!menu) return head;
    return el("div", { class: "head-wrap" }, [head, menu]);
  }
  function clearPanel() { panel.innerHTML = ""; }

  // v3.323.0 -- a real gap found comparing AYN's actual coverage against
  // a real, live multi-step application (Workday: 7 steps, an account
  // gate as step 1) -- AYN has never had any way to tell someone "this
  // isn't the whole application, there's more after this page." Shown
  // once, above whatever the normal result for this step already is
  // (filled fields, nothing found, whatever) -- this never replaces or
  // blocks the real fill, it's added context so a step that's mostly a
  // login form doesn't read as AYN failing.
  function wizardNotice(wizardStep) {
    if (!wizardStep) return null;
    const { current, total, stepName } = wizardStep;
    const box = el("div", { class: "callout" });
    const label = stepName ? `Step ${current} of ${total}: ${stepName}` : `Step ${current} of ${total}`;
    box.appendChild(el("p", { text: `This looks like a ${total}-step application (${label}).`, style: "margin: 0 0 4px; font-weight: 600;" }));
    box.appendChild(el("p", { class: "muted", text: "AYN filled what it can on this step. Continue to the next step yourself, then reopen AYN there." }));
    return box;
  }

  // v3.340.0 -- was a hard closePanel() that host.remove()'d the whole
  // thing, so the only way back in was the toolbar icon or detector.js
  // re-triggering. Reported directly, asking for the same floating-tab
  // pattern a real competitor (Jobright) already has: minimizing now
  // collapses the panel to a small tab docked on the right edge instead
  // of destroying it, and every screen's content stays exactly as it
  // was underneath -- reopening never re-fetches or re-charges anything,
  // it just shows what was already there. host's own CSS has to shrink
  // to wrap just the tab while minimized, not stay pinned at 100vh --
  // a fixed-position div with no explicit width shrinks to its visible
  // content's width, but height:100vh was a hardcoded literal, and a
  // "transparent" box still intercepts clicks over its own geometry
  // regardless of what's actually painted -- left as 100vh, minimizing
  // would have left an invisible column blocking clicks on the real
  // page for the tab's whole height, most of it nowhere near the tab.
  const FULL_HOST_CSS = "all: initial; position: fixed; top: 0; right: 0; height: 100vh; z-index: 2147483647;";
  const MINI_HOST_CSS = "all: initial; position: fixed; top: 50%; right: 0; transform: translateY(-50%); height: auto; z-index: 2147483647;";
  let liveObserver = null;
  function minimizePanel() {
    if (liveObserver) { liveObserver.disconnect(); liveObserver = null; }
    panel.style.display = "none";
    tab.style.display = "flex";
    host.style.cssText = MINI_HOST_CSS;
    // v3.326.0 -- detector.js (auto-open on a real, recognized apply
    // page, see its own header) checks this before ever triggering
    // again on the same page load. Minimizing is a real, deliberate
    // "not now" -- without this, a page that keeps matching the same
    // detection signal (an unchanged URL, an unchanged field count)
    // would just pop straight back open the moment it minimized. It
    // never blocks the person's OWN click on the tab below -- that's a
    // direct, explicit action, not detector.js reopening anything.
    window.__aynAutoDismissed = true;
  }
  function expandPanel() {
    tab.style.display = "none";
    panel.style.display = "";
    host.style.cssText = FULL_HOST_CSS;
  }
  tab.addEventListener("click", expandPanel);

  // v3.285.0 -- a real, adoptable improvement: a multi-step wizard or a
  // form that reveals more fields after an earlier answer (e.g. "Yes" to
  // one question exposes three more) can genuinely change after the one
  // fill pass already ran. Never re-fills anything on its own -- that
  // would mean silently touching a live page with no one watching what
  // it does -- it only ever offers, as a real visible button the person
  // clicks themselves, exactly like the very first fill did.
  // v3.298.0 -- a real, confirmed gap found running AYN against real
  // multi-step application wizards (Workday's own "My Information / My
  // Experience / Application Questions / ..." flow is the clearest real
  // example): a step that advances via a genuine client-side route
  // change -- no full page reload, common on every React/Angular-router
  // ATS wizard -- leaves this exact same MutationObserver blind. It was
  // built to catch a field REVEALED on the current step (a "Yes" answer
  // exposing three more questions) by diffing against the still-known
  // element set, but a route change usually REPLACES the whole form,
  // meaning knownEls' old elements are gone from the DOM entirely and
  // "any element not in knownEls" fires just as reliably here too -- it
  // was already catching the DOM mutation half of a route change, it
  // just had no way to say the right thing about it, and worse, could
  // fire its stale "New fields appeared" copy for what is actually a
  // brand new page. Snapshotting the URL at setup time and checking it
  // inside the same debounced callback (no second observer needed --
  // a client-side route change is itself a DOM mutation, so the existing
  // one already wakes up for it) lets this tell the two cases apart and
  // word the notice honestly for each, while keeping the exact same
  // "never fill anything without a real, visible click" rule the
  // original comment already established.
  function watchForNewFields(session) {
    if (liveObserver) liveObserver.disconnect();
    const knownEls = new Set(fieldRegistry_().values());
    const startUrl = location.href;
    let debounce = null;
    liveObserver = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const navigated = location.href !== startUrl;
        const nowVisible = queryDeep(document, "input, textarea, select").filter((e) => visible(e) && !e.disabled);
        const hasNew = nowVisible.some((e) => !knownEls.has(e));
        if (!navigated && !hasNew) return;
        liveObserver.disconnect();
        const notice = el("div", { style: "padding: 10px 20px; background: var(--bg); border-top: 1px solid var(--border); font-size: 13.5px; color: var(--ink); display: flex; align-items: center; justify-content: space-between; gap: 10px;" }, [
          el("span", { text: navigated ? "This looks like a new step in the application." : "New fields appeared on this page." }),
          el("button", { class: "btn btn-primary", text: navigated ? "Fill this step" : "Fill them too", style: "padding: 6px 14px; font-size: 13px; flex-shrink: 0;", onclick: () => autofill(session) }),
        ]);
        panel.insertBefore(notice, panel.firstChild.nextSibling);
      }, 800);
    });
    liveObserver.observe(document.body, { childList: true, subtree: true });
  }

  function showSignIn() {
    clearPanel();
    const emailInput = el("input", { type: "email" });
    const passInput = el("input", { type: "password" });
    const err = el("p", { class: "warn" });
    err.style.display = "none";
    const goBtn = el("button", { class: "btn btn-primary", text: "Sign in", style: "width:100%" });
    goBtn.addEventListener("click", async () => {
      err.style.display = "none";
      goBtn.disabled = true; goBtn.textContent = "Signing in…";
      try {
        const session = await signIn(emailInput.value.trim(), passInput.value);
        await showReady(session);
      } catch (e) {
        err.textContent = e.message || "Sign-in failed.";
        err.style.display = "block";
        goBtn.disabled = false; goBtn.textContent = "Sign in";
      }
    });
    panel.appendChild(buildHead("Sign in"));
    panel.appendChild(el("div", { class: "body" }, [
      el("p", { class: "muted", text: "Sign in with your real AYN account to autofill this form from your own profile." }),
      el("div", { class: "row" }, [el("label", { class: "field-label", text: "Email" }), emailInput]),
      el("div", { class: "row" }, [el("label", { class: "field-label", text: "Password" }), passInput]),
      err, goBtn,
    ]));
  }

  // v3.332.0 -- reported directly against a live screenshot: "as soon as i
  // login ayn autofill right away needs to have a button for that." The
  // panel used to skip straight from opening (or from signing in) to
  // filling the page, with no click in between and no chance to see the
  // fit card or reach for Tailor/Cover letter first. This is the real,
  // explicit landing screen that was missing -- shown the moment the panel
  // opens (a manual icon click, an auto-detected job page, or a fresh
  // sign-in), it fires the free fit check and a cheap, local field scan
  // (no backend call, no AI, just DOM structure) so it can show real
  // context and real per-job actions, and it does nothing to the page
  // itself until one of its buttons is actually clicked.
  async function showReady(session) {
    clearPanel();
    panel.appendChild(buildHead("Ready to help", session));
    const body = el("div", { class: "body" });

    // v3.348.0 -- "what page is AYN actually reading," a real gap found
    // researching this panel's own navigability: nothing here confirmed
    // which posting AYN was scoped to before Fill was clicked. The page's
    // own real <title> -- never guessed at or parsed into title/company
    // pieces, most real ATS platforms already format it usefully -- so
    // this is honest context, not an invented summary of the page.
    const pageTitle = (document.title || "").trim();
    if (pageTitle) {
      body.appendChild(el("p", { class: "page-context-label", text: "On this page" }));
      body.appendChild(el("p", { class: "page-context-title", text: pageTitle, title: pageTitle }));
    }

    const fitSlot = el("div", {});
    body.appendChild(fitSlot);
    let latestFit = null;
    const fitPromise = fetchFit(session);
    fitPromise.then((m) => {
      latestFit = m;
      if (m) fitSlot.replaceWith(buildFitCard(m));
      else fitSlot.remove();
    });

    let localFields = [];
    try {
      localFields = extractFields().fields || [];
    } catch (e) {
      localFields = [];
    }
    const fileFields = localFields.filter((f) => f.type === "file");
    const resumeField = fileFields.find((f) => !NOT_RESUME_FIELD.test(f.label));
    const coverField = fileFields.find((f) => IS_COVER_LETTER_FIELD.test(f.label));
    const fillableCount = localFields.length;

    body.appendChild(el("div", { class: "stat-line" }, [
      el("span", { class: "stat-dot" }),
      el("span", {
        text: fillableCount
          ? `${fillableCount} field${fillableCount === 1 ? "" : "s"} on this page AYN can read`
          : "Couldn't find a form on this page yet",
      }),
    ]));

    // v3.348.0 -- "let result screens jump sideways," a real navigation
    // gap: landing here after a tailor or a cover letter meant either
    // starting over at Ready or continuing to fill the rest of the page
    // -- there was no way to reach the OTHER document-writing action
    // (write the cover letter too, right after tailoring) without a full
    // reset. resumeAttached/coverAttached track what this visit to the
    // Ready screen has already done; siblingAction offers the one real
    // remaining action, never both, never a repeat of one already done.
    let resumeAttached = false;
    let coverAttached = false;
    async function doTailor() {
      const inputEl = resumeField ? fieldRegistry_().get(resumeField.id) : null;
      if (!inputEl) return { ok: false, reason: "Field no longer on the page." };
      return tailorAndAttach(session, inputEl);
    }
    async function doCoverLetter() {
      const inputEl = coverField ? fieldRegistry_().get(coverField.id) : null;
      if (!inputEl) return { ok: false, reason: "Field no longer on the page." };
      return writeCoverLetterAndAttach(session, inputEl);
    }
    function siblingAction(justDid) {
      if (justDid === "resume" && coverField && !coverAttached) {
        return { label: "Write cover letter", sub: "Written from your real experience", icon: ICON_ENVELOPE, run: doCoverLetter,
          onOk: (r) => { coverAttached = true; afterAttach("Cover letter written", r, buildCoverLetterPreview(r.body), "cover"); } };
      }
      if (justDid === "cover" && resumeField && !resumeAttached) {
        return { label: "Tailor my resume", sub: "AI-tailored to this job", icon: ICON_DOC, run: doTailor,
          onOk: (r) => { resumeAttached = true; afterAttach("Tailored for this job", r, buildTailorDiffCard(r, latestFit && typeof latestFit.score === "number" ? latestFit.score : null), "resume"); } };
      }
      return null;
    }

    // A tailor/cover-letter run always attaches a real file and shows a
    // real, structured diff before handing back to the same screen --
    // never a second, different flow than the one Fill leads to.
    function afterAttach(title, r, diffCard, justDid) {
      clearPanel();
      panel.appendChild(buildHead(title, session));
      const b2 = el("div", { class: "body" });
      b2.appendChild(el("p", { class: "ok", text: "Attached. It'll go out with the application when you submit." }));
      b2.appendChild(diffCard);
      if (r.credits && typeof r.credits.spent === "number") {
        b2.appendChild(el("p", { class: "muted", text: `${r.credits.spent} credit${r.credits.spent === 1 ? "" : "s"} used.`, style: "margin-top: -6px;" }));
      }
      const sib = siblingAction(justDid);
      if (sib) {
        const subEl = el("span", { class: "list-row-sub", text: sib.sub });
        const label = el("div", { class: "list-row-text" }, [el("div", { text: sib.label }), subEl]);
        const chevron = el("span", { class: "list-row-chevron" }, [iconEl(ICON_CHEVRON)]);
        const row = el("button", { type: "button", class: "list-row" }, [
          el("span", { class: "list-row-icon" }, [iconEl(sib.icon)]), label, chevron,
        ]);
        row.addEventListener("click", async () => {
          row.disabled = true; subEl.textContent = "Working…";
          const rr = await sib.run();
          if (rr.ok) {
            sib.onOk(rr);
          } else {
            row.disabled = false; subEl.textContent = rr.reason || sib.sub;
          }
        });
        b2.appendChild(el("div", { class: "list-card", style: "margin: 8px 0 12px;" }, [row]));
      }
      const cont = el("button", { class: "btn btn-primary", text: "Continue filling the rest of the form", style: "width:100%; margin-top: 6px;" });
      cont.addEventListener("click", () => autofill(session, { fitPromise }));
      b2.appendChild(cont);
      const back = el("button", { class: "btn btn-ghost", text: "Back", style: "width:100%; margin-top: 8px;" });
      back.addEventListener("click", () => showReady(session));
      b2.appendChild(back);
      panel.appendChild(b2);
    }

    const stack = el("div", { class: "action-stack" });
    const fillBtn = el("button", { class: "btn btn-primary btn-lg", text: "Fill this application" });
    fillBtn.addEventListener("click", () => autofill(session, { fitPromise }));
    stack.appendChild(fillBtn);
    body.appendChild(stack);

    // v3.345.0 -- reported directly against a competitor's own panel:
    // one dominant primary button, a plain credit count right under it
    // ("4 Credits Left"), and resume/cover-letter as calm, chevron-led
    // list rows in one card -- not two ghost buttons the same visual
    // weight as the one real decision on this screen. billing_get is
    // the same free, already-existing action the web app's own Billing
    // page reads; nothing new on the backend, just read from here too.
    const creditsLine = el("p", { class: "credits-line", text: "" });
    body.appendChild(creditsLine);
    callHub(session, { action: "billing_get" }).then((b) => {
      if (typeof b?.balance !== "number") return;
      creditsLine.innerHTML = "";
      creditsLine.appendChild(document.createTextNode(""));
      const strong = el("b", { text: String(b.balance) });
      creditsLine.appendChild(strong);
      creditsLine.appendChild(document.createTextNode(` credit${b.balance === 1 ? "" : "s"} left`));
    }).catch(() => {});

    if (resumeField || coverField) {
      const card = el("div", { class: "list-card" });
      if (resumeField) {
        const sub = el("span", { class: "list-row-sub", text: "AI-tailored to this job" });
        const label = el("div", { class: "list-row-text" }, [el("div", { text: "Tailor my resume" }), sub]);
        const chevron = el("span", { class: "list-row-chevron" }, [iconEl(ICON_CHEVRON)]);
        const tRow = el("button", { type: "button", class: "list-row" }, [
          el("span", { class: "list-row-icon" }, [iconEl(ICON_DOC)]), label, chevron,
        ]);
        tRow.addEventListener("click", async () => {
          tRow.disabled = true; sub.textContent = "Tailoring…";
          const r = await doTailor();
          if (r.ok) {
            resumeAttached = true;
            afterAttach("Tailored for this job", r, buildTailorDiffCard(r, latestFit && typeof latestFit.score === "number" ? latestFit.score : null), "resume");
          } else {
            tRow.disabled = false; sub.textContent = r.reason || "AI-tailored to this job";
          }
        });
        card.appendChild(tRow);
      }
      if (coverField) {
        const sub2 = el("span", { class: "list-row-sub", text: "Written from your real experience" });
        const label2 = el("div", { class: "list-row-text" }, [el("div", { text: "Write cover letter" }), sub2]);
        const chevron2 = el("span", { class: "list-row-chevron" }, [iconEl(ICON_CHEVRON)]);
        const cRow = el("button", { type: "button", class: "list-row" }, [
          el("span", { class: "list-row-icon" }, [iconEl(ICON_ENVELOPE)]), label2, chevron2,
        ]);
        cRow.addEventListener("click", async () => {
          cRow.disabled = true; sub2.textContent = "Writing…";
          const r = await doCoverLetter();
          if (r.ok) {
            coverAttached = true;
            afterAttach("Cover letter written", r, buildCoverLetterPreview(r.body), "cover");
          } else {
            cRow.disabled = false; sub2.textContent = r.reason || "Written from your real experience";
          }
        });
        card.appendChild(cRow);
      }
      body.appendChild(card);
    }

    panel.appendChild(body);
  }

  // Extract THIS page's own fields, match them against your real AYN
  // profile, and fill -- no picking a job first (a saved-jobs record was
  // never needed for the matching itself, only for the earlier, server-
  // side Playwright path -- see the backend's own v3.278.0 comment on
  // auto_apply_extract). Reached by clicking "Fill this application" on
  // the ready screen above (v3.332.0), never automatically.
  async function autofill(session, opts = {}) {
    clearPanel();
    panel.appendChild(buildHead("Autofilling…", session));
    panel.appendChild(el("div", { class: "body" }, [el("p", { class: "muted", text: "Reading this page and matching it to your AYN profile…" })]));
    // Fired off now, overlapping with the extraction/matching work below,
    // rather than adding its own separate wait later. v3.332.0 -- a caller
    // that already fetched this on the ready screen (see showReady) passes
    // it straight through via opts.fitPromise, so clicking "Fill this
    // application" never fires a second, redundant `match` call for a fit
    // card that's already on its way.
    const consentPromise = getConsent(session);
    const fitPromise = opts.fitPromise || fetchFit(session);
    const { fields, skipped, wizardStep } = extractFields();

    // v3.294.0 -- iframe support: an application form embedded in a
    // frame runs its own copy of frame_agent.js (see background.js's
    // allFrames:true injection), which self-reports its own fields the
    // moment it loads, relayed through the background script (a content
    // script has no direct way to message a DIFFERENT frame -- only the
    // background script's own chrome.tabs.sendMessage can target a
    // specific frameId). Merged in here with a frame-prefixed id so a
    // sub-frame's own local ids can never collide with this frame's, or
    // another sub-frame's. Collected for a short, bounded window rather
    // than waited on indefinitely -- a frame that never reports (blocked,
    // slow, or genuinely has nothing fillable on it) must never hang the
    // rest of a real autofill pass. Deliberately v1-scoped to the
    // deterministic layer only (native inputs, ARIA radiogroups,
    // aria-pressed toggle groups, role=combobox) -- see frame_agent.js's
    // own header for why Form Intelligence itself stays top-frame-only.
    const frameFieldOrigin = new Map(); // globalId -> { frameId, originalId }
    if (document.querySelectorAll("iframe").length) {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          chrome.runtime.onMessage.removeListener(onFrameReport);
          resolve();
        };
        function onFrameReport(msg) {
          if (!msg || msg.type !== "AYN_FRAME_REPORT" || typeof msg.frameId !== "number") return;
          for (const f of msg.fields || []) {
            const globalId = `frame${msg.frameId}:${f.id}`;
            frameFieldOrigin.set(globalId, { frameId: msg.frameId, originalId: f.id });
            const merged = { ...f, id: globalId };
            if (merged.radioGroup) merged.radioGroup = `frame${msg.frameId}:${merged.radioGroup}`;
            fields.push(merged);
          }
          for (const s of msg.skipped || []) skipped.push(s);
        }
        chrome.runtime.onMessage.addListener(onFrameReport);
        setTimeout(finish, 700);
      });
    }
    // Local aliases that transparently relay to the right frame when a
    // field's id says it came from one -- everything below this point
    // (matching, filling, the panel) never needs to know or care whether
    // a given field lives in this frame or a child one.
    async function fillTextLikeAny(fid, value, label) {
      const origin = frameFieldOrigin.get(fid);
      if (!origin) return fillTextLike(fid, value, label);
      try {
        return await chrome.runtime.sendMessage({
          type: "AYN_RELAY_TO_FRAME", targetFrameId: origin.frameId,
          payload: { type: "AYN_FRAME_FILL_TEXT", fid: origin.originalId, value, label },
        });
      } catch (e) {
        return { ok: false };
      }
    }
    async function fillRadioAny(fid) {
      const origin = frameFieldOrigin.get(fid);
      if (!origin) return fillRadio(fid);
      try {
        return await chrome.runtime.sendMessage({
          type: "AYN_RELAY_TO_FRAME", targetFrameId: origin.frameId,
          payload: { type: "AYN_FRAME_FILL_RADIO", fid: origin.originalId },
        });
      } catch (e) {
        return { ok: false };
      }
    }

    // v3.290.0 -- Form Intelligence merge step: anything the deterministic
    // scan above didn't already claim gets one shot at a real
    // classification, batched into a single call regardless of how many
    // candidates this one page has. A classification failure (network,
    // gateway) is swallowed here on purpose -- it must never block or
    // delay the rest of a real autofill pass, it can only ever ADD
    // fields, never remove or change one the deterministic scan already
    // found.
    // v3.294.0 -- a genuine "select all that apply" group (see
    // scanUnrecognizedWidgets/formIntelligence.ts's own multi_select_
    // button_group type) is never filled at all -- picking a real,
    // possibly-multiple subset against the person's own actual skills is
    // a different kind of matching this app was never built to do, and
    // guessing at it (or, worse, clicking one option as if that were the
    // whole honest answer) would be a real, meaningful mistake, not a
    // harmless one. Collected here instead and shown to the person by
    // name, the same honest "you handle this one" treatment a genuinely
    // unrecognized field already gets.
    const multiSelectFlags = [];
    // v3.298.0 -- the "flag a wrong answer" loop needs the exact same
    // structural signature the classification was made from, kept around
    // per real, visible question label so a "Wrong?" click in the results
    // panel below can send it straight back to auto_apply_flag_widget --
    // never re-derived from the DOM at flag time, since the widget's own
    // element could already be gone (a page re-render, a submitted form).
    const classifiedSummary = [];
    try {
      const known = new Set(fieldRegistry_().values());
      const candidates = scanUnrecognizedWidgets(known);
      if (candidates.length) {
        const clsRes = await callHub(session, {
          action: "auto_apply_classify_widgets",
          // v3.300.0 -- real, per-site provenance on the shared cache
          // ("label each website with its own knowledge") -- kept as
          // observability metadata only, never part of the match key
          // (see the migration's own header), so it can't fragment the
          // cross-company sharing that makes this cache valuable.
          pageHostname: location.hostname,
          widgets: candidates.map((c) => c.signature),
        });
        const byId = new Map((clsRes.classifications || []).map((c) => [c.localId, c]));
        for (const cand of candidates) {
          const cls = byId.get(cand.localId);
          if (!cls) continue;
          if (cls.widgetType !== "unrecognized") {
            classifiedSummary.push({
              label: cand.signature.nearbyText || "An unlabeled question on this page",
              widgetType: cls.widgetType,
              signature: cand.signature,
            });
          }
          if (cls.widgetType === "multi_select_button_group") {
            multiSelectFlags.push(cand.signature.nearbyText || "A “select all that apply” style question on this page");
            continue;
          }
          if (cls.widgetType === "toggle_button_group" || cls.widgetType === "custom_checkbox") {
            const groupName = `ayn-cls-${cand.localId}`;
            for (const opt of cand.els) {
              const fid = `ayn-cls-f-${cand.localId}-${cand.els.indexOf(opt)}`;
              fieldRegistry_().set(fid, opt);
              fields.push({
                id: fid, tag: "button", type: "radio", required: false,
                label: (opt.getAttribute("aria-label") || opt.textContent || "").trim(),
                radioGroup: groupName, radioGroupLabel: cand.signature.nearbyText || undefined,
              });
            }
          } else if (cls.widgetType === "combobox_static" || cls.widgetType === "combobox_typeahead") {
            const target = cand.els[0];
            const fid = `ayn-cls-f-${cand.localId}-0`;
            fieldRegistry_().set(fid, target);
            // A trigger that isn't a real text-editable input can never
            // "type" -- always falls through to click-then-search
            // regardless of what it was classified as (see fillTextLike).
            target.dataset.aynClsMode = target.tagName === "INPUT" ? cls.widgetType : "combobox_static";
            fields.push({
              id: fid, tag: target.tagName.toLowerCase(), type: "select", required: false,
              label: cand.signature.nearbyText || "An unlabeled field on this page",
            });
          }
          // "unrecognized" -- left uncaptured, the same honest behavior
          // as any field the deterministic scan never found either.
        }
      }
    } catch (e) {
      // Best effort -- see comment above.
    }

    if (!fields.length && !skipped.length) {
      clearPanel();
      panel.appendChild(buildHead("No form found", session));
      const wn = wizardNotice(wizardStep);
      if (wn) panel.appendChild(wn);
      panel.appendChild(el("div", { class: "body" }, [el("p", { class: "muted", text: "Couldn't find a fillable application form on this page." })]));
      return;
    }
    if (!fields.length) {
      // Only slider/range-type controls found -- nothing here for AYN to
      // fill (see extractFields' own note: a slider's value is a
      // preference, never a fact to guess), but real, so say so plainly
      // rather than a generic "no form found."
      clearPanel();
      panel.appendChild(buildHead("Nothing to autofill here", session));
      const wn2 = wizardNotice(wizardStep);
      if (wn2) panel.appendChild(wn2);
      const body = el("div", { class: "body" });
      body.appendChild(el("p", { class: "muted", text: "This page only has slider/range controls -- those are preferences, not facts, so AYN leaves them for you to set:" }));
      const ul = el("ul", { class: "fail-list" });
      for (const s of skipped) ul.appendChild(el("li", { text: s }));
      body.appendChild(ul);
      panel.appendChild(body);
      return;
    }
    let result;
    try {
      result = await callHub(session, { action: "auto_apply_extract", fields });
    } catch (e) {
      clearPanel();
      panel.appendChild(buildHead("Couldn't read your profile", session));
      panel.appendChild(el("div", { class: "body" }, [el("p", { class: "warn", text: e.message })]));
      return;
    }

    const idRows = Object.values(result.identityMatches || {});
    const ansRows = result.answerMatches || [];
    const radioRows = result.radioMatches || [];
    const fileRows = result.fileFields || [];

    // v3.279.0 -- reported directly: "why does it ask me questions and I
    // have to fill, what's the point of autofilling." Correct call --
    // typing a value into a box inside the extension, for something not
    // on file, is not autofill, it's a second form. Fields with nothing
    // on file are now just named plainly in the summary below, same as a
    // field that failed to fill -- you type it directly into the REAL
    // page, once, like everything else on that page. Nothing here ever
    // asks for input again.
    const notOnFile = [];
    const failed = [];
    const legalFilled = []; // { label, answer } -- verified separately, always
    let filledCount = 0;

    // v3.322.0 -- a real, live bug found on the Learning Commons
    // Greenhouse posting: a checkbox-group OPTION (e.g. "Tech Talks") is
    // its own separate field to the backend, with only its own bare
    // option text as m.label -- the group's real question ("Have we met
    // you at one of our events? If so, which one(s)?") lives on the
    // local, already-extracted field entry (checkboxGroupLabel), never on
    // the backend's answer match, so an unanswered option showed up in
    // the "not on file" list standing alone with no question attached.
    // Radio groups don't have this problem -- fillRadioAny already
    // carries r.groupLabel as the real question -- this is checkbox-only.
    const fieldById = new Map(fields.map((f) => [f.id, f]));
    function displayLabel(fieldId, bareLabel) {
      const f = fieldById.get(fieldId);
      const group = f && f.checkboxGroupLabel;
      return group && group !== bareLabel ? `${group}: ${bareLabel}` : bareLabel;
    }

    // v3.282.0 -- a wrong or unconfirmed answer to a work-authorization/
    // sponsorship/age-eligibility question is a real, serious mistake on
    // a real application, not just an inconvenience -- these get called
    // out on their own, by name, with the exact answer filled, instead of
    // blending into the generic "N fields filled" line. Matched on the
    // label's own wording, the same class of phrasing the backend's own
    // KNOWN_QUESTIONS resolvers look for. LEGAL_SENSITIVE itself now
    // lives at module scope, near CONSENT_CHECKBOX_RE.

    // v3.324.0 -- "regenerate this one answer," a real, distinct
    // capability found comparing AYN against a real competitor's own
    // extension: matchedType === "ai_narrative" (auto_apply_extract's own
    // v3.307.0 narrative-answer pass) is the one class of field this
    // actually applies to -- an AI-authored, open-ended answer, not a
    // plain fact like name/email where "regenerate" has no real meaning.
    // Only fields that actually filled successfully get the affordance;
    // one that failed to fill has a different, already-handled problem.
    const narrativeFilled = [];
    // v3.328.0 -- "remember what I typed for next time." Only text-like
    // fields (this loop), not radio groups -- reading back which radio
    // option a person picked is a different kind of lookup this pass
    // doesn't attempt, a real, disclosed scope limit rather than
    // guessed-at. Tracks {fieldId, label} for anything left unanswered
    // here so the real, current DOM value can be read back later, once
    // the person has actually had a chance to type something in.
    const notOnFileTracked = [];
    for (const m of [...idRows, ...ansRows]) {
      const value = m.value ?? m.answer ?? "";
      const shownLabel = displayLabel(m.fieldId, m.label);
      if (!value) { notOnFile.push(shownLabel); notOnFileTracked.push({ fieldId: m.fieldId, label: m.label }); continue; }
      const r = await fillTextLikeAny(m.fieldId, value, m.label);
      if (r.ok) {
        filledCount++;
        if (LEGAL_SENSITIVE.test(m.label)) legalFilled.push({ label: m.label, answer: value });
        if (m.matchedType === "ai_narrative") narrativeFilled.push({ fieldId: m.fieldId, label: m.label, value });
        // v3.328.0 -- a reused answer from a past application, not
        // freshly matched -- worth a real, distinct signal in the
        // summary so the person specifically double-checks it, since a
        // wrongly-reused stored answer is a real mistake, not just a
        // display nicety.
        if (m.matchedType === "answer_bank") narrativeFilled.push({ fieldId: m.fieldId, label: m.label, value, reused: true });
      } else {
        failed.push(shownLabel);
      }
    }
    // v3.336.0 -- radioNotOnFileTracked keeps each unmatched group's real
    // groupName (the backend's own radioMatches shape already returns this
    // -- see index.ts's radioGroupsByName), the one thing the earlier
    // "not on file" list never kept, so the results screen below can look
    // up that group's REAL options from the local fields array and offer
    // them as real, clickable choices -- never invented, never a free-text
    // box standing in for a fixed-choice question.
    const radioNotOnFileTracked = [];
    for (const r of radioRows) {
      if (!r.chosenFieldId) {
        notOnFile.push(r.groupLabel);
        radioNotOnFileTracked.push({ groupName: r.groupName, groupLabel: r.groupLabel });
        continue;
      }
      const res = await fillRadioAny(r.chosenFieldId);
      if (res.ok) {
        filledCount++;
        if (LEGAL_SENSITIVE.test(r.groupLabel || "")) legalFilled.push({ label: r.groupLabel, answer: r.chosenOptionLabel });
      } else {
        failed.push(r.groupLabel);
      }
    }

    clearPanel();
    panel.appendChild(buildHead("Filled", session));
    const wn3 = wizardNotice(wizardStep);
    if (wn3) panel.appendChild(wn3);
    const body = el("div", { class: "body" });
    const fitSlot = el("div", {});
    body.appendChild(fitSlot);
    fitPromise.then((m) => { if (m) fitSlot.replaceWith(buildFitCard(m)); else fitSlot.remove(); });
    body.appendChild(el("p", { class: "ok", text: `${filledCount} field${filledCount === 1 ? "" : "s"} filled from your AYN profile.` }));

    if (legalFilled.length) {
      const box = el("div", { class: "callout" });
      box.appendChild(el("p", { class: "warn", text: "Double-check these before submitting — work authorization/eligibility answers matter:", style: "margin: 0 0 6px; font-weight: 600;" }));
      const ul = el("ul", { style: "margin: 0; padding-left: 18px; font-size: 13.5px; line-height: 1.7; color: var(--ink);" });
      for (const f of legalFilled) {
        const li = el("li", {});
        li.appendChild(el("span", { text: `${f.label}: `, style: "color: var(--muted);" }));
        li.appendChild(el("b", { text: f.answer || "" }));
        ul.appendChild(li);
      }
      box.appendChild(ul);
      body.appendChild(box);
    }

    // v3.341.0 -- reported directly: a second form to type into, right
    // inside the panel, read as confusing -- "let the user fill it in
    // the real page and ayn can know the answers, memorize them." The
    // v3.336.0 inline answer-and-save rows above (buildTextAnswerRow/
    // buildRadioAnswerRow) are gone; a not-on-file question is now only
    // ever answered once, on the real page, the ordinary way. What
    // "Save what I typed, for next time" (further down) does with that
    // is unchanged from v3.328.0: read the real, current value the
    // person already typed or chose, and store it in the same
    // user_answer_bank every other reuse path already writes to -- this
    // block just stopped duplicating that typing inside the panel too.
    const stillNeeded = [...notOnFile, ...failed];
    if (stillNeeded.length) {
      body.appendChild(el("p", { class: "warn", text: "Fill these directly on the page:" }));
      const ul = el("ul", { class: "fail-list" });
      for (const f of stillNeeded) ul.appendChild(el("li", { text: f }));
      body.appendChild(ul);
    }

    // v3.324.0 -- "regenerate this one answer," a real, distinct
    // capability found comparing AYN against a real competitor's own
    // extension. This is not the free-text answer box the v3.279.0
    // history above deliberately removed -- that was "type the answer
    // AYN couldn't find," a second form; this is "AYN already wrote one,
    // tell it how to make this specific one better," only ever shown next
    // to a real, already-filled open-ended answer, never a blank field.
    for (const nf of narrativeFilled) {
      const card = el("div", { class: "callout-neutral" });
      const labelP = el("p", { style: "margin: 0 0 4px; font-weight: 600; font-size: 13px;" });
      labelP.appendChild(document.createTextNode(nf.label));
      if (nf.reused) {
        labelP.appendChild(el("span", {
          text: " · reused from a past application",
          style: "font-weight: 500; color: var(--warn); font-size: 11.5px;",
        }));
      }
      card.appendChild(labelP);
      const valueP = el("p", { class: "muted", text: nf.value, style: "margin: 0 0 8px; font-size: 12.5px;" });
      card.appendChild(valueP);

      const toggleBtn = el("button", { class: "link-toggle", text: "Not quite right? Tell AYN how to fix it" });
      const editRow = el("div", { style: "display: none; gap: 6px; margin-top: 8px; flex-direction: column;" });
      const guidanceInput = el("input", { type: "text", placeholder: "e.g. mention my Python experience, keep it shorter" });
      guidanceInput.style.fontSize = "12.5px";
      const regenBtn = el("button", { class: "btn btn-ghost btn-sm", text: "Regenerate" });
      const statusP = el("p", { class: "muted", text: "", style: "margin: 4px 0 0; font-size: 11.5px;" });
      editRow.appendChild(guidanceInput);
      editRow.appendChild(regenBtn);
      editRow.appendChild(statusP);
      card.appendChild(toggleBtn);
      card.appendChild(editRow);

      toggleBtn.addEventListener("click", () => {
        const showing = editRow.style.display !== "none";
        editRow.style.display = showing ? "none" : "flex";
        if (!showing) guidanceInput.focus();
      });
      regenBtn.addEventListener("click", async () => {
        const guidance = guidanceInput.value.trim();
        if (!guidance) { statusP.textContent = "Type what you'd like changed first."; return; }
        regenBtn.disabled = true;
        statusP.textContent = "Regenerating…";
        try {
          const res = await callHub(session, {
            action: "auto_apply_regenerate_answer",
            label: nf.label,
            previousAnswer: nf.value,
            guidance,
          });
          const newText = res && res.text;
          if (!newText) throw new Error("AYN could not write a better answer from what's on file.");
          const fillRes = await fillTextLikeAny(nf.fieldId, newText, nf.label);
          if (!fillRes.ok) throw new Error("Wrote a new answer but could not fill it back into the page.");
          nf.value = newText;
          valueP.textContent = newText;
          guidanceInput.value = "";
          statusP.textContent = "Updated.";
        } catch (e) {
          statusP.textContent = e.message || "Could not regenerate this answer.";
        } finally {
          regenBtn.disabled = false;
        }
      });

      body.appendChild(card);
    }

    // v3.321.0 -- real, required-field completeness gate. Consent alone is
    // never enough to submit -- an honestly incomplete required field, a
    // multi-select question AYN deliberately never guesses at, or a
    // required resume that never got attached all block auto-submit
    // regardless of what the person's consent setting says. This can only
    // ever refuse a submit consent would otherwise allow, never the
    // reverse.
    // v3.322.0 -- built through the same displayLabel() the "not on
    // file"/"failed" lists now use (a no-op for anything that isn't a
    // checkbox-group option), so a required checkbox option still
    // correctly counts as missing even though its display string now
    // carries its group question -- checked live: a bare-label Set here
    // would have silently stopped matching those once stillNeeded
    // switched to the combined string, undercounting real blockers.
    const requiredLabels = new Set(fields.filter((f) => f.required).map((f) => displayLabel(f.id, f.label)));
    const requiredMissing = stillNeeded.filter((label) => requiredLabels.has(label));
    // v3.288.0 -- flipped from an allowlist ("only a field that says
    // resume/CV") to a denylist. A field whose own label clearly asks for
    // something else -- cover letter, portfolio, writing sample,
    // transcript, references, a photo/video/ID -- still says "attach
    // yourself," since your resume is a real, wrong guess for what was
    // asked there. Everything else, including a plain "Attachment" or a
    // genuinely unlabeled field, now gets the same "Attach my resume"
    // button too: it's a real file you actually have, not an invented
    // value, and you still review the real page before you submit --
    // reported directly, a form with one ambiguous "Attachment" field
    // was otherwise the one thing standing between "click autofill" and
    // "click submit." (Both patterns are hoisted to module scope now --
    // see the top of this file -- so the ready screen can use them too.)
    // v3.321.0 -- consent is awaited here, right before it's first needed,
    // so it overlaps with everything above rather than adding its own wait.
    const consent = await consentPromise;
    let requiredResumeUnattached = 0;
    if (fileRows.length) {
      body.appendChild(el("p", { class: "warn", text: `${fileRows.length} file field${fileRows.length > 1 ? "s" : ""} to attach:` }));
      for (const f of fileRows) {
        const isResumeField = !NOT_RESUME_FIELD.test(f.label);
        const isCoverLetterField = IS_COVER_LETTER_FIELD.test(f.label);
        const row = el("div", { style: "display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px;" });
        const topRow = el("div", { style: "display: flex; align-items: center; justify-content: space-between; gap: 10px;" });
        topRow.appendChild(el("span", { text: f.label, style: "font-size: 14px;" }));
        row.appendChild(topRow);
        const statusP = el("p", { class: "muted", text: "", style: "margin: 0; font-size: 11.5px;" });
        if (isResumeField) {
          const btn = el("button", { class: "btn btn-primary", text: "Attach my resume", style: "padding: 7px 14px; font-size: 13px; flex-shrink: 0;" });
          const doAttach = async () => {
            btn.disabled = true; btn.textContent = "Attaching…";
            const inputEl = fieldRegistry_().get(f.id);
            const r = inputEl ? await attachResumeFile(session, inputEl) : { ok: false, reason: "Field no longer on the page." };
            if (r.ok) { btn.textContent = "Attached ✓"; btn.style.background = "var(--trust)"; btn.style.color = "#fff"; }
            else { btn.disabled = false; btn.textContent = "Try again"; btn.title = r.reason || ""; }
            return r.ok;
          };
          btn.addEventListener("click", doAttach);
          // v3.327.0 -- a real, separate option next to the free, instant
          // static attach: a resume tailored to the job on THIS page.
          // Deliberately never auto-run, even when "let AYN submit for
          // you" consent is on -- unlike the free static attach above,
          // this spends real credits every time, and doing that silently
          // on an unattended run risks a real, unwanted charge nobody
          // explicitly asked for on this specific application.
          const tailorBtn = el("button", { class: "btn btn-ghost", text: "Tailor for this job", style: "padding: 7px 14px; font-size: 13px; flex-shrink: 0;" });
          tailorBtn.addEventListener("click", async () => {
            btn.disabled = true; tailorBtn.disabled = true; tailorBtn.textContent = "Tailoring…"; statusP.textContent = "";
            const inputEl = fieldRegistry_().get(f.id);
            const r = inputEl ? await tailorAndAttach(session, inputEl) : { ok: false, reason: "Field no longer on the page." };
            btn.disabled = false;
            if (r.ok) {
              tailorBtn.textContent = "Tailored ✓"; tailorBtn.style.background = "var(--trust)"; tailorBtn.style.color = "#fff";
              btn.textContent = "Attach my resume instead";
              if (r.credits && typeof r.credits.spent === "number") statusP.textContent = `${r.credits.spent} credit${r.credits.spent === 1 ? "" : "s"} used.`;
            } else {
              tailorBtn.disabled = false; tailorBtn.textContent = "Tailor for this job";
              statusP.textContent = r.reason || "Could not tailor a resume for this job.";
            }
          });
          const btnRow = el("div", { style: "display: flex; gap: 8px;" }, [btn, tailorBtn]);
          row.appendChild(btnRow);
          row.appendChild(statusP);
          // v3.321.0 -- when consent is on, "one click, everything filled"
          // has to include the resume too, not wait on a second manual
          // click that would never come in an unattended, agreed-to run.
          if (consent.opted_in) {
            const ok = await doAttach();
            if (!ok && requiredLabels.has(f.label)) requiredResumeUnattached++;
          }
        } else if (isCoverLetterField) {
          // v3.327.0 -- previously this field only ever said "Attach
          // yourself," even though AYN can genuinely write one -- the
          // web app's own Jobs tab has done this for a long time, just
          // never reached from here. Same manual-click-only rule as
          // Tailor above, for the same real reason: a real credit spend.
          const writeBtn = el("button", { class: "btn btn-ghost", text: "Write & attach cover letter", style: "padding: 7px 14px; font-size: 13px; flex-shrink: 0;" });
          writeBtn.addEventListener("click", async () => {
            writeBtn.disabled = true; writeBtn.textContent = "Writing…"; statusP.textContent = "";
            const inputEl = fieldRegistry_().get(f.id);
            const r = inputEl ? await writeCoverLetterAndAttach(session, inputEl) : { ok: false, reason: "Field no longer on the page." };
            if (r.ok) {
              writeBtn.textContent = "Attached ✓"; writeBtn.style.background = "var(--trust)"; writeBtn.style.color = "#fff";
              if (r.credits && typeof r.credits.spent === "number") statusP.textContent = `${r.credits.spent} credit${r.credits.spent === 1 ? "" : "s"} used.`;
            } else {
              writeBtn.disabled = false; writeBtn.textContent = "Write & attach cover letter";
              statusP.textContent = r.reason || "Could not write a cover letter for this job.";
            }
          });
          row.appendChild(el("div", { style: "display: flex; gap: 8px;" }, [writeBtn]));
          row.appendChild(statusP);
          if (consent.opted_in && requiredLabels.has(f.label)) requiredResumeUnattached++;
        } else {
          row.appendChild(el("span", { text: "Attach yourself", class: "muted", style: "font-size: 12.5px; margin: 0;" }));
          if (consent.opted_in && requiredLabels.has(f.label)) requiredResumeUnattached++;
        }
        body.appendChild(row);
      }
    }
    if (skipped.length) {
      body.appendChild(el("p", { class: "muted", text: "Slider/range preferences — set these yourself, AYN doesn't guess these:" }));
      const ul2 = el("ul", { class: "fail-list" });
      for (const s of skipped) ul2.appendChild(el("li", { text: s }));
      body.appendChild(ul2);
    }
    if (multiSelectFlags.length) {
      body.appendChild(el("p", { class: "muted", text: "Pick-several questions — choose your own answers here, AYN never guesses which apply to you:" }));
      const ul3 = el("ul", { class: "fail-list" });
      for (const s of multiSelectFlags) ul3.appendChild(el("li", { text: s }));
      body.appendChild(ul3);
    }

    // v3.321.0 -- the one real, gated exception to "AYN never clicks
    // submit for you": only when the person has explicitly, separately
    // agreed to it (auto_apply_consent, checked fresh every run, never
    // assumed), AND this particular run is honestly complete -- every
    // required field actually filled, every required resume actually
    // attached, and no "pick several" question AYN can't answer for them
    // left open. Any one of those blocks it, consent or not; this can
    // only ever refuse a submit consent would otherwise allow, never make
    // one happen consent didn't cover.
    const submitBlockers = [];
    if (requiredMissing.length) submitBlockers.push(`${requiredMissing.length} required field${requiredMissing.length > 1 ? "s" : ""} not filled`);
    if (requiredResumeUnattached) submitBlockers.push("a required resume wasn't attached");
    if (multiSelectFlags.length) submitBlockers.push("a pick-several question needs your own answer");

    if (consent.opted_in && !submitBlockers.length) {
      // v3.332.0 -- captured BEFORE attemptSubmit() runs, since a real
      // success there means the page has already navigated -- title/url
      // read any later than this would describe the confirmation page,
      // not the job that was actually applied to.
      const preSubmitTitle = document.title;
      const preSubmitUrl = location.href;
      const preSubmitJdText = getPageJdText();
      const submitNotice = el("p", { class: "muted", text: "Submitting, since you've agreed to let AYN do this…" });
      body.appendChild(submitNotice);
      const result = await attemptSubmit();
      submitNotice.remove();
      if (result.submitted) {
        body.appendChild(el("p", { class: "ok", text: "Submitted. AYN filled and sent this application, as you agreed.", style: "color: var(--trust);" }));
        // A real, completed submit is the one unambiguous signal AYN can
        // act on without asking -- record it into the same Jobs pipeline
        // the web app's own Saved -> Applied transition uses (see
        // saveJobToPipeline's own header). Best effort, never shown as an
        // error if it fails -- the real application already went through
        // either way.
        saveJobToPipeline(session, { title: preSubmitTitle, jdText: preSubmitJdText, sourceUrl: preSubmitUrl }, { markApplied: true });
      } else {
        body.appendChild(el("p", { class: "warn", text: `Not submitted: ${result.reason}` }));
        body.appendChild(el("p", { class: "muted", text: "Review the real page, then submit it yourself." }));
      }
    } else if (consent.opted_in) {
      body.appendChild(el("p", { class: "warn", text: `AYN would submit this for you, but ${submitBlockers.join(" and ")} — review and submit it yourself this time.` }));
    } else {
      body.appendChild(el("p", { class: "muted", text: "Review the real page, then submit it yourself — AYN never clicks submit for you." }));
    }

    // A real, always-visible, always-changeable setting -- never buried,
    // never assumed from a single click. Reflects the value this exact
    // run used; toggling it only ever affects the NEXT run.
    const consentRow = el("div", { style: "display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; margin: 6px 0 0; border-top: 1px solid var(--border);" });
    consentRow.appendChild(el("span", { text: "Let AYN submit for you next time", style: "font-size: 12.5px; color: var(--muted);" }));
    const consentBtn = el("button", {
      class: consent.opted_in ? "btn btn-primary" : "btn btn-ghost",
      text: consent.opted_in ? "On" : "Off",
      style: "padding: 5px 14px; font-size: 12.5px;",
    });
    consentBtn.addEventListener("click", async () => {
      consentBtn.disabled = true;
      try {
        const next = !consent.opted_in;
        await setConsent(session, next);
        consent.opted_in = next;
        consentBtn.className = next ? "btn btn-primary" : "btn btn-ghost";
        consentBtn.textContent = next ? "On" : "Off";
      } catch (e) {
        // Best effort -- the button's own state stays as it was.
      }
      consentBtn.disabled = false;
    });
    consentRow.appendChild(consentBtn);
    body.appendChild(consentRow);

    // v3.298.0 -- the flag half of the same loop the diagnostics button
    // below is part of. A classified widget shape is shared across every
    // AYN user on the same ATS platform (see form_widget_patterns' own
    // header) -- a real person here saying "this was wrong" is what lets
    // it get fixed for everyone, not just re-guessed at silently every
    // time. One flag never wipes the classification out from under
    // everyone else relying on it right now; it takes a real, small
    // threshold of separate people flagging the SAME widget shape before
    // it's actually re-classified (see flagWidgetClassification's own
    // header). Shown only when this page actually had an AI-classified
    // widget -- most pages never do, since the deterministic layer
    // already covers the overwhelming majority of real fields.
    if (classifiedSummary.length) {
      body.appendChild(el("p", { class: "muted", text: "AYN had to guess at these — tell it if one was wrong:" }));
      for (const c of classifiedSummary) {
        const row = el("div", { style: "display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px;" });
        row.appendChild(el("span", { text: c.label, style: "font-size: 13px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%;" }));
        const flagBtn = el("button", { class: "btn btn-ghost", text: "Wrong?", style: "padding: 4px 10px; font-size: 12px; flex-shrink: 0;" });
        flagBtn.addEventListener("click", async () => {
          flagBtn.disabled = true; flagBtn.textContent = "Flagging…";
          try {
            await callHub(session, { action: "auto_apply_flag_widget", signature: c.signature });
            flagBtn.textContent = "Flagged ✓";
          } catch (e) {
            flagBtn.disabled = false; flagBtn.textContent = "Try again";
          }
        });
        row.appendChild(flagBtn);
        body.appendChild(row);
      }
    }

    // v3.348.0 -- "the extension looks the same design," reported
    // directly against a real screenshot of exactly this screen: three
    // separate full-width ghost buttons stacked one after another, the
    // same "wall of buttons" the Ready screen's own v3.345.0 redesign
    // was built to move away from. All three below (diagnostics, save-
    // what-I-typed, save-this-job) are now rows in one shared list-card,
    // same visual language as the Ready screen's Tailor/Cover-letter
    // card -- none of the click logic below changed, only how it's shown.
    const utilCard = el("div", { class: "list-card" });

    // v3.296.0 -- a real, explicit, opt-in diagnostics channel: sends a
    // structured summary of this exact run straight to AYN's own
    // backend, so it can be read directly rather than relayed by hand.
    // Deliberately built from the SAME data already on screen above --
    // never re-reads the page, never includes a filled VALUE (only
    // labels, kinds, structural widget signatures, and success/failure),
    // and only ever sends when this button is clicked, never silently.
    const diagSub = el("span", { class: "list-row-sub", text: "Helps AYN improve what it read on this page" });
    const diagLabel = el("div", { class: "list-row-text" }, [el("div", { text: "Send diagnostics to AYN" }), diagSub]);
    const diagChevron = el("span", { class: "list-row-chevron" }, [iconEl(ICON_CHEVRON)]);
    const diagRow = el("button", { type: "button", class: "list-row" }, [
      el("span", { class: "list-row-icon" }, [iconEl(ICON_INFO)]), diagLabel, diagChevron,
    ]);
    diagRow.addEventListener("click", async () => {
      diagRow.disabled = true; diagSub.textContent = "Sending…";
      try {
        const report = {
          fieldCount: fields.length,
          fieldsByKind: fields.reduce((acc, f) => { const k = f.type || "unknown"; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
          filledCount,
          notOnFile,
          failed,
          skipped,
          multiSelectFlags,
          fileFieldLabels: fileRows.map((f) => f.label),
          legalSensitiveLabels: legalFilled.map((f) => f.label),
          // v3.325.0 -- which known ATS platform this run was on, if any,
          // and whether that platform has ever actually had a real fix
          // verified against it. The real, honest use of this: a pattern
          // of failures clustering on platform:"icims"/verified:false is
          // a genuine signal something there is worth chasing down, the
          // same way a hostname clustering already helped find every
          // real bug fixed this session -- never a gate on whether
          // extraction runs, which stays identical on every site.
          platform: detectPlatform(),
        };
        await callHub(session, {
          action: "ext_diag_report",
          pageHostname: location.hostname,
          pagePathname: location.pathname,
          report,
        });
        diagSub.textContent = "Sent ✓";
      } catch (e) {
        diagRow.disabled = false;
        diagSub.textContent = "Couldn't send — try again";
      }
    });
    utilCard.appendChild(diagRow);

    // v3.328.0 -- "remember what I typed for next time," the real
    // feature this was built to close the gap on: not AI inventing an
    // answer, only ever replaying something the person genuinely typed
    // themselves once already. Reads the CURRENT, real DOM value of
    // every field this run reported as not on file -- by the time
    // someone reaches for this button they've had a real chance to type
    // into the actual page, unlike right when the panel first opens.
    //
    // v3.341.0 -- now the ONLY save path for a not-on-file question
    // (the inline panel rows are gone, see this file's own note above),
    // so it has to cover a fixed-choice question too, not just a typed
    // one: for each real radio/toggle group left unmatched, checks
    // which of that group's own real options the person actually chose
    // on the page (a native input's .checked, or aria-checked/
    // aria-pressed for a custom button-shaped one -- the exact same
    // check frame_agent.js's own fillRadio already verifies a fill
    // against, just read instead of set). Frame-hosted fields are a
    // real, disclosed gap here, same as the text-field half above
    // always had: fieldRegistry_() only ever sees this frame's own
    // elements, so a question living inside a sub-frame's own <iframe>
    // can't be read back this way -- unchanged scope, not a new one.
    function isOptionChosen(optEl) {
      if (!optEl) return false;
      if (optEl.tagName === "INPUT") return !!optEl.checked;
      const state = optEl.getAttribute("aria-checked") || optEl.getAttribute("aria-pressed");
      return state === "true";
    }
    if (notOnFileTracked.length || radioNotOnFileTracked.length) {
      const saveSub = el("span", { class: "list-row-sub", text: "So it's on file next time, not asked again" });
      const saveLabel = el("div", { class: "list-row-text" }, [el("div", { text: "Save what I typed, for next time" }), saveSub]);
      const saveChevron = el("span", { class: "list-row-chevron" }, [iconEl(ICON_CHEVRON)]);
      const saveAnswersRow = el("button", { type: "button", class: "list-row" }, [
        el("span", { class: "list-row-icon" }, [iconEl(ICON_SAVE)]), saveLabel, saveChevron,
      ]);
      saveAnswersRow.addEventListener("click", async () => {
        saveAnswersRow.disabled = true; saveSub.textContent = "Saving…";
        const toSave = [];
        for (const t of notOnFileTracked) {
          // v3.336.0 -- a consent-checkbox label is never reusable
          // profile data, so this bulk fallback can't save one either,
          // even if someone happened to type something into that exact
          // field on the real page themselves.
          if (!t.fieldId || CONSENT_CHECKBOX_RE.test(t.label)) continue;
          const el2 = fieldRegistry_().get(t.fieldId);
          const val = el2 && typeof el2.value === "string" ? el2.value.trim() : "";
          if (val) toSave.push({ label: t.label, answer: val });
        }
        for (const r of radioNotOnFileTracked) {
          if (!r.groupName || CONSENT_CHECKBOX_RE.test(r.groupLabel || "")) continue;
          const options = fields.filter((f) => f.radioGroup === r.groupName && f.label);
          const chosen = options.find((opt) => isOptionChosen(fieldRegistry_().get(opt.id)));
          if (chosen) toSave.push({ label: r.groupLabel, answer: chosen.label });
        }
        if (!toSave.length) {
          saveAnswersRow.disabled = false;
          saveSub.textContent = "Nothing typed in yet to save.";
          return;
        }
        let saved = 0;
        for (const item of toSave) {
          try {
            await callHub(session, { action: "auto_apply_save_answer", label: item.label, answer: item.answer });
            saved++;
          } catch (e) {
            // One field's save failing must never block the rest --
            // matches the same honest, per-item degrade every other
            // batched action in this panel already uses.
          }
        }
        saveAnswersRow.disabled = false;
        saveSub.textContent = saved
          ? `Saved ${saved} answer${saved === 1 ? "" : "s"} for next time.`
          : "Couldn't save those answers, try again.";
      });
      utilCard.appendChild(saveAnswersRow);
    }

    // v3.332.0 -- "more useful": everything else AYN knows about a job
    // lives in the web app's own Saved Jobs pipeline; this is the one
    // explicit, opt-in way to put THIS job there too, for the common
    // manual-review path (an auto-submit already records itself above,
    // with no click needed, since that's a real completed action -- a
    // fill alone isn't, so this stays a real button, not an assumption).
    const trackSub = el("span", { class: "list-row-sub", text: "Adds it to Saved Jobs in your AYN account" });
    const trackLabel = el("div", { class: "list-row-text" }, [el("div", { text: "Save this job to AYN" }), trackSub]);
    const trackChevron = el("span", { class: "list-row-chevron" }, [iconEl(ICON_CHEVRON)]);
    const trackRow = el("button", { type: "button", class: "list-row" }, [
      el("span", { class: "list-row-icon" }, [iconEl(ICON_BOOKMARK)]), trackLabel, trackChevron,
    ]);
    trackRow.addEventListener("click", async () => {
      trackRow.disabled = true; trackSub.textContent = "Saving…";
      const r = await saveJobToPipeline(session, { title: document.title, jdText: getPageJdText() });
      trackSub.textContent = r.ok ? "Saved to AYN ✓" : "Couldn't save — try again";
      if (!r.ok) trackRow.disabled = false;
    });
    utilCard.appendChild(trackRow);

    body.appendChild(utilCard);

    const closeBtn = el("button", { class: "btn btn-ghost", text: "Done", style: "width:100%" });
    closeBtn.addEventListener("click", minimizePanel);
    body.appendChild(closeBtn);
    panel.appendChild(body);
    watchForNewFields(session);
  }

  async function start() {
    const session = await ensureSession();
    if (!session) return showSignIn();
    return showReady(session);
  }

  start();
})();
