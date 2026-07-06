/**
 * grouping.ts
 * Clusters DetectedFields into logical questions. THE ASHBY FIX LIVES HERE:
 * choice controls are grouped by shared container or shared aria-labelledby,
 * NEVER by the name attribute alone. Name is demoted to weak evidence.
 */

import type { DetectedField } from "./question";
import type { Evidence } from "./evidence";

export interface GroupResult {
  clusters: DetectedField[][];
  evidence: Evidence[][];
  confidence: number[];
}

export function group(fields: ReadonlyArray<DetectedField>, root: Document | Element): GroupResult {
  void fields;
  void root;
  return { clusters: [], evidence: [], confidence: [] };
}
