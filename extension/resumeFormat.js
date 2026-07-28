// resumeFormat.js — render the AYN resume text as a properly formatted PDF/DOCX.
// Exposes window.AYNResumeFormat = { buildResumePdfBlob, buildResumeDocxBlob, parseResume }
// Depends on window.jspdf (jsPDF UMD) and window.docx (docx UMD) being loaded first.
(function () {
  'use strict';

  const KNOWN_SECTIONS = ['SUMMARY', 'EXPERIENCE', 'EDUCATION', 'SKILLS', 'PROJECTS', 'CERTIFICATIONS', 'AWARDS', 'LANGUAGES'];

  // ── Sanitize dashes ────────────────────────────────────────────────
  // No em/en dashes anywhere. " - " ranges between numbers/dates become "to";
  // other stray hyphens used as connectors become commas. We keep hyphens
  // inside compound words like "front-end" intact (alpha-hyphen-alpha).
  function noDashes(s) {
    if (!s) return '';
    let t = String(s).replace(/\u2013|\u2014|\u2212/g, '-'); // normalize en/em/minus to -
    // numeric/date ranges: "2020 - 2024", "Jan 2020 - Present", "$50 - $80k"
    t = t.replace(/(\b(?:19|20)\d{2}\b|Present|Current|\$?\d[\d,.]*\w*)\s*-\s*(\b(?:19|20)\d{2}\b|Present|Current|\$?\d[\d,.]*\w*)/gi, '$1 to $2');
    // Hyphens with spaces around them used as a connector → comma
    t = t.replace(/\s+-\s+/g, ', ');
    // Leading hyphen used as a bullet stays handled elsewhere; remove stray leading "- " in body text
    return t;
  }

  // ── Parse the resume text into a structured shape ─────────────────
  function parseResume(text) {
    const raw = String(text || '').replace(/\r\n?/g, '\n');
    const lines = raw.split('\n').map(l => l.replace(/\s+$/, ''));
    let i = 0;
    const skipBlank = () => { while (i < lines.length && !lines[i].trim()) i++; };

    skipBlank();
    const name = (lines[i] || '').trim();
    i++;

    skipBlank();
    let title = '';
    let contact = '';

    // Title line (optional)
    if (i < lines.length) {
      const l = lines[i].trim();
      const isContact = /[|•]/.test(l) && /(@|\+?\d{3})/.test(l);
      const isSection = KNOWN_SECTIONS.includes(l.toUpperCase());
      if (l && !isContact && !isSection) { title = l; i++; }
    }

    skipBlank();
    if (i < lines.length) {
      const l = lines[i].trim();
      const isContact = /[|•]/.test(l) || /(@|\bhttps?:|linkedin\.com|\+?\d{3}[\d \-().]{6,})/.test(l);
      const isSection = KNOWN_SECTIONS.includes(l.toUpperCase());
      if (l && isContact && !isSection) { contact = l; i++; }
    }

    // Sections
    const sections = []; // { name, blocks: [{ heading, dateRight, bullets:[], paras:[] }] }
    let current = null;
    let currentBlock = null;

    const flushBlock = () => {
      if (currentBlock && current) current.blocks.push(currentBlock);
      currentBlock = null;
    };
    const flushSection = () => {
      flushBlock();
      if (current) sections.push(current);
      current = null;
    };

    const yearRange = /\b(?:19|20)\d{2}\b.*\b((?:19|20)\d{2}|Present|Current)\b/i;

    for (; i < lines.length; i++) {
      const lineRaw = lines[i];
      const l = lineRaw.trim();
      if (!l) { continue; }

      const up = l.toUpperCase();
      if (KNOWN_SECTIONS.includes(up)) {
        flushSection();
        current = { name: up, blocks: [] };
        currentBlock = null;
        continue;
      }
      if (!current) {
        // Stray content before any section — treat as summary
        current = { name: 'SUMMARY', blocks: [] };
      }

      const isBullet = /^[\-\*•]\s+/.test(l);
      if (current.name === 'EXPERIENCE' || current.name === 'PROJECTS') {
        if (isBullet) {
          if (!currentBlock) currentBlock = { heading: '', dateRight: '', bullets: [], paras: [] };
          currentBlock.bullets.push(noDashes(l.replace(/^[\-\*•]\s+/, '')));
        } else {
          // New role/company heading line
          flushBlock();
          let heading = l;
          let dateRight = '';
          const m = l.match(yearRange);
          if (m) {
            // Split heading and trailing date if a clear separator exists
            const dashIdx = l.search(/\s+[\-–—|·]\s+(?=[A-Za-z0-9]*\s*(?:19|20)\d{2}|Present|Current)/);
            if (dashIdx > 0) {
              heading = l.slice(0, dashIdx).trim();
              dateRight = noDashes(l.slice(dashIdx).replace(/^\s+[\-–—|·]\s+/, '').trim());
            } else {
              // Try last word date
              const idx = l.search(/\b(?:19|20)\d{2}\b/);
              if (idx > 6) {
                heading = l.slice(0, idx).trim().replace(/[,\-–—|·]\s*$/, '');
                dateRight = noDashes(l.slice(idx).trim());
              }
            }
          }
          currentBlock = { heading: noDashes(heading), dateRight, bullets: [], paras: [] };
        }
      } else {
        // SUMMARY / SKILLS / EDUCATION / others — flat paragraphs/bullets
        if (!currentBlock) currentBlock = { heading: '', dateRight: '', bullets: [], paras: [] };
        if (isBullet) currentBlock.bullets.push(noDashes(l.replace(/^[\-\*•]\s+/, '')));
        else currentBlock.paras.push(noDashes(l));
      }
    }
    flushSection();

    return {
      name: noDashes(name),
      title: noDashes(title).toUpperCase(),
      contact: noDashes(contact),
      sections,
    };
  }

  // ─── PDF builder (jsPDF) ───────────────────────────────────────────
  function buildResumePdfBlob(resumeText, fileBase) {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) throw new Error('jsPDF not loaded');
    const data = parseResume(resumeText);

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const M = 54; // ~0.75"
    const MAX_W = PAGE_W - M * 2;
    let y = M;

    const ensure = (need) => {
      if (y + need > PAGE_H - M) { doc.addPage(); y = M; }
    };

    // Name
    doc.setFont('times', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(0, 0, 0);
    if (data.name) {
      ensure(26);
      doc.text(data.name, PAGE_W / 2, y + 18, { align: 'center' });
      y += 26;
    }
    // Title
    if (data.title) {
      doc.setFont('times', 'bold');
      doc.setFontSize(11);
      ensure(16);
      doc.text(data.title, PAGE_W / 2, y + 12, { align: 'center' });
      y += 16;
    }
    // Contact
    if (data.contact) {
      doc.setFont('times', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(60, 60, 60);
      ensure(14);
      doc.text(data.contact, PAGE_W / 2, y + 10, { align: 'center' });
      y += 14;
      doc.setTextColor(0, 0, 0);
    }
    y += 6;

    const drawSectionHeader = (name) => {
      ensure(22);
      doc.setFont('times', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text(name, M, y + 11);
      y += 14;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.6);
      doc.line(M, y, PAGE_W - M, y);
      y += 8;
    };

    const drawWrapped = (text, opts = {}) => {
      const size = opts.size || 10;
      const style = opts.style || 'normal';
      const indent = opts.indent || 0;
      doc.setFont('times', style);
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, MAX_W - indent);
      const lh = size * 1.25;
      for (const ln of lines) {
        ensure(lh);
        doc.text(ln, M + indent, y + size);
        y += lh;
      }
    };

    data.sections.forEach(sec => {
      drawSectionHeader(sec.name);
      sec.blocks.forEach(block => {
        if (block.heading) {
          ensure(14);
          doc.setFont('times', 'bold');
          doc.setFontSize(10.5);
          const headW = MAX_W - (block.dateRight ? doc.getTextWidth(block.dateRight) + 12 : 0);
          const hLines = doc.splitTextToSize(block.heading, headW);
          doc.text(hLines[0], M, y + 10);
          if (block.dateRight) {
            doc.setFont('times', 'italic');
            doc.setFontSize(10);
            doc.text(block.dateRight, PAGE_W - M, y + 10, { align: 'right' });
          }
          y += 13;
          for (let k = 1; k < hLines.length; k++) {
            ensure(13);
            doc.setFont('times', 'bold');
            doc.setFontSize(10.5);
            doc.text(hLines[k], M, y + 10);
            y += 13;
          }
        }
        block.paras.forEach(p => drawWrapped(p, { size: 10 }));
        block.bullets.forEach(b => {
          doc.setFont('times', 'normal');
          doc.setFontSize(10);
          const lines = doc.splitTextToSize(b, MAX_W - 16);
          lines.forEach((ln, idx) => {
            ensure(13);
            if (idx === 0) doc.text('•', M + 2, y + 10);
            doc.text(ln, M + 16, y + 10);
            y += 12.5;
          });
        });
        y += 4;
      });
      y += 2;
    });

    return doc.output('blob');
  }

  // ─── DOCX builder (docx UMD) ───────────────────────────────────────
  function buildResumeDocxBlob(resumeText, fileBase) {
    const D = window.docx;
    if (!D) throw new Error('docx not loaded');
    const {
      Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel,
      BorderStyle, TabStopType, TabStopPosition, LevelFormat,
    } = D;
    const data = parseResume(resumeText);
    const FONT = 'Times New Roman';

    const para = (children, opts = {}) => new Paragraph({
      alignment: opts.align,
      spacing: { before: opts.before || 0, after: opts.after || 60, line: 280 },
      tabStops: opts.tabStops,
      numbering: opts.numbering,
      border: opts.border,
      children,
    });
    const run = (text, opts = {}) => new TextRun({
      text: String(text || ''), bold: !!opts.bold, italics: !!opts.italic,
      size: (opts.size || 20), font: FONT, color: opts.color || '000000',
      allCaps: !!opts.caps,
    });

    const blocks = [];

    if (data.name) {
      blocks.push(para([run(data.name, { bold: true, size: 36 })], { align: AlignmentType.CENTER, after: 40 }));
    }
    if (data.title) {
      blocks.push(para([run(data.title, { bold: true, size: 22, caps: true })], { align: AlignmentType.CENTER, after: 40 }));
    }
    if (data.contact) {
      blocks.push(para([run(data.contact, { size: 19, color: '404040' })], { align: AlignmentType.CENTER, after: 160 }));
    }

    const sectionHeader = (name) => para([run(name, { bold: true, size: 22, caps: true })], {
      before: 160, after: 60,
      border: { bottom: { color: '000000', size: 6, space: 2, style: BorderStyle.SINGLE } },
    });

    data.sections.forEach(sec => {
      blocks.push(sectionHeader(sec.name));
      sec.blocks.forEach(block => {
        if (block.heading) {
          if (block.dateRight) {
            blocks.push(para([
              run(block.heading, { bold: true, size: 21 }),
              new TextRun({ text: '\t', font: FONT }),
              run(block.dateRight, { italic: true, size: 20 }),
            ], { tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }], after: 40 }));
          } else {
            blocks.push(para([run(block.heading, { bold: true, size: 21 })], { after: 40 }));
          }
        }
        block.paras.forEach(p => {
          blocks.push(para([run(p, { size: 20 })], { after: 40 }));
        });
        block.bullets.forEach(b => {
          blocks.push(para([run(b, { size: 20 })], { numbering: { reference: 'ayn-bullets', level: 0 }, after: 20 }));
        });
      });
    });

    const doc = new Document({
      numbering: {
        config: [{
          reference: 'ayn-bullets',
          levels: [{
            level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360, hanging: 220 } } },
          }],
        }],
      },
      styles: { default: { document: { run: { font: FONT, size: 20 } } } },
      sections: [{
        properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
        children: blocks,
      }],
    });

    return Packer.toBlob(doc);
  }

  // Blob → base64 (no data: prefix)
  async function blobToBase64(blob) {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  function buildCoverLetterPdfBlob(bodyText, opts) {
    opts = opts || {};
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) throw new Error('jsPDF not loaded');
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const M = 72;
    const MAX_W = PAGE_W - M * 2;
    let y = M;
    function ensureSpace(h) { if (y + h > PAGE_H - M) { doc.addPage(); y = M; } }
    const name = (opts.name || '').trim();
    const contact = (opts.contact || '').trim();
    if (name && name.length <= 60) {
      doc.setFont('times', 'bold'); doc.setFontSize(15);
      ensureSpace(20); doc.text(name, M, y); y += 20;
    }
    if (contact) {
      doc.setFont('times', 'normal'); doc.setFontSize(10);
      const cl = doc.splitTextToSize(contact, MAX_W);
      ensureSpace(cl.length * 13); doc.text(cl, M, y); y += cl.length * 13 + 6;
    }
    const date = opts.date || new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
    doc.setFont('times','normal'); doc.setFontSize(11);
    y += 6; ensureSpace(16); doc.text(date, M, y); y += 22;
    const rawLines = String(bodyText || '').replace(/\r/g,'').split('\n');
    doc.setFont('times','normal'); doc.setFontSize(11);
    const LH = 15;
    for (const raw of rawLines) {
      const t = raw.trim();
      if (!t) { y += 8; continue; }
      const lines = doc.splitTextToSize(t, MAX_W);
      for (const ln of lines) { ensureSpace(LH); doc.text(ln, M, y); y += LH; }
    }
    return doc.output('blob');
  }

  // ─── Cover Letter DOCX (docx UMD) ─────────────────────────────────
  // Single column, standard font, no images/tables. ATS-safe.
  function buildCoverLetterDocxBlob(bodyText, opts) {
    opts = opts || {};
    const D = window.docx;
    if (!D) throw new Error('docx not loaded');
    const { Document, Packer, Paragraph, TextRun, AlignmentType } = D;
    const FONT = 'Times New Roman';
    const run = (text, o = {}) => new TextRun({ text: String(text || ''), bold: !!o.bold, size: o.size || 22, font: FONT });
    const para = (children, o = {}) => new Paragraph({ children, alignment: o.align, spacing: { after: o.after != null ? o.after : 120, line: 300 } });
    const blocks = [];
    const name = (opts.name || '').trim();
    const contact = (opts.contact || '').trim();
    if (name) blocks.push(para([run(name, { bold: true, size: 28 })], { after: 40 }));
    if (contact) blocks.push(para([run(contact, { size: 20 })], { after: 160 }));
    const date = opts.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    blocks.push(para([run(date, { size: 22 })], { after: 200 }));
    const rawLines = String(bodyText || '').replace(/\r/g, '').split('\n');
    let buf = [];
    const flushPara = () => { if (buf.length) { blocks.push(para([run(buf.join(' '), { size: 22 })], { after: 160 })); buf = []; } };
    for (const raw of rawLines) {
      const t = raw.trim();
      if (!t) { flushPara(); continue; }
      buf.push(t);
    }
    flushPara();
    const doc = new Document({
      styles: { default: { document: { run: { font: FONT, size: 22 } } } },
      sections: [{
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children: blocks,
      }],
    });
    return Packer.toBlob(doc);
  }

  window.AYNResumeFormat = { parseResume, buildResumePdfBlob, buildResumeDocxBlob, buildCoverLetterPdfBlob, buildCoverLetterDocxBlob, blobToBase64 };
})();
