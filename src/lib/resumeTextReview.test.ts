import { describe, expect, it } from 'vitest';
import { reviewResumeText } from './resumeTextReview';

describe('public text review', () => {
  it('provides actual excerpts and limits findings to three', () => {
    const text = 'Results-driven professional\nResponsible for platform delivery\n' + 'A long passage '.repeat(30);
    const findings = reviewResumeText(text);
    expect(findings).toHaveLength(3);
    expect(findings[0].excerpt).toBe('Responsible for platform delivery');
  });
  it('does not penalize no metrics, career gaps, multiple roles or ordinary action verbs', () => {
    expect(reviewResumeText('person@example.com\nEngineer 2018 to 2020\nFounder 2024 to Present\nConsultant 2024 to Present\nSpearheaded system maintenance\nOrchestrated migration')).toEqual([]);
  });
  it('treats absent contact information as a question, not an automatic failure', () => {
    const [finding] = reviewResumeText('Built a reporting service');
    expect(finding.id).toBe('contact');
    expect(finding.action).toBe('clarify');
    expect(finding.explanation).toContain('removed it');
  });
});
