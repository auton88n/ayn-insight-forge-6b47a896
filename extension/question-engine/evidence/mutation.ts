/**
 * evidence/mutation.ts — MutationObserver support for the engine.
 *
 * Emits (source: 'mutation') Evidence for controls revealed/updated after the
 * initial scan, and provides diff utilities used by index.observeForm to emit
 * QuestionDelta { added, changed, removedIds } to consumers. Delta-only:
 * this module never re-scans the whole form.
 */

import type { Evidence } from "../evidence";
import type { Question } from "../question";

/** Attributes that meaningfully change a control's understanding. */
export const OBSERVED_ATTRS: ReadonlyArray<string> = Object.freeze([
  "aria-hidden",
  "hidden",
  "disabled",
  "required",
  "aria-required",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-invalid",
  "value",
]);

/** Placeholder: mutation-source evidence is emitted by observers, not queried. */
export function collect(el: Element, root: Document | Element): Evidence[] {
  void el;
  void root;
  return [];
}

export interface QuestionDelta {
  added: Question[];
  changed: Question[];
  removedIds: string[];
}

/**
 * Compute a QuestionDelta between two Question[] snapshots. Shallow-equal
 * comparison on the fields that affect downstream behavior (label, kind,
 * required, options.length, confidence.overall, section).
 */
export function diffQuestions(
  prev: ReadonlyArray<Question>,
  next: ReadonlyArray<Question>
): QuestionDelta {
  const prevById = new Map(prev.map((q) => [q.id, q]));
  const nextById = new Map(next.map((q) => [q.id, q]));
  const added: Question[] = [];
  const changed: Question[] = [];
  const removedIds: string[] = [];

  for (const q of next) {
    const before = prevById.get(q.id);
    if (!before) {
      added.push(q);
      continue;
    }
    if (!questionsEquivalent(before, q)) changed.push(q);
  }
  for (const q of prev) {
    if (!nextById.has(q.id)) removedIds.push(q.id);
  }
  return { added, changed, removedIds };
}

function questionsEquivalent(a: Question, b: Question): boolean {
  if (a.label !== b.label) return false;
  if (a.kind !== b.kind) return false;
  if (a.semanticType !== b.semanticType) return false;
  if (a.required !== b.required) return false;
  if (a.section !== b.section) return false;
  if (a.options.length !== b.options.length) return false;
  if (Math.abs(a.confidence.overall - b.confidence.overall) > 0.01) return false;
  return true;
}
