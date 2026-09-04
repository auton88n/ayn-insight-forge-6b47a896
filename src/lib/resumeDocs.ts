/**
 * resumeDocs.ts — v3.4.0 "one profile, one resume", rebuilt v3.65.0 for a
 * real one-page layout with the name and every job/school title actually
 * bold, not just guessed at from all-caps plain text.
 *
 * Same output contract as extension/resumeFormat.js: real selectable text in
 * the file, never a rasterized screenshot.
 *
 * v3.137.0 — two real bugs found by generating and inspecting real output,
 * not guessed at. One, every job/school "title" block concatenated title,
 * company, and the date range into one plain string with no structure at
 * all — reported directly as "titles not aligned," and rightly so: a real
 * resume puts the date range flush right on the same line as the title,
 * consistently, and this had no such column at all. Both builders below
 * now draw the date right-aligned when it fits on the title's own line.
 * Two, and the more serious one: buildResumeDocxBlob has never set an
 * explicit page size/margin, so it silently fell back to the docx
 * library's own default — confirmed directly in its source, a flat 1-inch
 * margin on every side. The PDF builder uses 0.75in margins, and
 * pickFontSize picks ONE font size by measuring against the PDF's wider
 * 504pt content width, then reuses that same size for the DOCX — meaning
 * the DOCX was always wrapping into a narrower real column than the size
 * was actually chosen for, overflowing lines it was never measured
 * against and landing on two pages more often than the PDF ever would.
 * Fixed by giving the DOCX section the identical 0.75in margins the PDF
 * already uses, so the same picked size fits the same real width in both.
 */
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun, TabStopType, AlignmentType } from "docx";
import type { ResumeContent } from "@/lib/resumeHub";

/** Flatten a structured resume into plain text — used by the diff viewer, not the downloads below. */
export function resumeToText(c: ResumeContent): string {
  const b = c.basics ?? {};
  const lines: string[] = [];
  if (b.name) lines.push(b.name);
  const linkUrls = (b.links ?? []).map(l => l.url).filter(Boolean);
  const contact = [b.title, b.email, b.phone, b.location, ...linkUrls].filter(Boolean).join(" | ");
  if (contact) lines.push(contact);
  if (b.summary) lines.push("", "SUMMARY", b.summary);

  if ((c.skillGroups ?? []).length) {
    lines.push("", "SKILLS");
    (c.skillGroups ?? []).forEach(g => lines.push(`${g.category}: ${g.skills.join(", ")}`));
  } else if ((c.skills ?? []).length) {
    lines.push("", "SKILLS", (c.skills ?? []).join(", "));
  }

  if ((c.work ?? []).length) {
    lines.push("", "EXPERIENCE");
    (c.work ?? []).forEach(w => {
      const when = [w.start, w.end || "Present"].filter(Boolean).join(" to ");
      lines.push([w.title, w.company].filter(Boolean).join(", ") + (when ? ` (${when})` : ""));
      (w.bullets ?? []).filter(Boolean).forEach(x => lines.push(`• ${x}`));
      lines.push("");
    });
  }
  if ((c.certifications ?? []).length) lines.push("CERTIFICATIONS & LICENSES", (c.certifications ?? []).join(", "), "");
  if ((c.education ?? []).length) {
    lines.push("EDUCATION");
    (c.education ?? []).forEach(e =>
      lines.push([e.degree, e.field, e.school].filter(Boolean).join(", "))
    );
  }
  return lines.join("\n").trim();
}

// ── Structured layout, shared by the PDF and DOCX builders ─────────────────
//
// A resume is a short, fixed list of block types (name, contact line,
// summary, section header, a job/school title, a bullet, a plain line), each
// with its own bold/size treatment. Building from this instead of a
// flattened text string is what lets both formats bold the name and every
// job title correctly, instead of the old approach of guessing "is this
// line shouting in all caps" on a string that has already lost the
// structure.
type BlockKind = "name" | "contact" | "summary" | "header" | "title" | "bullet" | "plain" | "label";
// v3.137.0 — `meta` is the date range for a "title" block, kept separate
// from `text` (title + company/school) so it can be drawn right-aligned on
// the same line, the standard resume convention, instead of being
// concatenated into one plain string with nothing to align it.
interface DocBlock { kind: BlockKind; text: string; meta?: string; gapBefore?: number }

function buildResumeBlocks(c: ResumeContent): DocBlock[] {
  const blocks: DocBlock[] = [];
  const b = c.basics ?? {};
  if (b.name) blocks.push({ kind: "name", text: b.name });
  const linkUrls = (b.links ?? []).map(l => l.url).filter(Boolean);
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
        text: [w.title, w.company].filter(Boolean).join(", "),
        meta: when || undefined,
        gapBefore: i === 0 ? 7 : 8,
      });
      (w.bullets ?? []).filter(Boolean).forEach(x => blocks.push({ kind: "bullet", text: x }));
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

// v3.143.0 — asked directly to center the name/contact block. Every other
// block stays left-aligned; only the header identity block is centered,
// the standard resume convention.
const CENTERED_KINDS: BlockKind[] = ["name", "contact"];

const PAGE_W = 612, PAGE_H = 792; // US letter, points
const MARGIN = 54; // 0.75 inch
const CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_H = PAGE_H - MARGIN * 2;
const LINE_RATIO = 1.15;
// Shrink to fit one page: try each size in turn, smallest still-readable
// size wins if nothing bigger fits. A genuinely very long resume (10+ roles)
// falls through to the safety net in layoutPdf, which starts a second page
// rather than silently clipping content.
const CANDIDATE_SIZES = [10.5, 10, 9.5, 9, 8.5, 8];
// A senior executive resume shouldn't get shrunk to 8pt to force one page —
// two comfortable pages read better than one cramped one at that level.
// Never below 10pt; let the existing page-break safety net in layoutPdf
// carry the rest onto a real second page instead of shrinking further.
// There's no structured field anywhere in this schema for "has an academic
// publications list" (no publications section exists), so that half of the
// exception isn't detectable — this only covers the executive-title case.
const EXEC_CANDIDATE_SIZES = [10.5, 10];
const EXEC_TITLE_RE = /\b(chief\s+\w+\s+officer|c[eoxfmt]o|president|vice\s*president|\bvp\b|executive\s+director|managing\s+director)\b/i;

function isExecutiveResume(c: ResumeContent): boolean {
  return EXEC_TITLE_RE.test(c.basics?.title || "");
}

/** Lays out every block at the given size. draw=false only measures (no page-break safety net, so the returned height reflects true overflow). */
function layoutPdf(doc: jsPDF, blocks: DocBlock[], baseSize: number, draw: boolean): number {
  let y = MARGIN;
  for (let block of blocks) {
    const style = STYLE[block.kind];
    const size = baseSize + style.sizeDelta;
    doc.setFont("helvetica", style.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lineH = size * LINE_RATIO;
    y += block.gapBefore ?? 0;

    // v3.137.0 — a title block with a date range draws the date flush right
    // on the title's own line when there's room for both, the standard
    // resume convention instead of one plain concatenated string. A title
    // long enough that it wouldn't leave room degrades to the old
    // parenthetical form rather than an awkward two-width wrap.
    if (block.kind === "title" && block.meta) {
      doc.setFont("helvetica", "bold");
      const titleWidth = doc.getTextWidth(block.text);
      doc.setFont("helvetica", "normal");
      const metaWidth = doc.getTextWidth(block.meta);
      const GAP = 10;
      if (titleWidth + GAP + metaWidth <= CONTENT_W) {
        if (draw && y > PAGE_H - MARGIN) { doc.addPage(); y = MARGIN; }
        if (draw) {
          doc.setFont("helvetica", "bold");
          doc.text(block.text, MARGIN, y);
          doc.setFont("helvetica", "normal");
          doc.text(block.meta, MARGIN + CONTENT_W - metaWidth, y);
        }
        y += lineH;
        continue;
      }
      // Doesn't fit on one line — fall through to the plain wrap below,
      // with the date folded back into the text as before.
      block = { ...block, text: `${block.text} (${block.meta})` };
    }

    const prefix = block.kind === "bullet" ? "• " : "";
    const width = CONTENT_W - style.indent;
    const wrapped: string[] = block.text.trim() ? doc.splitTextToSize(prefix + block.text, width) : [""];
    const centered = CENTERED_KINDS.includes(block.kind);
    for (const line of wrapped) {
      if (draw && y > PAGE_H - MARGIN) { doc.addPage(); y = MARGIN; }
      if (draw) {
        if (centered) doc.text(line, PAGE_W / 2, y, { align: "center" });
        else doc.text(line, MARGIN + style.indent, y);
      }
      y += lineH;
    }
  }
  return y - MARGIN;
}

// v3.143.0 — safetyMargin gives the picked size headroom below the exact
// measured cap. The PDF path leaves it at 1 (its own measurement is
// authoritative for itself, nothing to hedge against); the DOCX path below
// passes a tighter margin, since Word renders the same size a little wider
// than jsPDF's Helvetica-as-a-ruler estimate assumes, and DOCX no longer
// has a PDF fallback sitting next to it once PDF is dropped for AYN's own
// written documents — this is now the only copy the person downloads.
function pickFontSize(doc: jsPDF, blocks: DocBlock[], allowTwoPages: boolean, safetyMargin = 1): number {
  const sizes = allowTwoPages ? EXEC_CANDIDATE_SIZES : CANDIDATE_SIZES;
  const cap = (allowTwoPages ? CONTENT_H * 2 : CONTENT_H) * safetyMargin;
  for (const size of sizes) {
    if (layoutPdf(doc, blocks, size, false) <= cap) return size;
  }
  return sizes[sizes.length - 1];
}

export function buildResumePdfBlob(c: ResumeContent): Blob {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const blocks = buildResumeBlocks(c);
  const size = pickFontSize(doc, blocks, isExecutiveResume(c));
  layoutPdf(doc, blocks, size, true);
  return doc.output("blob");
}

// v3.137.0 — twips (1pt = 20 twips) is the unit both the page margin and
// the tab-stop position below need, converted from the exact same
// point-based constants the PDF builder uses.
const TWIPS_PER_PT = 20;

// v3.143.0 — Calibri was the docx library's own convenient default, never
// a deliberate choice — asked directly for whatever's easiest for an ATS
// or an AI reader to parse. Arial is the standard answer (it's a
// metric-compatible clone of Helvetica, built for exactly this kind of
// cross-renderer parity), and it's also what the PDF builder already
// draws in, so both formats now genuinely match instead of two different
// typefaces that happen to look similar.
const DOCX_FONT = "Arial";

export async function buildResumeDocxBlob(c: ResumeContent): Promise<Blob> {
  const blocks = buildResumeBlocks(c);
  // jsPDF is used here purely as a text-measuring ruler so the DOCX picks
  // the same size the PDF settled on — now a closer estimate than before
  // since both sides draw in Helvetica/Arial, real metric equivalents of
  // each other, not just "close enough". Word still does its own
  // pagination, so this can't be a hard guarantee the way the PDF builder
  // is — the safety margin below is the hedge against that gap, which
  // matters more now that DOCX is the only format AYN's own written
  // documents download as.
  const size = pickFontSize(new jsPDF({ unit: "pt", format: "letter" }), blocks, isExecutiveResume(c), 0.93);
  const rightTabPos = Math.round(CONTENT_W * TWIPS_PER_PT);

  const paragraphs = blocks.map(block => {
    const style = STYLE[block.kind];
    const prefix = block.kind === "bullet" ? "• " : "";
    const baseSpacing = { before: (block.gapBefore ?? 0) * TWIPS_PER_PT, after: 60 };
    const indent = style.indent ? { left: style.indent * TWIPS_PER_PT } : undefined;
    const alignment = CENTERED_KINDS.includes(block.kind) ? AlignmentType.CENTER : undefined;

    // Same right-aligned date treatment as layoutPdf: a real tab stop at
    // the page's own right margin, not a plain concatenated string.
    if (block.kind === "title" && block.meta) {
      return new Paragraph({
        spacing: baseSpacing,
        indent,
        alignment,
        tabStops: [{ type: TabStopType.RIGHT, position: rightTabPos }],
        children: [
          new TextRun({ text: block.text, bold: true, font: DOCX_FONT, size: Math.round((size + style.sizeDelta) * 2) }),
          new TextRun({ text: `\t${block.meta}`, bold: false, font: DOCX_FONT, size: Math.round((size + style.sizeDelta) * 2) }),
        ],
      });
    }

    return new Paragraph({
      spacing: baseSpacing,
      indent,
      alignment,
      children: [new TextRun({
        text: prefix + block.text,
        bold: style.bold,
        font: DOCX_FONT,
        size: Math.round((size + style.sizeDelta) * 2),
      })],
    });
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: Math.round(PAGE_W * TWIPS_PER_PT), height: Math.round(PAGE_H * TWIPS_PER_PT) },
          margin: {
            top: Math.round(MARGIN * TWIPS_PER_PT),
            right: Math.round(MARGIN * TWIPS_PER_PT),
            bottom: Math.round(MARGIN * TWIPS_PER_PT),
            left: Math.round(MARGIN * TWIPS_PER_PT),
          },
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
// style. Same page setup and fonts as the resume builders, one fixed size.
const TEXT_SIZE = 11;

export function buildTextPdfBlob(text: string): Blob {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(TEXT_SIZE);
  const lineH = TEXT_SIZE * 1.45;
  let y = MARGIN;
  for (const para of String(text ?? "").split(/\n/)) {
    const wrapped: string[] = para.trim() ? doc.splitTextToSize(para, CONTENT_W) : [""];
    for (const line of wrapped) {
      if (y > PAGE_H - MARGIN) { doc.addPage(); y = MARGIN; }
      doc.text(line, MARGIN, y);
      y += lineH;
    }
  }
  return doc.output("blob");
}

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



export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Safe file base like "Ghazi_Aldhyaei_Acme_Resume". */
export function fileBase(...parts: (string | undefined | null)[]) {
  return parts.filter(Boolean).join("_").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/_+/g, "_").slice(0, 80);
}
