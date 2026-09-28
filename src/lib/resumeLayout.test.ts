// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildResumeDocxBlob, ResumeOverflowError } from './resumeDocs';

describe('one-page export policy', () => {
  it('exports a concise resume', async () => {
    const blob = await buildResumeDocxBlob({ basics: { name: 'Test Applicant', title: 'Developer' }, skills: ['Python'], work: [{ company: 'Example', title: 'Developer', bullets: ['Built reporting tools.'] }] });
    expect(blob.size).toBeGreaterThan(0);
  });
  it.each(['Developer', 'Chief Executive Officer'])('rejects overflow without deleting content for %s', async title => {
    const resume = { basics: { name: 'Test Applicant', title }, work: Array.from({ length: 12 }, (_, i) => ({ company: `Example ${i}`, title, bullets: Array(8).fill('Built reporting tools for client teams using existing records and reviewed the results with stakeholders.') })) };
    const original = JSON.stringify(resume);
    await expect(buildResumeDocxBlob(resume)).rejects.toBeInstanceOf(ResumeOverflowError);
    expect(JSON.stringify(resume)).toBe(original);
  });
});
