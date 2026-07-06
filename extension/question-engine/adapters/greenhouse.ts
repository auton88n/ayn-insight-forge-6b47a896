/**
 * adapters/greenhouse.ts
 * Greenhouse ATS adapter. Evidence and grouping hints only. Country-list fallback
 * for empty selects lands in Phase 6.
 */

import type { ATSPlugin } from "./index";

export const greenhouseAdapter: ATSPlugin = {
  id: "greenhouse",
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
