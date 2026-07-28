/**
 * extension/content.entry.js
 * Bridge between the Universal Question Engine and the legacy content script.
 * Runs at document_idle in every frame; exposes the engine's Question[] via
 * window.__AYN_QUESTIONS__ and dispatches "ayn:questions-ready".
 *
 * v2.4 upgrades wired here:
 *   1. Decision loop     -> window.__AYN_DECISION_LOOP__
 *   2. Learning memory   -> window.__AYN_LEARNING__ (routed via ext-memory fn)
 *   3. Vision discovery  -> window.__AYN_VISION_DISCOVER__ + setVisionProvider
 * All transports are best-effort; failures never break the base scanner.
 */
import {
  scanForm,
  observeForm,
  projectToLegacy,
  setVisionProvider,
  setLearningEngine,
  createVisionProvider,
  createDecisionLoop,
  findVisualDeadZones,
  classifyFailure,
  questionSignature,
} from "./question-engine/index";

const SUPABASE_URL = "https://dfkoxuokfkttjhfjcecx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw";
const FN_MEMORY = `${SUPABASE_URL}/functions/v1/ext-memory`;

// v2.11.0 — retry and vision now route through background.js so the
// authenticated extension token stays out of the content-script bundle.
// The old shared "x-proxy-secret" shipped inside the public zip and was
// removed. If chrome.runtime is unavailable (e.g. detached test frame),
// the request is skipped rather than sent unauthenticated.
function bgSend(type, payload) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
        return reject(new Error("no_runtime"));
      }
      chrome.runtime.sendMessage({ type, payload }, (resp) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!resp || !resp.ok) return reject(new Error((resp && resp.error) || "bg_error"));
        resolve(resp.data);
      });
    } catch (e) {
      reject(e);
    }
  });
}


(function initAynEngineBridge() {
  if (window.__AYN_ENGINE_BRIDGE_V2__) return;
  window.__AYN_ENGINE_BRIDGE_V2__ = true;

  let _emitGuardPending = false;

  // v2.5.4 — always hold an empty scan that arrives after a populated one.
  // Previously we only held when no recheck was already pending, so a second
  // empty scan that arrived while the first recheck timer was still running
  // fell through and overwrote the good data. Now the hold is unconditional:
  // any empty result keeps the previous result until a recheck finally shows
  // the form is genuinely gone (prevHadContent becomes false).
  const emit = (questions) => {
    try {
      const prev = window.__AYN_QUESTIONS__;
      const prevHadContent = Array.isArray(prev) && prev.length > 0;
      if (questions.length === 0 && prevHadContent) {
        if (!_emitGuardPending) {
          _emitGuardPending = true;
          setTimeout(() => {
            _emitGuardPending = false;
            try {
              const recheck = scanForm(document);
              emit(recheck); // if THIS is also empty, prevHadContent may now be
                              // false (nothing to protect) or another hold cycle
                              // starts — either way it converges, never overwrites
                              // blindly.
            } catch (_) {}
          }, 350);
        }
        console.warn("[AYN][engine-bridge] empty scan after a populated one — holding previous result");
        return; // ALWAYS do not overwrite here, whether or not a recheck is pending
      }
      window.__AYN_QUESTIONS__ = questions;
      window.__AYN_QUESTIONS_LEGACY__ = questions.map(projectToLegacy);
      window.dispatchEvent(
        new CustomEvent("ayn:questions-ready", {
          detail: {
            count: questions.length,
            frame: window.top === window ? "top" : (location && location.href) || "frame",
          },
        })
      );
    } catch (e) {
      console.warn("[AYN][engine-bridge] emit failed", e);
    }
  };

  const runOnce = () => {
    try { emit(scanForm(document)); }
    catch (e) { console.warn("[AYN][engine-bridge] scan failed", e); }
  };

  // ────────────────────────────────────────────────────────────
  //  Reload-snapshot: some ATS forms perform a genuine full page
  //  reload mid-fill (bot-detection). In-memory state is wiped,
  //  so persist verified answers to chrome.storage.local keyed by
  //  the current URL, then restore them on startup.
  // ────────────────────────────────────────────────────────────
  // v2.5.7 — normalized key (origin + pathname). Iframes never save or restore.
  const SNAPSHOT_KEY = `ayn_reload_snapshot:${location.origin}${location.pathname}`;
  const IS_TOP_FRAME = (() => { try { return window.top === window; } catch (_) { return false; } })();
  const buildSnapshot = () => {
    try {
      const qs = window.__AYN_QUESTIONS__;
      const answers = [];
      if (Array.isArray(qs) && qs.length) {
        for (const q of qs) {
          if (!q || !q.answer) continue;
          // If verified is present, require it to be successful.
          // If not yet verified, accept the answer optimistically.
          if (q.verified && q.verified.verified === false) continue;
          try {
            answers.push({
              signature: questionSignature(q),
              value: q.answer.value,
              optionLabel: q.answer.optionLabel,
              optionLabels: q.answer.optionLabels,
            });
          } catch (_) {}
        }
      }
      if (!answers.length) {
        const injected = window.__AYN_LAST_INJECTED_VALUES__;
        if (Array.isArray(injected) && injected.length) {
          for (const v of injected) {
            if (!v || !v.id || v.skip) continue;
            const hasValue = v.value != null || v.optionValue != null || v.optionLabel != null || (Array.isArray(v.optionValues) && v.optionValues.length) || (Array.isArray(v.optionLabels) && v.optionLabels.length);
            if (!hasValue) continue;
            try {
              answers.push({
                id: v.id,
                _frame: v._frame,
                value: v.value,
                optionValue: v.optionValue,
                optionLabel: v.optionLabel,
                optionValues: v.optionValues,
                optionLabels: v.optionLabels,
                source: "injected-values",
              });
            } catch (_) {}
          }
        }
      }
      if (!answers.length) return null;
      return { url: location.href, savedAt: Date.now(), answers };
    } catch { return null; }
  };
  const saveReloadSnapshot = () => {
    if (!IS_TOP_FRAME) return; // v2.5.7 — only top frame persists
    try {
      const snap = buildSnapshot();
      if (!snap) {
        console.log("[AYN][engine-bridge] snapshot save skipped — no answered questions yet");
        return;
      }
      chrome.storage.local.set({ [SNAPSHOT_KEY]: snap }, () => {
        try {
          if (chrome.runtime.lastError) {
            console.warn("[AYN][engine-bridge] snapshot save failed:", chrome.runtime.lastError.message);
            return;
          }
          console.log("[AYN][engine-bridge] snapshot saved:", snap.answers.length, "answers, key=", SNAPSHOT_KEY);
        } catch (_) {}
      });
    } catch (_) {}
  };
  try { if (IS_TOP_FRAME) window.addEventListener("beforeunload", saveReloadSnapshot); } catch (_) {}
  try {
    setInterval(() => {
      try {
        if (document.visibilityState === "visible") saveReloadSnapshot();
      } catch (_) {}
    }, 5000);
  } catch (_) {}

  // Startup: restore a fresh (<2min) snapshot for this exact URL, expose
  // via window.__AYN_RESTORED_ANSWERS__, then delete so it's one-shot.
  // Startup: only the top frame reads the snapshot. Iframes (reCAPTCHA, etc.)
  // never had a matching key and only produced noisy "found=false" logs.
  if (!IS_TOP_FRAME) {
    window.__AYN_RESTORED_ANSWERS__ = null;
  } else try {
    chrome.storage.local.get([SNAPSHOT_KEY], (data) => {
      try {
        if (chrome.runtime.lastError) {
          console.warn("[AYN][engine-bridge] snapshot lookup failed:", chrome.runtime.lastError.message);
        }
        const snap = data && data[SNAPSHOT_KEY];
        console.log("[AYN][engine-bridge] snapshot lookup for key=", SNAPSHOT_KEY, "found=", !!snap, snap ? { url: snap.url, age_ms: Date.now() - (snap.savedAt||0), count: (snap.answers||[]).length } : null);
        // v2.5.7 — match by normalized pathname, not full href.
        const snapPath = snap && snap.url ? (() => { try { const u = new URL(snap.url); return u.origin + u.pathname; } catch { return ''; } })() : '';
        const curPath = location.origin + location.pathname;
        if (
          snap && snapPath === curPath &&
          Array.isArray(snap.answers) && snap.answers.length &&
          (Date.now() - (snap.savedAt || 0)) < 120000
        ) {
          window.__AYN_RESTORED_ANSWERS__ = snap.answers;
          console.log("[AYN][engine-bridge] restored", snap.answers.length, "answers from reload snapshot");
        } else {
          window.__AYN_RESTORED_ANSWERS__ = null;
        }
        try { chrome.storage.local.remove(SNAPSHOT_KEY); } catch (_) {}
      } catch (_) {}
    });
  } catch (_) { window.__AYN_RESTORED_ANSWERS__ = null; }

  setTimeout(runOnce, 0);

  try {
    observeForm(
      document,
      (delta) => {
        if (
          window.__AYN_QUESTIONS__ &&
          !delta.added.length && !delta.changed.length && !delta.removedIds.length
        ) return;
        try { emit(scanForm(document)); } catch (_) {}
      },
      { debounceMs: 200 }
    );
  } catch (e) {
    console.warn("[AYN][engine-bridge] observe failed", e);
  }


  // ────────────────────────────────────────────────────────────
  //  Helpers shared by the three v2.4 subsystems
  // ────────────────────────────────────────────────────────────

  const getExtToken = () =>
    new Promise((resolve) => {
      try {
        chrome.storage.local.get(["ayn_token"], (d) => resolve((d && d.ayn_token) || null));
      } catch { resolve(null); }
    });

  // Cached SnapDOM module. Loaded once via chrome.runtime.getURL so the
  // extension's bundled vendor copy is used. SnapDOM replaces html2canvas:
  // faster, and handles Shadow DOM / custom Web Components (Ashby, Workday
  // custom controls) that html2canvas is known to miss.
  let _snapdomPromise = null;
  const loadSnapdom = () => {
    if (_snapdomPromise) return _snapdomPromise;
    _snapdomPromise = (async () => {
      try {
        const url = chrome.runtime.getURL("vendor/snapdom.esm.js");
        const mod = await import(url);
        return mod.snapdom || mod.default || null;
      } catch { return null; }
    })();
    return _snapdomPromise;
  };

  const screenshotElement = async (el) => {
    const snapdom = await loadSnapdom();
    if (!snapdom) return "";
    try {
      const img = await snapdom.toPng(el, {
        backgroundColor: "#ffffff",
        scale: 0.75,
      });
      // snapdom.toPng returns an HTMLImageElement whose src is a data URL.
      const src = img && img.src ? img.src : "";
      const b64 = src.split(",")[1] || "";
      if (b64) return b64;
      // Fallback path in case this build's API returns a canvas instead.
      if (typeof snapdom.toCanvas === "function") {
        const canvas = await snapdom.toCanvas(el, { backgroundColor: "#ffffff", scale: 0.75 });
        return (canvas.toDataURL("image/png").split(",")[1]) || "";
      }
      return "";
    } catch { return ""; }
  };

  // ────────────────────────────────────────────────────────────
  //  Part 2 — learning memory (routed through ext-memory edge fn)
  // ────────────────────────────────────────────────────────────
  try {
    const cache = new Map(); // sig -> row | null
    const memoryFetch = async (payload) => {
      const token = await getExtToken();
      if (!token) return null;
      try {
        const r = await fetch(FN_MEMORY, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            "x-ayn-ext-token": token,
          },
          body: JSON.stringify(payload),
        });
        if (!r.ok) return null;
        return await r.json();
      } catch { return null; }
    };

    const learning = {
      remember(q) {
        const a = q && q.answer;
        if (!a || a.skip) return;
        const sig = questionSignature(q);
        void memoryFetch({
          action: "remember",
          row: {
            question_signature: sig,
            canonical_label: q.label,
            semantic_type: q.semanticType,
            question_kind: q.kind,
            answer_value: a.value ?? null,
            answer_option_label: a.optionLabel ?? null,
            answer_option_labels: a.optionLabels ?? null,
          },
        });
      },
      lookup(q) {
        const sig = questionSignature(q);
        const row = cache.get(sig);
        if (row === undefined) {
          void memoryFetch({ action: "lookup", signature: sig }).then((res) => {
            cache.set(sig, (res && res.row) || null);
          });
          return null;
        }
        if (!row) return null;
        const trust = row.verified_ok_count / Math.max(1, row.verified_ok_count + row.verified_fail_count);
        if (trust < 0.5) return null;
        return {
          answer: {
            value: row.answer_value ?? undefined,
            optionLabel: row.answer_option_label ?? undefined,
            optionLabels: row.answer_option_labels ?? undefined,
            confidence: 0.6 + Math.min(0.3, (row.verified_ok_count || 0) * 0.03),
            reasoning: "learned_from_previous_fills",
          },
          confidence: 0.7,
          source: "memory",
        };
      },
      promote(q) {
        const sig = questionSignature(q);
        void memoryFetch({
          action: "remember",
          row: {
            question_signature: sig,
            canonical_label: q.label,
            semantic_type: q.semanticType,
            question_kind: q.kind,
            verified_ok_count: 1,
          },
        });
      },
      forget() { /* UI-driven; not called by engine */ },
      async recordVerified(q, verified, atsHint) {
        const a = q && q.answer;
        if (!a) return;
        const sig = questionSignature(q);
        cache.delete(sig);
        await memoryFetch({
          action: "remember",
          row: {
            question_signature: sig,
            canonical_label: q.label,
            semantic_type: q.semanticType,
            question_kind: q.kind,
            answer_value: a.value ?? null,
            answer_option_label: a.optionLabel ?? null,
            answer_option_labels: a.optionLabels ?? null,
            ats_hint: atsHint || null,
            verified_ok_count: verified ? 1 : 0,
            verified_fail_count: verified ? 0 : 1,
          },
        });
      },
      /**
       * Lightweight helper: look up an answer by a raw (label, kind, options)
       * shape. Used by content.js for legacy field descriptors that never
       * materialize into a full Question.
       */
      async lookupByShape(label, kind, options) {
        const sig = questionSignature({ label: label || "", kind: kind || "text", options: options || [] });
        if (cache.has(sig)) {
          const row = cache.get(sig);
          if (!row) return null;
          const trust = row.verified_ok_count / Math.max(1, row.verified_ok_count + row.verified_fail_count);
          return trust >= 0.5 ? row : null;
        }
        const res = await memoryFetch({ action: "lookup", signature: sig });
        const row = (res && res.row) || null;
        cache.set(sig, row);
        if (!row) return null;
        const trust = row.verified_ok_count / Math.max(1, row.verified_ok_count + row.verified_fail_count);
        return trust >= 0.5 ? row : null;
      },
    };
    setLearningEngine(learning);
    window.__AYN_LEARNING__ = learning;
  } catch (e) {
    console.warn("[AYN][engine-bridge] learning wire failed", e);
  }

  // ────────────────────────────────────────────────────────────
  //  Part 1 — decision loop
  // ────────────────────────────────────────────────────────────
  try {
    const loop = createDecisionLoop({
      transport: {
        retry: async (payload) => bgSend("AYN_FN_RETRY", payload),
      },
      maxRoundsPerField: 2,
      totalTimeBudgetMs: 8000,
    });
    window.__AYN_DECISION_LOOP__ = { loop, classifyFailure };
  } catch (e) {
    console.warn("[AYN][engine-bridge] decision loop wire failed", e);
  }

  // ────────────────────────────────────────────────────────────
  //  Part 3 — vision discovery
  // ────────────────────────────────────────────────────────────
  try {
    const discover = async (image_base64, context) =>
      bgSend("AYN_FN_VISION", { image_base64, image_mime: "image/png", context });
      maxRoundsPerField: 2,
      totalTimeBudgetMs: 8000,
    });
    window.__AYN_DECISION_LOOP__ = { loop, classifyFailure };
  } catch (e) {
    console.warn("[AYN][engine-bridge] decision loop wire failed", e);
  }

  // ────────────────────────────────────────────────────────────
  //  Part 3 — vision discovery
  // ────────────────────────────────────────────────────────────
  try {
    const discover = async (image_base64, context) => {
      const r = await fetch(FN_VISION, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-proxy-secret": PROXY_SECRET,
          "x-source": "ext",
        },
        body: JSON.stringify({ image_base64, image_mime: "image/png", context }),
      });
      if (!r.ok) throw new Error(`vision_${r.status}`);
      return r.json();
    };
    const provider = createVisionProvider({
      screenshot: screenshotElement,
      discover,
    });
    setVisionProvider(provider);
    window.__AYN_VISION_DISCOVER__ = {
      async run() {
        try {
          const detectedControls = new Set(
            (window.__AYN_QUESTIONS__ || [])
              .flatMap((q) => (q.controls || [])
                .map((c) => c && c.fid ? document.querySelector(`[data-ayn-fid="${String(c.fid).replace(/"/g, '\\"')}"]`) : null)
                .filter(Boolean))
              .map((n) => n.closest('fieldset,[role="group"],[role="radiogroup"],[class*="field"],[class*="question"]') || n)
          );
          const zones = findVisualDeadZones(document, detectedControls);
          if (!zones.length) return { zones: 0, questions: [] };
          const all = [];
          for (const zone of zones) {
            const b64 = await screenshotElement(zone);
            if (!b64) continue;
            try {
              const res = await discover(b64, { url: location.href });
              if (Array.isArray(res.questions)) all.push(...res.questions);
            } catch (_) {}
          }
          return { zones: zones.length, questions: all };
        } catch (e) {
          return { zones: 0, questions: [], error: String(e) };
        }
      },
    };
  } catch (e) {
    console.warn("[AYN][engine-bridge] vision wire failed", e);
  }
})();
