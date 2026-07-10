/**
 * extension/fill-session.js
 *
 * Phase A of the structural consolidation: ONE object owns everything about a
 * fill attempt. Today that state is scattered across a dozen bare globals
 * (window.__AYN_QUESTIONS__, __AYN_QUESTIONS_LEGACY__, __AYN_RESTORED_ANSWERS__,
 * __AYN_LAST_INJECTED_VALUES__, __aynFillSessionActive, __aynScanInFlight,
 * __aynLastHybridN/At, ...), each written and read independently, with no
 * shared notion of "this is one fill attempt." That's the direct cause of the
 * races chased today: nothing agrees on what "the current session" even is.
 *
 * This file does not remove any existing global yet — it is purely additive,
 * loaded early (right after constants.js) so every later script can start
 * reading and writing through window.AYN_FILL_SESSION instead of inventing a
 * new bare global. Existing globals get migrated into it one at a time in
 * later, separately-reviewed commits, not all at once here.
 *
 * Phase B (the pipeline debugger) is built directly on top of this: every
 * stage of a run records its outcome here, and getReport()/printReport()
 * renders exactly what a failure was and where it happened, instead of
 * requiring console archaeology across five files.
 */

(function initAynFillSession() {
  if (window.AYN_FILL_SESSION) return; // idempotent across re-injection

  const STAGES = Object.freeze([
    "detection",
    "grouping",
    "builder",
    "ruleEngine",
    "memory",
    "ai",
    "execution",
    "verification",
  ]);

  let _seq = 0;

  /** One fill attempt. Created fresh each time a fill is triggered. */
  class FillSession {
    constructor(url) {
      this.id = `fs${Date.now().toString(36)}${(_seq++).toString(36)}`;
      this.url = url || (typeof location !== "undefined" ? location.href : "");
      this.startedAt = Date.now();
      this.endedAt = null;

      // The Question objects this session is operating on, and their answers.
      // Keyed by a stable signature where possible (see setQuestions), not by
      // the DOM-stamped fid, so a re-render that mints a fresh id doesn't
      // orphan an answer already recorded here.
      this.questions = [];
      this.answersBySignature = new Map();

      // Per-stage outcome: { ok, count, ms, note, error }. Populated by
      // recordStage() as the pipeline actually executes each phase.
      this.stages = {};
      for (const s of STAGES) this.stages[s] = null;

      // Execution/verification detail, keyed by question signature, so a
      // specific failure ("question 17 failed") can be reported precisely.
      this.writes = []; // { signature, ok, method, reason, at }
      this.verifications = []; // { signature, verified, method, reason, at }
      this.retries = new Map(); // signature -> count

      this.logs = []; // { at, level, msg }
      this.errors = []; // { at, stage, error }

      this.active = true; // replaces window.__aynFillSessionActive
    }

    log(msg, level = "info") {
      this.logs.push({ at: Date.now(), level, msg });
    }

    error(stage, err) {
      this.errors.push({ at: Date.now(), stage, error: String((err && err.message) || err) });
    }

    /**
     * Record the outcome of one pipeline stage. Called once per stage per
     * run. `count` is whatever's meaningful for that stage (controls found,
     * questions grouped, answers produced, writes attempted, ...).
     */
    recordStage(stage, { ok, count, ms, note } = {}) {
      if (!STAGES.includes(stage)) return;
      this.stages[stage] = {
        ok: ok !== false,
        count: count || 0,
        ms: ms || 0,
        note: note || null,
        at: Date.now(),
      };
    }

    setQuestions(questions, signatureFn) {
      this.questions = Array.isArray(questions) ? questions : [];
      if (typeof signatureFn === "function") {
        for (const q of this.questions) {
          try {
            const sig = signatureFn(q);
            if (q && q.answer) this.answersBySignature.set(sig, q.answer);
          } catch (_) {}
        }
      }
    }

    recordWrite(signature, ok, method, reason) {
      this.writes.push({ signature, ok: !!ok, method: method || "", reason: reason || "", at: Date.now() });
    }

    recordVerification(signature, verified, method, reason) {
      this.verifications.push({ signature, verified: !!verified, method: method || "", reason: reason || "", at: Date.now() });
    }

    recordRetry(signature) {
      this.retries.set(signature, (this.retries.get(signature) || 0) + 1);
    }

    end() {
      this.active = false;
      this.endedAt = Date.now();
    }

    /** Structured summary — the data behind the pipeline debugger view. */
    getReport() {
      const writeFails = this.writes.filter((w) => !w.ok);
      const verifyFails = this.verifications.filter((v) => !v.verified);
      return {
        id: this.id,
        url: this.url,
        durationMs: (this.endedAt || Date.now()) - this.startedAt,
        stages: this.stages,
        totals: {
          questions: this.questions.length,
          answered: this.answersBySignature.size,
          writes: this.writes.length,
          writeFailures: writeFails.length,
          verified: this.verifications.filter((v) => v.verified).length,
          verifyFailures: verifyFails.length,
          retries: Array.from(this.retries.values()).reduce((a, b) => a + b, 0),
        },
        firstFailure: writeFails[0] || verifyFails[0] || null,
        errors: this.errors,
      };
    }

    /** Human-readable pipeline view, exactly the "did detection/grouping/AI/
     *  execution fail" question this whole file exists to answer at a glance. */
    printReport() {
      const r = this.getReport();
      const mark = (ok) => (ok ? "✓" : "✗");
      const lines = [`FillSession ${r.id}  (${r.url})  ${r.durationMs}ms`];
      for (const stage of STAGES) {
        const s = this.stages[stage];
        if (!s) { lines.push(`  ${stage.padEnd(12)} —`); continue; }
        lines.push(`  ${stage.padEnd(12)} ${s.count} ${s.note ? "(" + s.note + ") " : ""}${mark(s.ok)}`);
      }
      lines.push(`  writes: ${r.totals.writes}, failed: ${r.totals.writeFailures}`);
      lines.push(`  verified: ${r.totals.verified}, failed: ${r.totals.verifyFailures}`);
      lines.push(`  retries: ${r.totals.retries}`);
      if (r.firstFailure) lines.push(`  first failure: ${JSON.stringify(r.firstFailure)}`);
      if (r.errors.length) lines.push(`  errors: ${r.errors.length} (see .errors)`);
      const text = lines.join("\n");
      console.log(text);
      return text;
    }
  }

  /**
   * Session registry. `current` is the active session (if any); `history`
   * keeps the last few for comparison across retries within one page load.
   * This is the ONE global this file introduces — everything else should
   * read/write through it rather than adding a new bare window.__AYN_* var.
   */
  const registry = {
    current: null,
    history: [],
    maxHistory: 5,

    start(url) {
      if (this.current && this.current.active) this.current.end();
      const s = new FillSession(url);
      this.current = s;
      this.history.unshift(s);
      if (this.history.length > this.maxHistory) this.history.pop();
      return s;
    },

    end() {
      if (this.current) this.current.end();
    },

    /** True while a real fill is in progress — replaces __aynFillSessionActive. */
    isActive() {
      return !!(this.current && this.current.active);
    },

    report() {
      return this.current ? this.current.getReport() : null;
    },

    print() {
      if (!this.current) { console.log("[AYN][fill-session] no session yet"); return; }
      this.current.printReport();
    },
  };

  window.AYN_FILL_SESSION = registry;
})();
