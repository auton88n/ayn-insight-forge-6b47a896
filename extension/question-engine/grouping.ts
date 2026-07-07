/**
 * grouping.ts
 * Pure clustering of DetectedField[] into candidate groups.
 *
 * THE ASHBY FIX LIVES HERE: for CHECKBOXES we group by container/label rather
 * than the `name` attribute alone (Ashby's hidden-checkbox proxies share names
 * across unrelated questions). For RADIOS, shared `name` is a native contract
 * and remains the strongest grouping signal.
 *
 * Pure and side-effect free. Returns cluster indices + reasons; the
 * reconstructor decides which hints win.
 */

import type { DetectedField } from "./question";

export interface Cluster {
  members: DetectedField[];
  reason: "shared-name" | "aria-radiogroup" | "fieldset" | "container+shared-label" | "singleton";
  confidence: number;
}

export function cluster(fields: ReadonlyArray<DetectedField>): Cluster[] {
  const clusters: Cluster[] = [];
  const claimed = new Set<DetectedField>();

  // 1) Radios sharing name attribute
  const radiosByName = new Map<string, DetectedField[]>();
  for (const f of fields) {
    if (f.kind !== "radio") continue;
    const name = (f.node as HTMLInputElement).name;
    if (!name) continue;
    const arr = radiosByName.get(name) ?? [];
    arr.push(f);
    radiosByName.set(name, arr);
  }
  for (const [, arr] of radiosByName) {
    if (arr.length > 1) {
      arr.forEach((f) => claimed.add(f));
      clusters.push({ members: arr, reason: "shared-name", confidence: 0.98 });
    }
  }

  // 2) Radios inside a shared aria role=radiogroup / fieldset
  for (const f of fields) {
    if (f.kind !== "radio" || claimed.has(f)) continue;
    const container = f.node.closest('[role="radiogroup"],fieldset');
    if (!container) continue;
    const siblings = fields.filter(
      (o) => o.kind === "radio" && !claimed.has(o) && container.contains(o.node)
    );
    if (siblings.length > 1) {
      siblings.forEach((s) => claimed.add(s));
      clusters.push({
        members: siblings,
        reason: container.getAttribute("role") === "radiogroup" ? "aria-radiogroup" : "fieldset",
        confidence: 0.95,
      });
    }
  }

  // 3) Checkbox groups inside a shared fieldset/[role=group] — but only when
  //    the container carries a group label (avoids collapsing unrelated
  //    consent boxes).
  const checkboxContainers = new Map<Element, DetectedField[]>();
  for (const f of fields) {
    if (f.kind !== "checkbox" || claimed.has(f)) continue;
    const container = f.node.closest('fieldset,[role="group"]');
    if (!container) continue;
    if (!hasGroupLabel(container)) continue;
    const arr = checkboxContainers.get(container) ?? [];
    arr.push(f);
    checkboxContainers.set(container, arr);
  }
  for (const [, arr] of checkboxContainers) {
    if (arr.length > 1) {
      arr.forEach((f) => claimed.add(f));
      clusters.push({
        members: arr,
        reason: "container+shared-label",
        confidence: 0.9,
      });
    }
  }

  // 4) Everything else: singletons
  for (const f of fields) {
    if (claimed.has(f)) continue;
    clusters.push({ members: [f], reason: "singleton", confidence: 1.0 });
  }

  return clusters;
}

function hasGroupLabel(container: Element): boolean {
  if (container.tagName.toLowerCase() === "fieldset") {
    if (container.querySelector(":scope > legend")) return true;
  }
  if (container.getAttribute("aria-labelledby") || container.getAttribute("aria-label")) return true;
  return false;
}
