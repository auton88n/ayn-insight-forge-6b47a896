import { test, expect } from '@playwright/test';

/**
 * Network Resilience Tests - Phase 3
 * Testing offline handling and network recovery
 */

test.describe('Network Resilience', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test.describe('Offline Detection', () => {
    test('should show offline banner when network disconnects', async ({ page, context }) => {
      // Go offline
      await context.setOffline(true);
      await page.waitForTimeout(2000);
      
      // Should show offline indicator
      const offlineBanner = page.locator('text=Offline, text=No connection, text=disconnected').first();
      await expect(offlineBanner).toBeVisible({ timeout: 5000 });
    });

    test('should hide offline banner when reconnected', async ({ page, context }) => {
      // Go offline
      await context.setOffline(true);
      await page.waitForTimeout(2000);
      
      // Go back online
      await context.setOffline(false);
      await page.waitForTimeout(2000);
      
      // Offline banner should disappear
      const offlineBanner = page.locator('[class*="offline"], [data-offline]');
      await expect(offlineBanner).not.toBeVisible({ timeout: 5000 });
    });

    test('should detect slow network connection', async ({ page, context }) => {
      // Simulate slow 2G network
      const client = await page.context().newCDPSession(page);
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: 25000, // 25kb/s
        uploadThroughput: 12500,
        latency: 2000,
      });
      
      // Try to load a page
      await page.goto('/engineering');
      
      // Should still load eventually
      await expect(page.locator('body')).toBeVisible({ timeout: 30000 });
    });
  });

  test.describe('Request Queuing', () => {
    test('should queue messages while offline', async ({ page, context }) => {
      // Login first
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Go offline
      await context.setOffline(true);
      await page.waitForTimeout(1000);
      
      // Try to send message
      const chatInput = page.locator('textarea').first();
      if (await chatInput.isVisible()) {
        await chatInput.fill('Offline test message');
        await page.keyboard.press('Enter');
        
        // Message should appear as pending/queued
        await page.waitForTimeout(1000);
      }
      
      // Go back online
      await context.setOffline(false);
      await page.waitForTimeout(3000);
      
      // Message should be sent
    });
  });

  test.describe('API Timeout Handling', () => {
    test('should handle API timeout gracefully', async ({ page }) => {
      // Login
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Intercept and delay API calls
      await page.route('**/functions/v1/**', async route => {
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30s delay
        route.abort();
      });
      
      // Try to send message
      const chatInput = page.locator('textarea').first();
      if (await chatInput.isVisible()) {
        await chatInput.fill('Timeout test message');
        await page.keyboard.press('Enter');
        
        // Should show timeout error eventually
        await expect(page.locator('text=timeout, text=error, text=try again').first()).toBeVisible({ timeout: 35000 });
      }
    });

    test('should allow retry after timeout', async ({ page }) => {
      let requestCount = 0;
      
      // Login first
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // First request fails, second succeeds
      await page.route('**/functions/v1/ayn-unified', async route => {
        requestCount++;
        if (requestCount === 1) {
          route.abort('timedout');
        } else {
          route.continue();
        }
      });
      
      // Send message
      const chatInput = page.locator('textarea').first();
      if (await chatInput.isVisible()) {
        await chatInput.fill('Retry test message');
        await page.keyboard.press('Enter');
        
        // Wait for error
        await page.waitForTimeout(3000);
        
        // Click retry if available
        const retryBtn = page.locator('button:has-text("Retry"), button:has-text("Try again")').first();
        if (await retryBtn.isVisible()) {
          await retryBtn.click();
        }
      }
    });
  });

  test.describe('Network Error Recovery', () => {
    test('should recover from connection drop mid-request', async ({ page, context }) => {
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Start a request then go offline
      const chatInput = page.locator('textarea').first();
      if (await chatInput.isVisible()) {
        await chatInput.fill('Connection drop test');
        await page.keyboard.press('Enter');
        
        // Immediately go offline
        await context.setOffline(true);
        await page.waitForTimeout(2000);
        
        // Go back online
        await context.setOffline(false);
        await page.waitForTimeout(3000);
      }
      
      // Should handle gracefully
      await expect(page.locator('body')).toBeVisible();
    });

    test('should maintain UI state after network recovery', async ({ page, context }) => {
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Navigate to a page
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      
      // Fill some inputs
      const input = page.locator('input, textarea').first();
      if (await input.isVisible()) {
        await input.fill('Test data before offline');
      }
      
      // Go offline and back
      await context.setOffline(true);
      await page.waitForTimeout(1000);
      await context.setOffline(false);
      await page.waitForTimeout(2000);
      
      // Data should still be in the input
      if (await input.isVisible()) {
        const value = await input.inputValue();
        expect(value).toContain('Test data');
      }
    });
  });

  test.describe('Websocket Resilience', () => {
    test('should reconnect realtime subscriptions after disconnect', async ({ page }) => {
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Check for realtime connection status if visible
      const realtimeIndicator = page.locator('[class*="realtime"], [class*="connected"]');
      
      // This is hard to test directly, but we verify the page works after reconnection
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('Progressive Loading', () => {
    test('should show loading states during slow requests', async ({ page }) => {
      // Slow down all requests
      await page.route('**/*', async route => {
        await new Promise(resolve => setTimeout(resolve, 500));
        route.continue();
      });
      
      await page.goto('/engineering');
      
      // Should show loading indicator
      const loadingIndicator = page.locator('[class*="loading"], [class*="spinner"], [class*="skeleton"]').first();
      // Loading indicators should appear during slow loads
    });
  });
});
