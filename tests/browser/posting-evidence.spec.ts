import { expect, test } from '@playwright/test';

const id = '8010724c-04aa-433c-94a9-af81bd4fbfb2';
const job = { id, title: 'Engineer', company: 'Fixture', description: 'Build data systems.',
  location: 'Austin', source: 'greenhouse', posted_at: '2026-10-10', first_seen_at: '2026-09-12',
  closure_status: 'error', closure_checked_at: '2026-10-09', closure_last_open_at: '2026-10-08',
  last_seen_at: '2026-10-09', repost_count: 2, apply_url: 'https://fixture.invalid/apply' };
const evidence = { ...job, appearances: [{ archive_id: 1, first_observed_at: '2026-09-12', removed_at: '2026-09-20', removal_reason: 'pruned' }], changes: [
  { id: 3, field: 'description', old_value: '40 characters', new_value: '45 characters', old_excerpt: 'Build Python systems.', new_excerpt: 'Build Python and SQL systems.', changed_at: '2026-10-08' },
  { id: 2, field: 'salary', old_value: '100000 to 120000', new_value: '110000 to 130000', changed_at: '2026-10-07' },
  { id: 1, field: 'title', old_value: '<script>alert(1)</script>', new_value: 'Engineer', changed_at: '2026-10-06' },
] };

for (const width of [1280, 390]) test(`receipts, real diffs and failed checks remain readable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let reads = 0;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.pathname === '/rest/v1/job_postings') return route.fulfill({ json: url.searchParams.get('select')?.includes('description') ? job : [job], headers: { 'content-range': '0-0/1' } });
    if (url.pathname === '/rest/v1/rpc/job_posting_evidence') { reads++; return route.fulfill({ json: evidence }); }
    return route.abort();
  });
  await page.goto('/jobs');
  await expect(page.locator('.lp-browser-card .ayn-receipt-line')).toContainText('Could not confirm');
  await expect(page.locator('.lp-browser-card .ayn-receipt-line')).toContainText('2 earlier catalog appearances');
  if (width < 640) {
    expect(reads).toBe(0);
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await page.locator('.lp-browser-card').click();
  }
  // Only the selected detail requests history; cards use their summary projection.
  await expect(page.getByRole('region', { name: 'Posting evidence' })).toContainText('Historical currency and pay period were not recorded');
  expect(reads).toBe(1);
  const panel = page.getByRole('region', { name: 'Posting evidence' });
  await expect(panel).toContainText('Earlier catalog appearance');
  await expect(panel).toContainText('2 counted at ingestion; 1 matching archive records');
  await expect(panel).toContainText('Build Python and SQL systems.');
  await expect(panel.locator('del').first()).toHaveText('<script>alert(1)</script>');
  await expect(panel.locator('script')).toHaveCount(0);
  await expect(panel).toContainText('Oct 8, 2026');
  await expect(panel).not.toContainText('VERIFIED');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('history failure has a working retry and does not imply closure', async ({ page }) => {
  let fail = true;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.pathname === '/rest/v1/job_postings') return route.fulfill({ json: url.searchParams.get('select')?.includes('description') ? job : [job], headers: { 'content-range': '0-0/1' } });
    if (url.pathname === '/rest/v1/rpc/job_posting_evidence') return fail ? route.fulfill({ status: 503, json: { message: 'Unavailable' } }) : route.fulfill({ json: evidence });
    return route.abort();
  });
  await page.goto('/jobs/' + id);
  const panel = page.getByRole('region', { name: 'Posting evidence' });
  await expect(panel).toContainText('This is not evidence that the job closed');
  fail = false;
  await panel.getByRole('button', { name: 'Retry history' }).click();
  await expect(panel).toContainText('First observed by AYN');
});

test('archived posting keeps evidence without claiming employer removal for pruning', async ({ page }) => {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.pathname === '/rest/v1/job_postings') return route.fulfill({ json: url.searchParams.get('select')?.includes('description') ? null : [], headers: { 'content-range': '*/0' } });
    if (url.pathname === '/rest/v1/rpc/job_posting_evidence') return route.fulfill({ json: { ...evidence, removed_at: '2026-10-09', removal_reason: 'pruned' } });
    return route.abort();
  });
  await page.goto('/jobs/' + id);
  await expect(page.getByRole('region', { name: 'Posting evidence' })).toContainText('Removed from AYN catalog');
});
