/**
 * question.ts
 * The single source of truth for the AYN Universal Question Engine.
 *
 * Nothing downstream of the engine reasons over HTML. Everything reasons over
 * Question objects. This module defines the immutable pipeline stage types
 * (Raw -> Detected -> Grouped -> Question) plus the enrichment helpers that let
 * downstream layers (rule engine, verifier, learning) enrich a Question without
 * mutating it.
 *
 * The engine owns four stages: RawDetection, DetectedField, QuestionGroup,
 * Question. The answer/verified/history fields exist on Question so the object
 * is one shape end to end, but the ENGINE NEVER SETS THEM. They are filled by
 * layers outside the engine via withAnswer / withVerification.
 */

import type { Evidence } from "./evidence";
import type { ElementRef } from "./refs";

/** The raw kind of an interactive control, before semantic interpretation. */
export type ControlKind =
  | "text"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "combobox"
  | "listbox"
  | "file"
  | "custom";

/** The semantic kind of a reconstructed question (how it should be answered). */
export type QuestionKind =
  | "text"
  | "single_choice"
  | "multi_choice"
  | "boolean"
  | "file"
  | "date";

/**
 * Semantic classification of the question's meaning. Namespaced. Extends the
 * existing classifyField output (eeo.*, logic.*, open.*). "unknown" is valid
 * and must be handled downstream rather than guessed.
 */
export type SemanticType = string;

/** Where a downstream answer came from. Set outside the engine. */
export type AnswerSource =
  | "profile"
  | "resume"
  | "canonical"
  | "computed"
  | "inferred"
  | "memory"
  | "ai"
  | "user";

export interface Option {
  value: string;
  label: string;
  ref: ElementRef;
}

export interface Validation {
  pattern?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  format?: string;
}

/**
 * Structured per-question confidence produced by the confidence engine.
 * overall is intentionally min(grouping, labeling, typing): a question is only
 * as trustworthy as its weakest understood dimension.
 */
export interface QuestionConfidence {
  grouping: number;
  labeling: number;
  typing: number;
  overall: number;
}

/** Downstream answer payload. The engine never sets this. */
export interface Answer {
  value?: string;
  optionValue?: string;
  optionLabel?: string;
  optionLabels?: string[];
  skip?: boolean;
  confidence?: number;
  reasoning?: string;
}

/** Downstream verification payload. The engine never sets this. */
export interface VerificationResult {
  verified: boolean;
  method: string;
  confidence: number;
  reason?: string;
}

export interface HistoryEntry {
  stage: string;
  at: number;
  note?: string;
}

/** Stage 1: a bare interactive control, no evidence, no grouping. */
export interface RawDetection {
  readonly node: Element;
  readonly kind: ControlKind;
  readonly ref: ElementRef;
  readonly frame: string;
}

/** Stage 2: a control with evidence and layout context attached. */
export interface DetectedField extends RawDetection {
  readonly evidence: ReadonlyArray<Evidence>;
  readonly visible: boolean;
  readonly container: Element;
}

/** Stage 3: controls clustered into one logical question, not yet built. */
export interface QuestionGroup {
  readonly controls: ReadonlyArray<DetectedField>;
  readonly groupingEvidence: ReadonlyArray<Evidence>;
  readonly groupConfidence: number;
}

/** Stage 4: the semantic Question. The single source of truth. */
export interface Question {
  readonly id: string;
  readonly frame: string;
  readonly label: string;
  readonly semanticType: SemanticType;
  readonly kind: QuestionKind;
  readonly required: boolean;
  readonly options: ReadonlyArray<Option>;
  readonly section: string | null;
  readonly description: string | null;
  readonly placeholder: string | null;
  readonly helpText: string | null;
  readonly validation: Validation | null;
  readonly confidence: QuestionConfidence;
  readonly evidence: ReadonlyArray<Evidence>;
  readonly controls: ReadonlyArray<ElementRef>;
  readonly answer?: Answer;
  readonly answerSource?: AnswerSource;
  readonly verified?: VerificationResult;
  readonly history?: ReadonlyArray<HistoryEntry>;
}

/** Deep-freeze a Question so no consumer can mutate it in place. */
export function freezeQuestion(q: Question): Question {
  Object.freeze(q.confidence);
  Object.freeze(q.options);
  Object.freeze(q.evidence);
  Object.freeze(q.controls);
  if (q.history) Object.freeze(q.history);
  return Object.freeze(q);
}

/**
 * Return a NEW Question with an answer attached. Used by the rule engine,
 * memory, and AI. Preserves the immutable-pipeline guarantee.
 */
export function withAnswer(
  q: Question,
  answer: Answer,
  source: AnswerSource
): Question {
  return freezeQuestion({
    ...q,
    answer,
    answerSource: source,
    history: appendHistory(q, `answer:${source}`),
  });
}

/** Return a NEW Question with a verification result attached. */
export function withVerification(
  q: Question,
  result: VerificationResult
): Question {
  return freezeQuestion({
    ...q,
    verified: result,
    history: appendHistory(q, `verify:${result.verified ? "ok" : "fail"}`),
  });
}

function appendHistory(q: Question, note: string): ReadonlyArray<HistoryEntry> {
  const entry: HistoryEntry = { stage: note, at: Date.now() };
  return q.history ? [...q.history, entry] : [entry];
}
