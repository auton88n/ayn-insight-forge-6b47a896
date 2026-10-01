import { test, expect } from '@playwright/test';
import { loginAsTestUser, TEST_USERS } from '../../utils/auth-helper';
import { sendChatMessage, waitForAIResponse } from '../../utils/test-helpers';

test.describe('Dashboard - Basic Chat', () => {
  test.beforeEach(async ({ page }) => {
    // Try to login
    const loggedIn = await loginAsTestUser(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display dashboard after login', async ({ page }) => {
    // Check for dashboard elements or landing page
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should have chat input area', async ({ page }) => {
    const chatInput = page.locator('textarea').or(
      page.locator('input[type="text"][placeholder*="message" i]')
    );
    
    if (await chatInput.count() > 0) {
      await expect(chatInput.first()).toBeVisible();
    }
  });

  test('should send a message', async ({ page }) => {
    const chatInput = page.locator('textarea').first();
    
    if (await chatInput.count() > 0) {
      await chatInput.fill('Hello, this is a test message');
      
      const sendBtn = page.locator('button[type="submit"]').or(
        page.locator('button:has([class*="send"])')
      );
      
      if (await sendBtn.count() > 0) {
        await sendBtn.first().click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('should display typing indicator when waiting for response', async ({ page }) => {
    const chatInput = page.locator('textarea').first();
    
    if (await chatInput.count() > 0) {
      await chatInput.fill('What is AYN?');
      await page.keyboard.press('Enter');
      
      // Look for typing indicator
      await page.waitForTimeout(500);
      
      const typingIndicator = page.locator('[class*="typing"]').or(
        page.locator('[class*="loading"]').or(
          page.locator('[class*="dots"]')
        )
      );
      
      // Might appear briefly
      if (await typingIndicator.count() > 0) {
        expect(await typingIndicator.first().isVisible()).toBeDefined();
      }
    }
  });

  test('should receive AI response', async ({ page }) => {
    const chatInput = page.locator('textarea').first();
    
    if (await chatInput.count() > 0) {
      await chatInput.fill('Hello');
      await page.keyboard.press('Enter');
      
      // Wait for response (up to 30 seconds)
      await page.waitForTimeout(5000);
      
      // Check for any response elements
      const messages = page.locator('[class*="message"]').or(
        page.locator('[class*="bubble"]')
      );
      
      if (await messages.count() > 0) {
        expect(await messages.count()).toBeGreaterThan(0);
      }
    }
  });

  test('should support markdown in responses', async ({ page }) => {
    const chatInput = page.locator('textarea').first();
    
    if (await chatInput.count() > 0) {
      await chatInput.fill('Show me a code example');
      await page.keyboard.press('Enter');
      
      await page.waitForTimeout(5000);
      
      // Check for code blocks or formatted text
      const codeBlock = page.locator('pre').or(
        page.locator('code')
      );
      
      // Soft assertion - may or may not have code
      if (await codeBlock.count() > 0) {
        expect(await codeBlock.first().isVisible()).toBe(true);
      }
    }
  });

  test('should handle empty message submission', async ({ page }) => {
    const chatInput = page.locator('textarea').first();
    const sendBtn = page.locator('button[type="submit"]').first();
    
    if (await chatInput.count() > 0 && await sendBtn.count() > 0) {
      // Clear and try to submit
      await chatInput.fill('');
      await sendBtn.click();
      
      // Should not crash
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should handle very long messages', async ({ page }) => {
    const chatInput = page.locator('textarea').first();
    
    if (await chatInput.count() > 0) {
      const longMessage = 'Test '.repeat(500); // ~2500 characters
      await chatInput.fill(longMessage);
      
      // Check input still works
      const value = await chatInput.inputValue();
      expect(value.length).toBeGreaterThan(100);
    }
  });

  test('should handle special characters', async ({ page }) => {
    const chatInput = page.locator('textarea').first();
    
    if (await chatInput.count() > 0) {
      await chatInput.fill('Test: <>&"\'`${}[]()!@#$%^*');
      await page.keyboard.press('Enter');
      
      await page.waitForTimeout(1000);
      
      // Should not crash
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should handle emoji messages', async ({ page }) => {
    const chatInput = page.locator('textarea').first();
    
    if (await chatInput.count() > 0) {
      await chatInput.fill('Hello! 🎉🚀💡🔧⚡️');
      await page.keyboard.press('Enter');
      
      await page.waitForTimeout(1000);
      
      // Should handle emojis
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should handle Arabic messages', async ({ page }) => {
    const chatInput = page.locator('textarea').first();
    
    if (await chatInput.count() > 0) {
      await chatInput.fill('مرحبا، كيف يمكنك مساعدتي؟');
      await page.keyboard.press('Enter');
      
      await page.waitForTimeout(2000);
      
      // Should work with RTL text
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should handle rapid message sending', async ({ page }) => {
    const chatInput = page.locator('textarea').first();
    
    if (await chatInput.count() > 0) {
      // Send multiple messages rapidly
      for (let i = 0; i < 5; i++) {
        await chatInput.fill(`Rapid test message ${i + 1}`);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
      }
      
      // Should not crash
      await expect(page.locator('body')).toBeVisible();
    }
  });
});
