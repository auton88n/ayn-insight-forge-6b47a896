/**
 * index.ts
 * The public API of the Universal Question Engine. scanForm(root) -> Question[].
 * Pure with respect to the DOM: reads, never writes (except stamping fids).
 * Never calls AI, never reads the profile, never fills.
 */

import type { Question } from "./question";
import { freezeQuestion, withAnswer, withVerification } from "./question";
import { detect, enrich } from "./field-detector";
import { reconstruct } from "./question-reconstructor";
import { build } from "./question-builder";
import { selectAdapter, registerAdapter } from "./adapters/index";
import { genericAdapter } from "./adapters/generic";
import { workdayAdapter } from "./adapters/workday";
import { ashbyAdapter } from "./adapters/ashby";
import { greenhouseAdapter } from "./adapters/greenhouse";
import { leverAdapter } from "./adapters/lever";
import { icimsAdapter } from "./adapters/icims";
import { projectToLegacy, projectFromLegacyAnswer } from "./legacy";
import { nextGeneration } from "./refs";
import {
  diffQuestions,
  OBSERVED_ATTRS,
  type QuestionDelta,
} from "./evidence/mutation";
import { setVisionProvider } from "./evidence/vision";

export type { Question, QuestionKind, SemanticType, Option, QuestionConfidence, Answer } from "./question";
export type { Evidence } from "./evidence";
export type { ElementRef } from "./refs";
export type { ATSPlugin, AtsId } from "./adapters/index";
export type { LearningEngine } from "./learning/interface";
export type { LegacyDescriptor } from "./legacy";
export type { QuestionDelta } from "./evidence/mutation";
export {
  withAnswer,
  withVerification,
  projectToLegacy,
  projectFromLegacyAnswer,
  registerAdapter,
  setVisionProvider,
};

// Registration order matters: non-generic adapters are probed first, generic
// is the guaranteed fallback (registered last). detect() predicates for the
// specific ATSes are disjoint by host/DOM signature.
registerAdapter(workdayAdapter);
registerAdapter(ashbyAdapter);
registerAdapter(greenhouseAdapter);
registerAdapter(leverAdapter);
registerAdapter(icimsAdapter);
registerAdapter(genericAdapter);

export interface ScanOptions {
  ats?: string;
  useVision?: boolean;
  signal?: AbortSignal;
}

export function scanForm(root: Document | Element, opts: ScanOptions = {}): Question[] {
  void opts;
  const doc = root instanceof Document ? root : root.ownerDocument ?? document;
  const url = doc.location?.href ?? "";
  const adapter = selectAdapter(doc, url);
  const raw = detect(root);
  const detected = enrich(raw, root, adapter);
  const groups = reconstruct(detected, root, adapter);
  const questions = build(groups);
  return questions.map(freezeQuestion);
}

export interface ObserveOptions extends ScanOptions {
  /** Debounce window (ms) collapsing rapid mutation bursts. Default 120ms. */
  debounceMs?: number;
}

/**
 * Watch a root for DOM mutations and emit QuestionDelta batches. Delta-only:
 * we re-run scanForm on the whole root but downstream consumers receive only
 * added/changed/removedIds relative to the prior generation. Filtering
 * happens against a stable snapshot keyed by Question.id.
 */
export function observeForm(
  root: Document | Element,
  onUpdate: (delta: QuestionDelta) => void,
  opts: ObserveOptions = {}
): () => void {
  const doc = root instanceof Document ? root : root.ownerDocument ?? document;
  const win = doc.defaultView;
  if (!win || typeof win.MutationObserver !== "function") return () => {};

  const debounceMs = Math.max(0, opts.debounceMs ?? 120);
  let snapshot: Question[] = scanForm(root, opts);
  // Emit initial state as an all-added delta so consumers can bootstrap.
  onUpdate({ added: [...snapshot], changed: [], removedIds: [] });

  let pending: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    pending = null;
    nextGeneration();
    const next = scanForm(root, opts);
    const delta = diffQuestions(snapshot, next);
    snapshot = next;
    if (delta.added.length || delta.changed.length || delta.removedIds.length) {
      onUpdate(delta);
    }
  };

  const mo = new win.MutationObserver(() => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(flush, debounceMs);
  });
  const target: Node = root instanceof Document ? root.documentElement ?? root : root;
  mo.observe(target, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [...OBSERVED_ATTRS],
  });

  return () => {
    if (pending) clearTimeout(pending);
    mo.disconnect();
  };
}
