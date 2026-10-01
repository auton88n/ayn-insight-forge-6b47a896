/**
 * resumeText.ts — split out of resumeDocs.ts, Sept 2026, during a deep
 * investigation into "why is the app slow, why does it take time for
 * pages to show up." resumeDocs.ts statically imports jsPDF and docx (the
 * two libraries behind the app's real, live DOCX download) and compiles
 * into a genuinely huge chunk on its own — 742KB / 230KB gzipped, the
 * single biggest chunk in the whole build, confirmed directly in the
 * production build output. ProfileTab.tsx and JobsTab.tsx both imported
 * resumeToText/fileBase/downloadBlob from that same file as a plain,
 * static top-level import — meaning every signed-in visitor opening their
 * Profile or Saved Jobs tab (two of the most ordinary, frequent actions
 * in the whole app) paid that entire 230KB transfer-and-parse cost just
 * to open the page, whether or not they ever clicked Download that
 * session, since resumeToText is what the diff viewer needs to render
 * immediately, not something that can wait for a click.
 *
 * This file holds exactly the pieces those two components need on every
 * render — resumeToText (plain-text flattening, for the diff viewer),
 * fileBase (a filename helper), and downloadBlob (a trivial anchor-click
 * helper) — none of which need jsPDF or docx at all. resumeDocs.ts itself
 * keeps the two, and every caller now imports its heavy exports
 * (buildResumeDocxBlob, buildTextDocxBlob) with a dynamic import() at the
 * point of the actual download click, not at the top of the file, so the
 * heavy chunk only ever loads for someone who actually clicks Download.
 */
import type { ResumeContent } from "@/lib/resumeHub";

/** Flatten a structured resume into plain text — used by the diff viewer, not the downloads. */
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
