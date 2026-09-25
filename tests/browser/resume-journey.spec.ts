import { test, expect } from '@playwright/test';

test('public search does not eagerly load account settings or marketing tabs', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', request => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  await page.route('https://ayn-test.invalid/**', route => route.abort());
  await page.goto('/#search');
  await expect(page.getByRole('heading', { name: 'Browse real jobs', exact: true })).toBeVisible();
  // Covers the former three-second idle preload, not only first paint.
  await page.waitForTimeout(3500);
  expect(scripts.filter(url => /\/(HomeTabs|HomeTabPanel|AccountTabs|Settings|SettingsPanel)\.tsx/.test(url))).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  // Never send a browser test to production. Only the public-check fixture
  // is fulfilled; all other non-local requests are blocked.
  await page.route('**/*', async route => {
    const request = route.request();
    if (new URL(request.url()).hostname === '127.0.0.1') return route.continue();
    if (request.url().includes('/functions/v1/resume-hub') && request.postDataJSON()?.action === 'resume_check_public') {
      return route.fulfill({ json: { matched: ['Python'], missing: ['Terraform'], niceToHave: [], matchPct: 50 } });
    }
    return route.abort();
  });
});

test('text-only check offers evidence and clears stale results on editing', async ({ page }) => {
  await page.goto('/check-resume');
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await page.getByLabel('Your resume', { exact: true }).fill('Applicant\napplicant@example.com\nResponsible for Python reporting.');
  await page.getByLabel('The job description').fill('Requirements: Python and Terraform.');
  await page.getByRole('button', { name: 'Check my resume', exact: true }).click();
  await expect(page.getByText('Lead with the contribution, not the duty')).toBeVisible();
  await expect(page.getByRole('blockquote')).toContainText('Responsible for Python reporting.');
  await page.getByRole('button', { name: 'Create an account or sign in' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('Your resume', { exact: true }).fill('Changed text');
  await expect(page.getByText('Lead with the contribution, not the duty')).toHaveCount(0);
});

test('home tabs survive refresh and browser Back', async ({ page }) => {
  await page.goto('/#features');
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Everything AYN actually does for you' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Everything AYN actually does for you' })).toBeVisible();
  await page.getByRole('button', { name: 'Plans & credits', exact: true }).click();
  await expect(page).toHaveURL(/#pricing$/);
  await page.goBack();
  await expect(page).toHaveURL(/#features$/);
  await expect(page.getByRole('heading', { name: 'Everything AYN actually does for you' })).toBeVisible();
});

test('mobile checker fits the viewport and keeps its labels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/check-resume');
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByLabel('Your resume', { exact: true })).toBeVisible();
  await expect(page.getByLabel('The job description')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
