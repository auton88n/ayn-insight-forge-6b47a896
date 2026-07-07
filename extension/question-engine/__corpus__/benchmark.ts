/**
 * __corpus__/benchmark.ts
 * The regression gate. Runs the engine over every fixture and scores accuracy per
 * ATS. A commit that lowers ANY metric for ANY ATS below its prior value fails the
 * gate and does not merge. This is the concrete mechanism that ends whack-a-mole.
 *
 * Scoring is intentionally simple and deterministic:
 *   detection      = matched_labels / expected.length
 *   grouping       = matched_options_shape / expected.length
 *   label          = matched_label_texts / expected.length
 *   classification = matched_semantic_types / expected.length
 * A produced question matches an expected one when their normalized labels
 * fuzzy-equal (case + whitespace insensitive, prefix or substring accepted).
 */

import type { Fixture, ExpectedQuestion } from "./capture";
import type { Question } from "../question";

export type Metric = "detection" | "grouping" | "label" | "classification";

export type Scorecard = Record<string, Record<Metric, number>>;

/** Production accuracy targets per ATS. A metric below target is a release blocker. */
export const TARGETS: Readonly<Record<string, Partial<Record<Metric, number>>>> = Object.freeze({
  workday: { detection: 0.98, grouping: 0.98, label: 0.95, classification: 0.9 },
  ashby: { detection: 0.98, grouping: 0.98, label: 0.95, classification: 0.9 },
  greenhouse: { detection: 0.97, grouping: 0.96, label: 0.95, classification: 0.9 },
  lever: { detection: 0.97, grouping: 0.96, label: 0.95, classification: 0.9 },
  icims: { detection: 0.95, grouping: 0.94, label: 0.92, classification: 0.88 },
  generic: { detection: 0.9, grouping: 0.88, label: 0.85, classification: 0.8 },
});

export function score(
  produced: ReadonlyArray<Question>,
  fixture: Fixture
): Record<Metric, number> {
  const expected = fixture.expected ?? [];
  if (expected.length === 0) {
    return { detection: 0, grouping: 0, label: 0, classification: 0 };
  }

  let detected = 0;
  let groupedOk = 0;
  let labelOk = 0;
  let classOk = 0;

  const used = new Set<Question>();
  for (const ex of expected) {
    const match = findMatch(produced, ex, used);
    if (!match) continue;
    used.add(match);
    detected++;
    if (labelsEqual(match.label, ex.label)) labelOk++;
    if (match.semanticType === ex.semanticType) classOk++;
    if (optionShapeMatches(match, ex)) groupedOk++;
  }

  const n = expected.length;
  return {
    detection: detected / n,
    grouping: groupedOk / n,
    label: labelOk / n,
    classification: classOk / n,
  };
}

export function passesGate(card: Scorecard): boolean {
  for (const [ats, metrics] of Object.entries(card)) {
    const targets = TARGETS[ats];
    if (!targets) continue;
    for (const [m, target] of Object.entries(targets)) {
      if ((metrics[m as Metric] ?? 0) < (target ?? 0)) return false;
    }
  }
  return true;
}

// ============ helpers ============

function findMatch(
  produced: ReadonlyArray<Question>,
  ex: ExpectedQuestion,
  used: Set<Question>
): Question | null {
  // Prefer exact label match, then fuzzy.
  let fuzzy: Question | null = null;
  for (const q of produced) {
    if (used.has(q)) continue;
    if (labelsEqual(q.label, ex.label)) return q;
    if (!fuzzy && labelsFuzzy(q.label, ex.label)) fuzzy = q;
  }
  return fuzzy;
}

function labelsEqual(a: string, b: string): boolean {
  return norm(a) === norm(b);
}

function labelsFuzzy(a: string, b: string): boolean {
  const A = norm(a);
  const B = norm(b);
  if (!A || !B) return false;
  return A.includes(B) || B.includes(A);
}

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[*✱﹡＊]/g, "").replace(/\s+/g, " ").trim();
}

function optionShapeMatches(q: Question, ex: ExpectedQuestion): boolean {
  const expected = (ex.optionLabels ?? []).map((s) => norm(s)).filter(Boolean);
  const got = q.options.map((o) => norm(o.label)).filter(Boolean);
  if (expected.length === 0) return got.length === 0;
  if (got.length === 0) return false;
  // Every expected option label should appear in the produced set.
  const set = new Set(got);
  return expected.every((e) => set.has(e));
}
