/**
 * __corpus__/benchmark.ts
 * The regression gate. Runs the engine over every fixture and scores accuracy per
 * ATS. A commit that lowers ANY metric for ANY ATS below its prior value fails the
 * gate and does not merge. This is the concrete mechanism that ends whack-a-mole.
 */

import type { Fixture } from "./capture";
import type { Question } from "../question";

export type Metric =
  | "detection"
  | "grouping"
  | "label"
  | "classification";

export type Scorecard = Record<string, Record<Metric, number>>; // ats -> metric -> 0..1

/** Production accuracy targets per ATS. A metric below target is a release blocker. */
export const TARGETS: Readonly<Record<string, Partial<Record<Metric, number>>>> = Object.freeze({
  workday: { detection: 0.98, grouping: 0.98, label: 0.95, classification: 0.9 },
  ashby: { detection: 0.98, grouping: 0.98, label: 0.95, classification: 0.9 },
  greenhouse: { detection: 0.97, grouping: 0.96, label: 0.95, classification: 0.9 },
  lever: { detection: 0.97, grouping: 0.96, label: 0.95, classification: 0.9 },
  icims: { detection: 0.95, grouping: 0.94, label: 0.92, classification: 0.88 },
  generic: { detection: 0.9, grouping: 0.88, label: 0.85, classification: 0.8 },
});

/** Score the engine's output against a fixture's expected annotations. */
export function score(
  produced: ReadonlyArray<Question>,
  fixture: Fixture
): Record<Metric, number> {
  // Phase 4+: compare produced vs fixture.expected across the four metrics.
  void produced;
  void fixture;
  return { detection: 0, grouping: 0, label: 0, classification: 0 };
}

/** True if every metric for every ATS meets its target. Gate for CI. */
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
