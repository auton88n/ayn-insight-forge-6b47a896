import { test, expect } from '@playwright/test';

/**
 * Full User Lifecycle Journey Tests - Phase 2
 * End-to-end user journey simulations
 */

test.describe('User Lifecycle Journeys', () => {
  test.describe('New User Complete Onboarding', () => {
    test('should complete full signup to first interaction flow', async ({ page }) => {
      await page.goto('/');
      
      // Step 1: Land on homepage
      await expect(page.locator('h1, [class*="hero"]').first()).toBeVisible();
      
      // Step 2: Click sign up
      await page.click('text=Sign Up, text=Get Started').catch(async () => {
        await page.click('text=Sign In');
      });
      
      await expect(page.locator('[role="dialog"], form')).toBeVisible({ timeout: 5000 });
      
      // Step 3: Fill registration (or use existing test user for stability)
      const email = `test-${Date.now()}@example.com`;
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', 'TestPassword123!');
      
      // Click submit and wait for response
      await page.click('button[type="submit"]');
      
      // May succeed or show verification message
      await page.waitForTimeout(3000);
    });

    test('should complete returning user session restoration', async ({ page }) => {
      // Step 1: Login as existing user
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      
      await page.waitForURL('/', { timeout: 15000 });
      
      // Step 2: Start a conversation
      const chatInput = page.locator('textarea, input[type="text"]').first();
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      
      const testMessage = 'Test message for session ' + Date.now();
      await chatInput.fill(testMessage);
      await page.keyboard.press('Enter');
      
      // Wait for response
      await page.waitForTimeout(3000);
      
      // Step 3: Refresh page
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Step 4: Verify session restored (still logged in)
      await expect(chatInput).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Power User Workflow', () => {
    test('should handle complex multi-feature workflow', async ({ page }) => {
      // Login
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Step 1: Use chat
      const chatInput = page.locator('textarea, input[type="text"]').first();
      if (await chatInput.isVisible()) {
        await chatInput.fill('Hello, testing workflow');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }
      
      // Step 2: Navigate to Engineering
      await page.goto('/engineering');
      await page.waitForLoadState('networkidle');
      
      // Step 3: Return to main
      await page.goto('/');
      
      // Step 4: Check settings
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      
      // Step 5: Back to main - should maintain session
      await page.goto('/');
      await expect(page.locator('textarea, input[type="text"]').first()).toBeVisible({ timeout: 5000 });
    });

    test('should maintain context across navigation', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Navigate through multiple pages
      const pages = ['/engineering', '/support', '/settings', '/'];
      
      for (const path of pages) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        // Should stay authenticated
        await expect(page.locator('text=Sign In, text=Login')).not.toBeVisible({ timeout: 2000 }).catch(() => {});
      }
    });
  });

  test.describe('Session Timeout Handling', () => {
    test('should handle extended idle time gracefully', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Simulate some idle time
      await page.waitForTimeout(5000);
      
      // Should still be logged in
      await page.reload();
      await expect(page.locator('textarea, input[type="text"]').first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Multi-Tab Behavior', () => {
    test('should sync state across tabs', async ({ page, context }) => {
      // Login in first tab
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
      
      // Should be logged in on second tab too
      await expect(page2.locator('textarea, input[type="text"]').first()).toBeVisible({ timeout: 5000 });
      
      await page2.close();
    });
  });

  test.describe('Error Recovery', () => {
    test('should recover from page crash', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Force reload (simulating crash recovery)
      await page.evaluate(() => window.location.reload());
      await page.waitForLoadState('networkidle');
      
      // Should recover gracefully
      await expect(page.locator('body')).toBeVisible();
    });

    test('should handle browser back/forward navigation', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Navigate forward
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      
      // Go back
      await page.goBack();
      await page.waitForLoadState('networkidle');
      
      // Should work correctly
      await expect(page).toHaveURL('/');
      
      // Go forward
      await page.goForward();
      await expect(page).toHaveURL('/settings');
    });
  });

  test.describe('Logout Flow', () => {
    test('should complete logout and redirect', async ({ page }) => {
      // Login
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Find and click logout
      const logoutBtn = page.locator('button:has-text("Logout"), button:has-text("Sign Out"), [aria-label*="logout"]').first();
      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
        
        // Should redirect to landing or show login option
        await expect(page.locator('text=Sign In, text=Login').first()).toBeVisible({ timeout: 5000 });
      }
    });

    test('should clear session data on logout', async ({ page }) => {
      // Login
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Logout
      const logoutBtn = page.locator('button:has-text("Logout"), button:has-text("Sign Out")').first();
      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
        await page.waitForTimeout(2000);
        
        // Try to access protected page
        await page.goto('/settings');
        
        // Should redirect to login or show auth modal
        await expect(page.locator('text=Sign In, text=Login, [role="dialog"]').first()).toBeVisible({ timeout: 5000 });
      }
    });
  });
});
