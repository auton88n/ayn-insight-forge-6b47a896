import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`resume and letter reading layouts remain structured at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const requests: string[] = [];
    page.on('request', r => requests.push(r.url()));
    await page.goto('/tests/browser/fixtures/documents.html');
    const resume = page.getByRole('article', { name: 'Resume preview' });
    await expect(resume.getByRole('heading', { name: 'EXPERIENCE' })).toBeVisible();
    await expect(resume.getByRole('listitem')).toHaveCount(2);
    await expect(resume.getByText('Git', { exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Cover letter preview' }).locator('p')).toHaveCount(4);
    await expect(page.locator('pre')).toHaveCount(0);
    expect(await resume.getByRole('heading', { name: 'EXPERIENCE' }).evaluate(e => getComputedStyle(e).fontWeight)).toBe('700');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(requests.some(url => /(?:node_modules|deps).*\/(?:docx|jspdf)/i.test(url))).toBe(false);
  });
  test(`report typography, lists and tables remain readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      if (url.pathname === '/rest/v1/articles') return route.fulfill({ json: {
        slug: 'fixture-report', title: 'Readable hiring report', dek: 'A catalog snapshot.',
        category: 'software_engineering', kind: 'hiring_trend', published_at: '2026-10-10',
        body_md: 'First paragraph.\n\n## Market context\n\nSecond paragraph.\n\n- First finding\n- Second finding\n\n| Role | Pay |\n| --- | --- |\n| Engineer | USD 100,000 |\n\n<script>window.presentationInjected=true</script>',
      } });
      return route.fulfill({ json: null });
    });
    await page.goto('/insights/fixture-report');
    const article = page.locator('article.ayn-reading');
    await expect(article.getByRole('heading', { name: 'Market context' })).toBeVisible();
    await expect(article.locator('li')).toHaveCount(2);
    const styles = await article.evaluate(e => {
      const p = getComputedStyle(e.querySelector('p')!);
      const h = getComputedStyle(e.querySelector('h2')!);
      const list = getComputedStyle(e.querySelector('ul')!);
      return { paragraph: parseFloat(p.fontSize), heading: parseFloat(h.fontSize), margin: parseFloat(p.marginBottom), list: list.listStyleType };
    });
    expect(styles.heading).toBeGreaterThan(styles.paragraph);
    expect(styles.margin).toBeGreaterThan(12);
    expect(styles.list).toBe('disc');
    await expect(article.getByRole('region', { name: 'Report table' })).toHaveAttribute('tabindex', '0');
    await expect(article.locator('script')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto('/privacy');
    await expect(page.locator('article.ayn-reading.legal-doc')).toBeVisible();
    expect(await page.locator('article.legal-doc p').first().evaluate(e => parseFloat(getComputedStyle(e).marginBottom))).toBeGreaterThan(10);
  });
}
