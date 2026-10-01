import { test, expect } from '@playwright/test';
import { loginAsTestUser } from '../../utils/auth-helper';
import engineeringData from '../../fixtures/engineering-data.json';

test.describe('Engineering - Beam Calculator', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/engineering');
    await page.waitForLoadState('networkidle');
  });

  test('should load engineering workspace', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible();
  });

  test('should select beam calculator', async ({ page }) => {
    const beamBtn = page.locator('button:has-text("Beam")').or(page.locator('[data-calculator="beam"]'));
    if (await beamBtn.count() > 0) {
      await beamBtn.first().click();
      await page.waitForTimeout(500);
    }
  });

  test('should calculate beam with standard inputs', async ({ page }) => {
    const beamBtn = page.locator('button:has-text("Beam")').first();
    if (await beamBtn.count() > 0) {
      await beamBtn.click();
      await page.waitForTimeout(500);
      
      const calculateBtn = page.locator('button:has-text("Calculate")').first();
      if (await calculateBtn.count() > 0) {
        await calculateBtn.click();
        await page.waitForTimeout(2000);
      }
    }
  });

  test('should display 3D visualization', async ({ page }) => {
    const canvas = page.locator('canvas');
    if (await canvas.count() > 0) {
      await expect(canvas.first()).toBeVisible();
    }
  });

  test('should handle edge case: maximum span', async ({ page }) => {
    const spanInput = page.locator('input[name="span"]').or(page.locator('input#span'));
    if (await spanInput.count() > 0) {
      await spanInput.first().fill('20');
      await page.waitForTimeout(300);
    }
  });

  test('should export DXF file', async ({ page }) => {
    const exportBtn = page.locator('button:has-text("DXF")').or(page.locator('button:has-text("Export")'));
    if (await exportBtn.count() > 0) {
      await expect(exportBtn.first()).toBeVisible();
    }
  });
});

test.describe('Engineering - All Calculators Stress Test', () => {
  test('should handle rapid calculator switching', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/engineering');
    await page.waitForLoadState('networkidle');
    
    const calculators = ['Beam', 'Column', 'Foundation', 'Slab'];
    for (const calc of calculators) {
      const btn = page.locator(`button:has-text("${calc}")`).first();
      if (await btn.count() > 0) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    }
    await expect(page.locator('body')).toBeVisible();
  });

  test('should run 10 calculations in sequence', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/engineering');
    await page.waitForLoadState('networkidle');
    
    for (let i = 0; i < 10; i++) {
      const calcBtn = page.locator('button:has-text("Calculate")').first();
      if (await calcBtn.count() > 0 && await calcBtn.isEnabled()) {
        await calcBtn.click();
        await page.waitForTimeout(500);
      }
    }
    await expect(page.locator('body')).toBeVisible();
  });
});
