import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

for (const width of [390, 1440]) {
  test(`supporting pages preserve actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/#help');
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await page.getByRole('button', { name: 'Credits and billing', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Credits and billing' })).toBeVisible();
    await page.getByText('Do credits roll over?', { exact: true }).click();
    await expect(page.getByText('No, they reset each billing period.', { exact: true })).toBeVisible();
    await page.getByLabel('Search for an answer').fill('zzzz-no-match');
    await expect(page.getByRole('status').filter({ hasText: '0 answers found' })).toBeVisible();
    await page.getByRole('button', { name: 'Your data', exact: true }).click();
    await expect(page.getByLabel('Search for an answer')).toHaveValue('');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `/tmp/ayn-help-${width}.png`, fullPage: true });

    await page.goto('/#pricing');
    await expect(page.locator('.ayn-plan')).toHaveCount(4);
    await expect(page.getByRole('button', { name: 'Choose Starter', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `/tmp/ayn-pricing-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Choose Starter', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');

    // FAQ stayed on its real card grid (each question shown with its
    // answer already visible, an icon badge per card) rather than moving
    // to an accordion -- flagged directly: "codex was about to do
    // something i dont want it which is changing the help ceneter cards."
    // No expand/collapse to test here; confirm the real cards render.
    await page.goto('/#faq');
    await expect(page.locator('.lp-faq-item')).toHaveCount(7);
    await expect(page.locator('.lp-faq-item-icon').first()).toBeVisible();
    await page.goto('/#saved-jobs');
    await expect(page.getByRole('heading', { name: 'Saved jobs', exact: true })).toBeVisible();
    const headingBounds = await page.getByRole('heading', { name: 'Saved jobs', exact: true }).boundingBox();
    expect(headingBounds?.y).toBeLessThan(width < 900 ? 130 : 80);
    await page.screenshot({ path: `/tmp/ayn-gate-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Already have an account? Sign in', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
}
