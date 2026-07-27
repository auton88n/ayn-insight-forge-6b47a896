/**
 * adapters/ashby.ts — hidden-checkbox proxy handling preserved.
 */
import type { ATSPlugin, GroupingHint } from "./index";
import type { DetectedField } from "../question";
import { makeEvidence, type Evidence } from "../evidence";
import { ensureFid } from "../refs";
import { getAdapterConfig, hostRe, joinSelector } from "../adapter-config";

export const ashbyAdapter: ATSPlugin = {
  id: "ashby",
  detect(doc: Document, url: string): boolean {
    const cfg = getAdapterConfig().ashby;
    try { if (hostRe("ashby").test(new URL(url).hostname)) return true; } catch {}
    return !!doc.querySelector(joinSelector(cfg.detectSelectors));
  },
  collectEvidence(field: DetectedField): Evidence[] {
    const cfg = getAdapterConfig().ashby;
    const out: Evidence[] = [];
    if (field.kind === "checkbox" || field.kind === "radio" || field.kind === "custom") {
      const proxy = proxyLabelFor(field.node);
      if (proxy) {
        out.push(makeEvidence("adapter", "label", proxy, 0.9, { via: "ashby-proxy" }));
      }
    }
    const q = field.node.closest(joinSelector(cfg.wrapperSelectors));
    if (q) {
      const legend = q.querySelector(joinSelector(cfg.labelSelectors));
      const t = legend?.textContent?.replace(/\s+/g, " ").trim();
      if (t) out.push(makeEvidence("adapter", "label", t, 0.85, { via: "ashby-fieldentry" }));
      const choiceTexts = Array.from(q.querySelectorAll(joinSelector(cfg.choiceButtonSelectors)))
        .map((n) => n.textContent?.replace(/\s+/g, " ").trim() ?? "")
        .filter((t) => t && t.length <= 120)
        .slice(0, 12);
      if (choiceTexts.length >= 2) {
        out.push(makeEvidence("adapter", "options", choiceTexts.map((label) => ({ value: label, label })), 0.9, { via: "ashby-choice-buttons" }));
      }
    }
    return out;
  },
  groupingHints(fields: ReadonlyArray<DetectedField>): GroupingHint[] {
    const cfg = getAdapterConfig().ashby;
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
        const customChoices = arr.filter((f) => f.kind === "custom" || f.kind === "radio");
        const members = customChoices.length >= 2 ? customChoices : arr;
        hints.push({
          memberFids: members.map((f) => ensureFid(f.node)),
          confidence: 0.95,
          reason: "ashby:fieldEntry",
        });
      }
    }
    return hints;
  },
};

function proxyLabelFor(el: Element): string | null {
  const parent = el.parentElement;
  if (!parent) return null;
  const clone = parent.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("input,textarea,select,button").forEach((n) => n.remove());
  const t = (clone.textContent || "").replace(/\s+/g, " ").trim();
  return t || null;
}
