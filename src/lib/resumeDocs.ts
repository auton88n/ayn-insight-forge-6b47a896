/**
 * resumeDocs.ts — v3.4.0 "one profile, one resume"
 *
 * The web Hub now owns document download, because tailored resumes and cover
 * letters live on the job they were generated for instead of in a resume
 * library. Same output contract as extension/resumeFormat.js: real text in the
 * file, never a rasterized screenshot.
 */
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun } from "docx";
import type { ResumeContent } from "@/lib/resumeHub";

/** Flatten a structured resume into the plain text both builders render. */
export function resumeToText(c: ResumeContent): string {
  const b = c.basics ?? {};
  const lines: string[] = [];
  if (b.name) lines.push(b.name);
  const contact = [b.title, b.email, b.phone, b.location].filter(Boolean).join(" | ");
  if (contact) lines.push(contact);
  if (b.summary) lines.push("", b.summary);

  if ((c.work ?? []).length) {
    lines.push("", "EXPERIENCE");
    (c.work ?? []).forEach(w => {
      const when = [w.start, w.end || "Present"].filter(Boolean).join(" to ");
      lines.push([w.title, w.company].filter(Boolean).join(", ") + (when ? ` (${when})` : ""));
      (w.bullets ?? []).filter(Boolean).forEach(x => lines.push(`• ${x}`));
      lines.push("");
    });
  }
  if ((c.education ?? []).length) {
    lines.push("EDUCATION");
    (c.education ?? []).forEach(e =>
      lines.push([e.degree, e.field, e.school].filter(Boolean).join(", "))
    );
    lines.push("");
  }
  if ((c.skills ?? []).length) lines.push("SKILLS", (c.skills ?? []).join(", "));
  return lines.join("\n").trim();
}

const MARGIN = 54; // 0.75 inch at 72 dpi
const LINE = 14;

export function buildTextPdfBlob(text: string): Blob {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const width = doc.internal.pageSize.getWidth() - MARGIN * 2;
  const height = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  let y = MARGIN;
  text.split(/\r?\n/).forEach(raw => {
    const heading = /^[A-Z][A-Z \/&]{2,}$/.test(raw.trim());
    doc.setFont("helvetica", heading ? "bold" : "normal");
    const wrapped: string[] = raw.trim() ? doc.splitTextToSize(raw, width) : [""];
    wrapped.forEach(w => {
      if (y > height - MARGIN) { doc.addPage(); y = MARGIN; }
      doc.text(w, MARGIN, y);
      y += LINE;
    });
  });
  return doc.output("blob");
}

export async function buildTextDocxBlob(text: string): Promise<Blob> {
  const paragraphs = text.split(/\r?\n/).map(raw => {
    const heading = /^[A-Z][A-Z \/&]{2,}$/.test(raw.trim());
    return new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: raw, bold: heading, font: "Calibri", size: 21 })],
    });
  });
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
