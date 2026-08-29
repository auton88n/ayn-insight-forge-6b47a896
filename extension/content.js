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
  let fieldRegistry = new Map();

  function visible(el) {
    return el.offsetParent !== null || el.getClientRects().length > 0;
  }

  // Generic UI copy that occasionally ends up as a placeholder -- never a
  // real question, and showing it as one is actively misleading (worse
  // than showing nothing). Reported directly, a real screenshot: "Start
  // typing…" appeared in AYN's own summary as if it were the field's
  // actual question.
  const GENERIC_PLACEHOLDER = /^(start typing|select|choose|search|type here)/i;

  function siblingText(node, hops) {
    let n = node, h = 0;
    while (n && h < hops) {
      const t = n.textContent?.trim();
      if (t && t.length < 200) return t;
      n = n.previousElementSibling; h++;
    }
    return "";
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
    const direct = siblingText(el.previousElementSibling, 3);
    if (direct) return direct;
    // v3.280.0 -- an ancestor-climbing fallback was tried here for deeply
    // nested combobox widgets (react-select and similar, common on
    // Ashby), and caught by testing it directly against a real DOM before
    // shipping: it can walk past the actual field's own container and
    // pick up a DIFFERENT, nearby field's question instead -- confidently
    // wrong, which is worse than this field honestly coming back
    // unlabeled. Removed rather than shipped; a genuinely unlabeled field
    // now stays unlabeled (see extractFields' own fallback text) instead
    // of risking a mismatched label.
    if (el.placeholder && el.placeholder.trim() && !GENERIC_PLACEHOLDER.test(el.placeholder.trim())) {
      return el.placeholder.trim();
    }
    return "";
  }

  // v3.283.0 -- reported directly: a slider-style distance/radius filter
  // (unit toggle, live value label, step ticks, min/max bounds, a
  // custom-number override) doesn't belong on an application form to
  // begin with -- it's a SEARCH preference, the same category as "how
  // far are you willing to commute," not a fact AYN has a single right
  // answer for. The real, general point underneath it stands though:
  // a range/slider input is its own distinct control type, and AYN
  // should never try to write an arbitrary matched string into one --
  // unlike a text box, a slider's value is only ever meaningful as a
  // specific number within its own min/max, and there is no fact in a
  // profile that translates to "the correct point on this scale."
  // Recognized explicitly and always left for the person to set
  // themselves, the same honest treatment as a file attachment.
  // v3.285.0 -- a real, adoptable improvement: some ATS platforms build
  // their form widgets as real web components with a closed-off shadow
  // DOM, and a plain document.querySelectorAll never sees inside one --
  // that part of the form was silently invisible before this, the same
  // failure shape as the ARIA-radiogroup gap fixed earlier this session,
  // just for a different reason. Recurses into every OPEN shadow root
  // found anywhere in the tree (a genuinely closed shadow root -- mode:
  // "closed" -- is deliberately unreachable from outside its own
  // component by the platform itself; no page script, this extension
  // included, can see into one, which is a real, disclosed limit, not a
  // bug to chase).
  function queryDeep(root, selector) {
    const found = Array.from(root.querySelectorAll(selector));
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) found.push(...queryDeep(el.shadowRoot, selector));
    }
    return found;
  }

  function extractFields() {
    fieldRegistry = new Map();
    const out = [];
    const skipped = [];
    let n = 0;
    const seenRadioGroups = new Set();
    for (const el of queryDeep(document, "input, textarea, select")) {
      if (!visible(el) || el.disabled) continue;
      const type = (el.getAttribute("type") || el.tagName.toLowerCase()).toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) continue;

      if (type === "range") {
        skipped.push(labelFor(el) || "A slider or range control on this page");
        continue;
      }
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
      // A genuinely unlabeled field still needs a real, honest name in
      // the summary rather than a blank line -- never a guessed question.
      out.push({ id: fid, tag, type: tag === "select" ? "select" : tag === "textarea" ? "textarea" : type, required: !!el.required, label: labelFor(el) || "An unlabeled field on this page" });
    }

    // v3.282.0 -- reported directly, a real screenshot: a "Yes/No" legal
    // question (work authorization) rendered as a segmented button pair,
    // not a native <input type=radio>, so the scan above never saw it at
    // all -- silently invisible to the whole matching/fill pipeline, no
    // fill attempted, nothing reported either way. Custom toggle-button
    // widgets almost always carry the ARIA role= a real radio group needs
    // for accessibility even when they skip the native <input> element --
    // recognized here the same way a screen reader would.
    for (const group of queryDeep(document, '[role="radiogroup"]')) {
      if (!visible(group)) continue;
      const options = Array.from(group.querySelectorAll('[role="radio"]')).filter(visible);
      if (!options.length) continue;
      const groupName = `ayn-rg-${n++}`;
      const groupLabel = group.getAttribute("aria-label") || labelFor(group) || undefined;
      for (const opt of options) {
        const fid = `ayn-f-${n++}`;
        fieldRegistry.set(fid, opt);
        out.push({
          id: fid, tag: opt.tagName.toLowerCase(), type: "radio", required: false,
          label: (opt.getAttribute("aria-label") || opt.textContent || "").trim(),
          radioGroup: groupName, radioGroupLabel: groupLabel,
        });
      }
    }

    // v3.286.0 -- Radix Select / react-select-style custom dropdowns:
    // never a real <select>, so the native scan above never sees them --
    // a button/div carrying role="combobox" (the real, standard ARIA
    // pattern this kind of widget needs regardless of styling) is the
    // trigger. Its own listbox doesn't exist yet at extraction time
    // (comboboxes render their options lazily, on open), so only the
    // trigger is registered here -- fillCombobox does the actual open/
    // search/select/verify sequence at fill time.
    for (const trigger of queryDeep(document, '[role="combobox"]')) {
      if (!visible(trigger) || trigger.getAttribute("aria-disabled") === "true") continue;
      const fid = `ayn-f-${n++}`;
      fieldRegistry.set(fid, trigger);
      out.push({ id: fid, tag: trigger.tagName.toLowerCase(), type: "select", required: false, label: labelFor(trigger) || "An unlabeled field on this page" });
    }
    return { fields: out, skipped };
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
    // v3.285.0 -- a real, adoptable improvement: some React versions track
    // an input's "last known value" on a private _valueTracker property
    // and compare against IT (not just the DOM value) to decide whether a
    // change is real -- the native-setter trick above can still get
    // silently reverted on next render if this isn't also updated to
    // match, since React sees its own tracked value as already current.
    if (el._valueTracker) el._valueTracker.setValue(value);
    // v3.286.0 -- a real, adoptable improvement: some forms only run
    // their own field-level validation (the check that decides whether
    // a "Next"/"Continue" button is enabled) on blur, not on input --
    // dispatching focus first and blur after mirrors what actually
    // happens during a real click-into-then-tab-out-of interaction.
    el.dispatchEvent(new Event("focus", { bubbles: true }));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  // v3.281.0 -- reported directly, a real screenshot: "Please list your
  // highest level of education achieved?" (a real <select> dropdown)
  // showed as "not on file" even with the resolver fixed to actually
  // answer it (see the backend's own applicationAnswers.ts). Root cause
  // here: a <select>'s real, valid values are its own <option> values,
  // which almost never match a plain resolved string exactly ("Bachelor's"
  // vs an option literally reading "Bachelor's Degree") -- setting
  // el.value to a non-matching string is a silent no-op in every browser.
  // Fields registered as a real <select> now match against that select's
  // own actual option text (exact, then substring) and select the real
  // matching option -- never an invented one, and correctly reported as
  // failed if genuinely no option matches.
  // A boolean-shaped stored answer ("Yes"/"No"/"true"/"false") -- the
  // resolver has never had a reason to write anything else for a
  // checkbox-shaped question.
  function isAffirmative(value) {
    return /^(yes|true|1|on|checked)$/i.test(value.trim());
  }

  // v3.286.0 -- Radix Select / react-select-style widgets: not a real
  // <select>, a button/div with role="combobox" that opens a real
  // role="listbox" popup on click. Scoped correctly on purpose -- via
  // the trigger's own aria-controls, the standard ARIA link to ITS
  // listbox -- never a bare, page-wide search for "any [role=option] or
  // <li>", which could click something on the page that has nothing to
  // do with this field at all. Waits for the popup by actually checking
  // for it (polled, short interval) rather than a fixed guessed delay,
  // which is exactly the kind of timing assumption that silently breaks
  // on a slower render. Verified afterward by re-reading the trigger's
  // own displayed text, not just trusted because a click happened.
  async function fillCombobox(el, value) {
    const wanted = value.trim().toLowerCase();
    el.click();
    const listboxId = el.getAttribute("aria-controls");
    let listbox = null;
    for (let i = 0; i < 15 && !listbox; i++) {
      listbox = listboxId ? document.getElementById(listboxId) : document.querySelector('[role="listbox"]');
      if (!listbox) await new Promise((r) => setTimeout(r, 100));
    }
    if (!listbox) return { ok: false };
    const options = Array.from(listbox.querySelectorAll('[role="option"]'));
    const match = options.find((o) => o.textContent.trim().toLowerCase() === wanted)
      || options.find((o) => o.textContent.trim().toLowerCase().includes(wanted) || wanted.includes(o.textContent.trim().toLowerCase()));
    if (!match) {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return { ok: false };
    }
    match.click();
    await new Promise((r) => setTimeout(r, 100));
    const landed = match.getAttribute("aria-selected") === "true"
      || (el.textContent || "").trim().toLowerCase().includes(match.textContent.trim().toLowerCase());
    return { ok: landed };
  }

  async function fillTextLike(fid, value) {
    const el = fieldRegistry.get(fid);
    if (!el) return { ok: false };
    if (el.getAttribute("role") === "combobox") return fillCombobox(el, value);
    // v3.286.0 -- checked against a real DOM before shipping, not assumed:
    // setNativeValue's HTMLInputElement setter writes to a checkbox's own
    // .value attribute, which browsers keep and read back as a real
    // string ("Yes") completely independent of .checked -- meaning the
    // old code's read-back check (el.value === value) could report a
    // checkbox as successfully filled while it stayed genuinely unchecked
    // on the real page the whole time. Checkboxes were never actually
    // matched by the backend before this (a disclosed limit), but nothing
    // stopped a caller from reaching this path, and it would have lied
    // about the outcome if one had.
    if (el.type === "checkbox") {
      const want = isAffirmative(value);
      if (el.checked !== want) el.click();
      return { ok: el.checked === want };
    }
    if (el.tagName === "SELECT") {
      const wanted = value.trim().toLowerCase();
      const opts = Array.from(el.options);
      const match = opts.find((o) => o.textContent.trim().toLowerCase() === wanted)
        || opts.find((o) => o.textContent.trim().toLowerCase().includes(wanted) || wanted.includes(o.textContent.trim().toLowerCase()));
      if (!match) return { ok: false };
      setNativeValue(el, match.value);
      return { ok: el.value === match.value };
    }
    setNativeValue(el, value);
    return { ok: el.value === value };
  }
  function fillRadio(fid) {
    const el = fieldRegistry.get(fid);
    if (!el) return { ok: false };
    // A real <input type=radio> has a checked property to verify against;
    // a custom [role="radio"] button (see extractFields' own ARIA scan)
    // does not -- a real .click() (not a synthetic dispatched event,
    // which many custom components' own onClick handlers don't reliably
    // react to) is both how it's activated and, via aria-checked/
    // aria-pressed, how a real selection is confirmed afterward.
    if (el.tagName === "INPUT") {
      el.checked = true;
      el.dispatchEvent(new Event("click", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: el.checked };
    }
    el.click();
    const state = el.getAttribute("aria-checked") || el.getAttribute("aria-pressed");
    return { ok: state === "true" };
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
  function watchForNewFields(session) {
    if (liveObserver) liveObserver.disconnect();
    const knownEls = new Set(fieldRegistry.values());
    let debounce = null;
    liveObserver = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const nowVisible = queryDeep(document, "input, textarea, select").filter((e) => visible(e) && !e.disabled);
        const hasNew = nowVisible.some((e) => !knownEls.has(e));
        if (!hasNew) return;
        liveObserver.disconnect();
        const notice = el("div", { style: "padding: 10px 20px; background: #efe6db; font-size: 13.5px; color: #1f1a17; display: flex; align-items: center; justify-content: space-between; gap: 10px;" }, [
          el("span", { text: "New fields appeared on this page." }),
          el("button", { class: "btn btn-primary", text: "Fill them too", style: "padding: 6px 14px; font-size: 13px;", onclick: () => autofill(session) }),
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
      const r = await fillTextLike(m.fieldId, value);
      if (r.ok) {
        filledCount++;
        if (LEGAL_SENSITIVE.test(m.label)) legalFilled.push({ label: m.label, answer: value });
      } else {
        failed.push(m.label);
      }
    }
    for (const r of radioRows) {
      if (!r.chosenFieldId) { notOnFile.push(r.groupLabel); continue; }
      const res = fillRadio(r.chosenFieldId);
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
      const box = el("div", { style: "border: 1.5px solid #9a5348; border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; background: #fdf1ee;" });
      box.appendChild(el("p", { class: "warn", text: "Double-check these before submitting — work authorization/eligibility answers matter:", style: "margin: 0 0 6px; font-weight: 700;" }));
      const ul = el("ul", { style: "margin: 0; padding-left: 20px; font-size: 14.5px; line-height: 1.7; color: #1f1a17;" });
      for (const f of legalFilled) {
        const li = el("li", {});
        li.appendChild(el("span", { text: `${f.label}: `, style: "color: #7a6d61;" }));
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
            const inputEl = fieldRegistry.get(f.id);
            const r = inputEl ? await attachResumeFile(session, inputEl) : { ok: false, reason: "Field no longer on the page." };
            if (r.ok) { btn.textContent = "Attached ✓"; btn.style.background = "#2f6b52"; }
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
    body.appendChild(el("p", { class: "muted", text: "Review the real page, then submit it yourself — AYN never clicks submit for you." }));
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
