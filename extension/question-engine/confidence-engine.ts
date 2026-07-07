/**
 * confidence-engine.ts
 * Computes structured per-question confidence from fused evidence.
 * overall = min(grouping, labeling, typing).
 */

import type { Evidence } from "./evidence";
import type { QuestionConfidence } from "./question";
import { fuse } from "./evidence/merge";

export interface ConfidenceInput {
  labelEvidence: ReadonlyArray<Evidence>;
  groupConfidence: number;
  typingConfidence: number;
}

export function computeConfidence(input: ConfidenceInput): QuestionConfidence {
  const labeling = clamp01(fuse(input.labelEvidence).agreement);
  const grouping = clamp01(input.groupConfidence);
  const typing = clamp01(input.typingConfidence);
  const overall = Math.min(grouping, labeling, typing);
  return { grouping, labeling, typing, overall };
}

/** Public agreement helper. Delegates to the pure fuse() so math lives in one place. */
export function agreement(ev: ReadonlyArray<Evidence>): number {
  return clamp01(fuse(ev).agreement);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Confidence thresholds that route answering. Consumed downstream, defined here. */
export const THRESHOLDS = Object.freeze({
  deterministic: 0.9,
  memoryThenAi: 0.7,
  aiRequired: 0.4,
  visionGate: 0.7,
});
