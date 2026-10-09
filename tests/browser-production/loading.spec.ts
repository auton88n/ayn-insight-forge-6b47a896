import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

for (const width of [390, 1440]) {
  test(`compiled pricing loads only the selected feature at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const scripts: string[] = [];
    const errors: string[] = [];
    page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: 'Plans & credits', exact: true })).toBeVisible();
    await expect(page.locator('.ayn-plan')).toHaveCount(4);
    expect(scripts.some(url => /\/PricingTab-/.test(url))).toBe(true);
    expect(scripts.filter(url => /\/(AuthModal|JobsBrowser|TicketForm|AccountTabs|EmployerHub|AdminApp|legalDocs|resumeDocs|HelpTab|proxy)-/.test(url))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await page.getByRole('button', { name: 'Choose Starter', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(scripts.some(url => /\/AuthModal-/.test(url))).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `/tmp/ayn-split-pricing-${width}.png`, fullPage: true });
  });
}

test('compiled search can navigate to Help and restore search with Back', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  await page.goto('/#search');
  await expect(page.getByRole('heading', { name: 'Browse real jobs', exact: true })).toBeVisible();
  expect(scripts.filter(url => /\/(AccountTabs|EmployerHub|AdminApp|AuthModal|resumeDocs|HelpTab|PricingTab|proxy)-/.test(url))).toEqual([]);
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Help Center', exact: true })).toBeVisible();
  await expect(page.locator('.lp-reveal').first()).toHaveCSS('opacity', '1');
  expect(scripts.some(url => /\/HelpTab-/.test(url))).toBe(true);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Browse real jobs', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Browse real jobs', exact: true })).toBeVisible();
});
