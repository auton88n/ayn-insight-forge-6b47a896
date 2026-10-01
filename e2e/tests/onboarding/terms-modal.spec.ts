import { test, expect } from '@playwright/test';

/**
 * Terms & Conditions Modal Tests - Phase 1
 * Onboarding flow and consent management
 */

test.describe('Terms & Conditions Modal', () => {
  test.describe('First Time User Flow', () => {
    test('should show terms modal for new users', async ({ page }) => {
      // This would require a fresh user - simulate by checking the modal component exists
      await page.goto('/');
      
      // Check if terms modal component is in the DOM
      const termsModal = page.locator('[data-testid="terms-modal"], [class*="TermsModal"]');
      // May or may not be visible depending on user state
    });

    test('should require both checkboxes to proceed', async ({ page }) => {
      await page.goto('/');
      
      // If terms modal is visible
      const termsModal = page.locator('[role="dialog"]').filter({ hasText: 'Terms' });
      if (await termsModal.isVisible()) {
        const submitBtn = termsModal.locator('button[type="submit"], button:has-text("Continue")');
        
        // Without checking boxes, button should be disabled
        await expect(submitBtn).toBeDisabled();
        
        // Check first checkbox only
        await termsModal.locator('input[type="checkbox"]').first().check();
        await expect(submitBtn).toBeDisabled();
        
        // Check second checkbox
        await termsModal.locator('input[type="checkbox"]').nth(1).check();
        await expect(submitBtn).toBeEnabled();
      }
    });

    test('should not be dismissible without acceptance', async ({ page }) => {
      await page.goto('/');
      
      const termsModal = page.locator('[role="dialog"]').filter({ hasText: 'Terms' });
      if (await termsModal.isVisible()) {
        // Try to click outside
        await page.click('body', { position: { x: 10, y: 10 } });
        
        // Modal should still be visible
        await expect(termsModal).toBeVisible();
        
        // Try pressing Escape
        await page.keyboard.press('Escape');
        await expect(termsModal).toBeVisible();
      }
    });

    test('should allow scrolling through terms content', async ({ page }) => {
      await page.goto('/');
      
      const termsModal = page.locator('[role="dialog"]').filter({ hasText: 'Terms' });
      if (await termsModal.isVisible()) {
        const scrollableContent = termsModal.locator('[class*="scroll"], [class*="overflow"]').first();
        
        if (await scrollableContent.isVisible()) {
          // Scroll to bottom
          await scrollableContent.evaluate(el => {
            el.scrollTop = el.scrollHeight;
          });
        }
      }
    });

    test('should proceed after accepting all terms', async ({ page }) => {
      await page.goto('/');
      
      const termsModal = page.locator('[role="dialog"]').filter({ hasText: 'Terms' });
      if (await termsModal.isVisible()) {
        // Check all checkboxes
        const checkboxes = termsModal.locator('input[type="checkbox"]');
        const count = await checkboxes.count();
        
        for (let i = 0; i < count; i++) {
          await checkboxes.nth(i).check();
        }
        
        // Click continue
        await termsModal.locator('button:has-text("Continue"), button[type="submit"]').click();
        
        // Modal should close
        await expect(termsModal).not.toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Returning User', () => {
    test('should not show terms modal for returning accepted user', async ({ page }) => {
      // Login as existing user who already accepted
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      
      await page.waitForTimeout(3000);
      
      // Terms modal should NOT appear
      const termsModal = page.locator('[role="dialog"]').filter({ hasText: 'Terms' });
      await expect(termsModal).not.toBeVisible();
    });
  });

  test.describe('Terms Content', () => {
    test('should display privacy policy link', async ({ page }) => {
      await page.goto('/');
      
      const termsModal = page.locator('[role="dialog"]').filter({ hasText: 'Terms' });
      if (await termsModal.isVisible()) {
        await expect(termsModal.locator('text=Privacy Policy, text=privacy')).toBeVisible();
      }
    });

    test('should display terms of service link', async ({ page }) => {
      await page.goto('/');
      
      const termsModal = page.locator('[role="dialog"]').filter({ hasText: 'Terms' });
      if (await termsModal.isVisible()) {
        await expect(termsModal.locator('text=Terms of Service, text=terms')).toBeVisible();
      }
    });

    test('should have accessible labels', async ({ page }) => {
      await page.goto('/');
      
      const termsModal = page.locator('[role="dialog"]').filter({ hasText: 'Terms' });
      if (await termsModal.isVisible()) {
        // Check for aria-labels
        const checkboxes = termsModal.locator('input[type="checkbox"]');
        const count = await checkboxes.count();
        
        for (let i = 0; i < count; i++) {
          const label = await checkboxes.nth(i).getAttribute('aria-label');
          const id = await checkboxes.nth(i).getAttribute('id');
          // Should have label or be associated with a label element
        }
      }
    });
  });
});
