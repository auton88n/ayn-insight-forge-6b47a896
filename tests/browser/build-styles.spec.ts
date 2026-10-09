import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`build preserves design tokens and utility precedence at ${width}px`, async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/#help');
    await expect(page.getByLabel('Search for an answer')).toBeVisible();
    await page.evaluate(() => {
      const fixture = document.createElement('div');
      fixture.id = 'build-style-fixture';
      fixture.innerHTML = `
        <div data-check="border" class="border border-blue-300 rounded-sm shadow-sm">Border</div>
        <div data-check="height" class="max-h-[calc(100vh_-_40px)] overflow-y-auto"><div style="height:2000px"></div></div>
        <div data-check="blur" class="backdrop-blur">Blur</div>
        <button data-check="outline" class="outline-hidden">Focus</button>
        <div data-check="responsive" class="hidden lg:block">Desktop</div>`;
      document.body.append(fixture);
    });
    const fixture = page.locator('#build-style-fixture');
    await expect(fixture.locator('[data-check="border"]')).toHaveCSS('border-top-color', 'rgb(147, 197, 253)');
    await expect(fixture.locator('[data-check="border"]')).toHaveCSS('border-radius', '8px');
    await expect(fixture.locator('[data-check="border"]')).toHaveCSS('box-shadow', /rgba\(0, 0, 0, 0\.05\) 0px 1px 2px 0px/);
    await expect(fixture.locator('[data-check="height"]')).toHaveCSS('max-height', '960px');
    await expect(fixture.locator('[data-check="blur"]')).toHaveCSS('backdrop-filter', 'blur(8px)');
    await expect(fixture.locator('[data-check="outline"]')).toHaveCSS('outline-style', 'none');
    await page.emulateMedia({ forcedColors: 'active' });
    await expect(fixture.locator('[data-check="outline"]')).toHaveCSS('outline-style', 'solid');
    await expect(fixture.locator('[data-check="outline"]')).toHaveCSS('outline-width', '2px');
    await page.emulateMedia({ forcedColors: 'none' });
    await expect(fixture.locator('[data-check="responsive"]')).toHaveCSS('display', width < 1024 ? 'none' : 'block');
  });
}
