// Lightweight document structure shared by the screen preview and exports.
import type { ResumeContent } from "./resumeHub";

export type BlockKind = "name" | "contact" | "summary" | "header" | "title" | "bullet" | "plain" | "label";
// Date metadata is preserved inline in the measured, left-aligned title.
export interface DocBlock { kind: BlockKind; text: string; meta?: string; gapBefore?: number }

export function buildResumeBlocks(c: ResumeContent): DocBlock[] {
  const blocks: DocBlock[] = [];
  const b = c.basics ?? {};
  if (b.name) blocks.push({ kind: "name", text: b.name });
  const linkUrls = (b.links ?? []).map(l => [l.label, l.url].filter(Boolean).join(": "));
  const contact = [b.title, b.email, b.phone, b.location, ...linkUrls].filter(Boolean).join(" | ");
  if (contact) blocks.push({ kind: "contact", text: contact });
  if (b.summary) {
    blocks.push({ kind: "header", text: "SUMMARY", gapBefore: 10 });
    blocks.push({ kind: "summary", text: b.summary, gapBefore: 7 });
  }

  if ((c.skillGroups ?? []).length) {
    blocks.push({ kind: "header", text: "SKILLS", gapBefore: 12 });
    // v3.143.0 — reported directly against a live download: the category
    // label ("AI & Software Development:") rendered in the exact same
    // plain weight as the skill list after it, so the two ran together
    // and the section read as one dense block instead of scannable groups.
    // The label now gets its own bold line (reusing "label"'s styling,
    // deliberately not "title" — a category name isn't a job/school title
    // and doesn't want that block's date-alignment behavior), with the
    // skill list plain on the line right below it.
    (c.skillGroups ?? []).forEach((g, i) => {
      blocks.push({ kind: "label", text: g.category, gapBefore: i === 0 ? 7 : 5 });
      blocks.push({ kind: "plain", text: g.skills.join(", "), gapBefore: 1 });
    });
    // Stale presentation groups must never hide canonical skills.
    const grouped = new Set(c.skillGroups!.flatMap(g => g.skills));
    const ungrouped = (c.skills ?? []).filter(skill => !grouped.has(skill));
    if (ungrouped.length) blocks.push({ kind: "plain", text: ungrouped.join(", "), gapBefore: 1 });
  } else if ((c.skills ?? []).length) {
    blocks.push({ kind: "header", text: "SKILLS", gapBefore: 12 });
    blocks.push({ kind: "plain", text: (c.skills ?? []).join(", "), gapBefore: 7 });
  }

  if ((c.work ?? []).length) {
    blocks.push({ kind: "header", text: "EXPERIENCE", gapBefore: 12 });
    (c.work ?? []).forEach((w, i) => {
      const when = [w.start, w.end || "Present"].filter(Boolean).join(" to ");
      blocks.push({
        kind: "title",
        text: [w.title, w.company, w.location].filter(Boolean).join(", "),
        meta: when || undefined,
        gapBefore: i === 0 ? 7 : 8,
      });
      (w.bullets ?? []).filter(Boolean).forEach(x => blocks.push({ kind: "bullet", text: x }));
    });
  }

  if ((c.projects ?? []).length) {
    blocks.push({ kind: "header", text: "PROJECTS", gapBefore: 12 });
    c.projects!.forEach((p, i) => {
      blocks.push({ kind: "title", text: [p.name, p.url].filter(Boolean).join(" | "), gapBefore: i === 0 ? 7 : 8 });
      if (p.description) blocks.push({ kind: "plain", text: p.description });
    });
  }

  if ((c.certifications ?? []).length) {
    blocks.push({ kind: "header", text: "CERTIFICATIONS & LICENSES", gapBefore: 12 });
    blocks.push({ kind: "plain", text: (c.certifications ?? []).join(", "), gapBefore: 7 });
  }

  if ((c.education ?? []).length) {
    blocks.push({ kind: "header", text: "EDUCATION", gapBefore: 12 });
    (c.education ?? []).forEach((e, i) => {
      const when = [e.start, e.end].filter(Boolean).join(" to ");
      blocks.push({
        kind: "title",
        text: [e.degree, e.field, e.school].filter(Boolean).join(", "),
        meta: when || undefined,
        gapBefore: i === 0 ? 7 : 4,
      });
    });
  }

  return blocks;
}
