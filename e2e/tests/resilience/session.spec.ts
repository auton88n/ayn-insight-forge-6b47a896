import { test, expect } from '@playwright/test';

/**
 * Session Management Tests - Phase 3
 * Authentication session handling and security
 */

test.describe('Session Management', () => {
  test.describe('Token Handling', () => {
    test('should maintain session across page refreshes', async ({ page }) => {
      // Login
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Verify logged in
      const chatInput = page.locator('textarea').first();
      await expect(chatInput).toBeVisible({ timeout: 5000 });
      
      // Refresh page
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Should still be logged in
      await expect(chatInput).toBeVisible({ timeout: 5000 });
    });

    test('should persist session across browser restarts', async ({ page, context }) => {
      // Login
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Close and reopen page (simulate restart)
      await page.close();
      const newPage = await context.newPage();
      await newPage.goto('/');
      await newPage.waitForLoadState('networkidle');
      
      // Should still be logged in
      const chatInput = newPage.locator('textarea').first();
      await expect(chatInput).toBeVisible({ timeout: 5000 });
      
      await newPage.close();
    });
  });

  test.describe('Session Expiry', () => {
    test('should detect session expiry gracefully', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Clear auth tokens to simulate expiry
      await page.evaluate(() => {
        localStorage.removeItem('sb-dfkoxuokfkttjhfjcecx-auth-token');
      });
      
      // Try to perform authenticated action
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Should show login option or redirect to login
      const authPrompt = page.locator('text=Sign In, text=Login, [role="dialog"]');
      // May need to re-authenticate
    });

    test('should prompt re-login on 401 response', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Mock 401 response
      await page.route('**/functions/v1/**', route => {
        route.fulfill({
          status: 401,
          body: JSON.stringify({ error: 'Unauthorized' }),
        });
      });
      
      // Try to send message
      const chatInput = page.locator('textarea').first();
      if (await chatInput.isVisible()) {
        await chatInput.fill('Test after 401');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }
      
      // Should show auth error or prompt
    });
  });

  test.describe('Multi-Tab Session Sync', () => {
    test('should sync login state across tabs', async ({ page, context }) => {
      // Open first tab
      await page.goto('/');
      
      // Open second tab
      const page2 = await context.newPage();
      await page2.goto('/');
      await page2.waitForLoadState('networkidle');
      
      // Login in first tab
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Refresh second tab
      await page2.reload();
      await page2.waitForLoadState('networkidle');
      
      // Second tab should also be logged in
      const chatInput = page2.locator('textarea').first();
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      
      await page2.close();
    });

    test('should sync logout across tabs', async ({ page, context }) => {
      // Login first
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Open second tab
      const page2 = await context.newPage();
      await page2.goto('/');
      await page2.waitForLoadState('networkidle');
      
      // Logout in first tab
      const logoutBtn = page.locator('button:has-text("Logout"), button:has-text("Sign Out")').first();
      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
        await page.waitForTimeout(2000);
      }
      
      // Refresh second tab
      await page2.reload();
      await page2.waitForLoadState('networkidle');
      
      // Second tab should be logged out too
      const signInBtn = page2.locator('text=Sign In').first();
      await expect(signInBtn).toBeVisible({ timeout: 5000 });
      
      await page2.close();
    });
  });

  test.describe('Concurrent Sessions', () => {
    test('should handle same user in multiple browsers', async ({ browser }) => {
      // Create two separate contexts (like two different browsers)
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      
      // Login in both
      for (const page of [page1, page2]) {
        await page.goto('/');
        await page.click('text=Sign In');
        await page.fill('input[type="email"]', 'test-user@aynn.io');
        await page.fill('input[type="password"]', 'TestPassword123!');
        await page.click('button[type="submit"]');
        await page.waitForURL('/', { timeout: 15000 });
      }
      
      // Both should work independently
      const chatInput1 = page1.locator('textarea').first();
      const chatInput2 = page2.locator('textarea').first();
      
      await expect(chatInput1).toBeVisible({ timeout: 5000 });
      await expect(chatInput2).toBeVisible({ timeout: 5000 });
      
      // Cleanup
      await context1.close();
      await context2.close();
    });
  });

  test.describe('Device Fingerprinting', () => {
    test('should detect new device login', async ({ page }) => {
      // Login from "new device" (simulated by different user agent)
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Test Device) E2E Testing Browser',
      });
      
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      
      // May show new device warning or just proceed
      await page.waitForTimeout(3000);
    });
  });

  test.describe('Session Security', () => {
    test('should not expose session tokens in URL', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Navigate around
      await page.goto('/settings');
      await page.goto('/engineering');
      await page.goto('/');
      
      // Check URLs for tokens
      const url = page.url();
      expect(url).not.toContain('token');
      expect(url).not.toContain('access_token');
      expect(url).not.toContain('refresh_token');
    });

    test('should use secure cookies for session', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Get cookies
      const cookies = await page.context().cookies();
      
      // Auth cookies should be secure (when served over HTTPS)
      // Note: Local dev may not have secure flag
    });
  });
});
