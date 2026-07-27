/**
 * adapters/greenhouse.ts
 * Greenhouse ATS. Constants are sourced from adapter-config so they can be
 * hot-fixed via the ats_config table.
 */

import type { ATSPlugin, GroupingHint } from "./index";
import type { DetectedField } from "../question";
import { makeEvidence, type Evidence } from "../evidence";
import { ensureFid } from "../refs";
import { getAdapterConfig, hostRe, joinSelector } from "../adapter-config";

export const greenhouseAdapter: ATSPlugin = {
  id: "greenhouse",
  detect(doc: Document, url: string): boolean {
    const cfg = getAdapterConfig().greenhouse;
    try { if (hostRe("greenhouse").test(new URL(url).hostname)) return true; } catch {}
    return !!doc.querySelector(joinSelector(cfg.detectSelectors));
  },
  collectEvidence(field: DetectedField): Evidence[] {
    const cfg = getAdapterConfig().greenhouse;
    const out: Evidence[] = [];
    const id = field.node.getAttribute("id") || "";
    if (id.startsWith(cfg.idPrefix)) {
      let stripRe: RegExp;
      try { stripRe = new RegExp(cfg.idPrefixStripRe); } catch { stripRe = /^job_application_(answers_attributes_\d+_)?/; }
      const label = id.replace(stripRe, "").replace(/_/g, " ").trim();
      if (label) out.push(makeEvidence("adapter", "label", label, 0.75, { via: "gh-id" }));
    }
    const wrap = field.node.closest(joinSelector(cfg.wrapperSelectors));
    if (wrap?.querySelector(joinSelector(cfg.requiredSelectors))) {
      out.push(makeEvidence("adapter", "required", true, 0.9));
    }
    return out;
  },
  groupingHints(fields: ReadonlyArray<DetectedField>): GroupingHint[] {
    const cfg = getAdapterConfig().greenhouse;
    const sel = joinSelector(cfg.groupingSelectors);
    const buckets = new Map<Element, DetectedField[]>();
    for (const f of fields) {
      const c = f.node.closest(sel);
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
