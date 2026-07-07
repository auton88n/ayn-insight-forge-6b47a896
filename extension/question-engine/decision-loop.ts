/**
 * decision-loop.ts
 *
 * Part 1 of the "close the AI decision loop" upgrade. Given a Question that
 * failed to inject/verify, this module classifies the failure and asks the
 * ext-fill-form-retry edge function for a re-planned answer. Bounded by a
 * per-field retry cap and a total time budget.
 *
 * Transport is injected so the engine has no direct network coupling.
 */

import type { Question, Answer } from "./question";

export type FailureClass =
  | "injection_failed"
  | "option_not_found"
  | "validation_rejected"
  | "field_became_visible"
  | "unknown";

export interface RetryContext {
  /** Fresh snapshot of options currently in the DOM (for choice kinds). */
  options?: Array<{ value: string; label: string }>;
  /** Nearby already-filled fields, to help the model triangulate. */
  siblings?: Array<{ label: string; value?: string }>;
  ats?: string;
  url?: string;
}

export interface RetryTransport {
  /** POST to ext-fill-form-retry. Return the raw answer object or throw. */
  retry(payload: {
    field: {
      label: string;
      kind: Question["kind"];
      semanticType: Question["semanticType"];
      required: boolean;
      placeholder: string | null;
      helpText: string | null;
      validation: Question["validation"];
    };
    original_answer: Answer | null;
    failure_class: FailureClass;
    options?: Array<{ value: string; label: string }>;
    siblings?: Array<{ label: string; value?: string }>;
    ats?: string;
    url?: string;
  }): Promise<{ answer: Answer }>;
}

export interface DecisionLoopConfig {
  transport: RetryTransport;
  maxRoundsPerField?: number;
  totalTimeBudgetMs?: number;
}

export interface RetryOutcome {
  answer: Answer | null;
  rounds: number;
  failureHistory: FailureClass[];
  timedOut: boolean;
}

/**
 * Classify a failure from a verification result + DOM snapshot. Kept dumb on
 * purpose — heuristics are cheap and deterministic; the AI does the smart part.
 */
export function classifyFailure(
  q: Question,
  domOptionsNow: ReadonlyArray<{ value: string; label: string }>,
  answer: Answer | null,
  newFieldAppeared: boolean
): FailureClass {
  if (newFieldAppeared) return "field_became_visible";
  if (!answer) return "unknown";
  if ((q.kind === "single_choice" || q.kind === "multi_choice") && answer.optionLabel) {
    const want = normalize(answer.optionLabel);
    const hit = domOptionsNow.some((o) => normalize(o.label) === want);
    if (!hit) return "option_not_found";
  }
  if (q.validation?.pattern && answer.value) {
    try {
      const re = new RegExp(q.validation.pattern);
      if (!re.test(answer.value)) return "validation_rejected";
    } catch { /* invalid regex, ignore */ }
  }
  if (answer.value != null || answer.optionLabel != null || answer.optionLabels?.length) {
    return "injection_failed";
  }
  return "unknown";
}

export function createDecisionLoop(cfg: DecisionLoopConfig) {
  const maxRounds = Math.max(1, cfg.maxRoundsPerField ?? 2);
  const budget = Math.max(1000, cfg.totalTimeBudgetMs ?? 8000);

  return {
    async replan(q: Question, ctx: RetryContext, initialFailure: FailureClass): Promise<RetryOutcome> {
      const start = Date.now();
      const history: FailureClass[] = [initialFailure];
      let current: Answer | null = q.answer ?? null;
      let round = 0;
      while (round < maxRounds && Date.now() - start < budget) {
        try {
          const { answer } = await cfg.transport.retry({
            field: {
              label: q.label,
              kind: q.kind,
              semanticType: q.semanticType,
              required: q.required,
              placeholder: q.placeholder,
              helpText: q.helpText,
              validation: q.validation,
            },
            original_answer: current,
            failure_class: history[history.length - 1] ?? "unknown",
            options: ctx.options,
            siblings: ctx.siblings,
            ats: ctx.ats,
            url: ctx.url,
          });
          round += 1;
          current = answer ?? current;
          // Caller decides whether to try re-injecting and, if it fails again,
          // pushes the next failure class onto history and re-invokes replan().
          return { answer: current, rounds: round, failureHistory: history, timedOut: false };
        } catch {
          round += 1;
          history.push("unknown");
        }
      }
      return {
        answer: current,
        rounds: round,
        failureHistory: history,
        timedOut: Date.now() - start >= budget,
      };
    },
    pushFailure(prev: RetryOutcome, f: FailureClass): RetryOutcome {
      return { ...prev, failureHistory: [...prev.failureHistory, f] };
    },
  };
}

function normalize(s: string): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}
