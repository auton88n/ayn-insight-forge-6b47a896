/**
 * adapters/ashby.ts
 * Ashby ATS adapter. Evidence and grouping hints only. Groups by container, not
 * name. Selectors land in Phase 6 against captured corpus fixtures.
 */

import type { ATSPlugin } from "./index";

export const ashbyAdapter: ATSPlugin = {
  id: "ashby",
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
