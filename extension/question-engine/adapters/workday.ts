/**
 * adapters/workday.ts
 * Workday ATS. Detects Workday via host / DOM signatures and uses
 * `data-automation-id` as the canonical label anchor. Groups repeating
 * work-history sections and Workday's custom "Select One" combobox by their
 * automation ids.
 */

import type { ATSPlugin, GroupingHint } from "./index";
import type { DetectedField } from "../question";
import { makeEvidence, type Evidence } from "../evidence";
import { ensureFid } from "../refs";

const WORKDAY_HOST_RE = /myworkday(?:jobs|site)?\.com$|\.wd\d+\.myworkday(?:jobs)?\.com$/i;

export const workdayAdapter: ATSPlugin = {
  id: "workday",
  detect(doc: Document, url: string): boolean {
    try {
      const u = new URL(url);
      if (WORKDAY_HOST_RE.test(u.hostname)) return true;
    } catch {
      // fall through
    }
    return !!doc.querySelector("[data-automation-id]");
  },
  collectEvidence(field: DetectedField, doc: Document): Evidence[] {
    void doc;
    const out: Evidence[] = [];
    const el = field.node;
    const aid = el.getAttribute("data-automation-id");
    if (aid) {
      const humanized = humanize(aid);
      if (humanized) {
        out.push(
          makeEvidence("adapter", "label", humanized, 0.9, { via: "data-automation-id", aid })
        );
      }
    }
    // "Select One" button-based comboboxes: label sits on the button's aria-label.
    const parent = el.closest("[data-automation-id]");
    if (parent && parent !== el) {
      const paid = parent.getAttribute("data-automation-id");
      if (paid) out.push(makeEvidence("adapter", "section", humanize(paid), 0.8));
    }
    // required marker used by Workday
    const req = el.closest("[data-automation-id-prompt]")?.getAttribute("data-required");
    if (req === "true") out.push(makeEvidence("adapter", "required", true, 0.95));
    return out;
  },
  groupingHints(fields: ReadonlyArray<DetectedField>): GroupingHint[] {
    // Group repeating work-history rows by their nearest [data-automation-id*="row"] container.
    const rows = new Map<Element, DetectedField[]>();
    for (const f of fields) {
      const row = f.node.closest('[data-automation-id*="row" i],[data-automation-id*="Row"]');
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

function humanize(aid: string): string {
  return aid
    .replace(/^formField-/, "")
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}
