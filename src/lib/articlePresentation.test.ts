import { expect, it } from 'vitest';
import { presentArticle } from '../../supabase/functions/_shared/articlePresentation.mjs';

const fixture = {
  kind: 'hiring_trend', category: 'software_engineering', city: null,
  body_md: '200 jobs posted in the last 24 hours. Salaries 140000 to 200225.',
  source_data: { open_roles: 200, posted_last_24h: 200, salary_sample_size: 12,
    median_salary: 140000, p25_salary: 120000, p75_salary: 200225,
    work_mode: { remote: 4, unspecified: 196 }, top_companies: [{ company: '<script>bad()</script>', open_roles: 7 }] },
};
it('formats snapshot facts, annual units and sample size without publication-age claims', () => {
  const article = presentArticle(fixture);
  expect(article.body_md).toContain('USD 140,000 per year');
  expect(article.body_md).toContain('12 listings');
  expect(article.body_md).toContain('not a count of all vacancies');
  expect(article.body_md).not.toContain('last 24 hours');
  expect(article.body_md).not.toContain('<script>');
  expect(article.faq).toBeNull();
});
it('withholds sub-floor medians and does not rewrite articles without snapshots', () => {
  expect(presentArticle({ ...fixture, source_data: { ...fixture.source_data, salary_sample_size: 9 } }).body_md).not.toContain('140,000');
  const legacy = { body_md: 'An independently written article' };
  expect(presentArticle(legacy)).toBe(legacy);
});
