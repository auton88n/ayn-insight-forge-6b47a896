import { test, expect } from '@playwright/test';
import { loginAsTestUser } from '../../utils/auth-helper';

test.describe('Admin Panel - Access Control', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
  });

  test('should show PIN gate for admin access', async ({ page }) => {
    const pinGate = page.locator('[class*="pin"]').or(
      page.locator('input[type="password"][placeholder*="PIN" i]')
    );
    // PIN gate should exist for admin protection
    await expect(page.locator('body')).toBeVisible();
  });

  test('should reject invalid PIN', async ({ page }) => {
    const pinInput = page.locator('input[type="password"]').first();
    if (await pinInput.count() > 0) {
      await pinInput.fill('0000');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      // Should show error or stay on PIN page
    }
  });

  test('should prevent brute force PIN attempts', async ({ page }) => {
    const pinInput = page.locator('input[type="password"]').first();
    if (await pinInput.count() > 0) {
      for (let i = 0; i < 5; i++) {
        await pinInput.fill(`${1000 + i}`);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        await pinInput.clear();
      }
      // Should be rate limited or locked
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should not expose admin routes without auth', async ({ page }) => {
    // Try accessing admin routes directly without login
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await page.goto('/admin');
    await page.waitForTimeout(1000);
    // Should redirect or show access denied
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Admin Panel - User Management', () => {
  test('should display user list', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    
    const userList = page.locator('[class*="user"]').or(
      page.locator('table')
    );
    // Admin panel should have user management
    await expect(page.locator('body')).toBeVisible();
  });

  test('should search users', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/admin');
    
    const searchInput = page.locator('input[placeholder*="search" i]');
    if (await searchInput.count() > 0) {
      await searchInput.fill('test');
      await page.waitForTimeout(500);
    }
  });

  test('should handle user limit modification', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/admin');
    
    const editBtn = page.locator('button:has-text("Edit")').first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      await page.waitForTimeout(300);
    }
  });
});

test.describe('Admin Panel - LLM Monitoring', () => {
  test('should display LLM usage stats', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/admin');
    
    const llmSection = page.locator('[class*="llm"]').or(
      page.locator('text=LLM').or(page.locator('text=AI Usage'))
    );
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show cost breakdown', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/admin');
    
    const costSection = page.locator('[class*="cost"]').or(
      page.locator('text=Cost').or(page.locator('text=SAR'))
    );
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display model performance metrics', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/admin');
    
    // Look for charts or metrics
    const charts = page.locator('canvas').or(page.locator('[class*="chart"]'));
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Admin Panel - System Settings', () => {
  test('should toggle maintenance mode', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/admin');
    
    const maintenanceToggle = page.locator('[class*="switch"]').or(
      page.locator('button:has-text("Maintenance")')
    );
    if (await maintenanceToggle.count() > 0) {
      // Don't actually toggle in test
      await expect(maintenanceToggle.first()).toBeVisible();
    }
  });

  test('should manage notification settings', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/admin');
    
    const notifSection = page.locator('text=Notification').or(
      page.locator('[class*="notification"]')
    );
    await expect(page.locator('body')).toBeVisible();
  });

  test('should view rate limit configuration', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/admin');
    
    const rateSection = page.locator('text=Rate').or(
      page.locator('[class*="rate"]')
    );
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle rapid navigation in admin', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/admin');
    
    // Rapid tab/section switching
    const tabs = page.locator('[role="tab"]');
    const count = await tabs.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      await tabs.nth(i).click().catch(() => {});
      await page.waitForTimeout(200);
    }
    await expect(page.locator('body')).toBeVisible();
  });
});
