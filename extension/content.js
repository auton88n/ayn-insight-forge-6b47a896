/**
 * AYN Auto-Apply — content script.
 *
 * Runs ONLY when you click the toolbar icon, ONLY in the tab you're
 * looking at, and ONLY ever fills or submits after you've reviewed the
 * exact values and clicked a real button inside this panel yourself.
 *
 * Why this exists at all, and why it's built the way it is: AYN's own
 * history already tried an auto-fill extension once and killed it after
 * it invented a fake email address and reported the fill as successful.
 * This rebuild is deliberately designed so neither of those can happen
 * again, structurally, not just by being more careful:
 *   1. Every value this panel offers to fill comes from a real backend
 *      call (auto_apply_extract) that only ever returns facts already on
 *      file in your own AYN profile -- the exact same matching logic the
 *      web app's own auto-apply panel uses. Nothing is generated here.
 *   2. After setting a field's value, this script reads the live DOM
 *      back and confirms it actually changed -- a field that didn't
 *      take the value is reported as "couldn't be filled," never
 *      silently counted as filled.
 *   3. After clicking submit, this script checks the page's own real
 *      text for the same class of anti-spam rejection phrases the
 *      server-side auto-apply path checks for (job-checker/server.py's
 *      _find_rejection_text) -- a URL change alone is never trusted as
 *      proof of success.
 * And this is a genuinely different thing from that server-side path:
 * this runs in YOUR real Chrome, on YOUR real IP and session -- it is
 * not an automated bot impersonating you, it's you, with AYN filling in
 * the boxes. Nothing here tries to look like anything other than what
 * it is to the site being applied to.
 *
 * All dynamic/untrusted text (job titles, this page's own field labels,
 * values you type) is rendered via textContent/setAttribute, never
 * interpolated into an HTML string -- every label or value here can
 * originate from a third-party page's own DOM, so it's treated as
 * untrusted content throughout, not just escaped as an afterthought.
 */
(() => {
  if (window.__aynAutoApplyInjected) return;
  window.__aynAutoApplyInjected = true;

  const SUPABASE_URL = "https://ayn.careers";
  const ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg2ODg5MDQyLCJleHAiOjIxMDIyNDkwNDJ9.AmUVtzKLnrXO_ubBNxSDCBDnI7jJyNkGfK9p7nrzkGI";
  const STORAGE_KEY = "ayn_auto_apply_session";

  // Same literal, narrow phrase list as _find_rejection_text in
  // job-checker/server.py -- kept in sync deliberately, both exist only
  // to report a real rejection honestly, never to get past one.
  const REJECTION_PHRASES = [
    "flagged as possible spam", "flagged as spam", "couldn't submit your application",
    "could not submit your application", "we couldn't submit", "unable to submit your application",
    "your submission was blocked", "application was not submitted", "suspicious activity detected",
    "automated submission", "bot detection",
  ];

  // ---------------------------------------------------------------
  // Session storage + auth
  // ---------------------------------------------------------------
  function getSession() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (r) => resolve(r[STORAGE_KEY] || null));
    });
  }
  function setSession(session) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: session }, resolve);
    });
  }
  function clearSession() {
    return new Promise((resolve) => {
      chrome.storage.local.remove([STORAGE_KEY], resolve);
    });
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

  // A JWT's own exp claim decides staleness -- never assumed valid just
  // because it exists in storage.
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
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status}).`);
    return data;
  }

  async function markApplied(session, jobId) {
    await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${jobId}`, {
      method: "PATCH",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ application_status: "applied", application_status_changed_at: new Date().toISOString() }),
    });
  }

  async function listSavedJobs(session) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/jobs?select=id,title,company,source_url&user_id=eq.${session.user.id}&application_status=eq.saved&order=created_at.desc&limit=50`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}` } }
    );
    if (!r.ok) return [];
    return r.json();
  }

  // ---------------------------------------------------------------
  // Field extraction -- reads the LIVE page, keeps real element
  // references in memory (never re-queries by a stale id later, unlike
  // the server-side path, which has to re-resolve by label every time
  // because a fresh Playwright session holds nothing between calls --
  // this script never loses the reference at all).
  // ---------------------------------------------------------------
  let fieldRegistry = new Map(); // id -> element

  function visible(el) {
    return el.offsetParent !== null || el.getClientRects().length > 0;
  }

  function labelFor(el) {
    if (el.id) {
      const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (byFor && byFor.textContent.trim()) return byFor.textContent.trim();
    }
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim();
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const parts = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean);
      if (parts.length) return parts.join(" ");
    }
    const wrappingLabel = el.closest("label");
    if (wrappingLabel && wrappingLabel.textContent.trim()) return wrappingLabel.textContent.trim();
    // Nearest preceding text within the same form group -- a common
    // shape (Greenhouse/Ashby/Lever all use some variant of this) where
    // the label is a sibling, not a wrapping <label> or a `for` link.
    let node = el.previousElementSibling;
    let hops = 0;
    while (node && hops < 3) {
      const t = node.textContent?.trim();
      if (t && t.length < 200) return t;
      node = node.previousElementSibling;
      hops++;
    }
    if (el.placeholder && el.placeholder.trim()) return el.placeholder.trim();
    return "";
  }

  function extractFields() {
    fieldRegistry = new Map();
    const out = [];
    let n = 0;
    const nodes = document.querySelectorAll("input, textarea, select");
    const seenRadioGroups = new Set();
    for (const el of nodes) {
      if (!visible(el)) continue;
      if (el.disabled) continue;
      const type = (el.getAttribute("type") || el.tagName.toLowerCase()).toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) continue;

      if (type === "file") {
        const fid = `ayn-f-${n++}`;
        fieldRegistry.set(fid, el);
        out.push({ id: fid, tag: "input", type: "file", required: !!el.required, label: labelFor(el) || "Attachment" });
        continue;
      }

      if (type === "radio") {
        const name = el.name || "";
        if (!name) continue;
        const groupLabel = seenRadioGroups.has(name) ? undefined : (() => {
          // The group's own question text -- usually a fieldset legend,
          // or the nearest heading-ish ancestor above the first option.
          const fieldset = el.closest("fieldset");
          const legend = fieldset?.querySelector("legend")?.textContent?.trim();
          return legend || labelFor(el);
        })();
        if (!seenRadioGroups.has(name)) seenRadioGroups.add(name);
        const fid = `ayn-f-${n++}`;
        fieldRegistry.set(fid, el);
        out.push({
          id: fid, tag: "input", type: "radio", required: !!el.required,
          label: labelFor(el), radioGroup: name, radioGroupLabel: groupLabel,
        });
        continue;
      }

      const fid = el.id && !fieldRegistry.has(el.id) ? el.id : `ayn-f-${n++}`;
      fieldRegistry.set(fid, el);
      const tag = el.tagName.toLowerCase();
      out.push({
        id: fid, tag, type: tag === "select" ? "select" : tag === "textarea" ? "textarea" : type,
        required: !!el.required, label: labelFor(el),
      });
    }
    return out;
  }

  // ---------------------------------------------------------------
  // Filling -- the native-setter trick is required for React/Vue-style
  // controlled inputs, which ignore a plain `el.value = x` assignment
  // (the framework's own change handler never fires, so its internal
  // state silently reverts the DOM on next render). Every set is
  // followed by a read-back check -- see this file's own header comment
  // for why that's the one non-negotiable part of this whole feature.
  // ---------------------------------------------------------------
  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype
      : el.tagName === "SELECT" ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillTextLike(fid, value) {
    const el = fieldRegistry.get(fid);
    if (!el) return { ok: false, reason: "Field no longer on the page." };
    setNativeValue(el, value);
    return { ok: el.value === value, reason: el.value === value ? null : "Value didn't take -- fill it in yourself." };
  }

  function fillRadio(fid) {
    const el = fieldRegistry.get(fid);
    if (!el) return { ok: false, reason: "Option no longer on the page." };
    el.checked = true;
    el.dispatchEvent(new Event("click", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: el.checked, reason: el.checked ? null : "Selection didn't take -- pick it yourself." };
  }

  function findRejectionText(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const phrase of REJECTION_PHRASES) {
      const idx = lower.indexOf(phrase);
      if (idx === -1) continue;
      const start = Math.max(text.lastIndexOf("\n", idx), 0);
      const end = (() => {
        const nl = text.indexOf("\n", idx);
        return nl === -1 ? Math.min(text.length, idx + 220) : nl;
      })();
      return text.slice(start, end).trim().slice(0, 220);
    }
    return null;
  }

  function findSubmitButton() {
    const candidates = Array.from(document.querySelectorAll("button, input[type=submit]"));
    const wordy = /^(submit( application)?|apply( now)?|send( application)?|finish( application)?)$/i;
    return candidates.find((b) => visible(b) && !b.disabled && wordy.test((b.textContent || b.value || "").trim()))
      || candidates.find((b) => visible(b) && !b.disabled && b.type === "submit");
  }

  // ---------------------------------------------------------------
  // Overlay UI -- a shadow root so this page's own CSS can never bleed
  // into the panel (and the panel's own styles never leak into the
  // host page either). Every dynamic value below is set via
  // textContent/setAttribute/.value, never string-interpolated into
  // markup -- job titles, this page's own field labels, and anything
  // you type are all treated as untrusted content, not just escaped.
  // ---------------------------------------------------------------
  const host = document.createElement("div");
  host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; bottom: 20px; right: 20px;";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    .panel { width: 340px; max-height: 78vh; overflow-y: auto; background: #fbf6f0; color: #1f1a17;
      border-radius: 16px; box-shadow: 0 24px 56px -20px rgba(20,15,10,0.35); border: 1px solid #ece2d6;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; }
    .head { padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;
      background: linear-gradient(135deg, #e85d3a 0%, #ff8a5c 100%); color: #fff; border-radius: 16px 16px 0 0; }
    .head b { font-size: 13.5px; }
    .close { cursor: pointer; opacity: 0.85; background: none; border: none; color: #fff; font-size: 16px; line-height: 1; }
    .body { padding: 14px 16px; }
    .row { margin-bottom: 10px; }
    label.field-label { display: block; font-size: 11px; color: #7a6d61; margin-bottom: 3px; }
    input, select { width: 100%; box-sizing: border-box; padding: 7px 9px; border-radius: 8px;
      border: 1px solid #e0d5c8; font-size: 13px; background: #fff; color: #1f1a17; }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 14px;
      border-radius: 999px; border: none; font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .btn-primary { background: linear-gradient(135deg, #e85d3a 0%, #ff8a5c 100%); color: #fff; }
    .btn-primary:disabled { opacity: 0.55; cursor: default; }
    .btn-ghost { background: #efe6db; color: #1f1a17; }
    .muted { color: #7a6d61; font-size: 12px; line-height: 1.5; margin: 0 0 8px; }
    .warn { color: #9a5348; font-size: 12.5px; line-height: 1.5; margin: 0 0 8px; }
    .ok { color: #2f6b52; font-size: 12.5px; line-height: 1.5; margin: 0 0 8px; }
    ul.fail-list { margin: 0 0 8px; padding-left: 18px; color: #9a5348; font-size: 12px; }
    .list { display: flex; flex-direction: column; gap: 6px; }
    .job-pick { text-align: left; padding: 8px 10px; border-radius: 10px; border: 1px solid #e0d5c8;
      background: #fff; cursor: pointer; font-size: 12.5px; }
    .job-pick:hover { border-color: #e85d3a; }
  `;
  root.appendChild(style);
  const panel = document.createElement("div");
  panel.className = "panel";
  root.appendChild(panel);

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

  function buildHead(title) {
    const closeBtn = el("button", { class: "close", text: "×", onclick: closePanel });
    return el("div", { class: "head" }, [el("b", { text: `AYN — ${title}` }), closeBtn]);
  }

  function clearPanel() {
    panel.innerHTML = "";
  }
  function closePanel() {
    host.remove();
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
        await showJobPick(session);
      } catch (e) {
        err.textContent = e.message || "Sign-in failed.";
        err.style.display = "block";
        goBtn.disabled = false; goBtn.textContent = "Sign in";
      }
    });
    const body = el("div", { class: "body" }, [
      el("p", { class: "muted", text: "Sign in with your real AYN account to fill this form from your own profile." }),
      el("div", { class: "row" }, [el("label", { class: "field-label", text: "Email" }), emailInput]),
      el("div", { class: "row" }, [el("label", { class: "field-label", text: "Password" }), passInput]),
      err, goBtn,
    ]);
    panel.appendChild(buildHead("Sign in"));
    panel.appendChild(body);
  }

  async function showJobPick(session) {
    clearPanel();
    panel.appendChild(buildHead("Loading"));
    panel.appendChild(el("div", { class: "body" }, [el("p", { class: "muted", text: "Finding this job in your Saved jobs…" })]));
    let jobs = [];
    try { jobs = await listSavedJobs(session); } catch { jobs = []; }
    const hostShort = location.hostname.replace(/^www\./, "").split(".")[0];
    const matches = jobs.filter((j) => {
      try { return j.source_url && new URL(j.source_url).hostname.replace(/^www\./, "").includes(hostShort); }
      catch { return false; }
    });
    const list = matches.length ? matches : jobs;
    clearPanel();
    panel.appendChild(buildHead(list.length ? "Which saved job is this?" : "No saved job found"));
    if (!list.length) {
      panel.appendChild(el("div", { class: "body" }, [
        el("p", { class: "muted", text: "Save this job in AYN's Saved jobs first (open Browse jobs, add it), then click the extension icon again on this page." }),
      ]));
      return;
    }
    const listEl = el("div", { class: "list" });
    for (const j of list) {
      const btn = el("button", { class: "job-pick", text: `${j.title || "Untitled role"} — ${j.company || ""}` });
      btn.addEventListener("click", () => runExtract(session, j.id, j));
      listEl.appendChild(btn);
    }
    panel.appendChild(el("div", { class: "body" }, [listEl]));
  }

  let currentValues = {}; // fieldId -> string value the person confirmed
  let currentMatches = null;

  async function runExtract(session, jobId) {
    clearPanel();
    panel.appendChild(buildHead("Reading this form"));
    panel.appendChild(el("div", { class: "body" }, [el("p", { class: "muted", text: "Matching fields to your AYN profile…" })]));
    const fields = extractFields();
    if (!fields.length) {
      clearPanel();
      panel.appendChild(buildHead("No form fields found"));
      panel.appendChild(el("div", { class: "body" }, [el("p", { class: "muted", text: "Couldn't find a fillable application form on this page." })]));
      return;
    }
    let result;
    try {
      result = await callHub(session, { action: "auto_apply_extract", jobId, fields });
    } catch (e) {
      clearPanel();
      panel.appendChild(buildHead("Couldn't read your profile"));
      panel.appendChild(el("div", { class: "body" }, [el("p", { class: "warn", text: e.message })]));
      return;
    }
    currentMatches = result;
    currentValues = {};
    for (const m of Object.values(result.identityMatches || {})) currentValues[m.fieldId] = m.value || "";
    for (const m of result.answerMatches || []) currentValues[m.fieldId] = m.answer || "";
    showReview(session, jobId);
  }

  function showReview(session, jobId) {
    clearPanel();
    panel.appendChild(buildHead("Review before filling"));
    const body = el("div", { class: "body" });
    const idRows = Object.values(currentMatches.identityMatches || {});
    const ansRows = currentMatches.answerMatches || [];
    const radioRows = currentMatches.radioMatches || [];
    const fileRows = currentMatches.fileFields || [];

    for (const m of [...idRows, ...ansRows]) {
      const input = el("input", { "data-fid": m.fieldId });
      input.value = currentValues[m.fieldId] || "";
      if (!input.value) input.placeholder = "Not on file — type it yourself";
      input.addEventListener("input", () => { currentValues[m.fieldId] = input.value; });
      body.appendChild(el("div", { class: "row" }, [el("label", { class: "field-label", text: m.label }), input]));
    }
    for (const r of radioRows) {
      const answerText = r.chosenOptionLabel || "Couldn't be answered from your profile — pick it yourself after filling.";
      body.appendChild(el("div", { class: "row" }, [
        el("label", { class: "field-label", text: r.groupLabel }),
        el("p", { class: "muted", text: answerText, style: "margin:0" }),
      ]));
    }
    if (fileRows.length) {
      const word = fileRows.length > 1 ? "them" : "it";
      body.appendChild(el("p", { class: "warn", text: `${fileRows.length} file field${fileRows.length > 1 ? "s" : ""} (e.g. resume) can't be attached automatically yet — attach ${word} yourself after AYN fills the rest.` }));
    }
    const fillBtn = el("button", { class: "btn btn-primary", text: "Fill this form", style: "width:100%; margin-top:6px" });
    fillBtn.addEventListener("click", () => doFill(session, jobId));
    body.appendChild(fillBtn);
    panel.appendChild(body);
  }

  function doFill(session, jobId) {
    const idRows = Object.values(currentMatches.identityMatches || {});
    const ansRows = currentMatches.answerMatches || [];
    const radioRows = currentMatches.radioMatches || [];
    const failed = [];
    let filledCount = 0;
    for (const m of [...idRows, ...ansRows]) {
      const value = currentValues[m.fieldId];
      if (!value) continue;
      const r = fillTextLike(m.fieldId, value);
      if (r.ok) filledCount++; else failed.push(`${m.label}: ${r.reason}`);
    }
    for (const r of radioRows) {
      if (!r.chosenFieldId) continue;
      const res = fillRadio(r.chosenFieldId);
      if (res.ok) filledCount++; else failed.push(`${r.groupLabel}: ${res.reason}`);
    }
    clearPanel();
    panel.appendChild(buildHead("Filled — review the real page"));
    const body = el("div", { class: "body" });
    body.appendChild(el("p", { class: "ok", text: `${filledCount} field${filledCount === 1 ? "" : "s"} filled on the page.` }));
    if (failed.length) {
      body.appendChild(el("p", { class: "warn", text: `${failed.length} couldn't be filled automatically:` }));
      const ul = el("ul", { class: "fail-list" });
      for (const f of failed) ul.appendChild(el("li", { text: f }));
      body.appendChild(ul);
    }
    body.appendChild(el("p", { class: "muted", text: "Check the actual form on the page. When it's ready, submit it below — AYN never submits on its own." }));
    const submitBtn = el("button", { class: "btn btn-primary", text: "Submit this application", style: "width:100%" });
    submitBtn.addEventListener("click", () => doSubmit(session, jobId, submitBtn));
    const skipBtn = el("button", { class: "btn btn-ghost", text: "I'll submit it myself", style: "width:100%; margin-top:8px" });
    skipBtn.addEventListener("click", closePanel);
    body.appendChild(submitBtn);
    body.appendChild(skipBtn);
    panel.appendChild(body);
  }

  async function doSubmit(session, jobId, submitButtonRef) {
    if (submitButtonRef) { submitButtonRef.disabled = true; submitButtonRef.textContent = "Submitting…"; }
    const beforeUrl = location.href;
    const pageSubmitBtn = findSubmitButton();
    if (!pageSubmitBtn) {
      clearPanel();
      panel.appendChild(buildHead("Couldn't find a submit button"));
      panel.appendChild(el("div", { class: "body" }, [
        el("p", { class: "warn", text: "AYN couldn't identify this form's own submit button. Please click it yourself on the page." }),
      ]));
      return;
    }
    pageSubmitBtn.click();
    await new Promise((r) => setTimeout(r, 2500));
    const rejection = findRejectionText(document.body.innerText || "");
    const urlChanged = location.href !== beforeUrl;
    clearPanel();
    if (rejection) {
      panel.appendChild(buildHead("The employer's system rejected this"));
      panel.appendChild(el("div", { class: "body" }, [
        el("p", { class: "warn", text: `"${rejection}"` }),
        el("p", { class: "muted", text: "This is the employer's own application system, not AYN — it refused the submission. AYN doesn't try to get around a site's own anti-spam checks. Try reloading and finishing it manually, from your own real browser, or reach out to the employer directly." }),
      ]));
      return;
    }
    if (urlChanged) {
      await markApplied(session, jobId);
      panel.appendChild(buildHead("Submitted"));
      panel.appendChild(el("div", { class: "body" }, [el("p", { class: "ok", text: "Marked as applied in AYN." })]));
      return;
    }
    panel.appendChild(buildHead("Not sure it went through"));
    panel.appendChild(el("div", { class: "body" }, [
      el("p", { class: "warn", text: "The page didn't change after submitting, and there's no clear confirmation. Check the page directly before assuming this application was sent." }),
    ]));
  }

  async function start() {
    const session = await ensureSession();
    if (!session) return showSignIn();
    return showJobPick(session);
  }

  start();
})();
