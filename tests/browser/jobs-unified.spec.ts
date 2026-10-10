import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const version = (slug: string) => readFileSync(`src/content/legal/${slug}.md`, 'utf8').match(/Version:\s*([^\s*]+)/i)?.[1];

const uid = '00000000-0000-4000-8000-000000000009';
const user = { id: uid, email: 'qa@fixture.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const jobs = [
  { id: '8010724c-04aa-433c-94a9-af81bd4fbfb2', title: 'Data Engineer', company: 'Fixture A', description: 'Build Python pipelines.', apply_url: 'https://fixture.invalid/apply-a', location: 'Austin', posted_at: '2026-10-10', first_seen_at: '2026-10-08' },
  { id: '8010724c-04aa-433c-94a9-af81bd4fbfb3', title: 'Platform Engineer', company: 'Fixture B', description: 'Build SQL systems.', apply_url: 'https://fixture.invalid/apply-b', location: 'Austin', posted_at: '2026-10-09', first_seen_at: '2026-10-08' },
];
async function fixture(page: Page, signedIn = false, missingResume = false, race = false) {
  const calls: string[] = [];
  let saved = false;
  if (signedIn) await page.addInitScript(u => {
    localStorage.setItem('sb-ayn-test-auth-token', JSON.stringify({ user: u, access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer' }));
  }, user);
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user });
    if (url.pathname === '/rest/v1/profiles') return route.fulfill({ json: { role: 'job_seeker' } });
    if (url.pathname === '/rest/v1/terms_consent_log') return route.fulfill({ json: { terms_accepted: true, privacy_accepted: true, terms_version: version('terms'), privacy_version: version('privacy') } });
    if (url.pathname === '/rest/v1/job_postings') {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      return route.fulfill({ json: id ? jobs.find(j => j.id === id) : jobs, headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' } });
    }
    if (url.pathname === '/rest/v1/resumes') {
      expect(url.searchParams.get('user_id')).toBe('eq.' + uid);
      return route.fulfill({ json: missingResume ? null : { id: 'resume-version', updated_at: '2026-10-10', content: { full_name: 'Fixture', summary: 'Build data systems.', skills: ['Python', 'SQL'], experience: [], education: [] } } });
    }
    if (url.pathname === '/rest/v1/jobs') {
      if (request.method() === 'POST') {
        expect(request.postDataJSON().user_id).toBe(uid);
        saved = true;
        return race ? route.fulfill({ status: 409, json: { code: '23505', message: 'duplicate' } }) : route.fulfill({ json: { id: 'saved-row' } });
      }
      expect(url.searchParams.get('user_id')).toBe('eq.' + uid);
      return route.fulfill({ json: url.searchParams.has('source_url') ? saved ? { id: 'saved-row' } : null : saved ? [{ id: 'saved-row', source_url: jobs[0].apply_url, title: jobs[0].title, company: jobs[0].company, jd_text: jobs[0].description, source: 'job_board', created_at: '2026-10-10', application_status: 'saved' }] : [] });
    }
    if (url.pathname === '/functions/v1/resume-hub') {
      const body = request.postDataJSON(); calls.push(body.action);
      if (body.action === 'job_board_score') {
        expect(body.jobs.length).toBeLessThanOrEqual(25);
        expect(body.jobs[0].description).toBe(jobs[0].description);
        return route.fulfill({ json: { scores: jobs.map((j, i) => ({ id: j.id, match_pct: i ? 80 : 20 })) } });
      }
      return route.fulfill({ json: {} });
    }
    if (url.pathname === '/rest/v1/rpc/get_feature_flags') return route.fulfill({ json: { flags: {}, messages: {} } });
    if (url.pathname === '/rest/v1/rpc/job_posting_evidence') return route.fulfill({ json: { source: 'greenhouse', changes: [] } });
    if (url.pathname === '/rest/v1/rpc/job_salary_comparison') return route.fulfill({ json: { enough: false, sample: 0 } });
    return route.fulfill({ json: null });
  });
  return calls;
}
async function rejectCookies(page: Page) {
  const reject = page.getByRole('button', { name: 'Reject', exact: true });
  if (await reject.isVisible()) await reject.click();
}

for (const width of [1280, 390]) test(`one Jobs layout retains matching and preparation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const calls = await fixture(page, true);
  await page.goto('/?where=Austin#search');
  await rejectCookies(page);
  await expect(page.getByRole('heading', { name: 'Jobs', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Job matches', exact: true })).toHaveCount(0);
  await expect(page.locator('.lp-browser-card')).toHaveCount(2);
  expect(calls).not.toContain('job_board_score');
  await page.getByRole('button', { name: 'My matches', exact: true }).click();
  await expect(page.locator('.lp-browser-card').first()).toContainText('Platform Engineer');
  await expect(page.locator('.lp-browser-card').first()).toContainText('80% resume match');
  await expect(page).toHaveURL(/where=Austin.*view=matches.*#search/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'My matches', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.lp-browser-card').first()).toContainText('80% resume match');
  await page.locator('.lp-browser-card').first().click();
  await expect(page.getByRole('button', { name: 'Save job', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Tailor resume & cover letter', exact: true }).click();
  await expect(page).toHaveURL(/#saved-jobs$/);
  expect(await page.evaluate(() => sessionStorage.getItem('ayn_jobs_return_url'))).toContain('view=matches');
  await expect(page.getByRole('button', { name: 'Tailor resume', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Write cover letter', exact: true })).toBeEnabled();
  expect(calls.some(action => ['tailor', 'cover_letter', 'resume_optimize'].includes(action))).toBe(false);
  await page.getByRole('button', { name: 'Browse jobs', exact: true }).click();
  await expect(page.getByRole('button', { name: 'My matches', exact: true })).toHaveAttribute('aria-pressed', 'true');
  if (width === 390) await page.getByRole('button', { name: 'Back to results', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Location', exact: true })).toHaveValue('Austin');
  await page.screenshot({ path: `/tmp/ayn-alert-release.MJoSSi/jobs-unified-${width}.png`, fullPage: true });
});

test('old match links preserve filters and use the shared browser', async ({ page }) => {
  await fixture(page);
  await page.goto('/?q=Engineer&where=Austin#matched-jobs');
  await expect(page).toHaveURL(/q=Engineer&where=Austin&view=matches#search$/);
  await expect(page.getByRole('heading', { name: 'Jobs', exact: true })).toBeVisible();
  await expect(page.getByText('Sign in to see how these jobs match your saved resume.')).toBeVisible();
  await rejectCookies(page);
  await page.getByRole('button', { name: 'All jobs', exact: true }).click();
  await expect(page).toHaveURL(/q=Engineer&where=Austin#search$/);
  await page.goBack();
  await expect(page.getByRole('button', { name: 'My matches', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('missing resumes do not invent scores or call the scoring backend', async ({ page }) => {
  const calls = await fixture(page, true, true);
  await page.goto('/jobs?view=matches');
  await expect(page.getByText('Add a resume to see your matches.', { exact: false })).toBeVisible();
  expect(calls).not.toContain('job_board_score');
  await rejectCookies(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText('Sign in to see how these jobs match your saved resume.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tailor resume & cover letter', exact: true })).toHaveCount(0);
});

test('a duplicate-save race still opens the existing preparation workspace', async ({ page }) => {
  await fixture(page, true, false, true);
  await page.goto('/jobs/' + jobs[0].id);
  await rejectCookies(page);
  await page.getByRole('button', { name: 'Tailor resume & cover letter', exact: true }).click();
  await expect(page).toHaveURL(/#saved-jobs$/);
  await expect(page.getByRole('button', { name: 'Tailor resume', exact: true })).toBeEnabled();
});

test('failed matching keeps browsing available and can be retried', async ({ page }) => {
  await fixture(page, true);
  let failed = true;
  await page.route('**/functions/v1/resume-hub', route => {
    if (failed && route.request().postDataJSON().action === 'job_board_score') {
      return route.fulfill({ status: 503, json: { error: 'temporarily unavailable' } });
    }
    return route.fallback();
  });
  await page.goto('/jobs?view=matches');
  await rejectCookies(page);
  await expect(page.getByRole('button', { name: 'Retry matches', exact: true })).toBeVisible();
  await expect(page.locator('.lp-browser-card')).toHaveCount(2);
  failed = false;
  await page.getByRole('button', { name: 'Retry matches', exact: true }).click();
  await expect(page.locator('.lp-browser-card').first()).toContainText('80% resume match');
});
