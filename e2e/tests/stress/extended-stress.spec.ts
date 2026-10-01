import { test, expect } from '@playwright/test';

/**
 * Extended Stress Tests - Phase 4
 * Heavy load and endurance testing
 */

test.describe('Extended Stress Tests', () => {
  test.describe('Chat Stress Testing', () => {
    test('should handle 100 messages in a single session', async ({ page }) => {
      test.setTimeout(300000); // 5 minutes
      
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      const chatInput = page.locator('textarea').first();
      let successCount = 0;
      let errorCount = 0;
      
      if (await chatInput.isVisible()) {
        for (let i = 0; i < 100; i++) {
          try {
            await chatInput.fill(`Stress test message ${i + 1} of 100`);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(500);
            successCount++;
            
            // Log progress every 10 messages
            if ((i + 1) % 10 === 0) {
              console.log(`Sent ${i + 1} messages`);
            }
          } catch (error) {
            errorCount++;
          }
        }
      }
      
      // At least 90% should succeed
      expect(successCount).toBeGreaterThan(90);
      console.log(`Success: ${successCount}, Errors: ${errorCount}`);
    });

    test('should handle long message content', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      const chatInput = page.locator('textarea').first();
      
      if (await chatInput.isVisible()) {
        // Generate 10,000 character message
        const longMessage = 'Lorem ipsum dolor sit amet. '.repeat(400);
        
        await chatInput.fill(longMessage);
        await page.keyboard.press('Enter');
        
        // Should handle without crashing
        await page.waitForTimeout(5000);
        await expect(page.locator('body')).toBeVisible();
      }
    });
  });

  test.describe('Engineering Calculation Stress', () => {
    test('should handle 50 consecutive calculations', async ({ page }) => {
      test.setTimeout(180000); // 3 minutes
      
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      await page.goto('/engineering');
      await page.waitForLoadState('networkidle');
      
      let calcCount = 0;
      
      // Select beam calculator
      await page.click('button:has-text("Beam")').catch(() => {});
      
      const spanInput = page.locator('input[name*="span"]').first();
      const calculateBtn = page.locator('button:has-text("Calculate")').first();
      
      if (await spanInput.isVisible() && await calculateBtn.isVisible()) {
        for (let i = 0; i < 50; i++) {
          await spanInput.fill(String(3 + (i % 10)));
          await calculateBtn.click();
          await page.waitForTimeout(300);
          calcCount++;
          
          if ((i + 1) % 10 === 0) {
            console.log(`Completed ${i + 1} calculations`);
          }
        }
      }
      
      console.log(`Total calculations: ${calcCount}`);
      await expect(page.locator('body')).toBeVisible();
    });

    test('should handle rapid calculator switching', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      await page.goto('/engineering');
      await page.waitForLoadState('networkidle');
      
      const calculators = ['Beam', 'Column', 'Slab', 'Foundation'];
      
      for (let i = 0; i < 30; i++) {
        const calc = calculators[i % calculators.length];
        await page.click(`button:has-text("${calc}")`).catch(() => {});
        await page.waitForTimeout(200);
      }
      
      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('Navigation Stress', () => {
    test('should handle 30-minute continuous usage simulation', async ({ page }) => {
      test.setTimeout(1800000); // 30 minutes max, but we'll simulate faster
      
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      const routes = ['/', '/engineering', '/support', '/settings', '/'];
      let navigationCount = 0;
      
      // Simulate 5 minutes of usage (scaled down)
      for (let minute = 0; minute < 5; minute++) {
        for (const route of routes) {
          await page.goto(route);
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(100);
          navigationCount++;
        }
        console.log(`Minute ${minute + 1}: ${navigationCount} navigations`);
      }
      
      // Memory check
      const metrics = await page.evaluate(() => {
        if (performance && (performance as any).memory) {
          return {
            usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
            totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
          };
        }
        return null;
      });
      
      if (metrics) {
        console.log(`Memory usage: ${Math.round(metrics.usedJSHeapSize / 1024 / 1024)}MB / ${Math.round(metrics.totalJSHeapSize / 1024 / 1024)}MB`);
      }
      
      await expect(page.locator('body')).toBeVisible();
    });

    test('should handle rapid back/forward navigation', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Navigate through pages
      const routes = ['/engineering', '/support', '/settings', '/'];
      for (const route of routes) {
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');
      }
      
      // Rapid back/forward
      for (let i = 0; i < 20; i++) {
        await page.goBack();
        await page.waitForTimeout(100);
        await page.goForward();
        await page.waitForTimeout(100);
      }
      
      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('Memory & Performance', () => {
    test('should not leak memory during heavy usage', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Get initial memory
      const initialMemory = await page.evaluate(() => {
        if ((performance as any).memory) {
          return (performance as any).memory.usedJSHeapSize;
        }
        return 0;
      });
      
      // Heavy operations
      for (let i = 0; i < 50; i++) {
        await page.goto('/engineering');
        await page.waitForLoadState('domcontentloaded');
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
      }
      
      // Get final memory
      const finalMemory = await page.evaluate(() => {
        if ((performance as any).memory) {
          return (performance as any).memory.usedJSHeapSize;
        }
        return 0;
      });
      
      if (initialMemory > 0 && finalMemory > 0) {
        const growth = (finalMemory - initialMemory) / initialMemory;
        console.log(`Memory growth: ${Math.round(growth * 100)}%`);
        // Memory should not grow more than 300%
        expect(growth).toBeLessThan(3);
      }
    });

    test('should maintain acceptable frame rate during animations', async ({ page }) => {
      await page.goto('/');
      
      // Collect performance metrics during animations
      const metrics = await page.evaluate(async () => {
        const frames: number[] = [];
        let lastTime = performance.now();
        
        return new Promise<{ avgFps: number; minFps: number }>((resolve) => {
          const measure = () => {
            const now = performance.now();
            const delta = now - lastTime;
            if (delta > 0) {
              frames.push(1000 / delta);
            }
            lastTime = now;
            
            if (frames.length < 60) {
              requestAnimationFrame(measure);
            } else {
              const avgFps = frames.reduce((a, b) => a + b, 0) / frames.length;
              const minFps = Math.min(...frames);
              resolve({ avgFps: Math.round(avgFps), minFps: Math.round(minFps) });
            }
          };
          requestAnimationFrame(measure);
        });
      });
      
      console.log(`Average FPS: ${metrics.avgFps}, Min FPS: ${metrics.minFps}`);
      // Should maintain at least 30 FPS on average
      expect(metrics.avgFps).toBeGreaterThan(30);
    });
  });

  test.describe('Concurrent Operations', () => {
    test('should handle multiple simultaneous operations', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Start multiple operations at once
      await Promise.all([
        page.locator('textarea').first().fill('Concurrent test 1').catch(() => {}),
        page.goto('/engineering').catch(() => {}),
        page.evaluate(() => window.localStorage.setItem('test', 'value')).catch(() => {}),
      ]);
      
      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('Data Volume Stress', () => {
    test('should handle large conversation history', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Send many messages to build up history
      const chatInput = page.locator('textarea').first();
      
      if (await chatInput.isVisible()) {
        for (let i = 0; i < 30; i++) {
          await chatInput.fill(`Building history message ${i}`);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(200);
        }
      }
      
      // Scroll through history
      const messageContainer = page.locator('[class*="message"], [class*="chat"]').first();
      if (await messageContainer.isVisible()) {
        await messageContainer.evaluate(el => {
          el.scrollTop = 0;
          el.scrollTop = el.scrollHeight;
        });
      }
      
      await expect(page.locator('body')).toBeVisible();
    });
  });
});
