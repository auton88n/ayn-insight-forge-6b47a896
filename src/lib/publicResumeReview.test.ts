// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';

function load(name: string): any {
  const source = readFileSync(new URL(`../../supabase/functions/_shared/${name}.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('require', 'exports', compiled)((path: string) => {
    if (path === './tailoring.ts') return load('tailoring');
    if (path === './resumeEvaluation.ts') return load('resumeEvaluation');
    if (path === './jobSkills.ts') return load('jobSkills');
    throw new Error(`Unexpected dependency: ${path}`);
  }, exports);
  return exports;
}
const { publicResumeReview } = load('publicResumeReview');
const { computeGap, buildSections } = load('tailoring');
const { evaluateResumeDocument, evaluateResumeText } = load('resumeEvaluation');
const { flattenResumeSkillsAndProse } = load('tailoring');
const jd = 'Requirements:\n- Python\n- Docker\n- Kubernetes\n- Terraform\n- PostgreSQL\n- Java';

describe('public resume review disclosure', () => {
  it('recognizes inline requirement labels without admitting inline benefits', () => {
    expect(publicResumeReview('Python', 'Skills: Python').matchPct).toBe(100);
    const result = publicResumeReview('Python', 'Requirements: Python and Terraform.\nBenefits: Health insurance.');
    expect(result.matchPct).toBe(0);
    expect(result.requirementCount).toBe(1);
    expect(result.missing[0]).toContain('Terraform');
    expect(result.missing.join(' ')).not.toContain('insurance');
  });
  it('evaluates explicit prose requirements without a heading or bullets', () => {
    const result = publicResumeReview('Python Docker developer', 'We require experience with Python and Docker. Candidates must have five years of software engineering experience.');
    expect(result.requirementCount).toBeGreaterThan(0);
    expect(result.matchPct).toBe(50);
    expect(result.missing.length).toBeGreaterThan(0);
    expect(result.missing.length).toBeLessThanOrEqual(3);
  });
  it('does not turn legal instructions or benefits into requirements', () => {
    const result = publicResumeReview('Python developer', 'Requirements:\n- Python\nBenefits:\nYou have access to health insurance.\nFor additional information about E-Verify visit USCIS.');
    expect(result.matchPct).toBe(100);
    expect(result.requirementCount).toBe(1);
  });
  it('ignores boilerplate tags without deleting genuine USCIS training', () => {
    const sections = buildSections(null, null, 'Python developer');
    const legal = computeGap('For additional information about E-Verify visit USCIS.', sections, { jdSkills: ['uscis'] });
    expect(legal.missing).toHaveLength(0);
    const real = computeGap('Complete ISSO USCIS provided training as required.', sections, { jdSkills: ['uscis'] });
    expect(real.missing.some((r: {text: string}) => r.text === 'uscis')).toBe(true);
  });
  it('scores the same document identically through public, before and after paths', () => {
    const resume = { basics: { title: 'Developer' }, skills: ['Python'], projects: [{ name: 'Deployment', description: 'Docker Kubernetes Terraform' }], certifications: ['PostgreSQL'], education: [{ degree: 'Java' }] };
    const text = flattenResumeSkillsAndProse(resume);
    const document = evaluateResumeDocument(resume, jd);
    expect(document.matchPct).toBe(100);
    expect(publicResumeReview(text, jd).matchPct).toBe(document.matchPct);
    expect(evaluateResumeText(text, jd).evaluationVersion).toBe(document.evaluationVersion);
    expect(evaluateResumeDocument(resume, jd)).toEqual(document);
  });
  it('does not reward repeating a keyword or confuse JavaScript with Java', () => {
    const job = 'Requirements:\n- Java\n- Python';
    expect(evaluateResumeText('JavaScript Python', job).matchPct).toBe(50);
    expect(evaluateResumeText('Python Python Python', job).matchPct).toBe(50);
  });
  it('includes visible ungrouped skills when presentation groups are stale', () => {
    const resume = { skills: ['Python', 'Docker'], skillGroups: [{ category: 'Languages', skills: ['Python'] }] };
    expect(evaluateResumeDocument(resume, 'Requirements:\n- Docker').matchPct).toBe(100);
  });
  it('limits details server-side without changing the full score', () => {
    const resume = 'Python developer building reporting systems.';
    const full = computeGap(jd, buildSections(null, null, resume));
    const result = publicResumeReview(resume, jd);
    expect(full.missing.length).toBeGreaterThan(3);
    expect(result.missing).toHaveLength(3);
    expect(result.matched).toEqual([]);
    expect(result.niceToHave).toEqual([]);
    expect(result.matchPct).toBe(Math.round(100 * full.matched.length / (full.matched.length + full.missing.length)));
    for (const hidden of full.missing.slice(3)) expect(JSON.stringify(result)).not.toContain(hidden.text);
    expect(result).not.toHaveProperty('requirements');
    expect(result).not.toHaveProperty('gap');
  });
  it('keeps an all-matched result distinct from no extracted requirements', () => {
    const result = publicResumeReview('Python Docker Kubernetes Terraform PostgreSQL Java', jd);
    expect(result.matchPct).toBe(100);
    expect(result.requirementCount).toBeGreaterThan(0);
    expect(result.missing).toEqual([]);
  });
  it('does not invent a percentage for unassessable text', () => {
    expect(publicResumeReview('Python developer', '').matchPct).toBeNull();
  });
});
