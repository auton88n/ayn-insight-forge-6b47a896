/**
 * evidence/adapter.ts — the "adapter" evidence source.
 *
 * Delegates to the active ATS plugin's collectEvidence(). Returns Evidence[]
 * tagged (source: 'adapter'); NEVER a Question. Called by field-detector.enrich
 * so per-adapter labels/required/section fuse alongside dom + a11y evidence.
 */

import type { Evidence } from "../evidence";
import type { DetectedField } from "../question";
import type { ATSPlugin } from "../adapters/index";

export function collect(
  field: DetectedField,
  root: Document | Element,
  adapter: ATSPlugin | null
): Evidence[] {
  if (!adapter) return [];
  const doc = root instanceof Document ? root : root.ownerDocument ?? document;
  try {
    return adapter.collectEvidence(field, doc) ?? [];
  } catch {
    return [];
  }
}
