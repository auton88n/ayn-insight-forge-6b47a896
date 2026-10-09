import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { displayJobTitle, JobDescriptionBody, resolveSalary } from './jobPostingFormat';
import type { JobPosting } from './resumeHub';
afterEach(cleanup);

it('does not use requisition identifiers or old checker placeholders as titles', () => {
  expect(displayJobTitle('Job Requisition ID: 180984…', 'Al-Futtaim Group')).toBe('Role at Al-Futtaim Group');
  expect(displayJobTitle('Job from resume check', 'Al-Futtaim Group', 'Job Requisition ID: 180984')).toBe('Role at Al-Futtaim Group');
  expect(displayJobTitle('Job from resume check', null, 'Job Requisition ID: 180984\nJob title: AI & Data Governance Manager')).toBe('AI & Data Governance Manager');
  expect(displayJobTitle('Job from resume check', null, 'Job Requisition ID: 180984\nWe are a great company.')).toBe('Saved job (title not provided)');
  expect(displayJobTitle('AI Engineer', 'Company')).toBe('AI Engineer');
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
