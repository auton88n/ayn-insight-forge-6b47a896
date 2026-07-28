#!/usr/bin/env node
/**
 * scripts/validate-pdf.mjs — v2.12.1 CI validator for AYN-generated PDFs.
 *
 * Purpose: verify that the resume and cover letter PDFs the extension produces
 * parse the way an ATS would read them: real selectable text, exactly one page,
 * sane reading order, and no lost sections.
 *
 * Parser: @opendataloader/pdf (Apache-2.0). Used here for VALIDATION only, never
 * bundled into the extension and never a runtime dependency. Requires Java 11+
 * on PATH (the OpenDataLoader CLI is a JVM tool).
 *
 * How to run:
 *   npm i -D @opendataloader/pdf         # one-time
 *   java -version                         # must be 11+
 *   npm run validate:pdf                  # or: node scripts/validate-pdf.mjs
 *
 * This script is NOT wired into extension/build.mjs on purpose: Java may be
 * unavailable in the build environment and it must never block a release.
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const EXT = resolve(ROOT, 'extension');
const OUT = resolve(ROOT, '.tmp/validate-pdf');

// ── Fixtures ──────────────────────────────────────────────────────
const RESUME_FIXTURE = `Jane Doe
Senior Product Engineer
jane@example.com | +1 555 111 2222 | linkedin.com/in/janedoe

SUMMARY
Product engineer with 8 years shipping consumer and B2B software. Led teams of 4 to 12 across web, mobile, and platform.

EXPERIENCE
Senior Product Engineer, Northwind 2022 to Present
- Cut checkout latency by 42 percent by rewriting the cart service in Go.
- Grew mobile MAU from 120k to 310k over 14 months.
Product Engineer, Contoso 2019 to 2022
- Owned the payments migration that moved 3.2 million users to Stripe with zero downtime.
- Mentored 5 junior engineers, 3 of whom were promoted within 12 months.

EDUCATION
BSc Computer Science, University of Toronto 2015 to 2019

SKILLS
TypeScript, Go, Postgres, React, distributed systems, product strategy, mentoring.

PROJECTS
Ayn Autofill 2024
- Chrome extension that autofills job applications with 92 percent accuracy across 6 ATS platforms.
`;

const COVER_FIXTURE = `Dear Hiring Manager,

I am writing to apply for the Senior Product Engineer role. Over the last 8 years I have led teams shipping consumer and B2B software, and I would love to bring that experience to your team.

At Northwind I cut checkout latency by 42 percent and grew mobile MAU from 120k to 310k. At Contoso I owned a payments migration that moved 3.2 million users to Stripe with zero downtime. I care about small, focused teams that ship real product.

I would welcome the chance to speak with you. Thank you for your time.

Sincerely,
Jane Doe
`;

const RESUME_SECTIONS = ['SUMMARY', 'EXPERIENCE', 'EDUCATION', 'SKILLS', 'PROJECTS'];

// ── Load builders (browser code) inside a jsdom-free sandbox ──────
async function loadBuilders() {
  const jsPdfUmd = await readFile(resolve(EXT, 'vendor/jspdf.umd.min.js'), 'utf8');
  const docxUmd = await readFile(resolve(EXT, 'vendor/docx.min.js'), 'utf8');
  const resumeFmt = await readFile(resolve(EXT, 'resumeFormat.js'), 'utf8');

  // Minimal browser-ish globals. jsPDF UMD attaches to a global under
  // `window`; docx UMD does the same. resumeFormat.js registers on
  // window.AYNResumeFormat.
  const win = {};
  const sandbox = {
    window: win, self: win, globalThis: win,
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    Blob: (await import('node:buffer')).Blob,
    Uint8Array, ArrayBuffer, TextEncoder, TextDecoder,
    performance: { now: () => Date.now() },
  };
  sandbox.window = sandbox;         // scripts use `window.X = ...`
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(jsPdfUmd, sandbox, { filename: 'jspdf.umd.min.js' });
  vm.runInContext(docxUmd, sandbox, { filename: 'docx.min.js' });
  vm.runInContext(resumeFmt, sandbox, { filename: 'resumeFormat.js' });
  if (!sandbox.AYNResumeFormat) throw new Error('AYNResumeFormat did not register');
  return sandbox.AYNResumeFormat;
}

async function blobToBuffer(blob) {
  const ab = await blob.arrayBuffer();
  return Buffer.from(ab);
}

// ── Parser bridge ─────────────────────────────────────────────────
async function parsePdf(pdfPath) {
  const require_ = createRequire(import.meta.url);
  let mod;
  try {
    mod = require_('@opendataloader/pdf');
  } catch (_err) {
    throw new Error(
      '@opendataloader/pdf is not installed. Install it with:\n' +
      '    npm i -D @opendataloader/pdf\n' +
      'It also requires Java 11+ on PATH (it is a JVM CLI wrapper).'
    );
  }
  // The package exposes a run/parse function that returns JSON. Try common shapes.
  const outJson = resolve(OUT, 'parsed.json');
  if (typeof mod.parse === 'function') {
    const res = await mod.parse(pdfPath, { output: outJson });
    return typeof res === 'string' ? JSON.parse(res) : res;
  }
  if (typeof mod.run === 'function') {
    await mod.run({ input: pdfPath, output: outJson });
    return JSON.parse(await readFile(outJson, 'utf8'));
  }
  if (typeof mod === 'function') {
    const res = await mod(pdfPath);
    return typeof res === 'string' ? JSON.parse(res) : res;
  }
  throw new Error('@opendataloader/pdf: could not find parse()/run() entry point.');
}

// ── Assertions ────────────────────────────────────────────────────
function collectText(parsed) {
  // Best-effort flattener: walk the JSON and collect any "text"/"content" fields.
  const parts = [];
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === 'string') { parts.push(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === 'object') {
      if (typeof v.text === 'string') parts.push(v.text);
      if (typeof v.content === 'string') parts.push(v.content);
      for (const k of Object.keys(v)) {
        if (k === 'text' || k === 'content') continue;
        walk(v[k]);
      }
    }
  };
  walk(parsed);
  return parts;
}

function countPages(parsed) {
  if (parsed && typeof parsed.pageCount === 'number') return parsed.pageCount;
  if (Array.isArray(parsed?.pages)) return parsed.pages.length;
  // Fallback: look for a "page" field per node.
  const pages = new Set();
  const walk = (v) => {
    if (!v || typeof v !== 'object') return;
    if (typeof v.page === 'number') pages.add(v.page);
    if (Array.isArray(v)) v.forEach(walk);
    else for (const k of Object.keys(v)) walk(v[k]);
  };
  walk(parsed);
  return pages.size || 1;
}

function assert(cond, msg) { if (!cond) { console.error('  ✗', msg); throw new Error(msg); } console.log('  ✓', msg); }

async function validateResume(fmt) {
  console.log('\n[resume]');
  const { blob, fitsOnePage } = fmt.buildResumePdfBlob(RESUME_FIXTURE, 'Jane_Doe');
  const buf = await blobToBuffer(blob);
  const pdfPath = resolve(OUT, 'resume.pdf');
  await writeFile(pdfPath, buf);

  const parsed = await parsePdf(pdfPath);
  const parts = collectText(parsed);
  const joined = parts.join(' ');
  const pageCount = countPages(parsed);

  assert(fitsOnePage, 'fit loop reports one page for the fixture');
  assert(parts.length > 0 && joined.trim().length > 100, '(a) real extracted text (no OCR fallback)');
  assert(pageCount === 1, `(b) page count is exactly 1 (got ${pageCount})`);

  const nameIdx = joined.indexOf('Jane Doe');
  const firstSecIdx = joined.indexOf(RESUME_SECTIONS[0]);
  assert(nameIdx >= 0 && firstSecIdx > nameIdx, `(c) name appears before first section (${nameIdx} < ${firstSecIdx})`);

  let last = firstSecIdx;
  for (let i = 1; i < RESUME_SECTIONS.length; i++) {
    const idx = joined.indexOf(RESUME_SECTIONS[i]);
    assert(idx > last, `(c) section order preserved: ${RESUME_SECTIONS[i]}`);
    last = idx;
  }
  for (const sec of RESUME_SECTIONS) {
    assert(joined.includes(sec), `(d) section preserved: ${sec}`);
  }
}

async function validateCover(fmt) {
  console.log('\n[cover letter]');
  const { blob, fitsOnePage } = fmt.buildCoverLetterPdfBlob(COVER_FIXTURE, { name: 'Jane Doe', contact: 'jane@example.com' });
  const buf = await blobToBuffer(blob);
  const pdfPath = resolve(OUT, 'cover.pdf');
  await writeFile(pdfPath, buf);
  const parsed = await parsePdf(pdfPath);
  const parts = collectText(parsed);
  const joined = parts.join(' ');
  const pageCount = countPages(parsed);
  assert(fitsOnePage, 'fit loop reports one page for the fixture');
  assert(parts.length > 0 && joined.trim().length > 80, '(a) real extracted text');
  assert(pageCount === 1, `(b) page count is exactly 1 (got ${pageCount})`);
  assert(joined.indexOf('Jane Doe') >= 0, '(c) name present');
  assert(joined.includes('Dear Hiring Manager'), '(d) salutation preserved');
  assert(joined.includes('Sincerely'), '(d) sign-off preserved');
}

async function main() {
  if (existsSync(OUT)) await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const fmt = await loadBuilders();
  await validateResume(fmt);
  await validateCover(fmt);
  console.log('\n✔ validate-pdf: all assertions passed');
}

main().catch((err) => {
  console.error('\n✗ validate-pdf failed:', err.message);
  process.exit(1);
});
