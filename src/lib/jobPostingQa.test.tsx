import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { additionalWorkMode, displayJobTitle, JobDescriptionBody, resolveSalary } from './jobPostingFormat';
import { verifiedEmploymentType } from '../../supabase/functions/_shared/jobEmploymentType';
import type { JobPosting } from './resumeHub';
afterEach(cleanup);

it('does not use requisition identifiers or old checker placeholders as titles', () => {
  expect(displayJobTitle('Job Requisition ID: 180984…', 'Al-Futtaim Group')).toBe('Role at Al-Futtaim Group');
  expect(displayJobTitle('Job from resume check', 'Al-Futtaim Group', 'Job Requisition ID: 180984')).toBe('Role at Al-Futtaim Group');
  expect(displayJobTitle('Job from resume check', null, 'Job Requisition ID: 180984\nJob title: AI & Data Governance Manager')).toBe('AI & Data Governance Manager');
  expect(displayJobTitle('Job from resume check', null, 'Job Requisition ID: 180984\nWe are a great company.')).toBe('Saved job (title not provided)');
  expect(displayJobTitle('AI Engineer', 'Company')).toBe('AI Engineer');
});
it('recovers company attribution for existing and newly saved title-missing jobs', () => {
  const jd = 'Job Requisition ID: 180984\n\nEstablished in the 1930s as a trading business, Al-Futtaim Group today is one of the most diversified businesses.';
  expect(displayJobTitle('Job from resume check', null, jd)).toBe('Role at Al-Futtaim Group');
  expect(displayJobTitle('Saved job (title not provided)', null, jd)).toBe('Role at Al-Futtaim Group');
  expect(displayJobTitle(null, null, 'Company: A & B\nClient: Another company')).toBe('Role at A & B');
  expect(displayJobTitle(null, null, 'We work with Al-Futtaim Group.')).toBe('Saved job (title not provided)');
  expect(displayJobTitle(null, 'Verified company', jd)).toBe('Role at Verified company');
});
it('does not repeat remote or hybrid modes already present in a location', () => {
  expect(additionalWorkMode('United States (Remote)', 'remote')).toBeNull();
  expect(additionalWorkMode('Remote', 'remote')).toBeNull();
  expect(additionalWorkMode('London, hybrid', 'hybrid')).toBeNull();
  expect(additionalWorkMode('Austin', 'remote')).toBe('Remote');
  expect(additionalWorkMode('United States (Remote)', 'hybrid')).toBe('Hybrid');
  expect(additionalWorkMode('Boston (On-site)', 'onsite')).toBeNull();
  expect(additionalWorkMode(null, null)).toBeNull();
});
it('does not confuse prior internship experience with an internship engagement', () => {
  const text = 'Experience: Admission to the State Bar of California; prior legal practice or internship experience in California public sector preferred.';
  expect(verifiedEmploymentType('internship', 'Deputy City Attorney', text)).toBeNull();
  expect(verifiedEmploymentType('intern', 'Legal Intern', text)).toBe('intern');
  expect(verifiedEmploymentType('internship', 'Legal program', text + '\nEmployment type: Internship')).toBe('internship');
  expect(verifiedEmploymentType('internship', 'Legal program', text + '\nThis position is a paid internship.')).toBe('internship');
  expect(verifiedEmploymentType('full_time', 'Deputy City Attorney', text)).toBe('full_time');
  expect(verifiedEmploymentType('internship', 'Student program', 'Internal team in an international company')).toBe('internship');
});
it('labels suspicious source pay as unverified and keeps the quoted description intact', () => {
  render(<JobDescriptionBody text="Pay: Up to $65,000.00 per hour" />);
  expect(screen.getByRole('note')).toHaveTextContent('Pay period needs confirmation');
  expect(screen.getByText('Pay: Up to $65,000.00 per hour', { exact: true })).toBeVisible();
  expect(resolveSalary({ description: 'Pay: Up to $65,000.00 per hour', salary_min: 60000, salary_max: 65000 } as JobPosting)).toBeNull();
});
it('shares currency and monthly extraction rules with the backend', () => {
  expect(resolveSalary({ description: 'Salary €4,000 - €5,000 per month', location: 'Berlin' } as JobPosting)).toEqual({ text: 'EUR 4k to 5k/mo', fromListingText: true });
});
