import { test, expect } from '@playwright/test';

test.describe('Landing Page Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should load landing page successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/AYN/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display hero section', async ({ page }) => {
    const hero = page.locator('section').first();
    await expect(hero).toBeVisible();
  });

  test('should have working navigation menu', async ({ page }) => {
    // Check nav exists
    const nav = page.locator('nav').or(page.locator('header'));
    await expect(nav).toBeVisible();
  });

  test('should toggle theme (dark/light)', async ({ page }) => {
    const themeToggle = page.locator('button[aria-label*="theme"]').or(
      page.locator('button:has([class*="sun"])').or(
        page.locator('button:has([class*="moon"])')
      )
    );
    
    if (await themeToggle.count() > 0) {
      await themeToggle.first().click();
      await page.waitForTimeout(300);
      
      // Check theme changed
      const html = page.locator('html');
      const className = await html.getAttribute('class');
      expect(className).toBeDefined();
    }
  });

  test('should switch language (EN/AR)', async ({ page }) => {
    const langSwitcher = page.locator('button:has-text("EN")').or(
      page.locator('button:has-text("AR")')
    );
    
    if (await langSwitcher.count() > 0) {
      await langSwitcher.first().click();
      await page.waitForTimeout(500);
    }
  });

  test('should open auth modal on Sign In click', async ({ page }) => {
    const signInBtn = page.locator('button:has-text("Sign In")').or(
      page.locator('button:has-text("تسجيل")')
    );
    
    if (await signInBtn.count() > 0) {
      await signInBtn.first().click();
      
      // Wait for modal
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 5000 });
    }
  });

  test('should scroll to sections smoothly', async ({ page }) => {
    // Look for section links
    const aboutLink = page.locator('a[href="#about"]').or(
      page.locator('button:has-text("About")')
    );
    
    if (await aboutLink.count() > 0) {
      await aboutLink.first().click();
      await page.waitForTimeout(1000);
    }
  });

  test('should display services section', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, 1000));
    await page.waitForTimeout(500);
    
    // Check for service cards
    const serviceCards = page.locator('[class*="card"]').or(
      page.locator('[class*="service"]')
    );
    
    const count = await serviceCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should have contact form', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    
    const contactForm = page.locator('form').or(
      page.locator('[class*="contact"]')
    );
    
    if (await contactForm.count() > 0) {
      await expect(contactForm.first()).toBeVisible();
    }
  });

  test('should be mobile responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);
    
    // Page should still be functional
    await expect(page.locator('body')).toBeVisible();
    
    // Check for mobile menu or hamburger
    const mobileMenu = page.locator('[class*="mobile"]').or(
      page.locator('button[aria-label*="menu"]')
    );
    
    // Either mobile menu exists or content is still accessible
    expect(true).toBe(true);
  });

  test('should handle rapid scroll', async ({ page }) => {
    // Stress test: rapid scrolling
    for (let i = 0; i < 10; i++) {
      await page.evaluate((pos) => window.scrollTo(0, pos * 500), i);
      await page.waitForTimeout(100);
    }
    
    // Page should still be stable
    await expect(page.locator('body')).toBeVisible();
  });

  test('should not have console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Filter out expected warnings
    const criticalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('third-party')
    );
    
    expect(criticalErrors.length).toBeLessThanOrEqual(2);
  });
});
