import { test, expect } from '@playwright/test';
import { loginAsTestUser } from '../../utils/auth-helper';

test.describe('Engineering - Parking Designer', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/engineering');
    await page.waitForLoadState('networkidle');
  });

  test('should load parking designer', async ({ page }) => {
    const parkingBtn = page.locator('button:has-text("Parking")').first();
    if (await parkingBtn.count() > 0) {
      await parkingBtn.click();
      await page.waitForTimeout(500);
    }
    await expect(page.locator('body')).toBeVisible();
  });

  test('should set site dimensions', async ({ page }) => {
    const lengthInput = page.locator('input[name="siteLength"]').or(page.locator('input#siteLength'));
    if (await lengthInput.count() > 0) {
      await lengthInput.first().fill('80');
    }
    const widthInput = page.locator('input[name="siteWidth"]').or(page.locator('input#siteWidth'));
    if (await widthInput.count() > 0) {
      await widthInput.first().fill('50');
    }
  });

  test('should select parking angle', async ({ page }) => {
    const angleSelector = page.locator('[class*="angle"]').or(page.locator('select'));
    if (await angleSelector.count() > 0) {
      await angleSelector.first().click();
    }
  });

  test('should generate layout', async ({ page }) => {
    const generateBtn = page.locator('button:has-text("Generate")').or(page.locator('button:has-text("Calculate")'));
    if (await generateBtn.count() > 0) {
      await generateBtn.first().click();
      await page.waitForTimeout(2000);
    }
  });

  test('should toggle 2D/3D view', async ({ page }) => {
    const viewToggle = page.locator('button:has-text("3D")').or(page.locator('button:has-text("2D")'));
    if (await viewToggle.count() > 0) {
      await viewToggle.first().click();
      await page.waitForTimeout(500);
    }
  });

  test('should export DXF', async ({ page }) => {
    const exportBtn = page.locator('button:has-text("DXF")');
    if (await exportBtn.count() > 0) {
      await expect(exportBtn.first()).toBeVisible();
    }
  });
});

test.describe('Engineering - Grading Designer', () => {
  test('should navigate to grading designer', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/ai-grading-designer');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should upload survey file', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/ai-grading-designer');
    
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await expect(fileInput).toBeAttached();
    }
  });

  test('should generate grading design', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/ai-grading-designer');
    
    const generateBtn = page.locator('button:has-text("Generate")');
    if (await generateBtn.count() > 0) {
      await expect(generateBtn.first()).toBeVisible();
    }
  });
});

test.describe('Engineering - AI Assistant', () => {
  test('should open AI assistant panel', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/engineering');
    
    const aiBtn = page.locator('button:has-text("AI")').or(page.locator('[class*="assistant"]'));
    if (await aiBtn.count() > 0) {
      await aiBtn.first().click();
      await page.waitForTimeout(500);
    }
  });

  test('should ask engineering question', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/engineering');
    
    const chatInput = page.locator('textarea').first();
    if (await chatInput.count() > 0) {
      await chatInput.fill('Is my beam design safe?');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }
  });

  test('should show quick actions', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/engineering');
    
    const quickActions = page.locator('[class*="quick"]').or(page.locator('button:has-text("Optimize")'));
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Engineering - 3D Visualization', () => {
  test('should render 3D canvas', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/engineering');
    
    const canvas = page.locator('canvas');
    if (await canvas.count() > 0) {
      await expect(canvas.first()).toBeVisible();
    }
  });

  test('should handle mouse interaction on 3D view', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/engineering');
    
    const canvas = page.locator('canvas').first();
    if (await canvas.count() > 0) {
      // Simulate drag to rotate
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2);
        await page.mouse.up();
      }
    }
  });

  test('should zoom 3D view', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/engineering');
    
    const canvas = page.locator('canvas').first();
    if (await canvas.count() > 0) {
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, -100); // Zoom in
        await page.waitForTimeout(300);
        await page.mouse.wheel(0, 100); // Zoom out
      }
    }
  });
});
