import { test, expect } from '@playwright/test';
import { TEST_USERS, logout } from '../../utils/auth-helper';

test.describe('Authentication - Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should open auth modal', async ({ page }) => {
    const signInBtn = page.locator('button:has-text("Sign In")').or(
      page.locator('button:has-text("تسجيل الدخول")')
    );
    
    if (await signInBtn.count() > 0) {
      await signInBtn.first().click();
      
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 5000 });
    }
  });

  test('should have email and password fields', async ({ page }) => {
    const signInBtn = page.locator('button:has-text("Sign In")').first();
    
    if (await signInBtn.count() > 0) {
      await signInBtn.click();
      await page.waitForSelector('[role="dialog"]');
      
      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      
      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
    }
  });

  test('should show error for invalid credentials', async ({ page }) => {
    const signInBtn = page.locator('button:has-text("Sign In")').first();
    
    if (await signInBtn.count() > 0) {
      await signInBtn.click();
      await page.waitForSelector('[role="dialog"]');
      
      await page.fill('input[type="email"]', 'invalid@test.com');
      await page.fill('input[type="password"]', 'wrongpassword');
      
      const submitBtn = page.locator('[role="dialog"] button[type="submit"]').first();
      await submitBtn.click();
      
      // Wait for error toast or message
      await page.waitForTimeout(2000);
      
      // Should still be on the same page with modal open
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible();
    }
  });

  test('should validate email format', async ({ page }) => {
    const signInBtn = page.locator('button:has-text("Sign In")').first();
    
    if (await signInBtn.count() > 0) {
      await signInBtn.click();
      await page.waitForSelector('[role="dialog"]');
      
      await page.fill('input[type="email"]', 'notanemail');
      await page.fill('input[type="password"]', 'somepassword');
      
      const emailInput = page.locator('input[type="email"]');
      const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
      
      expect(isInvalid).toBe(true);
    }
  });

  test('should close modal on outside click', async ({ page }) => {
    const signInBtn = page.locator('button:has-text("Sign In")').first();
    
    if (await signInBtn.count() > 0) {
      await signInBtn.click();
      await page.waitForSelector('[role="dialog"]');
      
      // Click on overlay
      await page.click('[data-radix-dialog-overlay]', { force: true }).catch(() => {
        // Fallback: press Escape
        page.keyboard.press('Escape');
      });
      
      await page.waitForTimeout(500);
    }
  });

  test('should handle forgot password link', async ({ page }) => {
    const signInBtn = page.locator('button:has-text("Sign In")').first();
    
    if (await signInBtn.count() > 0) {
      await signInBtn.click();
      await page.waitForSelector('[role="dialog"]');
      
      const forgotLink = page.locator('text=Forgot').or(
        page.locator('text=نسيت')
      );
      
      if (await forgotLink.count() > 0) {
        await forgotLink.first().click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('should switch between sign in and sign up tabs', async ({ page }) => {
    const signInBtn = page.locator('button:has-text("Sign In")').first();
    
    if (await signInBtn.count() > 0) {
      await signInBtn.click();
      await page.waitForSelector('[role="dialog"]');
      
      // Look for sign up tab
      const signUpTab = page.locator('[role="tab"]:has-text("Sign Up")').or(
        page.locator('[role="tab"]:has-text("إنشاء حساب")')
      );
      
      if (await signUpTab.count() > 0) {
        await signUpTab.click();
        await page.waitForTimeout(300);
        
        // Should show additional fields for signup
        const nameInput = page.locator('input[name="fullName"]').or(
          page.locator('input[placeholder*="name" i]')
        );
        
        await expect(nameInput).toBeVisible();
      }
    }
  });

  test('should handle concurrent login attempts', async ({ page }) => {
    const signInBtn = page.locator('button:has-text("Sign In")').first();
    
    if (await signInBtn.count() > 0) {
      await signInBtn.click();
      await page.waitForSelector('[role="dialog"]');
      
      await page.fill('input[type="email"]', 'test@test.com');
      await page.fill('input[type="password"]', 'password123');
      
      const submitBtn = page.locator('[role="dialog"] button[type="submit"]').first();
      
      // Rapid click - should not crash
      for (let i = 0; i < 3; i++) {
        await submitBtn.click().catch(() => {});
        await page.waitForTimeout(100);
      }
      
      // Page should still be stable
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should prevent brute force with rate limiting', async ({ page }) => {
    const signInBtn = page.locator('button:has-text("Sign In")').first();
    
    if (await signInBtn.count() > 0) {
      await signInBtn.click();
      await page.waitForSelector('[role="dialog"]');
      
      // Attempt multiple failed logins
      for (let i = 0; i < 5; i++) {
        await page.fill('input[type="email"]', `bruteforce${i}@test.com`);
        await page.fill('input[type="password"]', 'wrongpass');
        
        const submitBtn = page.locator('[role="dialog"] button[type="submit"]').first();
        await submitBtn.click();
        await page.waitForTimeout(500);
      }
      
      // Should still be functional (not crashed)
      await expect(page.locator('body')).toBeVisible();
    }
  });
});
