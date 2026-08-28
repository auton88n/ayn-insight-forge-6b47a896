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
 * signed in or not, and it goes straight to reading and filling that
 * page.
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

  // ---------------------------------------------------------------
  // Field extraction
  // ---------------------------------------------------------------
  let fieldRegistry = new Map();

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
    let node = el.previousElementSibling, hops = 0;
    while (node && hops < 3) {
      const t = node.textContent?.trim();
      if (t && t.length < 200) return t;
      node = node.previousElementSibling; hops++;
    }
    if (el.placeholder && el.placeholder.trim()) return el.placeholder.trim();
    return "";
  }

  function extractFields() {
    fieldRegistry = new Map();
    const out = [];
    let n = 0;
    const seenRadioGroups = new Set();
    for (const el of document.querySelectorAll("input, textarea, select")) {
      if (!visible(el) || el.disabled) continue;
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
          const fieldset = el.closest("fieldset");
          const legend = fieldset?.querySelector("legend")?.textContent?.trim();
          return legend || labelFor(el);
        })();
        seenRadioGroups.add(name);
        const fid = `ayn-f-${n++}`;
        fieldRegistry.set(fid, el);
        out.push({ id: fid, tag: "input", type: "radio", required: !!el.required, label: labelFor(el), radioGroup: name, radioGroupLabel: groupLabel });
        continue;
      }
      const fid = el.id && !fieldRegistry.has(el.id) ? el.id : `ayn-f-${n++}`;
      fieldRegistry.set(fid, el);
      const tag = el.tagName.toLowerCase();
      out.push({ id: fid, tag, type: tag === "select" ? "select" : tag === "textarea" ? "textarea" : type, required: !!el.required, label: labelFor(el) });
    }
    return out;
  }

  // ---------------------------------------------------------------
  // Filling -- native-setter trick for React/Vue-controlled inputs,
  // read-back verified after every write.
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
    if (!el) return { ok: false };
    setNativeValue(el, value);
    return { ok: el.value === value };
  }
  function fillRadio(fid) {
    const el = fieldRegistry.get(fid);
    if (!el) return { ok: false };
    el.checked = true;
    el.dispatchEvent(new Event("click", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: el.checked };
  }

  // ---------------------------------------------------------------
  // Overlay UI -- one small panel, shadow-DOM isolated. Every
  // dynamic/untrusted value is set via textContent, never interpolated
  // into markup.
  // ---------------------------------------------------------------
  const host = document.createElement("div");
  window.__aynAutoApplyHost = host;
  host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; bottom: 20px; right: 20px;";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    .panel { width: min(560px, 92vw); max-height: 90vh; overflow-y: auto; background: #fbf6f0; color: #1f1a17;
      border-radius: 20px; box-shadow: 0 32px 72px -20px rgba(20,15,10,0.45); border: 1px solid #ece2d6;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 15.5px; }
    .head { padding: 18px 24px; display: flex; align-items: center; justify-content: space-between;
      background: linear-gradient(135deg, #e85d3a 0%, #ff8a5c 100%); color: #fff; border-radius: 20px 20px 0 0; }
    .head b { font-size: 16.5px; }
    .close { cursor: pointer; opacity: 0.85; background: none; border: none; color: #fff; font-size: 22px; line-height: 1; padding: 2px; }
    .close:hover { opacity: 1; }
    .body { padding: 22px 24px 24px; }
    .row { margin-bottom: 15px; }
    label.field-label { display: block; font-size: 13.5px; color: #7a6d61; margin-bottom: 5px; font-weight: 600; }
    input { width: 100%; box-sizing: border-box; padding: 12px 14px; border-radius: 10px;
      border: 1px solid #e0d5c8; font-size: 15.5px; background: #fff; color: #1f1a17; }
    input:focus { outline: none; border-color: #e85d3a; box-shadow: 0 0 0 3px rgba(232,93,58,0.15); }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 13px 20px;
      border-radius: 999px; border: none; font-weight: 600; font-size: 15.5px; cursor: pointer; }
    .btn-primary { background: linear-gradient(135deg, #e85d3a 0%, #ff8a5c 100%); color: #fff; }
    .btn-primary:disabled { opacity: 0.55; cursor: default; }
    .btn-ghost { background: #efe6db; color: #1f1a17; }
    .muted { color: #7a6d61; font-size: 14.5px; line-height: 1.65; margin: 0 0 12px; }
    .warn { color: #9a5348; font-size: 14.5px; line-height: 1.65; margin: 0 0 12px; }
    .ok { color: #2f6b52; font-size: 16px; font-weight: 600; line-height: 1.6; margin: 0 0 12px; }
    ul.fail-list { margin: 0 0 12px; padding-left: 22px; color: #9a5348; font-size: 14.5px; line-height: 1.8; }
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
    return el("div", { class: "head" }, [el("b", { text: `AYN — ${title}` }), el("button", { class: "close", text: "×", onclick: closePanel })]);
  }
  function clearPanel() { panel.innerHTML = ""; }
  function closePanel() { host.remove(); }

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
        await autofill(session);
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

  // The one real step: extract THIS page's own fields, match them against
  // your real AYN profile, and fill immediately -- no picking a job first
  // (a saved-jobs record was never needed for the matching itself, only
  // for the earlier, server-side Playwright path -- see the backend's own
  // v3.278.0 comment on auto_apply_extract), no separate "review then
  // click Fill" step. You still see and can edit anything that came back
  // wrong, right here, but nothing waits on a second click.
  async function autofill(session) {
    clearPanel();
    panel.appendChild(buildHead("Autofilling…"));
    panel.appendChild(el("div", { class: "body" }, [el("p", { class: "muted", text: "Reading this page and matching it to your AYN profile…" })]));
    const fields = extractFields();
    if (!fields.length) {
      clearPanel();
      panel.appendChild(buildHead("No form found"));
      panel.appendChild(el("div", { class: "body" }, [el("p", { class: "muted", text: "Couldn't find a fillable application form on this page." })]));
      return;
    }
    let result;
    try {
      result = await callHub(session, { action: "auto_apply_extract", fields });
    } catch (e) {
      clearPanel();
      panel.appendChild(buildHead("Couldn't read your profile"));
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
    let filledCount = 0;

    for (const m of [...idRows, ...ansRows]) {
      const value = m.value ?? m.answer ?? "";
      if (!value) { notOnFile.push(m.label); continue; }
      const r = fillTextLike(m.fieldId, value);
      if (r.ok) filledCount++; else failed.push(m.label);
    }
    for (const r of radioRows) {
      if (!r.chosenFieldId) { notOnFile.push(r.groupLabel); continue; }
      const res = fillRadio(r.chosenFieldId);
      if (res.ok) filledCount++; else failed.push(r.groupLabel);
    }

    clearPanel();
    panel.appendChild(buildHead("Filled"));
    const body = el("div", { class: "body" });
    body.appendChild(el("p", { class: "ok", text: `${filledCount} field${filledCount === 1 ? "" : "s"} filled from your AYN profile.` }));

    const stillNeeded = [...notOnFile, ...failed];
    if (stillNeeded.length) {
      body.appendChild(el("p", { class: "warn", text: "Not on file yet — fill these directly on the page:" }));
      const ul = el("ul", { class: "fail-list" });
      for (const f of stillNeeded) ul.appendChild(el("li", { text: f }));
      body.appendChild(ul);
    }
    if (fileRows.length) {
      body.appendChild(el("p", { class: "warn", text: `${fileRows.length} file field${fileRows.length > 1 ? "s" : ""} (e.g. resume) need to be attached by hand.` }));
    }
    body.appendChild(el("p", { class: "muted", text: "Review the real page, then submit it yourself — AYN never clicks submit for you." }));
    const closeBtn = el("button", { class: "btn btn-ghost", text: "Done", style: "width:100%" });
    closeBtn.addEventListener("click", closePanel);
    body.appendChild(closeBtn);
    panel.appendChild(body);
  }

  async function start() {
    const session = await ensureSession();
    if (!session) return showSignIn();
    return autofill(session);
  }

  start();
})();
