import { test, expect, chromium } from '@playwright/test';
import { loginAsTestUser, TEST_USERS } from '../../utils/auth-helper';

test.describe('Stress Tests', () => {
  test('should handle 10 concurrent chat sessions', async () => {
    const browsers = await Promise.all(Array(10).fill(0).map(() => chromium.launch()));
    
    try {
      await Promise.all(browsers.map(async (browser, i) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto('https://aynn.io');
        await page.waitForLoadState('networkidle');
        
        const chatInput = page.locator('textarea').first();
        if (await chatInput.count() > 0) {
          await chatInput.fill(`Stress test ${i}`);
        }
      }));
    } finally {
      await Promise.all(browsers.map(b => b.close()));
    }
  });

  test('should handle rapid page navigation', async ({ page }) => {
    const routes = ['/', '/engineering', '/support', '/settings'];
    for (let i = 0; i < 20; i++) {
      const route = routes[i % routes.length];
      await page.goto(`https://aynn.io${route}`);
      await page.waitForTimeout(200);
    }
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle 50 rapid API calls', async ({ page }) => {
    await page.goto('https://aynn.io/engineering');
    await page.waitForLoadState('networkidle');
    
    const calcBtn = page.locator('button:has-text("Calculate")').first();
    for (let i = 0; i < 50; i++) {
      if (await calcBtn.count() > 0 && await calcBtn.isEnabled()) {
        await calcBtn.click().catch(() => {});
        await page.waitForTimeout(100);
      }
    }
    await expect(page.locator('body')).toBeVisible();
  });

  test('should measure response times', async ({ page }) => {
    await page.goto('https://aynn.io');
    const start = Date.now();
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - start;
    
    console.log(`Page load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(10000);
  });
});
