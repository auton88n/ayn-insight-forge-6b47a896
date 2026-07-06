/**
 * adapters/index.ts
 * The ATS plugin contract and registry. HARD RULES: adapters produce Evidence
 * and grouping hints only. An adapter NEVER constructs a Question, never fills,
 * never calls AI, never reads the profile. Exactly one adapter is active per scan
 * (highest-priority detect() true), falling back to generic. Note: reconstruct()
 * is deliberately NOT on the interface; adapters supply grouping HINTS instead so
 * only the builder ever creates Questions.
 */

import type { DetectedField, Question } from "../question";
import type { Evidence } from "../evidence";

export type AtsId = "workday" | "ashby" | "greenhouse" | "lever" | "icims" | "generic";

export interface GroupingHint {
  memberFids: string[];
  confidence: number;
  reason: string;
}

export interface VerificationHint {
  reconstructable: boolean;
  note?: string;
}

export interface ATSPlugin {
  readonly id: AtsId;
  detect(doc: Document, url: string): boolean;
  collectEvidence(field: DetectedField, doc: Document): Evidence[];
  groupingHints?(fields: ReadonlyArray<DetectedField>, doc: Document): GroupingHint[];
  verify?(q: Question, doc: Document): VerificationHint;
}

const registry: ATSPlugin[] = [];

/** Register an adapter. generic should be registered last (lowest priority). */
export function registerAdapter(plugin: ATSPlugin): void {
  registry.push(plugin);
}

/** Pick the active adapter for a document. Falls back to generic. */
export function selectAdapter(doc: Document, url: string): ATSPlugin | null {
  for (const p of registry) {
    if (p.id !== "generic" && p.detect(doc, url)) return p;
  }
  return registry.find((p) => p.id === "generic") ?? null;
}
