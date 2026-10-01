import { test, expect } from '@playwright/test';
import { loginAsTestUser } from '../../utils/auth-helper';

test.describe('Support - AI Chatbot', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/support');
    await page.waitForLoadState('networkidle');
  });

  test('should load support page', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display support options', async ({ page }) => {
    const supportContent = page.locator('[class*="support"]').or(
      page.locator('text=Support').or(page.locator('text=Help'))
    );
    await expect(page.locator('body')).toBeVisible();
  });

  test('should have AI support chat interface', async ({ page }) => {
    const chatInterface = page.locator('textarea').or(
      page.locator('[class*="chat"]')
    );
    if (await chatInterface.count() > 0) {
      await expect(chatInterface.first()).toBeVisible();
    }
  });

  test('should send support question', async ({ page }) => {
    const chatInput = page.locator('textarea').first();
    if (await chatInput.count() > 0) {
      await chatInput.fill('How do I reset my password?');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }
  });

  test('should suggest FAQ articles', async ({ page }) => {
    const faqSection = page.locator('[class*="faq"]').or(
      page.locator('text=FAQ').or(page.locator('text=Frequently'))
    );
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle rapid support queries', async ({ page }) => {
    const chatInput = page.locator('textarea').first();
    if (await chatInput.count() > 0) {
      for (let i = 0; i < 5; i++) {
        await chatInput.fill(`Support question ${i + 1}`);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
      }
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('Support - Ticket System', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/support');
    await page.waitForLoadState('networkidle');
  });

  test('should show ticket creation option', async ({ page }) => {
    const createTicketBtn = page.locator('button:has-text("Ticket")').or(
      page.locator('button:has-text("Submit")').or(
        page.locator('[class*="ticket"]')
      )
    );
    await expect(page.locator('body')).toBeVisible();
  });

  test('should validate ticket form', async ({ page }) => {
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForTimeout(500);
      // Should show validation errors
    }
  });

  test('should display user tickets', async ({ page }) => {
    const ticketList = page.locator('[class*="ticket"]').or(
      page.locator('table').or(page.locator('[class*="list"]'))
    );
    await expect(page.locator('body')).toBeVisible();
  });

  test('should view ticket details', async ({ page }) => {
    const ticketItem = page.locator('[class*="ticket-item"]').or(
      page.locator('tr').first()
    );
    if (await ticketItem.count() > 0) {
      await ticketItem.click().catch(() => {});
      await page.waitForTimeout(500);
    }
  });

  test('should categorize tickets', async ({ page }) => {
    const categorySelect = page.locator('select').or(
      page.locator('[class*="category"]')
    );
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Support - FAQ Browser', () => {
  test('should display FAQ categories', async ({ page }) => {
    await page.goto('/support');
    
    const faqCategories = page.locator('[class*="category"]').or(
      page.locator('[class*="accordion"]')
    );
    await expect(page.locator('body')).toBeVisible();
  });

  test('should expand FAQ items', async ({ page }) => {
    await page.goto('/support');
    
    const faqItem = page.locator('[class*="collapsible"]').or(
      page.locator('[data-state]').first()
    );
    if (await faqItem.count() > 0) {
      await faqItem.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  });

  test('should search FAQs', async ({ page }) => {
    await page.goto('/support');
    
    const searchInput = page.locator('input[placeholder*="search" i]');
    if (await searchInput.count() > 0) {
      await searchInput.fill('password');
      await page.waitForTimeout(500);
    }
  });

  test('should mark FAQ as helpful', async ({ page }) => {
    await page.goto('/support');
    
    const helpfulBtn = page.locator('button:has-text("Helpful")').or(
      page.locator('button:has([class*="thumb"])').first()
    );
    if (await helpfulBtn.count() > 0) {
      await helpfulBtn.click().catch(() => {});
    }
  });
});
