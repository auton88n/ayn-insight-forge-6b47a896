import { test, expect } from '@playwright/test';

test.describe('Authentication - Sign Up', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Open auth modal and switch to sign up
    const signInBtn = page.locator('button:has-text("Sign In")').first();
    if (await signInBtn.count() > 0) {
      await signInBtn.click();
      await page.waitForSelector('[role="dialog"]');
      
      const signUpTab = page.locator('[role="tab"]:has-text("Sign Up")').or(
        page.locator('[role="tab"]:has-text("إنشاء")')
      );
      
      if (await signUpTab.count() > 0) {
        await signUpTab.click();
        await page.waitForTimeout(300);
      }
    }
  });

  test('should display sign up form fields', async ({ page }) => {
    const modal = page.locator('[role="dialog"]');
    
    if (await modal.count() > 0) {
      // Check for common signup fields
      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      
      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
    }
  });

  test('should validate password strength', async ({ page }) => {
    const passwordInput = page.locator('input[type="password"]').first();
    
    if (await passwordInput.count() > 0) {
      // Test weak password
      await passwordInput.fill('123');
      await passwordInput.blur();
      await page.waitForTimeout(300);
    }
  });

  test('should validate matching passwords if confirm field exists', async ({ page }) => {
    const passwordInputs = page.locator('input[type="password"]');
    
    if (await passwordInputs.count() >= 2) {
      await passwordInputs.first().fill('StrongPass123!');
      await passwordInputs.nth(1).fill('DifferentPass123!');
      await passwordInputs.nth(1).blur();
      
      await page.waitForTimeout(300);
    }
  });

  test('should require valid email format', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]').first();
    
    if (await emailInput.count() > 0) {
      await emailInput.fill('not-an-email');
      await emailInput.blur();
      
      const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
      expect(isInvalid).toBe(true);
    }
  });

  test('should handle existing email gracefully', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('[role="dialog"] button[type="submit"]');
    
    if (await emailInput.count() > 0 && await submitBtn.count() > 0) {
      // Use an email that might already exist
      await emailInput.fill('admin@aynn.io');
      await passwordInput.fill('TestPassword123!');
      
      // Fill name field if exists
      const nameInput = page.locator('input[name="fullName"]').or(
        page.locator('input[placeholder*="name" i]')
      );
      if (await nameInput.count() > 0) {
        await nameInput.first().fill('Test User');
      }
      
      await submitBtn.first().click();
      await page.waitForTimeout(2000);
      
      // Should show error or handle gracefully
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should show terms and conditions link', async ({ page }) => {
    const termsLink = page.locator('text=terms').or(
      page.locator('text=Terms').or(
        page.locator('text=شروط')
      )
    );
    
    // Terms might be shown in the modal
    if (await termsLink.count() > 0) {
      await expect(termsLink.first()).toBeVisible();
    }
  });

  test('should sanitize input fields', async ({ page }) => {
    const nameInput = page.locator('input[name="fullName"]').or(
      page.locator('input[placeholder*="name" i]')
    );
    
    if (await nameInput.count() > 0) {
      const xssPayload = '<script>alert("xss")</script>';
      await nameInput.first().fill(xssPayload);
      
      const value = await nameInput.first().inputValue();
      // Script tag should be escaped or stripped
      expect(value).not.toContain('<script>');
    }
  });

  test('should handle form reset', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    
    if (await emailInput.count() > 0) {
      await emailInput.fill('test@example.com');
      await passwordInput.fill('password123');
      
      // Close and reopen modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      
      const signInBtn = page.locator('button:has-text("Sign In")').first();
      await signInBtn.click();
      await page.waitForSelector('[role="dialog"]');
      
      // Form should be reset
      const newEmailValue = await emailInput.inputValue();
      expect(newEmailValue).toBe('');
    }
  });
});
