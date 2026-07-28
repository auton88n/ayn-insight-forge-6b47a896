// resumeFormat.js — v2.12.1
// Two-pass (measure + draw) layout with bounded auto-fit. Single column, real
// selectable text (jsPDF for PDFs, docx UMD for Word). No rasterization, no
// tables, no headers/footers, no images. ATS-safe.
//
// PDF builders return { blob, fitsOnePage, overflowLines, longestSections }.
// DOCX builders return a Blob directly (Word paginates itself).
//
// Depends on window.jspdf (jsPDF UMD) and window.docx (docx UMD).
(function () {
  'use strict';

  const KNOWN_SECTIONS = ['SUMMARY', 'EXPERIENCE', 'EDUCATION', 'SKILLS', 'PROJECTS', 'CERTIFICATIONS', 'AWARDS', 'LANGUAGES'];

  // ── Sanitize dashes (unchanged behaviour) ─────────────────────────
  function noDashes(s) {
    if (!s) return '';
    let t = String(s).replace(/\u2013|\u2014|\u2212/g, '-');
    t = t.replace(/(\b(?:19|20)\d{2}\b|Present|Current|\$?\d[\d,.]*\w*)\s*-\s*(\b(?:19|20)\d{2}\b|Present|Current|\$?\d[\d,.]*\w*)/gi, '$1 to $2');
    t = t.replace(/\s+-\s+/g, ', ');
    return t;
  }

  // ── Parser (unchanged) ────────────────────────────────────────────
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

    const sections = [];
    let current = null;
    let currentBlock = null;

    const flushBlock = () => { if (currentBlock && current) current.blocks.push(currentBlock); currentBlock = null; };
    const flushSection = () => { flushBlock(); if (current) sections.push(current); current = null; };

    const yearRange = /\b(?:19|20)\d{2}\b.*\b((?:19|20)\d{2}|Present|Current)\b/i;

    for (; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l) continue;

      const up = l.toUpperCase();
      if (KNOWN_SECTIONS.includes(up)) {
        flushSection();
        current = { name: up, blocks: [] };
        currentBlock = null;
        continue;
      }
      if (!current) current = { name: 'SUMMARY', blocks: [] };

      const isBullet = /^[\-\*•]\s+/.test(l);
      if (current.name === 'EXPERIENCE' || current.name === 'PROJECTS') {
        if (isBullet) {
          if (!currentBlock) currentBlock = { heading: '', dateRight: '', bullets: [], paras: [] };
          currentBlock.bullets.push(noDashes(l.replace(/^[\-\*•]\s+/, '')));
        } else {
          flushBlock();
          let heading = l;
          let dateRight = '';
          const m = l.match(yearRange);
          if (m) {
            const dashIdx = l.search(/\s+[\-–—|·]\s+(?=[A-Za-z0-9]*\s*(?:19|20)\d{2}|Present|Current)/);
            if (dashIdx > 0) {
              heading = l.slice(0, dashIdx).trim();
              dateRight = noDashes(l.slice(dashIdx).replace(/^\s+[\-–—|·]\s+/, '').trim());
            } else {
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

  // ── Resume style scale (7 steps from top→floor) ───────────────────
  // Top (idx 0) reproduces v2.12.0 output. Floor (idx 6) is the readability
  // floor: body 9pt, name 16pt, section 10pt, LH 1.12, margins 0.75x, spacing 0.6x.
  const RESUME_SCALE = [
    { body: 10.0, section: 11.0, name: 20, heading: 10.5, contact: 9.5, title: 11,
      lh: 1.25, margin: 54, blockGap: 4, sectionGap: 2 },
    { body:  9.8, section: 10.85, name: 19.3, heading: 10.4, contact: 9.4, title: 10.85,
      lh: 1.23, margin: 51.75, blockGap: 3.7, sectionGap: 1.87 },
    { body:  9.65, section: 10.7, name: 18.7, heading: 10.25, contact: 9.3, title: 10.7,
      lh: 1.21, margin: 49.5, blockGap: 3.5, sectionGap: 1.73 },
    { body:  9.5, section: 10.5, name: 18, heading: 10.1, contact: 9.2, title: 10.5,
      lh: 1.19, margin: 47.25, blockGap: 3.25, sectionGap: 1.6 },
    { body:  9.35, section: 10.35, name: 17.35, heading: 9.95, contact: 9.1, title: 10.35,
      lh: 1.17, margin: 45, blockGap: 3.0, sectionGap: 1.5 },
    { body:  9.15, section: 10.15, name: 16.7, heading: 9.8, contact: 9.0, title: 10.15,
      lh: 1.145, margin: 42.75, blockGap: 2.7, sectionGap: 1.35 },
    { body:  9.0, section: 10.0, name: 16, heading: 9.6, contact: 9.0, title: 10.0,
      lh: 1.12, margin: 40.5, blockGap: 2.4, sectionGap: 1.2 },
  ];

  // Single layout function. In measureOnly mode: no doc.text, no addPage; returns
  // { totalHeight, sectionHeights: [{name, height}] }. In draw mode: renders, and
  // paginates only if allowMultiPage (the "still overflows at floor" fallback).
  function layoutResume(doc, data, style, opts) {
    const measureOnly = !!(opts && opts.measureOnly);
    const allowMultiPage = !!(opts && opts.allowMultiPage);
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const M = style.margin;
    const MAX_W = PAGE_W - M * 2;
    let y = M;
    const sectionHeights = [];

    const ensure = (need) => {
      if (measureOnly) return;
      if (y + need > PAGE_H - M) {
        if (allowMultiPage) { doc.addPage(); y = M; }
      }
    };
    const drawText = (text, x, yy, o) => { if (!measureOnly) doc.text(text, x, yy, o); };

    // Name
    if (data.name) {
      const h = style.name * 1.30;
      ensure(h);
      if (!measureOnly) { doc.setFont('times', 'bold'); doc.setFontSize(style.name); doc.setTextColor(0,0,0); drawText(data.name, PAGE_W/2, y + style.name*0.9, {align:'center'}); }
      y += h;
    }
    if (data.title) {
      const h = style.title * 1.45;
      ensure(h);
      if (!measureOnly) { doc.setFont('times','bold'); doc.setFontSize(style.title); drawText(data.title, PAGE_W/2, y + style.title*1.09, {align:'center'}); }
      y += h;
    }
    if (data.contact) {
      const h = style.contact * 1.47;
      ensure(h);
      if (!measureOnly) { doc.setFont('times','normal'); doc.setFontSize(style.contact); doc.setTextColor(60,60,60); drawText(data.contact, PAGE_W/2, y + style.contact*1.05, {align:'center'}); doc.setTextColor(0,0,0); }
      y += h;
    }
    y += style.blockGap * 1.5;

    // Section header
    const drawSectionHeader = (name) => {
      const h = style.section * 1.27 + 8;
      ensure(h);
      if (!measureOnly) {
        doc.setFont('times','bold'); doc.setFontSize(style.section); doc.setTextColor(0,0,0);
        drawText(name, M, y + style.section);
      }
      y += style.section * 1.27;
      if (!measureOnly) { doc.setDrawColor(0,0,0); doc.setLineWidth(0.6); doc.line(M, y, PAGE_W - M, y); }
      y += 8;
    };

    const wrapLines = (text, size, style2, maxW) => {
      // Need font set for splitTextToSize to compute widths accurately.
      doc.setFont('times', style2 || 'normal'); doc.setFontSize(size);
      return doc.splitTextToSize(String(text || ''), maxW);
    };

    const drawWrappedBody = (text, opts2) => {
      opts2 = opts2 || {};
      const size = opts2.size || style.body;
      const styleStr = opts2.style || 'normal';
      const indent = opts2.indent || 0;
      const lines = wrapLines(text, size, styleStr, MAX_W - indent);
      const lh = size * style.lh;
      for (const ln of lines) {
        ensure(lh);
        if (!measureOnly) { doc.setFont('times', styleStr); doc.setFontSize(size); doc.text(ln, M + indent, y + size); }
        y += lh;
      }
    };

    data.sections.forEach(sec => {
      const startY = y;
      drawSectionHeader(sec.name);
      sec.blocks.forEach(block => {
        if (block.heading) {
          const hHead = style.heading * 1.24;
          ensure(hHead);
          const headW = MAX_W - (block.dateRight ? (measureOnly ? 80 : doc.getTextWidth(block.dateRight)) + 12 : 0);
          const hLines = wrapLines(block.heading, style.heading, 'bold', headW);
          if (!measureOnly) {
            doc.setFont('times','bold'); doc.setFontSize(style.heading); doc.text(hLines[0], M, y + style.heading*0.95);
            if (block.dateRight) { doc.setFont('times','italic'); doc.setFontSize(style.heading*0.95); doc.text(block.dateRight, PAGE_W - M, y + style.heading*0.95, {align:'right'}); }
          }
          y += hHead;
          for (let k = 1; k < hLines.length; k++) {
            ensure(hHead);
            if (!measureOnly) { doc.setFont('times','bold'); doc.setFontSize(style.heading); doc.text(hLines[k], M, y + style.heading*0.95); }
            y += hHead;
          }
        }
        block.paras.forEach(p => drawWrappedBody(p, { size: style.body }));
        block.bullets.forEach(b => {
          const lines = wrapLines(b, style.body, 'normal', MAX_W - 16);
          const lh = style.body * style.lh;
          lines.forEach((ln, idx) => {
            ensure(lh);
            if (!measureOnly) {
              doc.setFont('times','normal'); doc.setFontSize(style.body);
              if (idx === 0) doc.text('•', M + 2, y + style.body*0.95);
              doc.text(ln, M + 16, y + style.body*0.95);
            }
            y += lh;
          });
        });
        y += style.blockGap;
      });
      y += style.sectionGap;
      sectionHeights.push({ name: sec.name, height: y - startY });
    });

    return { totalHeight: y - M, sectionHeights };
  }

  // ── Resume PDF builder ────────────────────────────────────────────
  function buildResumePdfBlob(resumeText /*, fileBase */) {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) throw new Error('jsPDF not loaded');
    const data = parseResume(resumeText);

    // Fit loop: measure with each scale step until one page holds it.
    const measureDoc = new jsPDF({ unit: 'pt', format: 'letter' });
    const PAGE_H = measureDoc.internal.pageSize.getHeight();

    let chosen = null;
    let lastMeasure = null;
    for (let i = 0; i < RESUME_SCALE.length; i++) {
      const style = RESUME_SCALE[i];
      const usable = PAGE_H - style.margin * 2;
      const m = layoutResume(measureDoc, data, style, { measureOnly: true });
      lastMeasure = { style, measure: m, usable };
      if (m.totalHeight <= usable) { chosen = { style, measure: m, usable }; break; }
    }

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    if (chosen) {
      layoutResume(doc, data, chosen.style, { measureOnly: false, allowMultiPage: false });
      return { blob: doc.output('blob'), fitsOnePage: true, overflowLines: 0, longestSections: [] };
    }

    // Floor still overflows: honest two-page render + overflow report.
    const style = lastMeasure.style;
    layoutResume(doc, data, style, { measureOnly: false, allowMultiPage: true });
    const overflowHeight = lastMeasure.measure.totalHeight - lastMeasure.usable;
    const perLine = style.body * style.lh;
    const overflowLines = Math.max(1, Math.round(overflowHeight / perLine));
    const longestSections = lastMeasure.measure.sectionHeights
      .slice().sort((a, b) => b.height - a.height).slice(0, 2).map(s => s.name);
    return { blob: doc.output('blob'), fitsOnePage: false, overflowLines, longestSections };
  }

  // ─── Resume DOCX (unchanged behaviour) ────────────────────────────
  function buildResumeDocxBlob(resumeText /*, fileBase */) {
    const D = window.docx;
    if (!D) throw new Error('docx not loaded');
    const {
      Document, Packer, Paragraph, TextRun, AlignmentType,
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
    if (data.name) blocks.push(para([run(data.name, { bold: true, size: 36 })], { align: AlignmentType.CENTER, after: 40 }));
    if (data.title) blocks.push(para([run(data.title, { bold: true, size: 22, caps: true })], { align: AlignmentType.CENTER, after: 40 }));
    if (data.contact) blocks.push(para([run(data.contact, { size: 19, color: '404040' })], { align: AlignmentType.CENTER, after: 160 }));

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
        block.paras.forEach(p => blocks.push(para([run(p, { size: 20 })], { after: 40 })));
        block.bullets.forEach(b => blocks.push(para([run(b, { size: 20 })], { numbering: { reference: 'ayn-bullets', level: 0 }, after: 20 })));
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

  async function blobToBase64(blob) {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = ''; const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    return btoa(bin);
  }

  // ── Cover letter scale (body/LH only; margins fixed) ──────────────
  const COVER_SCALE = [
    { body: 11.0, lh: 1.45, margin: 72, headerName: 15, headerContact: 10, gapAfterContact: 6, dateBefore: 6, dateAfter: 22, paraGap: 8 },
    { body: 10.85, lh: 1.42, margin: 72, headerName: 14.7, headerContact: 10, gapAfterContact: 5, dateBefore: 5, dateAfter: 20, paraGap: 7 },
    { body: 10.7, lh: 1.39, margin: 72, headerName: 14.3, headerContact: 10, gapAfterContact: 5, dateBefore: 5, dateAfter: 18, paraGap: 7 },
    { body: 10.5, lh: 1.36, margin: 72, headerName: 14, headerContact: 10, gapAfterContact: 4, dateBefore: 4, dateAfter: 16, paraGap: 6 },
    { body: 10.35, lh: 1.32, margin: 72, headerName: 13.7, headerContact: 10, gapAfterContact: 4, dateBefore: 4, dateAfter: 15, paraGap: 6 },
    { body: 10.15, lh: 1.28, margin: 72, headerName: 13.3, headerContact: 10, gapAfterContact: 4, dateBefore: 4, dateAfter: 14, paraGap: 5 },
    { body: 10.0, lh: 1.25, margin: 72, headerName: 13, headerContact: 10, gapAfterContact: 3, dateBefore: 3, dateAfter: 12, paraGap: 5 },
  ];

  function layoutCover(doc, bodyText, opts, style, layoutOpts) {
    const measureOnly = !!(layoutOpts && layoutOpts.measureOnly);
    const allowMultiPage = !!(layoutOpts && layoutOpts.allowMultiPage);
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const M = style.margin;
    const MAX_W = PAGE_W - M * 2;
    let y = M;
    const paraHeights = [];

    const ensure = (need) => {
      if (measureOnly) return;
      if (y + need > PAGE_H - M) { if (allowMultiPage) { doc.addPage(); y = M; } }
    };
    const drawText = (text, x, yy, o) => { if (!measureOnly) doc.text(text, x, yy, o); };
    const wrap = (text, size, styleStr, maxW) => {
      doc.setFont('times', styleStr || 'normal'); doc.setFontSize(size);
      return doc.splitTextToSize(String(text || ''), maxW);
    };

    const name = (opts.name || '').trim();
    const contact = (opts.contact || '').trim();
    if (name && name.length <= 60) {
      const h = style.headerName * 1.33;
      ensure(h);
      if (!measureOnly) { doc.setFont('times','bold'); doc.setFontSize(style.headerName); drawText(name, M, y + style.headerName*0.95); }
      y += h;
    }
    if (contact) {
      const lines = wrap(contact, style.headerContact, 'normal', MAX_W);
      const lh = 13;
      const h = lines.length * lh + style.gapAfterContact;
      ensure(h);
      if (!measureOnly) { doc.setFont('times','normal'); doc.setFontSize(style.headerContact); doc.text(lines, M, y + 10); }
      y += h;
    }
    y += style.dateBefore;
    const date = opts.date || new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
    const dh = 16;
    ensure(dh);
    if (!measureOnly) { doc.setFont('times','normal'); doc.setFontSize(11); drawText(date, M, y); }
    y += style.dateAfter;

    const rawLines = String(bodyText || '').replace(/\r/g,'').split('\n');
    for (const raw of rawLines) {
      const t = raw.trim();
      if (!t) { y += style.paraGap; continue; }
      const startP = y;
      const lines = wrap(t, style.body, 'normal', MAX_W);
      const lh = style.body * style.lh;
      for (const ln of lines) {
        ensure(lh);
        if (!measureOnly) { doc.setFont('times','normal'); doc.setFontSize(style.body); doc.text(ln, M, y + style.body*0.95); }
        y += lh;
      }
      paraHeights.push({ name: t.slice(0, 40), height: y - startP });
    }
    return { totalHeight: y - M, sectionHeights: paraHeights };
  }

  function buildCoverLetterPdfBlob(bodyText, opts) {
    opts = opts || {};
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) throw new Error('jsPDF not loaded');

    const measureDoc = new jsPDF({ unit: 'pt', format: 'letter' });
    const PAGE_H = measureDoc.internal.pageSize.getHeight();

    let chosen = null;
    let lastMeasure = null;
    for (let i = 0; i < COVER_SCALE.length; i++) {
      const style = COVER_SCALE[i];
      const usable = PAGE_H - style.margin * 2;
      const m = layoutCover(measureDoc, bodyText, opts, style, { measureOnly: true });
      lastMeasure = { style, measure: m, usable };
      if (m.totalHeight <= usable) { chosen = { style, measure: m, usable }; break; }
    }

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    if (chosen) {
      layoutCover(doc, bodyText, opts, chosen.style, { measureOnly: false, allowMultiPage: false });
      return { blob: doc.output('blob'), fitsOnePage: true, overflowLines: 0, longestSections: [] };
    }
    const style = lastMeasure.style;
    layoutCover(doc, bodyText, opts, style, { measureOnly: false, allowMultiPage: true });
    const overflowHeight = lastMeasure.measure.totalHeight - lastMeasure.usable;
    const perLine = style.body * style.lh;
    const overflowLines = Math.max(1, Math.round(overflowHeight / perLine));
    const longestSections = lastMeasure.measure.sectionHeights
      .slice().sort((a, b) => b.height - a.height).slice(0, 2).map(s => s.name);
    return { blob: doc.output('blob'), fitsOnePage: false, overflowLines, longestSections };
  }

  // ─── Cover Letter DOCX (unchanged) ─────────────────────────────────
  function buildCoverLetterDocxBlob(bodyText, opts) {
    opts = opts || {};
    const D = window.docx;
    if (!D) throw new Error('docx not loaded');
    const { Document, Packer, Paragraph, TextRun } = D;
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

  window.AYNResumeFormat = {
    parseResume,
    buildResumePdfBlob,
    buildResumeDocxBlob,
    buildCoverLetterPdfBlob,
    buildCoverLetterDocxBlob,
    blobToBase64,
  };
})();
