import { test, expect } from '@playwright/test';

test('direct posting survives cold load and reload without an update-depth loop', async ({ page }) => {
  const job = { id: '8010724c-04aa-433c-94a9-af81bd4fbfb2', title: 'Cold-load engineer', company: 'Fixture', location: 'Austin, TX', description: 'Python required.', apply_url: 'https://fixture.invalid/apply' };
  const errors: string[] = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.pathname === '/rest/v1/job_postings') return route.fulfill({ json: url.searchParams.get('id') ? job : [job], headers: { 'content-range': '0-0/1' } });
    return route.fulfill({ json: null });
  });
  for (let n=0; n<2; n++) {
    if (n) await page.reload(); else await page.goto('/jobs/' + job.id);
    await expect(page.locator('.ayn-job-title')).toHaveText(job.title);
    await expect(page).toHaveURL(new RegExp('/jobs/' + job.id + '$'));
    await page.waitForTimeout(250);
  }
  expect(errors.filter(error => /Maximum update depth|Too many re-renders/.test(error))).toEqual([]);
});

test('public discovery filters reach the server and survive refresh', async ({ page }) => {
  const searches: URL[] = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.pathname === '/rest/v1/job_postings' || url.pathname === '/rest/v1/rpc/browse_job_postings') {
      searches.push(url);
      return route.fulfill({ json: [], headers: { 'content-range': '*/0' } });
    }
    return route.fulfill({ json: null });
  });
  await page.goto('/jobs');
  await page.getByRole('combobox', { name: 'Work mode', exact: true }).selectOption('hybrid');
  await page.getByRole('combobox', { name: 'First observed', exact: true }).selectOption('30');
  await page.getByRole('combobox', { name: 'Experience level', exact: true }).selectOption('senior');
  await expect.poll(() => searches.some(url => url.searchParams.getAll('or').join(',').includes('work_mode.eq.hybrid') && url.searchParams.has('first_seen_at') && url.searchParams.get('seniority') === 'eq.senior')).toBe(true);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Work mode', exact: true })).toHaveValue('hybrid');
  await expect(page.getByRole('combobox', { name: 'First observed', exact: true })).toHaveValue('30');
  await expect(page.getByRole('combobox', { name: 'Experience level', exact: true })).toHaveValue('senior');
  await expect(page.getByText('Search a title, skill or company—not a full sentence. Put the city or country in Location and use Work mode below.')).toBeVisible();
});

test('positive salary-filter results request an exact count and paginate past the first page', async ({ page }) => {
  const jobs = Array.from({ length: 26 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, company: 'Fixture', title: `Engineer ${i + 1}`, location: 'Austin', description: 'Python required.', posted_at: '2026-10-01', apply_url: 'https://fixture.invalid/apply' }));
  const preferences: string[] = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.pathname === '/rest/v1/rpc/browse_job_postings') {
      const preference = route.request().headers()['prefer'] || '';
      preferences.push(preference);
      const offset = Number(url.searchParams.get('offset')) || 0;
      const rows = jobs.slice(offset, offset + 25);
      return route.fulfill({ json: rows, headers: { 'access-control-expose-headers': 'Content-Range', 'content-range': `${offset}-${offset + rows.length - 1}/${preference.includes('count=exact') ? '26' : '*'}` } });
    }
    if (url.pathname === '/rest/v1/job_postings') return route.fulfill({ json: jobs.find(j => `eq.${j.id}` === url.searchParams.get('id')) || jobs[0] });
    return route.abort();
  });
  await page.goto('/jobs?minPay=100000&currency=USD');
  await expect(page.locator('p[role="status"]').filter({ hasText: '26 roles found' })).toHaveText('26 roles found');
  await expect(page.locator('.lp-browser-card-title')).toHaveCount(25);
  await page.getByRole('button', { name: 'Load more jobs', exact: true }).click();
  await expect(page.locator('.lp-browser-card-title')).toHaveCount(26);
  expect(preferences.length).toBe(2);
  expect(preferences.every(p => p.includes('count=exact'))).toBe(true);
});

test('salary filters reach the server before pagination and persist through refresh', async ({ page }) => {
  const job = { id: '8010724c-04aa-433c-94a9-af81bd4fbfb2', company: 'Fixture company)', title: 'Engineer (33010)', location: '65-Fairfield Acura, Fairfield, OH', posted_at: '2026-10-01', description: 'Python required.', apply_url: 'https://fixture.invalid/apply' };
  const filters: Array<{ p_min_annual: number; p_currency: string }> = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.pathname === '/rest/v1/rpc/browse_job_postings') {
      filters.push(route.request().postDataJSON());
      return route.fulfill({ json: [], headers: { 'content-range': '*/0' } });
    }
    if (url.pathname === '/rest/v1/job_postings') return route.fulfill({ json: url.searchParams.get('select')?.includes('description') ? job : [job], headers: { 'content-range': '0-0/1' } });
    return route.abort();
  });
  await page.goto('/jobs');
  await expect(page.locator('.lp-browser-card-title')).toHaveText('Engineer');
  await expect(page.locator('.lp-browser-card-company')).toHaveText('Fixture company');
  await expect(page.locator('.lp-browser-card-meta')).toHaveText('Fairfield, Ohio, United States');
  await page.getByRole('spinbutton', { name: 'Minimum annual salary' }).fill('100000');
  await page.getByRole('combobox', { name: 'Salary currency' }).selectOption('AED');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No matching roles right now' })).toBeVisible();
  expect(filters.at(-1)).toMatchObject({ p_min_annual: 100000, p_currency: 'AED' });
  await expect(page).toHaveURL(/minPay=100000.*currency=AED/);
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'Minimum annual salary' })).toHaveValue('100000');
  await expect(page.getByRole('combobox', { name: 'Salary currency' })).toHaveValue('AED');
});

test('remote pay comparison explicitly uses eligibility, not the HQ city', async ({ page }) => {
  const job = { id: '8010724c-04aa-433c-94a9-af81bd4fbfb2', title: 'AI Engineer', company: 'Fixture', location: 'United States (Remote)', description: 'Python required.', work_mode: 'remote', posted_at: '2026-10-01', apply_url: 'https://fixture.invalid/apply' };
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.pathname === '/rest/v1/job_postings') return route.fulfill({ json: url.searchParams.get('select')?.includes('description') ? job : [job], headers: { 'content-range': '0-0/1' } });
    if (url.pathname === '/rest/v1/rpc/job_salary_comparison') return route.fulfill({ json: { enough: false, sample: 19, currency: 'USD', category: 'ai_engineering', city: 'Scottsdale', cohort_scope: 'remote', cohort_location: 'United States', seniority: 'senior', annual_min: 100000, annual_max: 140000 } });
    return route.abort();
  });
  await page.goto('/jobs/' + job.id);
  const comparison = page.getByRole('region', { name: 'Salary versus advertised market pay' });
  await expect(comparison).toContainText('remote postings eligible in United States');
  await expect(comparison).not.toContainText('Scottsdale');
  await expect(comparison).toContainText('at least 20 are needed');
  await expect(comparison).toContainText('$100,000–$140,000 per year (USD)');
});

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
    location: 'United States (Remote)', remote_region: 'United States', work_mode: 'remote', apply_by: '2026-09-11',
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
  await expect(page.locator('.lp-browser-card-meta')).toHaveText('United States · Remote');
});

test('company observations render once, including after refresh', async ({ page }) => {
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    if (route.request().url().includes('/rest/v1/rpc/company_location_summary')) return route.fulfill({ json: { total: 100, with_location: 90, source_groups: 2, groups: [{ location: 'USA', roles: 40 }, { location: 'United States of America', roles: 50 }] } });
    if (route.request().url().includes('/rest/v1/rpc/company_profile')) return route.fulfill({ json: {
      slug: 'workstream', name: 'Workstream', logo_url: null,
      insights: { open_roles: 100, pay: { postings: 11, with_pay: 1, pct: 9 }, speed: null },
      relisted_roles: 0, edits_30d: 1, sponsorship: { offered: 0, not_offered: 0 },
      work_mode: { hybrid: 6, onsite: 3 }, top_categories: [{ category: 'software_engineering', open_roles: 80 }], common_benefits: [], jobs: [],
    } });
    return route.abort();
  });
  await page.goto('/companies/workstream');
  for (let pass = 0; pass < 2; pass++) {
    await expect(page.getByText('of postings show pay (1 of 11)', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Posting updates', exact: true })).toHaveCount(1);
    await expect(page.getByText(/1 field change observed in the last 30 days/)).toHaveCount(1);
    await expect(page.getByText(/Showing the 0 most recent of 100\./)).toHaveCount(1);
    await expect(page.getByText('AYN has classified work mode for 9 of 100 postings. 91 remain unclassified.', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Roles it is hiring for', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Where it is hiring', exact: true })).toBeVisible();
    await expect(page.getByText('United States (90)', { exact: true })).toBeVisible();
    await expect(page.getByText(/90 of 100 postings state a location/)).toBeVisible();
    if (!pass) await page.reload();
  }
});
