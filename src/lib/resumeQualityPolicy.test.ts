// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const callAI = vi.fn(async (_input: any) => ({ structured: {
  date_format_inconsistent: false, weak_bullet_count: 0,
  generic_summary: false, tense_mismatch: false, issues: [],
} }));
const source = readFileSync(new URL('../../supabase/functions/resume-hub/lib/resumeScoring.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const rules: any = {};
new Function('require', 'exports', compiled)(() => ({ callAI }), rules);

describe('resume writing-quality policy', () => {
  const base = { basics: {}, skills: ['SQL'], work: [{ company: 'Example', start: '2020', end: 'Present', bullets: ['Built reporting tools.'] }] };
  it('does not penalize an optional summary or a single long-term employer', () => {
    expect(rules.deterministicDeductions(base)).toEqual({ points: 0, issues: [] });
  });
  it('does not invent unexplained-gap findings, whether a break is explained or not', () => {
    for (const summary of ['', 'Career break in 2021–2022 for caregiving.']) {
      const resume = { ...base, basics: { summary }, work: [
        { start: '2018', end: '2020', bullets: ['Built reporting tools.'] },
        { start: '2023', end: 'Present', bullets: ['Manage client reporting.'] },
      ] };
      expect(rules.deterministicDeductions(resume)).toEqual({ points: 0, issues: [] });
    }
  });
  it('still flags an unambiguously future employment start', () => {
    const resume = { ...base, work: [{ start: String(new Date().getUTCFullYear() + 3), bullets: [] }] };
    expect(rules.deterministicDeductions(resume).issues.join(' ')).toContain('after today');
  });
  it('uses contextual date and tense instructions and consistent arithmetic', async () => {
    expect((await rules.scoreResumeContent(base)).ats_score).toBe(100);
    const prompt = callAI.mock.calls.at(-1)?.[0]?.system;
    expect(prompt).toContain('Year-only dates are valid');
    expect(prompt).toContain('past tense for completed achievements');
    expect(prompt).toContain('An absent summary is valid');
  });
});
