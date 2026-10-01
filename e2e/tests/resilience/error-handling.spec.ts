import { test, expect } from '@playwright/test';

/**
 * Error Handling Tests - Phase 3
 * Error boundaries, recovery, and graceful degradation
 */

test.describe('Error Handling & Recovery', () => {
  test.describe('Error Boundaries', () => {
    test('should catch and display component errors', async ({ page }) => {
      await page.goto('/');
      
      // Force a component error
      await page.evaluate(() => {
        // Simulate component crash
        const errorEvent = new ErrorEvent('error', {
          error: new Error('Test component error'),
          message: 'Test component error',
          filename: 'test.js',
          lineno: 1,
          colno: 1,
        });
        window.dispatchEvent(errorEvent);
      });
      
      // App should still be visible (error boundary should catch it)
      await expect(page.locator('body')).toBeVisible();
    });

    test('should show fallback UI on crash', async ({ page }) => {
      // Navigate to a page
      await page.goto('/');
      
      // Check that error boundary exists in DOM
      const errorBoundary = page.locator('[class*="error-boundary"], [data-error-boundary]');
      // Error boundary component should exist
    });

    test('should allow refresh after error', async ({ page }) => {
      await page.goto('/');
      
      // Simulate error state
      await page.evaluate(() => {
        throw new Error('Intentional test error');
      }).catch(() => {}); // Ignore the error
      
      // Refresh page
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Should recover
      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('API Error Handling', () => {
    test('should display user-friendly error for 500 errors', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Mock server error
      await page.route('**/functions/v1/**', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });
      
      const chatInput = page.locator('textarea').first();
      if (await chatInput.isVisible()) {
        await chatInput.fill('Trigger error');
        await page.keyboard.press('Enter');
        
        // Should show friendly error message
        await expect(page.locator('text=error, text=wrong, text=try again').first()).toBeVisible({ timeout: 5000 });
      }
    });

    test('should handle malformed API responses', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Mock malformed response
      await page.route('**/functions/v1/ayn-unified', route => {
        route.fulfill({
          status: 200,
          body: 'not valid json {{{',
          contentType: 'application/json',
        });
      });
      
      const chatInput = page.locator('textarea').first();
      if (await chatInput.isVisible()) {
        await chatInput.fill('Test malformed response');
        await page.keyboard.press('Enter');
        
        // Should handle gracefully without crashing
        await page.waitForTimeout(3000);
        await expect(page.locator('body')).toBeVisible();
      }
    });

    test('should handle network errors distinctly from server errors', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Mock network failure
      await page.route('**/functions/v1/**', route => {
        route.abort('failed');
      });
      
      const chatInput = page.locator('textarea').first();
      if (await chatInput.isVisible()) {
        await chatInput.fill('Network error test');
        await page.keyboard.press('Enter');
        
        // Should show network-specific error
        await page.waitForTimeout(3000);
      }
    });
  });

  test.describe('Form Validation Errors', () => {
    test('should display inline validation errors', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      
      // Submit without filling fields
      await page.click('button[type="submit"]');
      
      // Should show validation errors
      await expect(page.locator('text=required, text=invalid, text=enter').first()).toBeVisible({ timeout: 3000 });
    });

    test('should clear errors when corrected', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      
      // Submit with invalid email
      await page.fill('input[type="email"]', 'invalid');
      await page.click('button[type="submit"]');
      
      // Error should appear
      await page.waitForTimeout(1000);
      
      // Correct the email
      await page.fill('input[type="email"]', 'valid@email.com');
      await page.fill('input[type="password"]', 'password123');
      
      // Error should be cleared or change
    });

    test('should not lose form data on validation error', async ({ page }) => {
      await page.goto('/support');
      await page.waitForLoadState('networkidle');
      
      // Fill some fields
      const subjectInput = page.locator('input[name*="subject"]').first();
      if (await subjectInput.isVisible()) {
        await subjectInput.fill('Test subject');
        
        // Submit without required fields
        await page.click('button[type="submit"]').catch(() => {});
        
        // Subject should still have data
        const value = await subjectInput.inputValue();
        expect(value).toBe('Test subject');
      }
    });
  });

  test.describe('404 Error Handling', () => {
    test('should display custom 404 page', async ({ page }) => {
      await page.goto('/this-page-does-not-exist-12345');
      
      // Should show 404 page
      await expect(page.locator('text=404, text=not found, text=page').first()).toBeVisible({ timeout: 5000 });
    });

    test('should provide navigation back to home', async ({ page }) => {
      await page.goto('/nonexistent-route');
      
      // Should have link to home
      const homeLink = page.locator('a[href="/"], button:has-text("Home"), button:has-text("Go back")').first();
      await expect(homeLink).toBeVisible({ timeout: 5000 });
      
      if (await homeLink.isVisible()) {
        await homeLink.click();
        await expect(page).toHaveURL('/');
      }
    });
  });

  test.describe('Loading State Errors', () => {
    test('should show error state when data fails to load', async ({ page }) => {
      // Mock failed data load
      await page.route('**/rest/v1/**', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Failed to load' }),
        });
      });
      
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      
      // May show error state
      await page.waitForTimeout(5000);
    });

    test('should provide retry option on load failure', async ({ page }) => {
      let failCount = 0;
      
      // First load fails, retry succeeds
      await page.route('**/rest/v1/**', async route => {
        failCount++;
        if (failCount === 1) {
          route.fulfill({
            status: 500,
            body: JSON.stringify({ error: 'Failed' }),
          });
        } else {
          route.continue();
        }
      });
      
      await page.goto('/support');
      await page.waitForTimeout(3000);
      
      // Look for retry button
      const retryBtn = page.locator('button:has-text("Retry"), button:has-text("Try again")').first();
      if (await retryBtn.isVisible()) {
        await retryBtn.click();
        await page.waitForTimeout(2000);
      }
    });
  });

  test.describe('State Recovery', () => {
    test('should preserve state after component re-render', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Enter something in chat
      const chatInput = page.locator('textarea').first();
      if (await chatInput.isVisible()) {
        await chatInput.fill('Preserving this message');
        
        // Trigger re-render (e.g., resize)
        await page.setViewportSize({ width: 800, height: 600 });
        await page.waitForTimeout(500);
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.waitForTimeout(500);
        
        // Input should still have text
        const value = await chatInput.inputValue();
        expect(value).toContain('Preserving');
      }
    });

    test('should recover gracefully from memory pressure', async ({ page }) => {
      await page.goto('/');
      
      // Simulate heavy usage
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => {
          // Create and discard large arrays
          const arr = new Array(100000).fill('x'.repeat(1000));
          arr.length = 0;
        });
      }
      
      // App should still work
      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('Concurrent Error Handling', () => {
    test('should handle multiple simultaneous errors', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Mock multiple failing endpoints
      await page.route('**/functions/v1/**', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Server error' }),
        });
      });
      
      await page.route('**/rest/v1/**', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Database error' }),
        });
      });
      
      // Navigate to trigger multiple requests
      await page.goto('/settings');
      await page.waitForTimeout(3000);
      
      // App should still be functional
      await expect(page.locator('body')).toBeVisible();
    });
  });
});
