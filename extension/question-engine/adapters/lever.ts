/**
 * adapters/lever.ts
 * Lever ATS adapter. Evidence and grouping hints only. URL canonicalization lands
 * in Phase 6.
 */

import type { ATSPlugin } from "./index";

export const leverAdapter: ATSPlugin = {
  id: "lever",
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
