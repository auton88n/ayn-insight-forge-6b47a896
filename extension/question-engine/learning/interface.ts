/**
 * learning/interface.ts
 * The learning contract. INTERFACE ONLY, no implementation in Phase 1. Keyed
 * primarily by (ats, semanticType) with per-company override.
 */

import type { Question, Answer } from "../question";
import type { AtsId } from "../adapters/index";

export interface Suggestion {
  answer: Answer;
  confidence: number;
  source: "memory";
}

export interface ForgetCriteria {
  ats?: AtsId;
  company?: string;
  semanticType?: string;
  before?: number;
}

export interface LearningEngine {
  remember(q: Question): void;
  lookup(q: Question): Suggestion | null;
  promote(q: Question): void;
  forget(criteria: ForgetCriteria): void;
}

/** No-op implementation shipped first so the engine has a dependency to bind. */
export const noopLearning: LearningEngine = {
  remember() {},
  lookup() {
    return null;
  },
  promote() {},
  forget() {},
};
