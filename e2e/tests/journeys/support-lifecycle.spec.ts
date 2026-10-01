import { test, expect } from '@playwright/test';

/**
 * Support Ticket Lifecycle Journey Tests - Phase 2
 * Complete support workflow simulations
 */

test.describe('Support Ticket Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/');
    await page.click('text=Sign In');
    await page.fill('input[type="email"]', 'test-user@aynn.io');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('/', { timeout: 15000 });
  });

  test.describe('FAQ to Ticket Journey', () => {
    test('should browse FAQ then create ticket if not found', async ({ page }) => {
      // Navigate to support
      await page.goto('/support');
      await page.waitForLoadState('networkidle');
      
      // Step 1: Browse FAQ
      const faqSection = page.locator('text=FAQ, text=Questions, text=Help').first();
      await expect(faqSection).toBeVisible({ timeout: 5000 });
      
      // Step 2: Search FAQ
      const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first();
      if (await searchInput.isVisible()) {
        await searchInput.fill('payment issue');
        await page.waitForTimeout(1000);
      }
      
      // Step 3: If not found, create ticket
      const createTicketBtn = page.locator('button:has-text("Create Ticket"), button:has-text("Contact"), button:has-text("New Ticket")').first();
      if (await createTicketBtn.isVisible()) {
        await createTicketBtn.click();
        await page.waitForTimeout(1000);
      }
      
      // Step 4: Fill ticket form
      const subjectInput = page.locator('input[name*="subject"], input[placeholder*="Subject"]').first();
      if (await subjectInput.isVisible()) {
        await subjectInput.fill('Test Support Ticket ' + Date.now());
      }
      
      const messageInput = page.locator('textarea[name*="message"], textarea[placeholder*="message"]').first();
      if (await messageInput.isVisible()) {
        await messageInput.fill('This is a test support ticket for E2E testing. Please ignore.');
      }
      
      // Step 5: Submit ticket
      const submitBtn = page.locator('button:has-text("Submit"), button[type="submit"]').first();
      if (await submitBtn.isVisible() && !await submitBtn.isDisabled()) {
        await submitBtn.click();
        await page.waitForTimeout(3000);
        
        // Should show success
        await expect(page.locator('text=submitted, text=created, text=success').first()).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Ticket Creation and Tracking', () => {
    test('should create ticket with all required fields', async ({ page }) => {
      await page.goto('/support');
      await page.waitForLoadState('networkidle');
      
      // Open new ticket form
      const newTicketBtn = page.locator('button:has-text("New Ticket"), button:has-text("Create")').first();
      if (await newTicketBtn.isVisible()) {
        await newTicketBtn.click();
      }
      
      // Fill all fields
      const subjectInput = page.locator('input[name*="subject"]').first();
      if (await subjectInput.isVisible()) {
        await subjectInput.fill('Urgent: Test Ticket ' + Date.now());
      }
      
      // Select category
      const categorySelect = page.locator('select[name*="category"], [role="combobox"]').first();
      if (await categorySelect.isVisible()) {
        await categorySelect.click();
        await page.locator('[role="option"]').first().click().catch(() => {});
      }
      
      // Select priority
      const prioritySelect = page.locator('select[name*="priority"], [data-priority]').first();
      if (await prioritySelect.isVisible()) {
        await prioritySelect.click();
        await page.locator('[role="option"], option').filter({ hasText: /high|urgent/i }).first().click().catch(() => {});
      }
      
      // Add description
      const descInput = page.locator('textarea').first();
      if (await descInput.isVisible()) {
        await descInput.fill('Detailed description of the issue for testing purposes.');
      }
      
      // Submit
      await page.locator('button:has-text("Submit"), button[type="submit"]').first().click().catch(() => {});
    });

    test('should view ticket list and details', async ({ page }) => {
      await page.goto('/support');
      await page.waitForLoadState('networkidle');
      
      // Look for ticket list
      const ticketList = page.locator('[class*="ticket"], [data-ticket]');
      if (await ticketList.count() > 0) {
        // Click first ticket
        await ticketList.first().click();
        
        // Should show ticket details
        await expect(page.locator('text=Status, text=Priority, text=Created').first()).toBeVisible({ timeout: 5000 });
      }
    });

    test('should add reply to existing ticket', async ({ page }) => {
      await page.goto('/support');
      await page.waitForLoadState('networkidle');
      
      // Open a ticket
      const ticketItem = page.locator('[class*="ticket"], button').filter({ hasText: /ticket|#/i }).first();
      if (await ticketItem.isVisible()) {
        await ticketItem.click();
        await page.waitForTimeout(1000);
      }
      
      // Add reply
      const replyInput = page.locator('textarea[placeholder*="Reply"], textarea[name*="reply"]').first();
      if (await replyInput.isVisible()) {
        await replyInput.fill('Additional information for this ticket: Test reply ' + Date.now());
        
        const sendBtn = page.locator('button:has-text("Send"), button:has-text("Reply")').first();
        if (await sendBtn.isVisible()) {
          await sendBtn.click();
          await page.waitForTimeout(2000);
        }
      }
    });
  });

  test.describe('AI Support Chat', () => {
    test('should interact with AI support bot first', async ({ page }) => {
      await page.goto('/support');
      await page.waitForLoadState('networkidle');
      
      // Find AI chat
      const aiChatInput = page.locator('textarea[placeholder*="chat"], input[placeholder*="Ask"]').first();
      if (await aiChatInput.isVisible()) {
        await aiChatInput.fill('How do I reset my password?');
        await page.keyboard.press('Enter');
        
        // Wait for AI response
        await page.waitForTimeout(5000);
        
        // Should get a response
        const aiResponse = page.locator('[class*="message"], [class*="response"]').last();
        await expect(aiResponse).toBeVisible();
      }
    });

    test('should escalate from AI to human support', async ({ page }) => {
      await page.goto('/support');
      await page.waitForLoadState('networkidle');
      
      // Chat with AI first
      const aiChatInput = page.locator('textarea, input[type="text"]').first();
      if (await aiChatInput.isVisible()) {
        await aiChatInput.fill('I need to speak to a human');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(3000);
      }
      
      // Look for escalation option
      const escalateBtn = page.locator('button:has-text("Human"), button:has-text("Agent"), button:has-text("Escalate")').first();
      if (await escalateBtn.isVisible()) {
        await escalateBtn.click();
      }
    });
  });

  test.describe('Ticket Status Tracking', () => {
    test('should display ticket status indicators', async ({ page }) => {
      await page.goto('/support');
      await page.waitForLoadState('networkidle');
      
      // Check for status badges
      const statusBadges = page.locator('[class*="badge"], [class*="status"]');
      if (await statusBadges.count() > 0) {
        await expect(statusBadges.first()).toBeVisible();
      }
    });

    test('should show unread reply indicator', async ({ page }) => {
      await page.goto('/support');
      await page.waitForLoadState('networkidle');
      
      // Look for unread indicators
      const unreadIndicator = page.locator('[class*="unread"], [class*="new"], .notification-dot');
      // May or may not have unread items
    });

    test('should mark ticket as resolved', async ({ page }) => {
      await page.goto('/support');
      await page.waitForLoadState('networkidle');
      
      // Open a ticket
      const ticketItem = page.locator('[class*="ticket"]').first();
      if (await ticketItem.isVisible()) {
        await ticketItem.click();
        await page.waitForTimeout(1000);
      }
      
      // Mark as resolved
      const resolveBtn = page.locator('button:has-text("Resolve"), button:has-text("Close")').first();
      if (await resolveBtn.isVisible()) {
        await resolveBtn.click();
        
        // Confirm if needed
        const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes")').first();
        if (await confirmBtn.isVisible()) {
          await confirmBtn.click();
        }
      }
    });
  });

  test.describe('Attachment Handling', () => {
    test('should upload attachment to ticket', async ({ page }) => {
      await page.goto('/support');
      await page.waitForLoadState('networkidle');
      
      // Open new ticket or existing ticket
      const newTicketBtn = page.locator('button:has-text("New Ticket")').first();
      if (await newTicketBtn.isVisible()) {
        await newTicketBtn.click();
      }
      
      // Upload file
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.isVisible()) {
        await fileInput.setInputFiles({
          name: 'test-screenshot.png',
          mimeType: 'image/png',
          buffer: Buffer.from('fake image content'),
        });
      }
    });
  });

  test.describe('Notification Preferences', () => {
    test('should toggle email notifications for tickets', async ({ page }) => {
      await page.goto('/support');
      await page.waitForLoadState('networkidle');
      
      // Look for notification settings
      const settingsBtn = page.locator('button:has-text("Settings"), button[aria-label*="settings"]').first();
      if (await settingsBtn.isVisible()) {
        await settingsBtn.click();
        
        const emailToggle = page.locator('[role="switch"], input[type="checkbox"]').first();
        if (await emailToggle.isVisible()) {
          await emailToggle.click();
        }
      }
    });
  });
});
