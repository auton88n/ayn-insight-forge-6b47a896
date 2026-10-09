import { test, expect } from '@playwright/test';

test('signed-in seeker can follow For employers without being redirected to Saved jobs', async ({ page }) => {
  await page.addInitScript(() => {
    const user = { id: '00000000-0000-4000-8000-000000000009', email: 'qa@fixture.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
    localStorage.setItem('sb-ayn-test-auth-token', JSON.stringify({ user, access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer' }));
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.pathname === '/rest/v1/profiles') return route.fulfill({ json: { role: 'job_seeker' } });
    if (url.pathname === '/rest/v1/rpc/get_feature_flags') return route.fulfill({ json: { flags: {}, messages: {} } });
    return route.abort();
  });
  await page.goto('/companies/fixture');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'For employers', exact: true }).click();
  await expect(page).toHaveURL(/\/employers$/);
  await expect(page.locator('h1')).toBeVisible();
  await page.reload();
  await expect(page.locator('h1')).toBeVisible();
  await expect(page).toHaveURL(/\/employers$/);
});

test('job details disclose source pay problems and visible application conditions', async ({ page }) => {
  const job = {
    id: '8010724c-04aa-433c-94a9-af81bd4fbfb2', company: 'Fixture company', title: 'General Manager',
    description: 'Remote role available in the United States only. Pay: Up to $65,000.00 per hour',
    location: 'Austin, TX', remote_region: 'United States', work_mode: 'remote', apply_by: '2026-09-11',
    posted_at: '2026-10-01T12:00:00Z', apply_url: 'https://fixture.invalid/apply',
  };
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.pathname === '/rest/v1/job_postings') {
      const detail = url.searchParams.get('select')?.includes('description');
      return route.fulfill({ json: detail ? job : [job], headers: { 'content-range': '0-0/1' } });
    }
    if (url.pathname === '/rest/v1/rpc/job_salary_comparison') return route.fulfill({ json: { enough: false, sample: 0 } });
    return route.abort();
  });
  await page.goto('/jobs/' + job.id);
  const conditions = page.getByRole('region', { name: 'Application conditions' });
  await expect(conditions).toBeVisible();
  await expect(conditions).toContainText('United States');
  await expect(conditions).toContainText('Stated deadline has passed');
  await expect(page.getByRole('note').filter({ hasText: 'Pay period needs confirmation' })).toBeVisible();
  await expect(page.getByText(job.description, { exact: true })).toBeVisible();
});

test('company observations render once, including after refresh', async ({ page }) => {
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    if (route.request().url().includes('/rest/v1/rpc/company_profile')) return route.fulfill({ json: {
      slug: 'workstream', name: 'Workstream', logo_url: null,
      insights: { open_roles: 11, pay: { postings: 11, with_pay: 1, pct: 9 }, speed: null },
      relisted_roles: 0, edits_30d: 2, sponsorship: { offered: 0, not_offered: 0 },
      work_mode: {}, top_categories: [], common_benefits: [], jobs: [],
    } });
    return route.abort();
  });
  await page.goto('/companies/workstream');
  for (let pass = 0; pass < 2; pass++) {
    await expect(page.getByText('of postings show pay (1 of 11)', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Posting updates', exact: true })).toHaveCount(1);
    await expect(page.getByText(/2 field changes observed in the last 30 days/)).toHaveCount(1);
    if (!pass) await page.reload();
  }
});
