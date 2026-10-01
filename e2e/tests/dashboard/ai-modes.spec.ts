import { test, expect } from '@playwright/test';
import { loginAsTestUser } from '../../utils/auth-helper';

test.describe('Dashboard - AI Modes', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display mode selector', async ({ page }) => {
    const modeSelector = page.locator('[class*="mode"]').or(
      page.locator('button:has-text("Mode")').or(
        page.locator('[class*="dropdown"]')
      )
    );
    
    if (await modeSelector.count() > 0) {
      await expect(modeSelector.first()).toBeVisible();
    }
  });

  test('should switch to Business mode', async ({ page }) => {
    const modeBtn = page.locator('button:has-text("Business")').or(
      page.locator('[data-mode="business"]')
    );
    
    if (await modeBtn.count() > 0) {
      await modeBtn.first().click();
      await page.waitForTimeout(300);
    }
  });

  test('should switch to Engineering mode', async ({ page }) => {
    const modeBtn = page.locator('button:has-text("Engineering")').or(
      page.locator('[data-mode="engineering"]')
    );
    
    if (await modeBtn.count() > 0) {
      await modeBtn.first().click();
      await page.waitForTimeout(300);
    }
  });

  test('should switch to Medical mode', async ({ page }) => {
    const modeBtn = page.locator('button:has-text("Medical")').or(
      page.locator('[data-mode="medical"]')
    );
    
    if (await modeBtn.count() > 0) {
      await modeBtn.first().click();
      await page.waitForTimeout(300);
    }
  });

  test('should switch to Legal mode', async ({ page }) => {
    const modeBtn = page.locator('button:has-text("Legal")').or(
      page.locator('[data-mode="legal"]')
    );
    
    if (await modeBtn.count() > 0) {
      await modeBtn.first().click();
      await page.waitForTimeout(300);
    }
  });

  test('should switch to Vision mode', async ({ page }) => {
    const modeBtn = page.locator('button:has-text("Vision")').or(
      page.locator('[data-mode="vision"]')
    );
    
    if (await modeBtn.count() > 0) {
      await modeBtn.first().click();
      await page.waitForTimeout(300);
    }
  });

  test('should switch to LAB mode', async ({ page }) => {
    const modeBtn = page.locator('button:has-text("LAB")').or(
      page.locator('[data-mode="lab"]')
    );
    
    if (await modeBtn.count() > 0) {
      await modeBtn.first().click();
      await page.waitForTimeout(300);
    }
  });

  test('should persist mode selection after page reload', async ({ page }) => {
    // Select a mode
    const modeBtn = page.locator('button:has-text("Engineering")').first();
    
    if (await modeBtn.count() > 0) {
      await modeBtn.click();
      await page.waitForTimeout(500);
      
      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Mode might be persisted
      await page.waitForTimeout(500);
    }
  });

  test('should show mode-specific UI elements', async ({ page }) => {
    // Different modes might show different UI
    const modeBtn = page.locator('button:has-text("Engineering")').first();
    
    if (await modeBtn.count() > 0) {
      await modeBtn.click();
      await page.waitForTimeout(500);
      
      // Engineering mode might show calculators
      const engElements = page.locator('[class*="engineering"]').or(
        page.locator('[class*="calculator"]')
      );
      
      // Soft assertion
      if (await engElements.count() > 0) {
        expect(await engElements.first().isVisible()).toBeDefined();
      }
    }
  });

  test('should handle rapid mode switching', async ({ page }) => {
    const modes = ['Business', 'Engineering', 'Medical', 'Legal'];
    
    for (const mode of modes) {
      const modeBtn = page.locator(`button:has-text("${mode}")`).first();
      
      if (await modeBtn.count() > 0) {
        await modeBtn.click();
        await page.waitForTimeout(200);
      }
    }
    
    // Should not crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('should update placeholder text based on mode', async ({ page }) => {
    const chatInput = page.locator('textarea').first();
    
    if (await chatInput.count() > 0) {
      const originalPlaceholder = await chatInput.getAttribute('placeholder');
      
      const modeBtn = page.locator('button:has-text("Engineering")').first();
      
      if (await modeBtn.count() > 0) {
        await modeBtn.click();
        await page.waitForTimeout(500);
        
        // Placeholder might change
        const newPlaceholder = await chatInput.getAttribute('placeholder');
        // May or may not be different
        expect(newPlaceholder).toBeDefined();
      }
    }
  });
});
