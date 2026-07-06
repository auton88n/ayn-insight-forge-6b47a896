/**
 * adapters/generic.ts
 * Always-available fallback adapter. Wraps the current container/proximity
 * heuristics. detect() always returns true so it is the guaranteed floor.
 */

import type { ATSPlugin, GroupingHint } from "./index";
import type { DetectedField } from "../question";
import type { Evidence } from "../evidence";

export const genericAdapter: ATSPlugin = {
  id: "generic",
  detect() {
    return true;
  },
  collectEvidence(field: DetectedField): Evidence[] {
    void field;
    return [];
  },
  groupingHints(fields: ReadonlyArray<DetectedField>): GroupingHint[] {
    void fields;
    return [];
  },
};
