/**
 * extension/content.entry.js
 * Bridge between the Universal Question Engine and the legacy content script.
 * Runs at document_idle in every frame; exposes the engine's Question[] via
 * window.__AYN_QUESTIONS__ and dispatches "ayn:questions-ready" so downstream
 * consumers (sidepanel, filler) can pick it up. Does NOT replace the legacy
 * scanner — this is additive telemetry for the new understanding layer.
 */
import { scanForm, observeForm, projectToLegacy } from "./question-engine/index";

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
      // Never let the bridge crash the host page.
      // eslint-disable-next-line no-console
      console.warn("[AYN][engine-bridge] emit failed", e);
    }
  };

  const runOnce = () => {
    try {
      const qs = scanForm(document);
      emit(qs);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[AYN][engine-bridge] scan failed", e);
    }
  };

  // Initial scan — defer to next tick so the legacy scripts finish their own
  // document_idle init first.
  setTimeout(runOnce, 0);

  // Delta observer — keeps __AYN_QUESTIONS__ fresh across SPA/route changes
  // and dynamic form reveals.
  try {
    observeForm(
      document,
      (delta) => {
        if (window.__AYN_QUESTIONS__ && !delta.added.length && !delta.changed.length && !delta.removedIds.length) return;
        // Cheapest correct behavior: re-scan on any delta to keep the array coherent.
        try {
          const qs = scanForm(document);
          emit(qs);
        } catch (_) {}
      },
      { debounceMs: 200 }
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[AYN][engine-bridge] observe failed", e);
  }
})();
