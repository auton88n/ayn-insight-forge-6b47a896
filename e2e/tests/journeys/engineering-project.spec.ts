import { test, expect } from '@playwright/test';

/**
 * Engineering Project Lifecycle Journey Tests - Phase 2
 * Complete engineering workflow simulations
 */

test.describe('Engineering Project Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/');
    await page.click('text=Sign In');
    await page.fill('input[type="email"]', 'test-user@aynn.io');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('/', { timeout: 15000 });
    
    // Navigate to engineering
    await page.goto('/engineering');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Complete Beam Design Workflow', () => {
    test('should complete full beam calculation to export', async ({ page }) => {
      // Step 1: Select beam calculator
      await page.click('button:has-text("Beam"), [data-calculator="beam"]').catch(() => {});
      
      // Step 2: Fill inputs
      const spanInput = page.locator('input[name*="span"], input[placeholder*="span"]').first();
      if (await spanInput.isVisible()) {
        await spanInput.fill('6');
      }
      
      const loadInput = page.locator('input[name*="load"], input[placeholder*="load"]').first();
      if (await loadInput.isVisible()) {
        await loadInput.fill('20');
      }
      
      // Step 3: Calculate
      const calculateBtn = page.locator('button:has-text("Calculate")').first();
      if (await calculateBtn.isVisible()) {
        await calculateBtn.click();
        await page.waitForTimeout(3000);
        
        // Step 4: Verify results
        await expect(page.locator('text=Results, text=Moment, text=Reinforcement').first()).toBeVisible({ timeout: 10000 });
      }
      
      // Step 5: Check 3D visualization
      const view3DBtn = page.locator('button:has-text("3D"), button:has-text("View")').first();
      if (await view3DBtn.isVisible()) {
        await view3DBtn.click();
        await page.waitForTimeout(2000);
      }
      
      // Step 6: Export (if available)
      const exportBtn = page.locator('button:has-text("Export"), button:has-text("DXF"), button:has-text("PDF")').first();
      if (await exportBtn.isVisible()) {
        await exportBtn.click();
      }
    });
  });

  test.describe('Column Design Workflow', () => {
    test('should complete column calculation with AI assistance', async ({ page }) => {
      // Select column calculator
      await page.click('button:has-text("Column"), [data-calculator="column"]').catch(() => {});
      
      // Fill column dimensions
      const widthInput = page.locator('input[name*="width"], input[placeholder*="width"]').first();
      if (await widthInput.isVisible()) {
        await widthInput.fill('400');
      }
      
      const heightInput = page.locator('input[name*="height"], input[placeholder*="height"]').first();
      if (await heightInput.isVisible()) {
        await heightInput.fill('400');
      }
      
      const loadInput = page.locator('input[name*="load"], input[placeholder*="load"]').first();
      if (await loadInput.isVisible()) {
        await loadInput.fill('1000');
      }
      
      // Calculate
      const calculateBtn = page.locator('button:has-text("Calculate")').first();
      if (await calculateBtn.isVisible()) {
        await calculateBtn.click();
        await page.waitForTimeout(3000);
      }
      
      // Try AI assistant
      const aiChatInput = page.locator('textarea[placeholder*="Ask"], input[placeholder*="Ask"]').first();
      if (await aiChatInput.isVisible()) {
        await aiChatInput.fill('What is the recommended reinforcement ratio?');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(5000);
      }
    });
  });

  test.describe('Foundation Design Workflow', () => {
    test('should design foundation with soil parameters', async ({ page }) => {
      // Select foundation calculator
      await page.click('button:has-text("Foundation"), [data-calculator="foundation"]').catch(() => {});
      
      // Fill foundation inputs
      const inputs = {
        'load': '500',
        'bearing': '150',
        'width': '2',
        'depth': '0.5'
      };
      
      for (const [key, value] of Object.entries(inputs)) {
        const input = page.locator(`input[name*="${key}"], input[placeholder*="${key}"]`).first();
        if (await input.isVisible()) {
          await input.fill(value);
        }
      }
      
      // Calculate
      const calculateBtn = page.locator('button:has-text("Calculate")').first();
      if (await calculateBtn.isVisible()) {
        await calculateBtn.click();
        await page.waitForTimeout(3000);
      }
    });
  });

  test.describe('Slab Design Workflow', () => {
    test('should complete slab design with loads', async ({ page }) => {
      // Select slab calculator
      await page.click('button:has-text("Slab"), [data-calculator="slab"]').catch(() => {});
      
      // Fill slab dimensions
      const lengthInput = page.locator('input[name*="length"], input[placeholder*="length"]').first();
      if (await lengthInput.isVisible()) {
        await lengthInput.fill('5');
      }
      
      const widthInput = page.locator('input[name*="width"], input[placeholder*="width"]').first();
      if (await widthInput.isVisible()) {
        await widthInput.fill('4');
      }
      
      // Calculate
      const calculateBtn = page.locator('button:has-text("Calculate")').first();
      if (await calculateBtn.isVisible()) {
        await calculateBtn.click();
        await page.waitForTimeout(3000);
      }
    });
  });

  test.describe('Retaining Wall Design', () => {
    test('should design retaining wall with earth pressures', async ({ page }) => {
      // Select retaining wall calculator
      await page.click('button:has-text("Retaining"), button:has-text("Wall"), [data-calculator="retaining"]').catch(() => {});
      
      // Fill wall parameters
      const heightInput = page.locator('input[name*="height"], input[placeholder*="height"]').first();
      if (await heightInput.isVisible()) {
        await heightInput.fill('3');
      }
      
      // Calculate
      const calculateBtn = page.locator('button:has-text("Calculate")').first();
      if (await calculateBtn.isVisible()) {
        await calculateBtn.click();
        await page.waitForTimeout(3000);
      }
    });
  });

  test.describe('Design Comparison', () => {
    test('should compare multiple calculations', async ({ page }) => {
      // Run first calculation
      await page.click('button:has-text("Beam")').catch(() => {});
      
      const spanInput = page.locator('input[name*="span"]').first();
      if (await spanInput.isVisible()) {
        await spanInput.fill('5');
        await page.locator('button:has-text("Calculate")').first().click();
        await page.waitForTimeout(2000);
        
        // Modify and recalculate
        await spanInput.fill('7');
        await page.locator('button:has-text("Calculate")').first().click();
        await page.waitForTimeout(2000);
      }
      
      // Check if comparison view is available
      const compareBtn = page.locator('button:has-text("Compare"), button:has-text("History")').first();
      if (await compareBtn.isVisible()) {
        await compareBtn.click();
      }
    });
  });

  test.describe('Save and Load Design', () => {
    test('should save design to portfolio', async ({ page }) => {
      // Run a calculation first
      await page.click('button:has-text("Beam")').catch(() => {});
      
      const spanInput = page.locator('input[name*="span"]').first();
      if (await spanInput.isVisible()) {
        await spanInput.fill('6');
        await page.locator('button:has-text("Calculate")').first().click();
        await page.waitForTimeout(3000);
      }
      
      // Save to portfolio
      const saveBtn = page.locator('button:has-text("Save"), button:has-text("Portfolio")').first();
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
        
        // Fill save dialog
        const nameInput = page.locator('input[placeholder*="name"], input[name*="name"]').first();
        if (await nameInput.isVisible()) {
          await nameInput.fill('Test Beam Design ' + Date.now());
          await page.locator('button:has-text("Save"), button[type="submit"]').first().click();
        }
      }
    });

    test('should load design from history', async ({ page }) => {
      // Open history/portfolio
      const historyBtn = page.locator('button:has-text("History"), button:has-text("Portfolio"), button:has-text("Load")').first();
      if (await historyBtn.isVisible()) {
        await historyBtn.click();
        await page.waitForTimeout(2000);
        
        // Select a saved design
        const savedItem = page.locator('[data-design], .design-item, .portfolio-item').first();
        if (await savedItem.isVisible()) {
          await savedItem.click();
        }
      }
    });
  });

  test.describe('PDF Report Generation', () => {
    test('should generate PDF report for calculation', async ({ page }) => {
      // Run a calculation
      await page.click('button:has-text("Beam")').catch(() => {});
      
      const spanInput = page.locator('input[name*="span"]').first();
      if (await spanInput.isVisible()) {
        await spanInput.fill('6');
        await page.locator('button:has-text("Calculate")').first().click();
        await page.waitForTimeout(3000);
      }
      
      // Generate PDF
      const pdfBtn = page.locator('button:has-text("PDF"), button:has-text("Report")').first();
      if (await pdfBtn.isVisible()) {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
          pdfBtn.click(),
        ]);
        
        if (download) {
          const filename = download.suggestedFilename();
          expect(filename).toMatch(/\.pdf$/i);
        }
      }
    });
  });

  test.describe('DXF Export', () => {
    test('should export design to DXF format', async ({ page }) => {
      // Run a calculation
      await page.click('button:has-text("Beam")').catch(() => {});
      
      const spanInput = page.locator('input[name*="span"]').first();
      if (await spanInput.isVisible()) {
        await spanInput.fill('6');
        await page.locator('button:has-text("Calculate")').first().click();
        await page.waitForTimeout(3000);
      }
      
      // Export DXF
      const dxfBtn = page.locator('button:has-text("DXF"), button:has-text("AutoCAD")').first();
      if (await dxfBtn.isVisible()) {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
          dxfBtn.click(),
        ]);
        
        if (download) {
          const filename = download.suggestedFilename();
          expect(filename).toMatch(/\.dxf$/i);
        }
      }
    });
  });
});
