/**
 * adapters/lever.ts
 */
import type { ATSPlugin, GroupingHint } from "./index";
import type { DetectedField } from "../question";
import { makeEvidence, type Evidence } from "../evidence";
import { ensureFid } from "../refs";
import { getAdapterConfig, hostRe, joinSelector } from "../adapter-config";

export const leverAdapter: ATSPlugin = {
  id: "lever",
  detect(doc: Document, url: string): boolean {
    const cfg = getAdapterConfig().lever;
    try { if (hostRe("lever").test(new URL(url).hostname)) return true; } catch {}
    return !!doc.querySelector(joinSelector(cfg.detectSelectors));
  },
  collectEvidence(field: DetectedField): Evidence[] {
    const cfg = getAdapterConfig().lever;
    const out: Evidence[] = [];
    const q = field.node.closest(joinSelector(cfg.wrapperSelectors));
    if (q) {
      const label = q.querySelector(joinSelector(cfg.labelSelectors));
      const t = label?.textContent?.replace(/\s+/g, " ").trim();
      if (t) out.push(makeEvidence("adapter", "label", t, 0.9, { via: "lever-app-label" }));
      if (q.querySelector(joinSelector(cfg.requiredSelectors))) {
        out.push(makeEvidence("adapter", "required", true, 0.9));
      }
    }
    return out;
  },
  groupingHints(fields: ReadonlyArray<DetectedField>): GroupingHint[] {
    const cfg = getAdapterConfig().lever;
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
          reason: "lever:application-question",
        });
      }
    }
    return hints;
  },
};
