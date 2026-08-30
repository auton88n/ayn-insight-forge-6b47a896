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

  // Builds a real resume PDF from the person's own AYN profile (via the
  // vendored, ported resumeDocs.js -- see its own header comment) and
  // attaches it to a real <input type=file> the same way a person
  // dragging a file in would -- DataTransfer is the only real, working
  // way to set a file input's value from script, not blocked by browser
  // security the way an older assumption held. Read back afterward
  // (input.files.length, the real name) rather than trusted blind.
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
    const file = new File([blob], name, { type: "application/pdf" });
    const dt = new DataTransfer();
    dt.items.add(file);
    inputEl.files = dt.files;
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    const landed = inputEl.files.length === 1 && inputEl.files[0].name === name;
    return { ok: landed };
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
  style.textContent = `
    * { box-sizing: border-box; }
    .panel { width: min(384px, 100vw); height: 100vh; background: #ffffff; color: #191919;
      border-left: 1px solid #ececec; box-shadow: -12px 0 32px -18px rgba(0,0,0,0.18);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 14px; line-height: 1.55; display: flex; flex-direction: column; }
    .head { padding: 16px 20px; display: flex; align-items: center; justify-content: space-between;
      border-bottom: 1px solid #f0f0f0; flex-shrink: 0; }
    .head-left { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
    .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #e85d3a; flex-shrink: 0; }
    .head b { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; color: #191919; }
    .head-title { font-size: 13px; font-weight: 500; color: #8a8a8a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .close { cursor: pointer; background: none; border: none; color: #9a9a9a; font-size: 17px; line-height: 1;
      padding: 5px; border-radius: 7px; flex-shrink: 0; }
    .close:hover { background: #f5f5f5; color: #191919; }
    .body { padding: 20px; overflow-y: auto; flex: 1; }
    .row { margin-bottom: 14px; }
    label.field-label { display: block; font-size: 12.5px; color: #8a8a8a; margin-bottom: 6px; font-weight: 500; }
    input { width: 100%; padding: 10px 12px; border-radius: 8px;
      border: 1px solid #e2e2e2; font-size: 14px; background: #fff; color: #191919; }
    input:focus { outline: none; border-color: #e85d3a; box-shadow: 0 0 0 3px rgba(232,93,58,0.12); }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 16px;
      border-radius: 8px; border: none; font-weight: 500; font-size: 14px; cursor: pointer; }
    .btn-primary { background: #e85d3a; color: #fff; }
    .btn-primary:hover:not(:disabled) { background: #d54e2c; }
    .btn-primary:disabled { opacity: 0.5; cursor: default; }
    .btn-ghost { background: #f5f5f5; color: #191919; }
    .btn-ghost:hover { background: #ececec; }
    .muted { color: #6f6f6f; font-size: 13.5px; line-height: 1.6; margin: 0 0 12px; }
    .warn { color: #b0392a; font-size: 13.5px; line-height: 1.6; margin: 0 0 12px; }
    .ok { color: #191919; font-size: 15px; font-weight: 600; line-height: 1.5; margin: 0 0 14px; }
    ul.fail-list { margin: 0 0 12px; padding-left: 18px; color: #8a8a8a; font-size: 13.5px; line-height: 1.75; }
    .callout { border-left: 2.5px solid #d9534f; padding: 2px 0 2px 12px; margin: 0 0 14px; }
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
    const left = el("div", { class: "head-left" }, [
      el("span", { class: "dot" }),
      el("b", { text: "AYN" }),
      el("span", { class: "head-title", text: title }),
    ]);
    return el("div", { class: "head" }, [left, el("button", { class: "close", text: "×", onclick: closePanel })]);
  }
  function clearPanel() { panel.innerHTML = ""; }
  let liveObserver = null;
  function closePanel() {
    if (liveObserver) { liveObserver.disconnect(); liveObserver = null; }
    host.remove();
  }

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
        const notice = el("div", { style: "padding: 10px 20px; background: #f7f7f7; border-top: 1px solid #efefef; font-size: 13.5px; color: #191919; display: flex; align-items: center; justify-content: space-between; gap: 10px;" }, [
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
    const { fields, skipped } = extractFields();

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
      panel.appendChild(buildHead("No form found"));
      panel.appendChild(el("div", { class: "body" }, [el("p", { class: "muted", text: "Couldn't find a fillable application form on this page." })]));
      return;
    }
    if (!fields.length) {
      // Only slider/range-type controls found -- nothing here for AYN to
      // fill (see extractFields' own note: a slider's value is a
      // preference, never a fact to guess), but real, so say so plainly
      // rather than a generic "no form found."
      clearPanel();
      panel.appendChild(buildHead("Nothing to autofill here"));
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
    const legalFilled = []; // { label, answer } -- verified separately, always
    let filledCount = 0;

    // v3.282.0 -- a wrong or unconfirmed answer to a work-authorization/
    // sponsorship/age-eligibility question is a real, serious mistake on
    // a real application, not just an inconvenience -- these get called
    // out on their own, by name, with the exact answer filled, instead of
    // blending into the generic "N fields filled" line. Matched on the
    // label's own wording, the same class of phrasing the backend's own
    // KNOWN_QUESTIONS resolvers look for.
    const LEGAL_SENSITIVE = /sponsor|work.{0,15}authoriz|legally (eligible|authorized)|visa status|\b18 years|legal drinking age/i;

    for (const m of [...idRows, ...ansRows]) {
      const value = m.value ?? m.answer ?? "";
      if (!value) { notOnFile.push(m.label); continue; }
      const r = await fillTextLikeAny(m.fieldId, value, m.label);
      if (r.ok) {
        filledCount++;
        if (LEGAL_SENSITIVE.test(m.label)) legalFilled.push({ label: m.label, answer: value });
      } else {
        failed.push(m.label);
      }
    }
    for (const r of radioRows) {
      if (!r.chosenFieldId) { notOnFile.push(r.groupLabel); continue; }
      const res = await fillRadioAny(r.chosenFieldId);
      if (res.ok) {
        filledCount++;
        if (LEGAL_SENSITIVE.test(r.groupLabel || "")) legalFilled.push({ label: r.groupLabel, answer: r.chosenOptionLabel });
      } else {
        failed.push(r.groupLabel);
      }
    }

    clearPanel();
    panel.appendChild(buildHead("Filled"));
    const body = el("div", { class: "body" });
    body.appendChild(el("p", { class: "ok", text: `${filledCount} field${filledCount === 1 ? "" : "s"} filled from your AYN profile.` }));

    if (legalFilled.length) {
      const box = el("div", { class: "callout" });
      box.appendChild(el("p", { class: "warn", text: "Double-check these before submitting — work authorization/eligibility answers matter:", style: "margin: 0 0 6px; font-weight: 600;" }));
      const ul = el("ul", { style: "margin: 0; padding-left: 18px; font-size: 13.5px; line-height: 1.7; color: #191919;" });
      for (const f of legalFilled) {
        const li = el("li", {});
        li.appendChild(el("span", { text: `${f.label}: `, style: "color: #8a8a8a;" }));
        li.appendChild(el("b", { text: f.answer || "" }));
        ul.appendChild(li);
      }
      box.appendChild(ul);
      body.appendChild(box);
    }

    const stillNeeded = [...notOnFile, ...failed];
    if (stillNeeded.length) {
      body.appendChild(el("p", { class: "warn", text: "Not on file yet — fill these directly on the page:" }));
      const ul = el("ul", { class: "fail-list" });
      for (const f of stillNeeded) ul.appendChild(el("li", { text: f }));
      body.appendChild(ul);
    }
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
    // "click submit."
    const NOT_RESUME_FIELD = /cover\s*letter|portfolio|writing\s*sample|work\s*sample|transcript|reference|id\b|passport|visa|photo|headshot|video|w-?2|w-?4|i-?9|1099/i;
    if (fileRows.length) {
      body.appendChild(el("p", { class: "warn", text: `${fileRows.length} file field${fileRows.length > 1 ? "s" : ""} to attach:` }));
      for (const f of fileRows) {
        const isResumeField = !NOT_RESUME_FIELD.test(f.label);
        const row = el("div", { style: "display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px;" });
        row.appendChild(el("span", { text: f.label, style: "font-size: 14px;" }));
        if (isResumeField) {
          const btn = el("button", { class: "btn btn-primary", text: "Attach my resume", style: "padding: 7px 14px; font-size: 13px; flex-shrink: 0;" });
          btn.addEventListener("click", async () => {
            btn.disabled = true; btn.textContent = "Attaching…";
            const inputEl = fieldRegistry_().get(f.id);
            const r = inputEl ? await attachResumeFile(session, inputEl) : { ok: false, reason: "Field no longer on the page." };
            if (r.ok) { btn.textContent = "Attached ✓"; btn.style.background = "#1f8f52"; }
            else { btn.disabled = false; btn.textContent = "Try again"; btn.title = r.reason || ""; }
          });
          row.appendChild(btn);
        } else {
          row.appendChild(el("span", { text: "Attach yourself", class: "muted", style: "font-size: 12.5px; margin: 0;" }));
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
    body.appendChild(el("p", { class: "muted", text: "Review the real page, then submit it yourself — AYN never clicks submit for you." }));

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
        row.appendChild(el("span", { text: c.label, style: "font-size: 13px; color: #191919; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%;" }));
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

    // v3.296.0 -- a real, explicit, opt-in diagnostics channel: sends a
    // structured summary of this exact run straight to AYN's own
    // backend, so it can be read directly rather than relayed by hand.
    // Deliberately built from the SAME data already on screen above --
    // never re-reads the page, never includes a filled VALUE (only
    // labels, kinds, structural widget signatures, and success/failure),
    // and only ever sends when this button is clicked, never silently.
    const diagBtn = el("button", { class: "btn btn-ghost", text: "Send diagnostics to AYN", style: "width:100%; margin-bottom: 8px; font-size: 12.5px;" });
    diagBtn.addEventListener("click", async () => {
      diagBtn.disabled = true; diagBtn.textContent = "Sending…";
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
        };
        await callHub(session, {
          action: "ext_diag_report",
          pageHostname: location.hostname,
          pagePathname: location.pathname,
          report,
        });
        diagBtn.textContent = "Sent ✓";
      } catch (e) {
        diagBtn.disabled = false;
        diagBtn.textContent = "Couldn't send — try again";
      }
    });
    body.appendChild(diagBtn);

    const closeBtn = el("button", { class: "btn btn-ghost", text: "Done", style: "width:100%" });
    closeBtn.addEventListener("click", closePanel);
    body.appendChild(closeBtn);
    panel.appendChild(body);
    watchForNewFields(session);
  }

  async function start() {
    const session = await ensureSession();
    if (!session) return showSignIn();
    return autofill(session);
  }

  start();
})();
