/**
 * adapters/workday.ts
 * Workday ATS adapter. Evidence and grouping hints only. Keyed on
 * data-automation-id. Selectors land in Phase 6 against captured corpus fixtures.
 */

import type { ATSPlugin } from "./index";

export const workdayAdapter: ATSPlugin = {
  id: "workday",
  detect(doc: Document, url: string): boolean {
    void doc;
    void url;
    return false;
  },
  collectEvidence(field, doc) {
    void field;
    void doc;
    return [];
  },
};
