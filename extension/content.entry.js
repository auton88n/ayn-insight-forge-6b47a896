/**
 * extension/content.entry.js
 * Bridge between the Universal Question Engine and the legacy content script.
 * Runs at document_idle in every frame; exposes the engine's Question[] via
 * window.__AYN_QUESTIONS__ and dispatches "ayn:questions-ready" so downstream
 * consumers (sidepanel, filler) can pick it up.
 *
 * Also wires the three v2.4 upgrades:
 *   1. Decision loop        -> window.__AYN_DECISION_LOOP__
 *   2. Learning memory      -> window.__AYN_LEARNING__
 *   3. Vision discovery     -> setVisionProvider(...) + window.__AYN_VISION_DISCOVER__
 * All transports fail gracefully offline and never block the base scanner.
 */
import {
  scanForm,
  observeForm,
  projectToLegacy,
  setVisionProvider,
  setLearningEngine,
  createSupabaseLearning,
  createVisionProvider,
  createDecisionLoop,
  findVisualDeadZones,
  classifyFailure,
} from "./question-engine/index";

const SUPABASE_URL = "https://dfkoxuokfkttjhfjcecx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw";
const PROXY_SECRET = "ayn-proxy-2024";
const FN_RETRY = `${SUPABASE_URL}/functions/v1/ext-fill-form-retry`;
const FN_VISION = `${SUPABASE_URL}/functions/v1/ext-vision-discover`;

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
            frame:
              window.top === window
                ? "top"
                : (location && location.href) || "frame",
          },
        })
      );
    } catch (e) {
      console.warn("[AYN][engine-bridge] emit failed", e);
    }
  };

  const runOnce = () => {
    try {
      const qs = scanForm(document);
      emit(qs);
    } catch (e) {
      console.warn("[AYN][engine-bridge] scan failed", e);
    }
  };

  setTimeout(runOnce, 0);

  try {
    observeForm(
      document,
      (delta) => {
        if (
          window.__AYN_QUESTIONS__ &&
          !delta.added.length &&
          !delta.changed.length &&
          !delta.removedIds.length
        )
          return;
        try {
          const qs = scanForm(document);
          emit(qs);
        } catch (_) {}
      },
      { debounceMs: 200 }
    );
  } catch (e) {
    console.warn("[AYN][engine-bridge] observe failed", e);
  }

  // ────────────────────────────────────────────────────────────────────
  // v2.4 upgrades: decision loop / learning / vision discovery
  // ────────────────────────────────────────────────────────────────────

  /**
   * Resolve the current user access token. The main content script maintains
   * it on window.__AYN_ACCESS_TOKEN__ after auth handshake with the sidepanel.
   */
  const getAccessToken = async () => window.__AYN_ACCESS_TOKEN__ || null;

  // — Part 2: learning store
  try {
    const learning = createSupabaseLearning({
      getAccessToken,
      restBaseUrl: `${SUPABASE_URL}/rest/v1`,
      anonKey: SUPABASE_ANON_KEY,
    });
    setLearningEngine(learning);
    window.__AYN_LEARNING__ = learning;
  } catch (e) {
    console.warn("[AYN][engine-bridge] learning wire failed", e);
  }

  // — Part 1: decision loop
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

  // — Part 3: vision discovery
  try {
    const screenshot = async (el) => {
      // html2canvas is bundled with the extension under vendor/ and loaded by
      // content.js before this bridge; guard for the case where it isn't.
      const h2c = window.html2canvas;
      if (typeof h2c !== "function") return "";
      const canvas = await h2c(el, {
        backgroundColor: null,
        logging: false,
        scale: 1,
        useCORS: true,
      });
      const dataUrl = canvas.toDataURL("image/png");
      return dataUrl.split(",")[1] || "";
    };
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
    const provider = createVisionProvider({ screenshot, discover });
    setVisionProvider(provider);
    window.__AYN_VISION_DISCOVER__ = {
      /**
       * Scan for visual dead zones and ask the model to describe questions.
       * Called by content.js when scanForm() returned zero questions but the
       * page visibly contains a form. Returns raw vision descriptors — merging
       * them into __AYN_QUESTIONS__ is the caller's job.
       */
      async run() {
        try {
          const zones = findVisualDeadZones(
            document,
            new Set((window.__AYN_QUESTIONS__ || []).flatMap((q) => q.controls || []))
          );
          if (!zones.length) return { zones: 0, questions: [] };
          const all = [];
          for (const zone of zones) {
            const b64 = await screenshot(zone);
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
