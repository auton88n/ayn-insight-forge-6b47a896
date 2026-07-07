/**
 * adapters/icims.ts
 * iCIMS ATS. Legacy Prototype-style DOM with `iCIMS_TableRow` layouts. Labels
 * are in a sibling <label> or a preceding .iCIMS_InfoField_Label cell.
 */

import type { ATSPlugin, GroupingHint } from "./index";
import type { DetectedField } from "../question";
import { makeEvidence, type Evidence } from "../evidence";
import { ensureFid } from "../refs";

const ICIMS_HOST_RE = /icims\.com$|jobs\.icims\.com$/i;

export const icimsAdapter: ATSPlugin = {
  id: "icims",
  detect(doc: Document, url: string): boolean {
    try {
      if (ICIMS_HOST_RE.test(new URL(url).hostname)) return true;
    } catch {
      // fall through
    }
    return !!doc.querySelector('[class^="iCIMS_"], [id^="iCIMS_"]');
  },
  collectEvidence(field: DetectedField): Evidence[] {
    const out: Evidence[] = [];
    const row = field.node.closest('.iCIMS_TableRow, [class*="iCIMS_InfoField"]');
    if (row) {
      const lbl = row.querySelector('.iCIMS_InfoField_Label, label, .iCIMS_Label');
      const t = lbl?.textContent?.replace(/\s+/g, " ").trim();
      if (t) out.push(makeEvidence("adapter", "label", t, 0.85, { via: "icims-row" }));
      if (row.querySelector('.iCIMS_Required, [class*="Required"]')) {
        out.push(makeEvidence("adapter", "required", true, 0.85));
      }
    }
    return out;
  },
  groupingHints(fields: ReadonlyArray<DetectedField>): GroupingHint[] {
    const buckets = new Map<Element, DetectedField[]>();
    for (const f of fields) {
      const c = f.node.closest('.iCIMS_TableRow, [class*="iCIMS_InfoField"]');
      if (!c) continue;
      const arr = buckets.get(c) ?? [];
      arr.push(f);
      buckets.set(c, arr);
    }
    const hints: GroupingHint[] = [];
    for (const [, arr] of buckets) {
      if (arr.length > 1) {
        hints.push({
          memberFids: arr.map((f) => ensureFid(f.node)),
          confidence: 0.85,
          reason: "icims:row",
        });
      }
    }
    return hints;
  },
};
