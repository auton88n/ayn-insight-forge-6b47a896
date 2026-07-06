/**
 * index.ts
 * The public API of the Universal Question Engine. The whole engine reduces to
 * scanForm(root) -> Question[]. Pure with respect to the DOM: reads, never
 * writes. Never calls AI, never reads the profile, never fills.
 */

import type { Question } from "./question";
import { freezeQuestion, withAnswer, withVerification } from "./question";
import { detect, enrich } from "./field-detector";
import { reconstruct } from "./question-reconstructor";
import { build } from "./question-builder";
import { selectAdapter, registerAdapter } from "./adapters/index";
import { genericAdapter } from "./adapters/generic";
import { projectToLegacy, projectFromLegacyAnswer } from "./legacy";
import { nextGeneration } from "./refs";

export type { Question, QuestionKind, SemanticType, Option, QuestionConfidence, Answer } from "./question";
export type { Evidence } from "./evidence";
export type { ElementRef } from "./refs";
export type { ATSPlugin, AtsId } from "./adapters/index";
export type { LearningEngine } from "./learning/interface";
export type { LegacyDescriptor } from "./legacy";
export { withAnswer, withVerification, projectToLegacy, projectFromLegacyAnswer, registerAdapter };

registerAdapter(genericAdapter);

export interface ScanOptions {
  ats?: string;
  useVision?: boolean;
  signal?: AbortSignal;
}

export interface QuestionDelta {
  added: Question[];
  changed: Question[];
  removedIds: string[];
}

export function scanForm(root: Document | Element, opts: ScanOptions = {}): Question[] {
  void opts;
  const doc = root instanceof Document ? root : root.ownerDocument ?? document;
  const url = doc.location?.href ?? "";
  void selectAdapter(doc, url);
  const raw = detect(root);
  const detected = enrich(raw, root);
  const groups = reconstruct(detected, root);
  const questions = build(groups);
  return questions.map(freezeQuestion);
}

export function observeForm(
  root: Document | Element,
  onUpdate: (delta: QuestionDelta) => void
): () => void {
  void root;
  void onUpdate;
  void nextGeneration;
  return () => {};
}
