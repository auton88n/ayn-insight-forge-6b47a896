/**
 * semantic-types.ts
 * Successor to classifyField(). Maps a question's fused text to a namespaced
 * SemanticType. Pure and table-driven so new patterns are data, not branches.
 */

import type { SemanticType, QuestionKind } from "./question";

export interface ClassifyInput {
  label: string;
  section: string | null;
  optionLabels: string[];
  placeholder: string | null;
  kind: QuestionKind;
}

export interface ClassifyResult {
  semanticType: SemanticType;
  confidence: number;
}

/** Classify a question. Phase 4 ports the classifyField table + confidence here. */
export function classify(input: ClassifyInput): ClassifyResult {
  void input;
  return { semanticType: "unknown", confidence: 0 };
}
