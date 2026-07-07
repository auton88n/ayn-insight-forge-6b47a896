/**
 * adapters/ashby.ts
 * Ashby ATS. THE HIDDEN-CHECKBOX PROXY FIX LIVES HERE.
 *
 * Ashby renders many custom controls where the real <input type=checkbox> is
 * visually hidden and a sibling clickable div carries the label. We must:
 *   1) Group by container, never by shared `name`.
 *   2) Emit label evidence from the clickable proxy's text.
 */

import type { ATSPlugin, GroupingHint } from "./index";
import type { DetectedField } from "../question";
import { makeEvidence, type Evidence } from "../evidence";
import { ensureFid } from "../refs";

const ASHBY_HOST_RE = /ashbyhq\.com$|jobs\.ashbyhq\.com$/i;

export const ashbyAdapter: ATSPlugin = {
  id: "ashby",
  detect(doc: Document, url: string): boolean {
    try {
      if (ASHBY_HOST_RE.test(new URL(url).hostname)) return true;
    } catch {
      // fall through
    }
    return !!doc.querySelector('[class*="ashby-application" i], [data-testid^="ashby"]');
  },
  collectEvidence(field: DetectedField): Evidence[] {
    const out: Evidence[] = [];
    if (field.kind === "checkbox" || field.kind === "radio") {
      const proxy = proxyLabelFor(field.node);
      if (proxy) {
        out.push(makeEvidence("adapter", "label", proxy, 0.9, { via: "ashby-proxy" }));
      }
    }
    const q = field.node.closest('[class*="_fieldEntry_" i], [class*="fieldEntry" i]');
    if (q) {
      const legend = q.querySelector('[class*="_label_" i], label');
      const t = legend?.textContent?.replace(/\s+/g, " ").trim();
      if (t) out.push(makeEvidence("adapter", "label", t, 0.85, { via: "ashby-fieldentry" }));
    }
    return out;
  },
  groupingHints(fields: ReadonlyArray<DetectedField>): GroupingHint[] {
    // Group by nearest _fieldEntry_ container — ignores shared `name`.
    const buckets = new Map<Element, DetectedField[]>();
    for (const f of fields) {
      const c = f.node.closest('[class*="_fieldEntry_" i], [class*="fieldEntry" i]');
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
          confidence: 0.95,
          reason: "ashby:fieldEntry",
        });
      }
    }
    return hints;
  },
};

function proxyLabelFor(el: Element): string | null {
  // sibling text container of the hidden input
  const parent = el.parentElement;
  if (!parent) return null;
  const clone = parent.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("input,textarea,select,button").forEach((n) => n.remove());
  const t = (clone.textContent || "").replace(/\s+/g, " ").trim();
  return t || null;
}
