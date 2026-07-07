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
const PROXY_SECRET = "ayn-proxy-2024";
const FN_RETRY = `${SUPABASE_URL}/functions/v1/ext-fill-form-retry`;
const FN_VISION = `${SUPABASE_URL}/functions/v1/ext-vision-discover`;
const FN_MEMORY = `${SUPABASE_URL}/functions/v1/ext-memory`;

(function initAynEngineBridge() {
  if (window.__AYN_ENGINE_BRIDGE__) return;
  window.__AYN_ENGINE_BRIDGE__ = true;

  const emit = (questions) => {
    try {
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

  // Cached html2canvas module. Loaded once via chrome.runtime.getURL so the
  // extension's bundled vendor copy is used (same pattern as content.js's
  // aynRunVisionFallback).
  let _h2cPromise = null;
  const loadH2C = () => {
    if (_h2cPromise) return _h2cPromise;
    _h2cPromise = (async () => {
      try {
        const url = chrome.runtime.getURL("vendor/html2canvas.esm.js");
        const mod = await import(url);
        return mod.default || mod.html2canvas || null;
      } catch { return null; }
    })();
    return _h2cPromise;
  };

  const screenshotElement = async (el) => {
    const h2c = await loadH2C();
    if (typeof h2c !== "function") return "";
    try {
      const canvas = await h2c(el, {
        backgroundColor: "#ffffff",
        logging: false,
        scale: 0.75,
        useCORS: true,
        allowTaint: false,
      });
      return (canvas.toDataURL("image/png").split(",")[1]) || "";
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
        retry: async (payload) => {
          const r = await fetch(FN_RETRY, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-proxy-secret": PROXY_SECRET,
              "x-source": "ext",
            },
            body: JSON.stringify(payload),
          });
          if (!r.ok) throw new Error(`retry_${r.status}`);
          return r.json();
        },
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
            (window.__AYN_QUESTIONS__ || []).flatMap((q) => (q.controls || []).map((c) => c && c.node).filter(Boolean))
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
