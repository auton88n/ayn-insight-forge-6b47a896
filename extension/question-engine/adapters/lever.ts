/**
 * adapters/lever.ts
 * Lever ATS. Fields live in .application-question / .application-field with a
 * .application-label element carrying the human label.
 */

import type { ATSPlugin, GroupingHint } from "./index";
import type { DetectedField } from "../question";
import { makeEvidence, type Evidence } from "../evidence";
import { ensureFid } from "../refs";

const LEVER_HOST_RE = /(?:^|\.)lever\.co$|jobs\.lever\.co$/i;

export const leverAdapter: ATSPlugin = {
  id: "lever",
  detect(doc: Document, url: string): boolean {
    try {
      if (LEVER_HOST_RE.test(new URL(url).hostname)) return true;
    } catch {
      // fall through
    }
    return !!doc.querySelector(".application-question, .lever-apply");
  },
  collectEvidence(field: DetectedField): Evidence[] {
    const out: Evidence[] = [];
    const q = field.node.closest(".application-question, .application-field");
    if (q) {
      const label = q.querySelector(".application-label, .question-label, label");
      const t = label?.textContent?.replace(/\s+/g, " ").trim();
      if (t) out.push(makeEvidence("adapter", "label", t, 0.9, { via: "lever-app-label" }));
      if (q.querySelector(".required")) out.push(makeEvidence("adapter", "required", true, 0.9));
    }
    return out;
  },
  groupingHints(fields: ReadonlyArray<DetectedField>): GroupingHint[] {
    const buckets = new Map<Element, DetectedField[]>();
    for (const f of fields) {
      const c = f.node.closest(".application-question, .application-field");
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
          confidence: 0.9,
          reason: "lever:application-question",
        });
      }
    }
    return hints;
  },
};
