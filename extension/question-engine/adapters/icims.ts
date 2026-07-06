/**
 * adapters/icims.ts
 * iCIMS ATS adapter. Evidence and grouping hints only. Selectors land in Phase 6.
 */

import type { ATSPlugin } from "./index";

export const icimsAdapter: ATSPlugin = {
  id: "icims",
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
