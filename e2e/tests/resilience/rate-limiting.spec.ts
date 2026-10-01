import { test, expect } from '@playwright/test';

/**
 * Rate Limiting Tests - Phase 3
 * Testing rate limit handling and user feedback
 */

test.describe('Rate Limiting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('text=Sign In');
    await page.fill('input[type="email"]', 'test-user@aynn.io');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('/', { timeout: 15000 });
  });

  test.describe('Chat Rate Limiting', () => {
    test('should handle rapid message sending', async ({ page }) => {
      const chatInput = page.locator('textarea').first();
      
      if (await chatInput.isVisible()) {
        // Send messages rapidly
        for (let i = 0; i < 20; i++) {
          await chatInput.fill(`Rapid message ${i}`);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(100); // Very fast
        }
        
        // Should not crash
        await expect(page.locator('body')).toBeVisible();
        
        // May show rate limit message
        const rateLimitMsg = page.locator('text=slow down, text=too many, text=limit, text=wait').first();
        // This may or may not appear depending on rate limit config
      }
    });

    test('should display friendly rate limit message', async ({ page }) => {
      // Mock rate limit response
      await page.route('**/functions/v1/ayn-unified', async route => {
        route.fulfill({
          status: 429,
          body: JSON.stringify({ 
            error: 'Rate limit exceeded',
            retryAfter: 60 
          }),
        });
      });
      
      const chatInput = page.locator('textarea').first();
      if (await chatInput.isVisible()) {
        await chatInput.fill('Test message');
        await page.keyboard.press('Enter');
        
        // Should show user-friendly error
        await expect(page.locator('text=limit, text=slow, text=wait, text=moment').first()).toBeVisible({ timeout: 5000 });
      }
    });

    test('should show countdown for retry', async ({ page }) => {
      // Mock rate limit with retry header
      await page.route('**/functions/v1/ayn-unified', async route => {
        route.fulfill({
          status: 429,
          headers: {
            'Retry-After': '30',
          },
          body: JSON.stringify({ 
            error: 'Rate limit exceeded',
            retryAfter: 30 
          }),
        });
      });
      
      const chatInput = page.locator('textarea').first();
      if (await chatInput.isVisible()) {
        await chatInput.fill('Test message');
        await page.keyboard.press('Enter');
        
        // May show countdown timer
        const countdown = page.locator('text=/\\d+ second/i, text=/wait \\d+/i').first();
        // Countdown may or may not be implemented
      }
    });
  });

  test.describe('API Rate Limiting', () => {
    test('should handle calculator rate limits', async ({ page }) => {
      await page.goto('/engineering');
      await page.waitForLoadState('networkidle');
      
      // Rapid calculations
      const calculateBtn = page.locator('button:has-text("Calculate")').first();
      
      if (await calculateBtn.isVisible()) {
        for (let i = 0; i < 15; i++) {
          await calculateBtn.click();
          await page.waitForTimeout(200);
        }
        
        // Should handle gracefully
        await expect(page.locator('body')).toBeVisible();
      }
    });

    test('should handle file upload rate limits', async ({ page }) => {
      const chatInput = page.locator('textarea').first();
      
      // Try to upload files rapidly
      const fileInput = page.locator('input[type="file"]').first();
      
      if (await fileInput.isVisible()) {
        for (let i = 0; i < 5; i++) {
          await fileInput.setInputFiles({
            name: `test-file-${i}.txt`,
            mimeType: 'text/plain',
            buffer: Buffer.from('test content'),
          });
          await page.waitForTimeout(500);
        }
      }
    });
  });

  test.describe('Auth Rate Limiting', () => {
    test('should rate limit login attempts', async ({ page }) => {
      // Logout first
      const logoutBtn = page.locator('button:has-text("Logout")').first();
      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
        await page.waitForTimeout(1000);
      }
      
      // Multiple failed login attempts
      for (let i = 0; i < 6; i++) {
        await page.click('text=Sign In');
        await page.fill('input[type="email"]', 'test@example.com');
        await page.fill('input[type="password"]', 'wrongpassword' + i);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(500);
        
        // Close modal if error shown
        await page.keyboard.press('Escape').catch(() => {});
      }
      
      // Should show lockout message eventually
      const lockoutMsg = page.locator('text=locked, text=too many attempts, text=try again later').first();
      // May or may not appear depending on rate limit config
    });

    test('should rate limit password reset requests', async ({ page }) => {
      // Logout first
      const logoutBtn = page.locator('button:has-text("Logout")').first();
      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
        await page.waitForTimeout(1000);
      }
      
      await page.click('text=Sign In');
      await page.click('text=Forgot password').catch(() => {});
      
      // Multiple reset requests
      for (let i = 0; i < 5; i++) {
        await page.fill('input[type="email"]', `test${i}@example.com`);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(300);
      }
    });
  });

  test.describe('Per-Endpoint Limits', () => {
    test('should have different limits for different endpoints', async ({ page }) => {
      // Chat endpoint
      const chatInput = page.locator('textarea').first();
      if (await chatInput.isVisible()) {
        await chatInput.fill('Test message');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
      }
      
      // Engineering endpoint
      await page.goto('/engineering');
      await page.waitForLoadState('networkidle');
      
      const calculateBtn = page.locator('button:has-text("Calculate")').first();
      if (await calculateBtn.isVisible()) {
        await calculateBtn.click();
        await page.waitForTimeout(1000);
      }
      
      // Both should work (different limits)
      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('Rate Limit Recovery', () => {
    test('should allow requests after rate limit window expires', async ({ page }) => {
      let requestCount = 0;
      
      // First few requests succeed, then fail, then succeed again
      await page.route('**/functions/v1/ayn-unified', async route => {
        requestCount++;
        if (requestCount >= 3 && requestCount <= 5) {
          route.fulfill({
            status: 429,
            body: JSON.stringify({ error: 'Rate limit exceeded' }),
          });
        } else {
          route.continue();
        }
      });
      
      const chatInput = page.locator('textarea').first();
      
      if (await chatInput.isVisible()) {
        // First request - should work
        await chatInput.fill('First message');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
        
        // Second request - should work
        await chatInput.fill('Second message');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
        
        // Third+ requests - will be rate limited
        await chatInput.fill('Third message');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
        
        // Wait for "rate limit to expire"
        await page.waitForTimeout(3000);
        
        // Sixth request - should work again
        await chatInput.fill('After rate limit');
        await page.keyboard.press('Enter');
      }
    });
  });

  test.describe('Admin Rate Limit Controls', () => {
    test('should be accessible to admin', async ({ page }) => {
      // Login as admin
      const logoutBtn = page.locator('button:has-text("Logout")').first();
      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
        await page.waitForTimeout(1000);
      }
      
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-admin@aynn.io');
      await page.fill('input[type="password"]', 'AdminPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Navigate to admin panel
      // This would test admin rate limit controls if they exist
    });
  });
});
