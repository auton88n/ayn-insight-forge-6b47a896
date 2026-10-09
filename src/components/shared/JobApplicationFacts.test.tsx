import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { JobApplicationFacts } from './JobApplicationFacts';
afterEach(cleanup);
it('shows both stated conditions once and does not invent unrestricted remote work', () => {
  render(<JobApplicationFacts job={{ remote_region: 'United States', apply_by: '2099-11-15' }} />);
  expect(screen.getAllByText('Remote eligibility:', { exact: true })).toHaveLength(1);
  expect(screen.getAllByText('Apply by:', { exact: true })).toHaveLength(1);
  expect(screen.getByRole('region', { name: 'Application conditions' })).toHaveTextContent('Missing restrictions do not confirm worldwide eligibility');
});
it('extracts explicitly stated conditions in a manually saved JD', () => {
  render(<JobApplicationFacts job={{ description: 'This is a remote position within the United States. Apply by November 15, 2026.' }} />);
  expect(screen.getByText('Remote eligibility:', { exact: true })).toBeVisible();
  expect(screen.getByText('Apply by:', { exact: true })).toBeVisible();
});
it('does not hide a passed stored deadline or mistake it for proof of closure', () => {
  render(<JobApplicationFacts job={{ apply_by: '2020-01-01' }} />);
  expect(screen.getByText('Stated deadline has passed:', { exact: true })).toBeVisible();
  expect(screen.getByRole('region')).toHaveTextContent('Confirm with the employer');
});
it('renders nothing for missing facts or an invalid date', () => {
  const view = render(<JobApplicationFacts job={{ apply_by: '2026-02-31' }} />);
  expect(view.container).toBeEmptyDOMElement();
});
