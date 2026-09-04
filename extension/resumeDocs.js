/**
 * AYN Auto-Apply — resume PDF builder.
 *
 * v3.287.0 -- the last disclosed gap from extension/README.md's own
 * "Known limits" list: file attachment had a correct mechanism
 * (DataTransfer) but nothing to inject, since the extension had no
 * resume file source of its own. This is a direct, line-for-line port
 * of src/lib/resumeDocs.ts's buildResumePdfBlob and everything it
 * depends on -- same block model, same shrink-to-fit sizing, same
 * executive-title exception, same bold-name/bold-title treatment --
 * so a resume attached from here is visually identical to the one the
 * web app itself would generate, not a second, different-looking
 * implementation. DOCX is deliberately left out: it needs the much
 * heavier `docx` package vendored too, and PDF alone is what the
 * overwhelming majority of real "attach your resume" fields accept.
 *
 * Loaded as a plain script (not a module -- no bundler in this
 * extension), after vendor/jspdf.umd.min.js, which exposes the real
 * jsPDF constructor as window.jspdf.jsPDF. Exposes one function on
 * window for content.js to call: window.__aynBuildResumePdfBlob(content).
 */
(() => {
  const { jsPDF } = window.jspdf;

  function buildResumeBlocks(c) {
    const blocks = [];
    const b = c.basics || {};
    if (b.name) blocks.push({ kind: "name", text: b.name });
    const linkUrls = (b.links || []).map((l) => l.url).filter(Boolean);
    const contact = [b.title, b.email, b.phone, b.location, ...linkUrls].filter(Boolean).join(" | ");
    if (contact) blocks.push({ kind: "contact", text: contact });
    if (b.summary) {
      blocks.push({ kind: "header", text: "SUMMARY", gapBefore: 10 });
      blocks.push({ kind: "summary", text: b.summary, gapBefore: 7 });
    }

    if ((c.skillGroups || []).length) {
      blocks.push({ kind: "header", text: "SKILLS", gapBefore: 12 });
      (c.skillGroups || []).forEach((g, i) => {
        blocks.push({ kind: "label", text: g.category, gapBefore: i === 0 ? 7 : 5 });
        blocks.push({ kind: "plain", text: g.skills.join(", "), gapBefore: 1 });
      });
    } else if ((c.skills || []).length) {
      blocks.push({ kind: "header", text: "SKILLS", gapBefore: 12 });
      blocks.push({ kind: "plain", text: (c.skills || []).join(", "), gapBefore: 7 });
    }

    if ((c.work || []).length) {
      blocks.push({ kind: "header", text: "EXPERIENCE", gapBefore: 12 });
      (c.work || []).forEach((w, i) => {
        const when = [w.start, w.end || "Present"].filter(Boolean).join(" to ");
        blocks.push({
          kind: "title",
          text: [w.title, w.company].filter(Boolean).join(", "),
          meta: when || undefined,
          gapBefore: i === 0 ? 7 : 8,
        });
        (w.bullets || []).filter(Boolean).forEach((x) => blocks.push({ kind: "bullet", text: x }));
      });
    }

    if ((c.certifications || []).length) {
      blocks.push({ kind: "header", text: "CERTIFICATIONS & LICENSES", gapBefore: 12 });
      blocks.push({ kind: "plain", text: (c.certifications || []).join(", "), gapBefore: 7 });
    }

    if ((c.education || []).length) {
      blocks.push({ kind: "header", text: "EDUCATION", gapBefore: 12 });
      (c.education || []).forEach((e, i) => {
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

  const STYLE = {
    name: { bold: true, sizeDelta: 4, indent: 0 },
    contact: { bold: false, sizeDelta: 0, indent: 0 },
    summary: { bold: false, sizeDelta: 0, indent: 0 },
    header: { bold: true, sizeDelta: 2.5, indent: 0 },
    title: { bold: true, sizeDelta: 0, indent: 0 },
    bullet: { bold: false, sizeDelta: 0, indent: 12 },
    plain: { bold: false, sizeDelta: 0, indent: 0 },
    label: { bold: true, sizeDelta: 0, indent: 0 },
  };
  const CENTERED_KINDS = ["name", "contact"];

  const PAGE_W = 612, PAGE_H = 792; // US letter, points
  const MARGIN = 54; // 0.75 inch
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const CONTENT_H = PAGE_H - MARGIN * 2;
  const LINE_RATIO = 1.15;
  const CANDIDATE_SIZES = [10.5, 10, 9.5, 9, 8.5, 8];
  const EXEC_CANDIDATE_SIZES = [10.5, 10];
  const EXEC_TITLE_RE = /\b(chief\s+\w+\s+officer|c[eoxfmt]o|president|vice\s*president|\bvp\b|executive\s+director|managing\s+director)\b/i;

  function isExecutiveResume(c) {
    return EXEC_TITLE_RE.test((c.basics && c.basics.title) || "");
  }

  function layoutPdf(doc, blocks, baseSize, draw) {
    let y = MARGIN;
    for (let block of blocks) {
      const style = STYLE[block.kind];
      const size = baseSize + style.sizeDelta;
      doc.setFont("helvetica", style.bold ? "bold" : "normal");
      doc.setFontSize(size);
      const lineH = size * LINE_RATIO;
      y += block.gapBefore || 0;

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
        block = Object.assign({}, block, { text: `${block.text} (${block.meta})` });
      }

      const prefix = block.kind === "bullet" ? "• " : "";
      const width = CONTENT_W - style.indent;
      const wrapped = block.text.trim() ? doc.splitTextToSize(prefix + block.text, width) : [""];
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

  function pickFontSize(doc, blocks, allowTwoPages, safetyMargin) {
    safetyMargin = safetyMargin == null ? 1 : safetyMargin;
    const sizes = allowTwoPages ? EXEC_CANDIDATE_SIZES : CANDIDATE_SIZES;
    const cap = (allowTwoPages ? CONTENT_H * 2 : CONTENT_H) * safetyMargin;
    for (const size of sizes) {
      if (layoutPdf(doc, blocks, size, false) <= cap) return size;
    }
    return sizes[sizes.length - 1];
  }

  window.__aynBuildResumePdfBlob = function (c) {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const blocks = buildResumeBlocks(c);
    const size = pickFontSize(doc, blocks, isExecutiveResume(c));
    layoutPdf(doc, blocks, size, true);
    return doc.output("blob");
  };

  // v3.327.0 -- a real, live gap found by the founder testing the
  // extension against a real Reddit application: it only ever attached
  // one static, un-tailored resume file, and had nothing at all to offer
  // for a real "Cover Letter" upload field -- both capabilities already
  // exist in AYN's own web app (the tailor/cover_letter actions), just
  // never wired into the extension's own file-attach step.
  //
  // v3.339.0 -- reported directly: "why you have different type of resume
  // tailoring in the extension, it should be the same formatting and rules
  // as the web app." The resume builder above already was a faithful,
  // line-for-line port (see this file's own top comment); this one never
  // was -- it was a genuinely separate, hand-written implementation:
  // split on PARAGRAPH breaks with an extra hand-tuned gap between them
  // (lineH * 0.6, nothing web does), a different line height (15.5 vs the
  // web's TEXT_SIZE * 1.45 = 15.95), and a capitalized "Helvetica" (jsPDF
  // normalizes this internally so it wasn't actually a bug, confirmed
  // live before assuming it was, but still worth matching the lowercase
  // spelling every other call in this codebase uses). Rewritten as an
  // exact port of src/lib/resumeDocs.ts's own buildTextPdfBlob: split on
  // every single newline, one uniform line height, no extra paragraph
  // spacing invented on this side. A cover letter attached from here is
  // now genuinely the same document the web app would have produced from
  // the identical text, not a second, different-looking rendering of it.
  const TEXT_SIZE = 11;
  window.__aynBuildCoverLetterPdfBlob = function (bodyText) {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(TEXT_SIZE);
    const lineH = TEXT_SIZE * 1.45;
    let y = MARGIN;
    for (const para of String(bodyText == null ? "" : bodyText).split(/\n/)) {
      const wrapped = para.trim() ? doc.splitTextToSize(para, CONTENT_W) : [""];
      for (const line of wrapped) {
        if (y > PAGE_H - MARGIN) { doc.addPage(); y = MARGIN; }
        doc.text(line, MARGIN, y);
        y += lineH;
      }
    }
    return doc.output("blob");
  };
})();
