import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`snapshot reports show formatted pay, not old generated claims at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      if (url.pathname === '/rest/v1/articles') return route.fulfill({ json: {
        slug: 'fixture-report', title: 'Old claims', dek: '140000 salary', category: 'software_engineering',
        kind: 'hiring_trend', published_at: '2026-10-10', body_md: '200 newly posted jobs in the last 24 hours.',
        source_data: { open_roles: 200, posted_last_24h: 200, salary_sample_size: 12,
          median_salary: 140000, p25_salary: 120000, p75_salary: 200225, work_mode: { remote: 200 } },
      } });
      return route.fulfill({ json: null });
    });
    await page.goto('/insights/fixture-report');
    await expect(page.locator('h1')).toContainText('hiring snapshot');
    const report = page.locator('article.ayn-reading');
    await expect(report).toContainText('USD 140,000 per year');
    await expect(report).toContainText('12 listings');
    await expect(report).not.toContainText('newly posted');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('job-to-company navigation, Back and Forward change both URL and rendered page', async ({ page }) => {
  const job = { id: '8010724c-04aa-433c-94a9-af81bd4fbfb2', title: 'Fixture engineer', company: 'Fixture',
    company_slug: 'fixture', location: 'Austin, TX', description: 'Python required.', apply_url: 'https://fixture.invalid/apply' };
  const insights = { open_roles: 2, pay: null, speed: null };
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.pathname === '/rest/v1/job_postings') return route.fulfill({ json: job });
    if (url.pathname.endsWith('/company_insights')) return route.fulfill({ json: insights });
    if (url.pathname.endsWith('/company_profile')) return route.fulfill({ json: {
      slug: 'fixture', name: 'Fixture', logo_url: null, insights, relisted_roles: 0, edits_30d: 0,
      sponsorship: { offered: 0, not_offered: 0 }, work_mode: {}, top_categories: [], common_benefits: [], jobs: [],
    } });
    return route.fulfill({ json: null });
  });
  await page.goto('/jobs/' + job.id);
  await expect(page.locator('.ayn-job-title')).toHaveText(job.title);
  await page.getByRole('link', { name: 'See all 2 open roles and hiring stats for Fixture' }).click();
  await expect(page).toHaveURL(/\/companies\/fixture$/);
  await expect(page.locator('h1')).toHaveText('Fixture: open roles and hiring stats');
  await page.goBack();
  await expect(page.locator('.ayn-job-title')).toHaveText(job.title);
  await page.goForward();
  await expect(page.locator('h1')).toHaveText('Fixture: open roles and hiring stats');
  expect(errors).toEqual([]);
});
