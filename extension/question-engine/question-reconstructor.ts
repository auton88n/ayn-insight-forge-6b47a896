/**
 * question-reconstructor.ts
 * DetectedField[] -> QuestionGroup[]. Consumes cluster hints from grouping.ts,
 * attaches the question label via a proximity-decay scorer that rejects
 * placeholder and option text as labels.
 */

import type { DetectedField, QuestionGroup } from "./question";
import { makeEvidence, type Evidence } from "./evidence";
import { cluster } from "./grouping";

export function reconstruct(
  fields: ReadonlyArray<DetectedField>,
  root: Document | Element
): QuestionGroup[] {
  void root;
  const clusters = cluster(fields);
  return clusters.map((c) => {
    const groupingEvidence: Evidence[] = [
      makeEvidence("dom", "grouping", { reason: c.reason, size: c.members.length }, c.confidence),
    ];

    // Prefer an explicit group-level label (fieldset/legend, role=group[aria-label]).
    const groupLabel = groupLevelLabel(c.members);
    if (groupLabel) {
      groupingEvidence.push(
        makeEvidence("dom", "label", groupLabel, 0.95, { via: "group-container" })
      );
    } else if (c.members.length > 1) {
      // Multi-control group with no explicit label — score candidates.
      const scored = scoreCandidateLabel(c.members);
      if (scored) {
        groupingEvidence.push(
          makeEvidence("dom", "label", scored.text, scored.confidence, {
            via: "proximity-decay",
          })
        );
      }
    }

    return Object.freeze({
      controls: Object.freeze(c.members.slice()),
      groupingEvidence: Object.freeze(groupingEvidence),
      groupConfidence: c.confidence,
    }) as QuestionGroup;
  });
}

function groupLevelLabel(members: DetectedField[]): string | null {
  if (members.length === 0) return null;
  const first = members[0].node;
  const container = first.closest('fieldset,[role="group"],[role="radiogroup"]');
  if (!container) return null;
  // Ensure the container actually wraps all members.
  if (!members.every((m) => container.contains(m.node))) return null;

  const legend = container.querySelector(":scope > legend");
  if (legend) {
    const t = normalize(legend.textContent || "");
    if (t) return t;
  }
  const labelledBy = container.getAttribute("aria-labelledby");
  if (labelledBy) {
    const doc = container.ownerDocument;
    const parts: string[] = [];
    for (const id of labelledBy.split(/\s+/).filter(Boolean)) {
      const n = doc?.getElementById(id);
      if (n) parts.push(normalize(n.textContent || ""));
    }
    const t = normalize(parts.join(" "));
    if (t) return t;
  }
  const ariaLabel = container.getAttribute("aria-label");
  if (ariaLabel) return normalize(ariaLabel);
  return null;
}

/**
 * Proximity-decay scorer. Looks upward from the group anchor, collecting the
 * nearest text nodes / headings that:
 *   - are NOT inside a form control themselves
 *   - are NOT the label of one of the group's own options
 * Score decays by (dom-depth + vertical-pixel-distance).
 */
function scoreCandidateLabel(
  members: DetectedField[]
): { text: string; confidence: number } | null {
  const anchor = members[0].node;
  const memberSet = new Set(members.map((m) => m.node));
  const optionLabelTexts = new Set(
    members
      .map((m) => textOfLabel(m.node))
      .filter(Boolean)
      .map((t) => t!.toLowerCase())
  );

  const anchorBox = safeRect(anchor);
  const candidates: { text: string; score: number }[] = [];

  let depth = 0;
  let node: Element | null = anchor.parentElement;
  while (node && depth < 6) {
    // walk preceding siblings for text-bearing nodes
    let sib: Element | null = node.previousElementSibling;
    while (sib) {
      collectFromNode(sib, memberSet, optionLabelTexts, anchorBox, depth, candidates);
      sib = sib.previousElementSibling;
    }
    // also try the container itself's first text-bearing child
    collectFromNode(node, memberSet, optionLabelTexts, anchorBox, depth, candidates);
    node = node.parentElement;
    depth++;
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return { text: best.text, confidence: Math.max(0.4, Math.min(0.9, best.score)) };
}

function collectFromNode(
  n: Element,
  memberSet: Set<Element>,
  optionTexts: Set<string>,
  anchorBox: DOMRect | null,
  depth: number,
  out: { text: string; score: number }[]
): void {
  if (isFormControl(n)) return;
  if (memberSet.has(n)) return;
  // Prefer heading / label / span / p / div immediate text
  const tag = n.tagName.toLowerCase();
  if (!/^(h[1-6]|label|span|p|div|legend|strong|b|em)$/.test(tag)) return;
  const t = normalize(n.textContent || "");
  if (!t || t.length > 300) return;
  if (optionTexts.has(t.toLowerCase())) return;

  const box = safeRect(n);
  const vDist = box && anchorBox ? Math.max(0, anchorBox.top - box.top) : 100;
  // Score: closer depth and smaller vertical distance = higher.
  const depthPenalty = 1 / (1 + depth);
  const distPenalty = 1 / (1 + vDist / 100);
  const headingBoost = /^h[1-6]$/.test(tag) ? 1.2 : 1.0;
  const score = depthPenalty * distPenalty * headingBoost;
  out.push({ text: t, score });
}

function textOfLabel(el: Element): string | null {
  const id = el.getAttribute("id");
  const doc = el.ownerDocument;
  if (id && doc) {
    const l = doc.querySelector(`label[for="${cssEscape(id)}"]`);
    if (l) return normalize(l.textContent || "");
  }
  const wrap = el.closest("label");
  if (wrap) {
    const clone = wrap.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input,textarea,select,button").forEach((x) => x.remove());
    return normalize(clone.textContent || "");
  }
  return null;
}

function isFormControl(el: Element): boolean {
  return /^(input|textarea|select|button)$/i.test(el.tagName);
}

function safeRect(el: Element): DOMRect | null {
  try {
    return (el as HTMLElement).getBoundingClientRect();
  } catch {
    return null;
  }
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
