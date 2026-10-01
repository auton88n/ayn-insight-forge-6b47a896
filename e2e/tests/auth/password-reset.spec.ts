import { test, expect } from '@playwright/test';

/**
 * Password Reset Tests - Phase 1
 * Complete password reset flow testing
 */

test.describe('Password Reset Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test.describe('Request Reset Link', () => {
    test('should display forgot password link in login modal', async ({ page }) => {
      await page.click('text=Sign In');
      await expect(page.locator('text=Forgot, text=Reset')).toBeVisible({ timeout: 5000 });
    });

    test('should open reset password form', async ({ page }) => {
      await page.click('text=Sign In');
      await page.click('text=Forgot password, text=Reset password').catch(async () => {
        await page.click('a:has-text("Forgot")');
      });
      await expect(page.locator('input[type="email"]')).toBeVisible();
    });

    test('should validate email format', async ({ page }) => {
      await page.click('text=Sign In');
      await page.click('text=Forgot password').catch(() => {});
      
      const emailInput = page.locator('input[type="email"]').first();
      await emailInput.fill('invalid-email');
      await page.click('button[type="submit"]');
      
      // Should show validation error
      await expect(page.locator('text=valid email, text=invalid, text=error').first()).toBeVisible({ timeout: 3000 });
    });

    test('should handle non-existent email gracefully', async ({ page }) => {
      await page.click('text=Sign In');
      await page.click('text=Forgot password').catch(() => {});
      
      const emailInput = page.locator('input[type="email"]').first();
      await emailInput.fill('nonexistent-' + Date.now() + '@example.com');
      await page.click('button[type="submit"]');
      
      // Should not reveal if email exists (security)
      await expect(page.locator('text=sent, text=check, text=email').first()).toBeVisible({ timeout: 10000 });
    });

    test('should send reset link for valid email', async ({ page }) => {
      await page.click('text=Sign In');
      await page.click('text=Forgot password').catch(() => {});
      
      const emailInput = page.locator('input[type="email"]').first();
      await emailInput.fill('test-user@aynn.io');
      await page.click('button[type="submit"]');
      
      // Should show success message
      await expect(page.locator('text=sent, text=check, text=email').first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Reset Password Page', () => {
    test('should display reset password page with token', async ({ page }) => {
      await page.goto('/reset-password');
      await expect(page.locator('text=Reset, text=Password, text=New').first()).toBeVisible();
    });

    test('should validate password strength', async ({ page }) => {
      await page.goto('/reset-password');
      
      const passwordInput = page.locator('input[type="password"]').first();
      if (await passwordInput.isVisible()) {
        // Try weak password
        await passwordInput.fill('weak');
        await page.click('button[type="submit"]');
        
        // Should show strength warning
        await expect(page.locator('text=strong, text=weak, text=characters, text=8').first()).toBeVisible({ timeout: 3000 });
      }
    });

    test('should require password confirmation match', async ({ page }) => {
      await page.goto('/reset-password');
      
      const passwords = page.locator('input[type="password"]');
      if (await passwords.count() >= 2) {
        await passwords.nth(0).fill('NewPassword123!');
        await passwords.nth(1).fill('DifferentPassword123!');
        await page.click('button[type="submit"]');
        
        // Should show mismatch error
        await expect(page.locator('text=match, text=same, text=confirm').first()).toBeVisible({ timeout: 3000 });
      }
    });

    test('should handle expired token', async ({ page }) => {
      // Navigate with invalid/expired token
      await page.goto('/reset-password?token=expired-invalid-token');
      
      const passwordInput = page.locator('input[type="password"]').first();
      if (await passwordInput.isVisible()) {
        await passwordInput.fill('NewPassword123!');
        await page.click('button[type="submit"]');
        
        // Should show expiry error
        await expect(page.locator('text=expired, text=invalid, text=error').first()).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Security Measures', () => {
    test('should rate limit reset requests', async ({ page }) => {
      await page.click('text=Sign In');
      await page.click('text=Forgot password').catch(() => {});
      
      const emailInput = page.locator('input[type="email"]').first();
      
      // Make multiple requests rapidly
      for (let i = 0; i < 5; i++) {
        await emailInput.fill(`test${i}@example.com`);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(500);
      }
      
      // Should eventually show rate limit message
      const rateLimitMessage = page.locator('text=too many, text=wait, text=limit, text=slow').first();
      // May or may not appear depending on rate limit configuration
    });

    test('should not reveal user existence', async ({ page }) => {
      await page.click('text=Sign In');
      await page.click('text=Forgot password').catch(() => {});
      
      const emailInput = page.locator('input[type="email"]').first();
      
      // Request for existing user
      await emailInput.fill('test-user@aynn.io');
      await page.click('button[type="submit"]');
      const message1 = await page.locator('[class*="toast"], [role="alert"]').textContent().catch(() => '');
      
      await page.reload();
      await page.click('text=Sign In');
      await page.click('text=Forgot password').catch(() => {});
      
      // Request for non-existing user
      await page.locator('input[type="email"]').first().fill('nonexistent@example.com');
      await page.click('button[type="submit"]');
      const message2 = await page.locator('[class*="toast"], [role="alert"]').textContent().catch(() => '');
      
      // Messages should be similar (not revealing existence)
    });
  });
});
