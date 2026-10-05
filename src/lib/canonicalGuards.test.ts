// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { guardExtractedProfile, tidyCountryName } from '../../supabase/functions/_shared/canonicalGuards';

describe('guardExtractedProfile', () => {
  const guessed = {
    work_auth: { citizenship: 'canada', needs_sponsorship_now: true, needs_sponsorship_future: true, countries: ['UAE'] },
    preferences: { salary_min_usd: 80000, salary_currency: 'CAD', open_to_remote: true },
  };
  it('drops sponsorship and salary the text never mentions, and fixes casing', () => {
    const out = guardExtractedProfile(guessed, 'Product manager. Led a team of 6 at Acme. Built dashboards.');
    expect(out.work_auth).toEqual({ citizenship: 'Canada', countries: ['UAE'] });
    expect(out.preferences).toEqual({ open_to_remote: true });
  });
  it('keeps them when the text supports them', () => {
    const out = guardExtractedProfile(guessed, 'I will need visa sponsorship. Expected salary: $80,000 per year.');
    expect(out.work_auth.needs_sponsorship_now).toBe(true);
    expect(out.preferences).toMatchObject({ salary_min_usd: 80000, salary_currency: 'CAD' });
  });
  it('never leaves a currency with no amount', () => {
    expect(guardExtractedProfile({ work_auth: {}, preferences: { salary_currency: 'CAD' } }, 'salary negotiable').preferences).toEqual({});
  });
  it('does not mutate its input', () => {
    const copy = JSON.parse(JSON.stringify(guessed));
    guardExtractedProfile(guessed, 'nothing relevant');
    expect(guessed).toEqual(copy);
  });
});

describe('tidyCountryName', () => {
  it.each([['canada', 'Canada'], ['united  states', 'United States'], ['UAE', 'UAE'], ['United Arab Emirates', 'United Arab Emirates'], ['', '']])('%s -> %s', (a, b) => expect(tidyCountryName(a)).toBe(b));
});
