import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

test('pricing fetches its own tab, not search, support, account or sign-in forms', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Plans & credits', exact: true })).toBeVisible();
  expect(scripts.some(url => /\/tabs\/PricingTab\.tsx/.test(url))).toBe(true);
  expect(scripts.filter(url => /\/(JobsBrowser|TicketForm|AccountTabs|AuthModal|EmployerLandingSections|EmployerHub)\.tsx|\/tabs\/(?!PricingTab)\w+\.tsx/.test(url))).toEqual([]);
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await page.getByRole('button', { name: 'Choose Starter', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(scripts.some(url => /\/auth\/AuthModal\.tsx/.test(url))).toBe(true);
});

test('late-loaded Help content is revealed and Back restores its state route', async ({ page }) => {
  await page.route('**/tabs/HelpTab.tsx', async route => {
    // Content arrives after the shell's old 900ms reveal timeout.
    await new Promise(resolve => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.goto('/#help');
  const heading = page.getByRole('heading', { name: 'Help Center', exact: true });
  await expect(heading).toBeVisible();
  await expect(page.locator('.lp-reveal').first()).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await page.getByRole('button', { name: 'Plans & credits', exact: true }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await page.goBack();
  await expect(heading).toBeVisible();
  await expect(page.locator('.lp-reveal').first()).toHaveCSS('opacity', '1');
});

test('offline notification still appears without the animation-library dependency', async ({ page, context }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Plans & credits', exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'No internet connection' })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('No internet connection', { exact: true })).toHaveCount(0);
});
