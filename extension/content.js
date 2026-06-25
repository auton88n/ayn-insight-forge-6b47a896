// AYN Autofill — content script
// 1) Detect form fields and autofill them via AYN AI
// 2) Save the current job page to AYN
// Site adapters tweak detection for known ATS forms.

(function () {
  if (window.__ayn_loaded) return;
  window.__ayn_loaded = true;

  // -------- helpers --------
  function labelFor(input) {
    if (input.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (lbl) return lbl.innerText.trim();
    }
    if (input.getAttribute("aria-label")) return input.getAttribute("aria-label");
    if (input.getAttribute("aria-labelledby")) {
      const ref = document.getElementById(input.getAttribute("aria-labelledby"));
      if (ref) return ref.innerText.trim();
    }
    const wrapLbl = input.closest("label");
    if (wrapLbl) return wrapLbl.innerText.trim();
    if (input.placeholder) return input.placeholder;
    // Walk up to a containing element that has visible text
    let el = input.parentElement;
    let hops = 0;
    while (el && hops++ < 3) {
      const txt = el.innerText?.trim();
      if (txt && txt.length < 120) return txt;
      el = el.parentElement;
    }
    return input.name || "";
  }

  function collectFields() {
    const fields = [];
    const elements = document.querySelectorAll("input, textarea, select");
    elements.forEach((el, idx) => {
      if (el.type === "hidden" || el.type === "submit" || el.type === "button") return;
      if (el.type === "password") return;
      if (el.disabled || el.readOnly) return;
      // ignore tiny / hidden inputs
      const rect = el.getBoundingClientRect();
      if (rect.width < 5 || rect.height < 5) return;

      const fid = `ayn_f_${idx}`;
      el.setAttribute("data-ayn-id", fid);
      const f = { id: fid, label: labelFor(el).slice(0, 200), type: el.type || el.tagName.toLowerCase() };
      if (el.tagName === "SELECT") {
        f.options = Array.from(el.options).map((o) => o.text);
      }
      fields.push(f);
    });
    return fields;
  }

  function applyValue(el, value) {
    if (!el || value == null || value === "") return false;
    try {
      if (el.tagName === "SELECT") {
        const target = value.toLowerCase();
        const opt = Array.from(el.options).find((o) => o.text.toLowerCase().includes(target) || o.value.toLowerCase().includes(target));
        if (opt) {
          el.value = opt.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
        return false;
      }
      if (el.type === "checkbox" || el.type === "radio") {
        const truthy = /^(yes|true|on|1)$/i.test(value);
        if (truthy !== el.checked) {
          el.checked = truthy;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return true;
      }
      // Use native setter to play nice with React-controlled inputs
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (e) { console.warn("AYN apply failed", e); return false; }
  }

  async function autofillNow() {
    const fields = collectFields();
    if (fields.length === 0) {
      flash("No fillable fields found.");
      return { filled: 0 };
    }
    flash(`Asking AYN for ${fields.length} fields…`);
    const r = await chrome.runtime.sendMessage({ type: "ayn_call", action: "ext_autofill", payload: { fields } });
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

  async function saveJob() {
    flash("Saving job to AYN…");
    const text = (document.body.innerText || "").slice(0, 25000);
    const r = await chrome.runtime.sendMessage({
      type: "ayn_call", action: "ext_ingest_job",
      payload: { source_url: location.href, text, html: document.documentElement.outerHTML.slice(0, 80000) },
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
      n.style.cssText = "position:fixed;bottom:24px;right:24px;background:#0f172a;color:#fff;padding:10px 14px;border-radius:8px;font:13px/1.4 system-ui,sans-serif;z-index:2147483647;box-shadow:0 6px 24px rgba(0,0,0,.3);max-width:280px;";
      document.body.appendChild(n);
    }
    n.textContent = "AYN: " + msg;
    clearTimeout(n.__t);
    n.__t = setTimeout(() => { n?.remove(); }, 3500);
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
