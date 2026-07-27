/**
 * adapters/workday.ts
 */
import type { ATSPlugin, GroupingHint } from "./index";
import type { DetectedField } from "../question";
import { makeEvidence, type Evidence } from "../evidence";
import { ensureFid } from "../refs";
import { getAdapterConfig, hostRe, joinSelector } from "../adapter-config";

export const workdayAdapter: ATSPlugin = {
  id: "workday",
  detect(doc: Document, url: string): boolean {
    const cfg = getAdapterConfig().workday;
    try { if (hostRe("workday").test(new URL(url).hostname)) return true; } catch {}
    return !!doc.querySelector(joinSelector(cfg.detectSelectors));
  },
  collectEvidence(field: DetectedField, doc: Document): Evidence[] {
    void doc;
    const cfg = getAdapterConfig().workday;
    const out: Evidence[] = [];
    const el = field.node;
    const aid = el.getAttribute(cfg.automationAttr);
    if (aid) {
      const humanized = humanize(aid, cfg.humanizeStripPrefix);
      if (humanized) {
        out.push(
          makeEvidence("adapter", "label", humanized, 0.9, { via: "data-automation-id", aid })
        );
      }
    }
    const parent = el.closest(`[${cfg.automationAttr}]`);
    if (parent && parent !== el) {
      const paid = parent.getAttribute(cfg.automationAttr);
      if (paid) out.push(makeEvidence("adapter", "section", humanize(paid, cfg.humanizeStripPrefix), 0.8));
    }
    const req = el.closest(`[${cfg.promptAttr}]`)?.getAttribute(cfg.requiredAttr);
    if (req === "true") out.push(makeEvidence("adapter", "required", true, 0.95));
    return out;
  },
  groupingHints(fields: ReadonlyArray<DetectedField>): GroupingHint[] {
    const cfg = getAdapterConfig().workday;
    const sel = joinSelector(cfg.rowSelectors);
    const rows = new Map<Element, DetectedField[]>();
    for (const f of fields) {
      const row = f.node.closest(sel);
      if (!row) continue;
      const arr = rows.get(row) ?? [];
      arr.push(f);
      rows.set(row, arr);
    }
    const hints: GroupingHint[] = [];
    for (const [, arr] of rows) {
      if (arr.length > 1) {
        hints.push({
          memberFids: arr.map((f) => ensureFid(f.node)),
          confidence: 0.9,
          reason: "workday:row",
        });
      }
    }
    return hints;
  },
};

function humanize(aid: string, stripPrefix: string): string {
  let s = aid;
  if (stripPrefix) {
    try { s = s.replace(new RegExp("^" + stripPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), ""); } catch {}
  }
  return s
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}
