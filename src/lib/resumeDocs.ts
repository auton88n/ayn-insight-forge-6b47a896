/** Resume fitting estimates Arial layout using Helvetica metrics. Word/LibreOffice
 * perform actual pagination; font substitution and renderer differences may change it.
 * Inspect the downloaded document before submitting it. */
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun, AlignmentType, LineRuleType } from "docx";
import type { ResumeContent } from "@/lib/resumeHub";

// ── Structured layout ───────────────────────────────────────────────────
//
// A resume is a short, fixed list of block types (name, contact line,
// summary, section header, a job/school title, a bullet, a plain line), each
// with its own bold/size treatment. Building from this instead of a
// flattened text string is what lets both formats bold the name and every
// job title correctly, instead of the old approach of guessing "is this
// line shouting in all caps" on a string that has already lost the
// structure.
type BlockKind = "name" | "contact" | "summary" | "header" | "title" | "bullet" | "plain" | "label";
// Date metadata is preserved inline in the measured, left-aligned title.
interface DocBlock { kind: BlockKind; text: string; meta?: string; gapBefore?: number }

function buildResumeBlocks(c: ResumeContent): DocBlock[] {
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

const STYLE: Record<BlockKind, { bold: boolean; sizeDelta: number; indent: number }> = {
  name: { bold: true, sizeDelta: 4, indent: 0 },
  contact: { bold: false, sizeDelta: 0, indent: 0 },
  summary: { bold: false, sizeDelta: 0, indent: 0 },
  header: { bold: true, sizeDelta: 2.5, indent: 0 },
  title: { bold: true, sizeDelta: 0, indent: 0 },
  bullet: { bold: false, sizeDelta: 0, indent: 12 },
  plain: { bold: false, sizeDelta: 0, indent: 0 },
  label: { bold: true, sizeDelta: 0, indent: 0 },
};

const PAGE_W = 612, PAGE_H = 792; // US letter, points
const MARGIN = 54; // 0.75 inch
const CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_H = PAGE_H - MARGIN * 2;
const TWIPS_PER_PT = 20;
const DOCX_FONT = "Arial";
const LINE_RATIO = 1.15;
const HEIGHT_BUDGET = CONTENT_H * 0.93;
// Reserve width too: Helvetica metrics are only a proxy for Arial.
const WIDTH_SAFETY = 0.97;
const FIT_OPTIONS = [
  { size: 10.5, gapScale: 1, after: 3 },
  { size: 10.5, gapScale: 0.5, after: 1 },
  { size: 10, gapScale: 0.5, after: 1 },
] as const;


export class ResumeOverflowError extends Error {
  readonly code = "RESUME_ONE_PAGE_OVERFLOW";
  constructor() {
    super("This resume is estimated to exceed one readable page at 10pt. Shorten the summary or bullet wording in your resume, or choose which entries to include, then try downloading again. No content was removed. Word and other editors may paginate differently.");
    this.name = "ResumeOverflowError";
  }
}

function measureLayout(blocks: DocBlock[], option: typeof FIT_OPTIONS[number]) {
  const ruler = new jsPDF({ unit: "pt", format: "letter" });
  const paragraphs = blocks.map(block => {
    const style = STYLE[block.kind];
    const size = option.size + style.sizeDelta;
    ruler.setFont("helvetica", style.bold ? "bold" : "normal");
    ruler.setFontSize(size);
    // Only whitespace changes. Dates use the same left-aligned flow as titles.
    const content = [block.text, block.meta].filter(Boolean).join(" | ");
    const text = (block.kind === "bullet" ? "• " : "") + content.replace(/\s+/gu, " ").trim();
    const lines: string[] = ruler.splitTextToSize(text, (CONTENT_W - style.indent) * WIDTH_SAFETY);
    return {
      ...style, size, lines: lines.length ? lines : [""],
      before: Math.round((block.gapBefore ?? 0) * option.gapScale * TWIPS_PER_PT),
      after: option.after * TWIPS_PER_PT,
      line: Math.ceil(size * LINE_RATIO * TWIPS_PER_PT),
    };
  });
  // Count both paragraph margins conservatively, even if Word collapses them.
  const height = paragraphs.reduce((sum, p) => sum + p.before + p.after + p.lines.length * p.line, 0) / TWIPS_PER_PT;
  return { paragraphs, height };
}

export async function buildResumeDocxBlob(c: ResumeContent): Promise<Blob> {
  const blocks = buildResumeBlocks(c);
  let layout = FIT_OPTIONS.map(option => measureLayout(blocks, option))
    .find(candidate => candidate.height <= HEIGHT_BUDGET);
  if (!layout) throw new ResumeOverflowError();

  // Emit measured breaks and spacing to reduce drift. This is still an
  // estimate, not actual DOCX pagination. AT_LEAST avoids clipping tall glyphs.
  const paragraphs = layout.paragraphs.map(p => new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: p.before, after: p.after, line: p.line, lineRule: LineRuleType.AT_LEAST },
    indent: p.indent ? { left: p.indent * TWIPS_PER_PT } : undefined,
    widowControl: false,
    children: p.lines.map((text, index) => new TextRun({
      text, break: index ? 1 : undefined, bold: p.bold, font: DOCX_FONT, size: p.size * 2,
    })),
  }));
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W * TWIPS_PER_PT, height: PAGE_H * TWIPS_PER_PT },
          margin: { top: MARGIN * TWIPS_PER_PT, right: MARGIN * TWIPS_PER_PT, bottom: MARGIN * TWIPS_PER_PT, left: MARGIN * TWIPS_PER_PT },
        },
      },
      children: paragraphs,
    }],
  });
  return Packer.toBlob(doc);
}

// ── Plain text documents (cover letters) ───────────────────────────────────
//
// A cover letter is prose, not a structured resume, so it has no blocks to
// style. Same page setup and font as the resume builder above, one fixed
// size — no jsPDF measuring pass needed here, since there's no shrink-to-
// fit ladder for plain prose the way there is for a resume's own sections.
const TEXT_SIZE = 11;

export async function buildTextDocxBlob(text: string): Promise<Blob> {
  const paragraphs = String(text ?? "").split(/\n/).map(line =>
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: line, font: DOCX_FONT, size: TEXT_SIZE * 2 })],
    })
  );
  const doc = new Document({ sections: [{ children: paragraphs }] });
  return Packer.toBlob(doc);
}
