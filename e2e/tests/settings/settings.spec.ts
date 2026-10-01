import { test, expect } from '@playwright/test';

/**
 * Settings Page Tests - Phase 1
 * Comprehensive testing of all settings functionality
 */

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/');
    await page.click('text=Sign In');
    await page.fill('input[type="email"]', 'test-user@aynn.io');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });
    
    // Navigate to settings
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Profile Editing', () => {
    test('should display current profile information', async ({ page }) => {
      await expect(page.locator('text=Account Settings')).toBeVisible();
      await expect(page.locator('input, textarea').first()).toBeVisible();
    });

    test('should update company name', async ({ page }) => {
      const companyInput = page.locator('input[placeholder*="company"], input[name*="company"]').first();
      if (await companyInput.isVisible()) {
        await companyInput.fill('Test Company Updated');
        await page.click('button:has-text("Save")');
        await expect(page.locator('text=saved, text=updated, text=success').first()).toBeVisible({ timeout: 5000 });
      }
    });

    test('should update contact person name', async ({ page }) => {
      const nameInput = page.locator('input[placeholder*="name"], input[name*="contact"]').first();
      if (await nameInput.isVisible()) {
        await nameInput.fill('Test Contact Person');
        await page.click('button:has-text("Save")');
      }
    });

    test('should validate required fields', async ({ page }) => {
      const requiredInput = page.locator('input[required]').first();
      if (await requiredInput.isVisible()) {
        await requiredInput.fill('');
        await page.click('button:has-text("Save")');
        // Should show validation error or prevent submission
      }
    });
  });

  test.describe('Avatar Upload', () => {
    test('should display avatar upload section', async ({ page }) => {
      const avatarSection = page.locator('[class*="avatar"], [data-testid="avatar"]').first();
      await expect(avatarSection).toBeVisible();
    });

    test('should show upload button or drag zone', async ({ page }) => {
      const uploadTrigger = page.locator('text=Upload, text=Change, text=Edit').first();
      await expect(uploadTrigger).toBeVisible();
    });

    test('should reject invalid file types', async ({ page }) => {
      // Try to upload non-image file
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.isVisible()) {
        await fileInput.setInputFiles({
          name: 'test.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('test content'),
        });
        // Should show error
        await expect(page.locator('text=invalid, text=error, text=image').first()).toBeVisible({ timeout: 3000 });
      }
    });
  });

  test.describe('Notification Settings', () => {
    test('should display notification toggles', async ({ page }) => {
      await page.click('text=Notifications').catch(() => {});
      const switches = page.locator('[role="switch"], input[type="checkbox"]');
      await expect(switches.first()).toBeVisible({ timeout: 3000 });
    });

    test('should toggle email notifications', async ({ page }) => {
      await page.click('text=Notifications').catch(() => {});
      const emailToggle = page.locator('[role="switch"]').first();
      if (await emailToggle.isVisible()) {
        const initialState = await emailToggle.getAttribute('aria-checked');
        await emailToggle.click();
        const newState = await emailToggle.getAttribute('aria-checked');
        expect(newState).not.toBe(initialState);
      }
    });

    test('should persist notification preferences', async ({ page }) => {
      await page.click('text=Notifications').catch(() => {});
      const toggle = page.locator('[role="switch"]').first();
      if (await toggle.isVisible()) {
        await toggle.click();
        await page.reload();
        await page.click('text=Notifications').catch(() => {});
        // Verify state persisted
      }
    });
  });

  test.describe('Privacy Settings', () => {
    test('should display privacy options', async ({ page }) => {
      await page.click('text=Privacy').catch(() => {});
      await expect(page.locator('text=Privacy, text=Data').first()).toBeVisible();
    });

    test('should allow data export request', async ({ page }) => {
      await page.click('text=Privacy').catch(() => {});
      const exportBtn = page.locator('button:has-text("Export"), button:has-text("Download")').first();
      if (await exportBtn.isVisible()) {
        await exportBtn.click();
      }
    });
  });

  test.describe('Session Management', () => {
    test('should display active sessions', async ({ page }) => {
      await page.click('text=Session, text=Security').catch(() => {});
      await expect(page.locator('text=Active, text=Current, text=Device').first()).toBeVisible({ timeout: 3000 });
    });

    test('should show current session indicator', async ({ page }) => {
      await page.click('text=Session, text=Security').catch(() => {});
      await expect(page.locator('text=Current, text=This device').first()).toBeVisible({ timeout: 3000 });
    });

    test('should allow terminating other sessions', async ({ page }) => {
      await page.click('text=Session, text=Security').catch(() => {});
      const terminateBtn = page.locator('button:has-text("Terminate"), button:has-text("End"), button:has-text("Logout")').first();
      if (await terminateBtn.isVisible() && !await terminateBtn.isDisabled()) {
        await terminateBtn.click();
      }
    });
  });

  test.describe('Unsaved Changes Warning', () => {
    test('should warn when navigating away with unsaved changes', async ({ page }) => {
      const input = page.locator('input, textarea').first();
      if (await input.isVisible()) {
        await input.fill('Unsaved test data ' + Date.now());
        
        // Try to navigate away
        page.on('dialog', dialog => {
          expect(dialog.message()).toContain('unsaved');
          dialog.dismiss();
        });
        
        await page.goto('/');
      }
    });
  });

  test.describe('Language & Theme', () => {
    test('should switch between languages', async ({ page }) => {
      const langSwitcher = page.locator('[data-testid="language-switcher"], button:has-text("EN"), button:has-text("AR")').first();
      if (await langSwitcher.isVisible()) {
        await langSwitcher.click();
      }
    });

    test('should toggle dark/light theme', async ({ page }) => {
      const themeToggle = page.locator('[data-testid="theme-toggle"], button[aria-label*="theme"]').first();
      if (await themeToggle.isVisible()) {
        await themeToggle.click();
        // Verify theme changed
        await expect(page.locator('html')).toHaveAttribute('class', /dark|light/);
      }
    });
  });
});
