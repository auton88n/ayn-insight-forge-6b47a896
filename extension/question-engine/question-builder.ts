/**
 * question-builder.ts
 * QuestionGroup[] -> Question[]. THE ONLY MODULE THAT CREATES A Question.
 * Fuses evidence, classifies, computes confidence, mints id, dedups, freezes.
 */

import type { QuestionGroup, Question } from "./question";

export function build(groups: ReadonlyArray<QuestionGroup>): Question[] {
  void groups;
  return [];
}
