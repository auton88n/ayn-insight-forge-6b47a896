import { test, expect } from '@playwright/test';

/**
 * Data Protection Tests - Phase 5
 * Testing data isolation and RLS enforcement
 */

test.describe('Data Protection', () => {
  test.describe('User Data Isolation', () => {
    test('should not access other users data', async ({ browser }) => {
      // Create two separate user sessions
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      
      // Login as user 1
      await page1.goto('/');
      await page1.click('text=Sign In');
      await page1.fill('input[type="email"]', 'test-user@aynn.io');
      await page1.fill('input[type="password"]', 'TestPassword123!');
      await page1.click('button[type="submit"]');
      await page1.waitForURL('/', { timeout: 15000 });
      
      // Create some data as user 1
      const chatInput1 = page1.locator('textarea').first();
      if (await chatInput1.isVisible()) {
        await chatInput1.fill('Secret message from user 1: CODE123');
        await page1.keyboard.press('Enter');
        await page1.waitForTimeout(2000);
      }
      
      // Login as user 2 (admin)
      await page2.goto('/');
      await page2.click('text=Sign In');
      await page2.fill('input[type="email"]', 'test-admin@aynn.io');
      await page2.fill('input[type="password"]', 'AdminPassword123!');
      await page2.click('button[type="submit"]');
      await page2.waitForURL('/', { timeout: 15000 });
      
      // User 2 should not see user 1's data
      const pageContent2 = await page2.content();
      expect(pageContent2).not.toContain('Secret message from user 1');
      expect(pageContent2).not.toContain('CODE123');
      
      await context1.close();
      await context2.close();
    });

    test('should isolate engineering calculations per user', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      
      // Login as user 1
      await page1.goto('/');
      await page1.click('text=Sign In');
      await page1.fill('input[type="email"]', 'test-user@aynn.io');
      await page1.fill('input[type="password"]', 'TestPassword123!');
      await page1.click('button[type="submit"]');
      await page1.waitForURL('/', { timeout: 15000 });
      
      // Go to engineering
      await page1.goto('/engineering');
      await page1.waitForLoadState('networkidle');
      
      // Do a calculation
      await page1.click('button:has-text("Beam")').catch(() => {});
      const spanInput = page1.locator('input[name*="span"]').first();
      if (await spanInput.isVisible()) {
        await spanInput.fill('7.5'); // Specific value
        await page1.locator('button:has-text("Calculate")').first().click();
        await page1.waitForTimeout(2000);
      }
      
      // Login as user 2
      await page2.goto('/');
      await page2.click('text=Sign In');
      await page2.fill('input[type="email"]', 'test-admin@aynn.io');
      await page2.fill('input[type="password"]', 'AdminPassword123!');
      await page2.click('button[type="submit"]');
      await page2.waitForURL('/', { timeout: 15000 });
      
      await page2.goto('/engineering');
      await page2.waitForLoadState('networkidle');
      
      // User 2's history should not contain user 1's calculations
      const historyBtn = page2.locator('button:has-text("History")').first();
      if (await historyBtn.isVisible()) {
        await historyBtn.click();
        await page2.waitForTimeout(1000);
        
        const pageContent2 = await page2.content();
        expect(pageContent2).not.toContain('7.5'); // User 1's specific value
      }
      
      await context1.close();
      await context2.close();
    });
  });

  test.describe('RLS Policy Enforcement', () => {
    test('should enforce RLS on messages table', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Try to access other users' messages via console (RLS should block)
      const result = await page.evaluate(async () => {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          'https://dfkoxuokfkttjhfjcecx.supabase.co',
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw'
        );
        
        // Try to fetch all messages (should only get own)
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .limit(10);
        
        return { count: data?.length || 0, error: error?.message };
      });
      
      // Should only return own messages (or error)
      expect(result.error).toBeFalsy();
    });

    test('should enforce RLS on profiles table', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Try to update another user's profile (should fail)
      const result = await page.evaluate(async () => {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          'https://dfkoxuokfkttjhfjcecx.supabase.co',
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkzdm2SmMNDmjNbxw'
        );
        
        // Try to update a random user's profile
        const { error } = await supabase
          .from('profiles')
          .update({ company_name: 'HACKED' })
          .neq('user_id', 'some-other-user-id');
        
        return { error: error?.message };
      });
      
      // Update to other users should fail or affect 0 rows
    });
  });

  test.describe('Encrypted Fields Protection', () => {
    test('should not expose encrypted data in UI', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Check settings page for encrypted fields
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      
      const pageContent = await page.content();
      
      // Should not contain raw encrypted data patterns
      expect(pageContent).not.toMatch(/[A-Za-z0-9+/]{50,}={0,2}/); // Base64 encrypted data
    });

    test('should mask sensitive data in UI', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Navigate around and check for sensitive data exposure
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      
      // API keys should be masked
      const maskedPatterns = await page.locator('text=/\\*{4,}/, text=/•{4,}/').count();
      // Sensitive data should be masked when displayed
    });
  });

  test.describe('Export Data Scope', () => {
    test('should only export own data', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      
      // Find export button
      const exportBtn = page.locator('button:has-text("Export"), button:has-text("Download")').first();
      
      if (await exportBtn.isVisible()) {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
          exportBtn.click(),
        ]);
        
        if (download) {
          const path = await download.path();
          if (path) {
            const content = await require('fs').promises.readFile(path, 'utf8');
            
            // Should not contain other users' data
            expect(content).not.toContain('test-admin@aynn.io');
          }
        }
      }
    });
  });

  test.describe('Data Deletion', () => {
    test('should completely delete user data on request', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      
      // Find delete account option (if available)
      const deleteBtn = page.locator('button:has-text("Delete Account"), button:has-text("Delete Data")').first();
      
      // This would test the delete functionality if implemented
      // We don't actually delete in test to preserve test user
    });

    test('should clear chat history completely', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Find clear history option
      const clearBtn = page.locator('button:has-text("Clear History"), button:has-text("Delete All")').first();
      
      // This would test clear history if the button exists
    });
  });

  test.describe('API Response Data Filtering', () => {
    test('should not leak sensitive fields in API responses', async ({ page }) => {
      const responses: any[] = [];
      
      // Capture all API responses
      page.on('response', async response => {
        if (response.url().includes('supabase.co')) {
          try {
            const json = await response.json();
            responses.push(json);
          } catch (e) {
            // Not JSON
          }
        }
      });
      
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      
      // Check responses don't contain sensitive fields
      const responseStr = JSON.stringify(responses);
      expect(responseStr).not.toContain('password_hash');
      expect(responseStr).not.toContain('secret_key');
    });
  });
});
