// AYN Autofill — content script
// 1) Detect form fields and autofill them via AYN AI
// 2) Save the current job page to AYN
// Works on standard HTML forms and React-controlled ATS forms.

(function () {
  if (window.__ayn_loaded) return;
  window.__ayn_loaded = true;

  // -------- helpers --------
  function labelFor(input) {
    if (input.id) {
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        if (lbl) return lbl.innerText.trim();
      } catch (_) {}
    }
    if (input.getAttribute && input.getAttribute("aria-label")) return input.getAttribute("aria-label");
    if (input.getAttribute && input.getAttribute("aria-labelledby")) {
      const ref = document.getElementById(input.getAttribute("aria-labelledby"));
      if (ref) return ref.innerText.trim();
    }
    const wrapLbl = input.closest && input.closest("label");
    if (wrapLbl) return wrapLbl.innerText.trim();
    if (input.placeholder) return input.placeholder;
    let el = input.parentElement;
    let hops = 0;
    while (el && hops++ < 4) {
      const txt = el.innerText && el.innerText.trim();
      if (txt && txt.length < 160) return txt;
      el = el.parentElement;
    }
    return (input.name || input.getAttribute("data-automation-id") || "").trim();
  }

  function visible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
  }

  function collectFields() {
    const fields = [];
    // Standard form controls
    const standard = document.querySelectorAll("input, textarea, select");
    standard.forEach((el, idx) => {
      if (el.type === "hidden" || el.type === "submit" || el.type === "button" || el.type === "password" || el.type === "file") return;
      if (el.disabled || el.readOnly) return;
      if (!visible(el)) return;

      const fid = `ayn_f_${idx}`;
      el.setAttribute("data-ayn-id", fid);
      const f = { id: fid, label: labelFor(el).slice(0, 200), type: el.type || el.tagName.toLowerCase(), name: el.name || "" };
      if (el.tagName === "SELECT") {
        f.options = Array.from(el.options).map((o) => o.text).filter(Boolean).slice(0, 50);
      }
      fields.push(f);
    });

    // Comboboxes / contenteditable (Workday, Greenhouse, Lever)
    const comboboxes = document.querySelectorAll('[role="combobox"], [contenteditable="true"], [role="textbox"]');
    comboboxes.forEach((el, idx) => {
      if (!visible(el)) return;
      if (el.hasAttribute("data-ayn-id")) return;
      const fid = `ayn_c_${idx}`;
      el.setAttribute("data-ayn-id", fid);
      fields.push({
        id: fid,
        label: labelFor(el).slice(0, 200),
        type: el.getAttribute("role") || "textbox",
        name: el.getAttribute("data-automation-id") || el.getAttribute("name") || "",
      });
    });

    return fields;
  }

  function setReactValue(el, value) {
    const isTextarea = el.tagName === "TEXTAREA";
    const proto = isTextarea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  }

  function applyValue(el, value) {
    if (!el || value == null || value === "") return false;
    try {
      // Scroll into view briefly so frameworks lazy-mount it
      try { el.scrollIntoView({ block: "center", behavior: "instant" }); } catch (_) {}

      if (el.tagName === "SELECT") {
        const target = String(value).toLowerCase();
        const opt = Array.from(el.options).find((o) => o.text.toLowerCase().includes(target) || o.value.toLowerCase().includes(target));
        if (opt) {
          el.value = opt.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
        return false;
      }
      if (el.type === "checkbox" || el.type === "radio") {
        const truthy = /^(yes|true|on|1)$/i.test(String(value));
        if (truthy !== el.checked) {
          el.checked = truthy;
          el.dispatchEvent(new Event("click", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return true;
      }
      if (el.isContentEditable) {
        el.focus();
        el.textContent = value;
        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: String(value) }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
        return true;
      }
      el.focus();
      setReactValue(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    } catch (e) { console.warn("AYN apply failed", e); return false; }
  }

  async function autofillNow() {
    const fields = collectFields();
    if (fields.length === 0) {
      flash("No fillable fields found on this page.");
      return { filled: 0 };
    }
    flash(`Asking AYN for ${fields.length} fields…`);
    const jobText = extractMainText();
    const r = await chrome.runtime.sendMessage({ type: "ayn_call", action: "ext_autofill", payload: { fields, jobText } });
    if (!r?.ok) { flash("Autofill error: " + (r?.error || "unknown")); return { filled: 0 }; }
    const values = r.data?.values || [];
    let filled = 0;
    values.forEach((v) => {
      if (!v.value) return;
      const el = document.querySelector(`[data-ayn-id="${v.id}"]`);
      if (applyValue(el, v.value)) filled++;
    });
    flash(`Filled ${filled}/${values.length} fields.`);
    return { filled, total: values.length };
  }

  function extractMainText() {
    const main = document.querySelector("main, article, [role=main], #content, .job-description, .posting");
    const src = main && main.innerText && main.innerText.length > 200 ? main : document.body;
    return (src.innerText || "").replace(/\s+\n/g, "\n").slice(0, 18000);
  }

  async function saveJob() {
    flash("Saving job to AYN…");
    const text = extractMainText();
    const r = await chrome.runtime.sendMessage({
      type: "ayn_call", action: "ext_ingest_job",
      payload: {
        source_url: location.href,
        text,
        html: document.documentElement.outerHTML.slice(0, 80000),
        title: document.title.slice(0, 200),
      },
    });
    if (!r?.ok) { flash("Save error: " + (r?.error || "unknown")); return null; }
    flash(r.data.deduped ? "Already saved." : "Saved!");
    return r.data;
  }

  function flash(msg) {
    let n = document.getElementById("__ayn_notify");
    if (!n) {
      n = document.createElement("div");
      n.id = "__ayn_notify";
      n.style.cssText = "position:fixed;bottom:24px;right:24px;background:#0f172a;color:#fff;padding:10px 14px;border-radius:8px;font:13px/1.4 system-ui,sans-serif;z-index:2147483647;box-shadow:0 6px 24px rgba(0,0,0,.3);max-width:320px;";
      document.body.appendChild(n);
    }
    n.textContent = "AYN: " + msg;
    clearTimeout(n.__t);
    n.__t = setTimeout(() => { n?.remove(); }, 4500);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (msg.type === "ayn_autofill_now") { sendResponse(await autofillNow()); }
      else if (msg.type === "ayn_save_job_from_page") { sendResponse(await saveJob()); }
      else if (msg.type === "ayn_collect_fields") { sendResponse({ ok: true, count: collectFields().length }); }
      else sendResponse({ ok: false });
    })();
    return true;
  });
})();
