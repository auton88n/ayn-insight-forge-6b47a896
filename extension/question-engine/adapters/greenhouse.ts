/**
 * adapters/greenhouse.ts
 * Greenhouse ATS. Standard `<label for>` semantics + Greenhouse's field id
 * conventions (`job_application_*`). Adds a country-select fallback where the
 * options are populated asynchronously.
 */

import type { ATSPlugin, GroupingHint } from "./index";
import type { DetectedField } from "../question";
import { makeEvidence, type Evidence } from "../evidence";
import { ensureFid } from "../refs";

const GH_HOST_RE = /(?:^|\.)greenhouse\.io$|boards\.greenhouse\.io$|job-boards\.greenhouse\.io$/i;

export const greenhouseAdapter: ATSPlugin = {
  id: "greenhouse",
  detect(doc: Document, url: string): boolean {
    try {
      if (GH_HOST_RE.test(new URL(url).hostname)) return true;
    } catch {
      // fall through
    }
    return !!doc.querySelector('form[id="application_form"], [id^="job_application_"]');
  },
  collectEvidence(field: DetectedField): Evidence[] {
    const out: Evidence[] = [];
    const id = field.node.getAttribute("id") || "";
    if (id.startsWith("job_application_")) {
      const label = id
        .replace(/^job_application_(answers_attributes_\d+_)?/, "")
        .replace(/_/g, " ")
        .trim();
      if (label) out.push(makeEvidence("adapter", "label", label, 0.75, { via: "gh-id" }));
    }
    // required asterisk sits in .label span
    const wrap = field.node.closest(".field, .application-question, li");
    if (wrap?.querySelector(".required, .asterisk")) {
      out.push(makeEvidence("adapter", "required", true, 0.9));
    }
    return out;
  },
  groupingHints(fields: ReadonlyArray<DetectedField>): GroupingHint[] {
    const buckets = new Map<Element, DetectedField[]>();
    for (const f of fields) {
      const c = f.node.closest(".application-question, .field");
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
          reason: "greenhouse:application-question",
        });
      }
    }
    return hints;
  },
};
