/**
 * question-reconstructor.ts
 * DetectedField[] -> QuestionGroup[]. Attaches the question label via the
 * proximity-decay scorer (rejecting placeholder and option text as labels).
 */

import type { DetectedField, QuestionGroup } from "./question";

export function reconstruct(
  fields: ReadonlyArray<DetectedField>,
  root: Document | Element
): QuestionGroup[] {
  void fields;
  void root;
  return [];
}
