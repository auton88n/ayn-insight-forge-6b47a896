/**
 * adapters/generic.ts
 * Always-available fallback adapter. Emits container-level grouping hints and
 * a light section-label evidence pulled from the nearest preceding heading.
 * detect() always returns true so it is the guaranteed floor.
 */

import type { ATSPlugin, GroupingHint } from "./index";
import type { DetectedField } from "../question";
import { makeEvidence, type Evidence } from "../evidence";
import { ensureFid } from "../refs";

export const genericAdapter: ATSPlugin = {
  id: "generic",
  detect() {
    return true;
  },
  collectEvidence(field: DetectedField): Evidence[] {
    const out: Evidence[] = [];
    const section = nearestHeading(field.node);
    if (section) out.push(makeEvidence("adapter", "section", section, 0.7));
    return out;
  },
  groupingHints(fields: ReadonlyArray<DetectedField>): GroupingHint[] {
    // Cluster checkboxes/radios sharing the same immediate container that isn't
    // a fieldset (fieldsets already handled by grouping.ts).
    const buckets = new Map<Element, DetectedField[]>();
    for (const f of fields) {
      if (f.kind !== "radio" && f.kind !== "checkbox") continue;
      const c = f.container;
      if (!c || c.tagName.toLowerCase() === "fieldset") continue;
      const arr = buckets.get(c) ?? [];
      arr.push(f);
      buckets.set(c, arr);
    }
    const hints: GroupingHint[] = [];
    for (const [, arr] of buckets) {
      if (arr.length > 1) {
        hints.push({
          memberFids: arr.map((f) => ensureFid(f.node)),
          confidence: 0.75,
          reason: "generic:shared-container",
        });
      }
    }
    return hints;
  },
};

function nearestHeading(el: Element): string | null {
  let node: Element | null = el;
  let depth = 0;
  while (node && depth < 8) {
    let sib: Element | null = node.previousElementSibling;
    while (sib) {
      if (/^H[1-6]$/.test(sib.tagName) || sib.getAttribute("role") === "heading") {
        const t = (sib.textContent || "").replace(/\s+/g, " ").trim();
        if (t) return t;
      }
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
    depth++;
  }
  return null;
}
