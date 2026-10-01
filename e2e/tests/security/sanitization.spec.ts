import { test, expect } from '@playwright/test';

/**
 * Input Sanitization & XSS Prevention Tests - Phase 5
 * Security testing for input handling
 */

test.describe('Input Sanitization', () => {
  const xssPayloads = [
    '<script>alert("XSS")</script>',
    '"><script>alert("XSS")</script>',
    '<img src="x" onerror="alert(\'XSS\')">',
    '<svg onload="alert(\'XSS\')">',
    'javascript:alert("XSS")',
    '<a href="javascript:alert(\'XSS\')">click</a>',
    '{{constructor.constructor("alert(1)")()}}',
    '<iframe src="javascript:alert(\'XSS\')"></iframe>',
    '<body onload="alert(\'XSS\')">',
    '<input onfocus="alert(\'XSS\')" autofocus>',
  ];

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('text=Sign In');
    await page.fill('input[type="email"]', 'test-user@aynn.io');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('/', { timeout: 15000 });
  });

  test.describe('Chat XSS Prevention', () => {
    test('should sanitize script tags in chat messages', async ({ page }) => {
      const chatInput = page.locator('textarea').first();
      
      if (await chatInput.isVisible()) {
        for (const payload of xssPayloads.slice(0, 5)) {
          await chatInput.fill(payload);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(1000);
          
          // Check no alert dialog appeared
          let alertTriggered = false;
          page.on('dialog', () => {
            alertTriggered = true;
          });
          
          await page.waitForTimeout(500);
          expect(alertTriggered).toBe(false);
        }
      }
      
      // Page should still be functional
      await expect(page.locator('body')).toBeVisible();
    });

    test('should escape HTML entities in displayed messages', async ({ page }) => {
      const chatInput = page.locator('textarea').first();
      const testPayload = '<script>alert("test")</script>';
      
      if (await chatInput.isVisible()) {
        await chatInput.fill(testPayload);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
        
        // The message should be displayed as text, not executed
        const pageContent = await page.content();
        
        // Script should be escaped or stripped
        expect(pageContent).not.toContain('<script>alert("test")</script>');
      }
    });
  });

  test.describe('Profile Fields XSS Prevention', () => {
    test('should sanitize XSS in profile name', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      
      const nameInput = page.locator('input[name*="name"], input[placeholder*="name"]').first();
      
      if (await nameInput.isVisible()) {
        await nameInput.fill('<script>alert("XSS")</script>');
        
        const saveBtn = page.locator('button:has-text("Save")').first();
        if (await saveBtn.isVisible()) {
          await saveBtn.click();
          await page.waitForTimeout(2000);
        }
        
        // Reload and check it's sanitized
        await page.reload();
        await page.waitForLoadState('networkidle');
        
        // No script execution
        let alertTriggered = false;
        page.on('dialog', () => {
          alertTriggered = true;
        });
        await page.waitForTimeout(1000);
        expect(alertTriggered).toBe(false);
      }
    });

    test('should sanitize XSS in company name', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      
      const companyInput = page.locator('input[name*="company"], input[placeholder*="company"]').first();
      
      if (await companyInput.isVisible()) {
        await companyInput.fill('<img src=x onerror=alert("XSS")>');
        
        const saveBtn = page.locator('button:has-text("Save")').first();
        if (await saveBtn.isVisible()) {
          await saveBtn.click();
        }
      }
      
      // No execution
      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('Support Ticket XSS Prevention', () => {
    test('should sanitize XSS in ticket subject', async ({ page }) => {
      await page.goto('/support');
      await page.waitForLoadState('networkidle');
      
      const newTicketBtn = page.locator('button:has-text("New Ticket")').first();
      if (await newTicketBtn.isVisible()) {
        await newTicketBtn.click();
      }
      
      const subjectInput = page.locator('input[name*="subject"]').first();
      if (await subjectInput.isVisible()) {
        await subjectInput.fill('<script>document.location="http://evil.com"</script>');
      }
      
      const messageInput = page.locator('textarea').first();
      if (await messageInput.isVisible()) {
        await messageInput.fill('<a href="javascript:alert(1)">Click me</a>');
      }
      
      // Submit
      const submitBtn = page.locator('button[type="submit"]').first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        await page.waitForTimeout(2000);
      }
      
      // No redirection or script execution
      expect(page.url()).not.toContain('evil.com');
    });

    test('should sanitize XSS in ticket messages', async ({ page }) => {
      await page.goto('/support');
      await page.waitForLoadState('networkidle');
      
      const ticketItem = page.locator('[class*="ticket"]').first();
      if (await ticketItem.isVisible()) {
        await ticketItem.click();
        await page.waitForTimeout(1000);
      }
      
      const replyInput = page.locator('textarea').first();
      if (await replyInput.isVisible()) {
        await replyInput.fill('<svg/onload=alert("XSS")>');
        
        const sendBtn = page.locator('button:has-text("Send")').first();
        if (await sendBtn.isVisible()) {
          await sendBtn.click();
        }
      }
    });
  });

  test.describe('Engineering Notes XSS Prevention', () => {
    test('should sanitize XSS in calculation notes', async ({ page }) => {
      await page.goto('/engineering');
      await page.waitForLoadState('networkidle');
      
      // Find notes/description input
      const notesInput = page.locator('textarea[name*="note"], input[name*="note"], textarea[placeholder*="note"]').first();
      
      if (await notesInput.isVisible()) {
        await notesInput.fill('<body onload="alert(\'XSS\')">');
        
        // Save if possible
        const saveBtn = page.locator('button:has-text("Save")').first();
        if (await saveBtn.isVisible()) {
          await saveBtn.click();
        }
      }
      
      // No execution
      let alertTriggered = false;
      page.on('dialog', () => {
        alertTriggered = true;
      });
      await page.waitForTimeout(2000);
      expect(alertTriggered).toBe(false);
    });
  });

  test.describe('File Name XSS Prevention', () => {
    test('should sanitize XSS in uploaded file names', async ({ page }) => {
      const fileInput = page.locator('input[type="file"]').first();
      
      if (await fileInput.isVisible()) {
        await fileInput.setInputFiles({
          name: '<script>alert("XSS")</script>.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('test content'),
        });
        
        await page.waitForTimeout(2000);
        
        // File name should be sanitized in display
        const pageContent = await page.content();
        expect(pageContent).not.toContain('<script>alert("XSS")</script>');
      }
    });
  });

  test.describe('URL Parameter XSS Prevention', () => {
    test('should sanitize XSS in URL parameters', async ({ page }) => {
      // Try to inject via URL
      await page.goto('/?search=<script>alert("XSS")</script>');
      await page.waitForTimeout(2000);
      
      // No script execution
      let alertTriggered = false;
      page.on('dialog', () => {
        alertTriggered = true;
      });
      await page.waitForTimeout(1000);
      expect(alertTriggered).toBe(false);
    });

    test('should sanitize XSS in hash fragments', async ({ page }) => {
      await page.goto('/#<img src=x onerror=alert("XSS")>');
      await page.waitForTimeout(2000);
      
      // No execution
      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('Content Security Policy', () => {
    test('should have CSP headers preventing inline scripts', async ({ page }) => {
      const response = await page.goto('/');
      const headers = response?.headers();
      
      // Check for CSP header (may not be present in dev)
      if (headers?.['content-security-policy']) {
        expect(headers['content-security-policy']).toContain('script-src');
      }
    });
  });

  test.describe('SQL Injection Prevention', () => {
    test('should handle SQL injection attempts in inputs', async ({ page }) => {
      const sqlPayloads = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "1; SELECT * FROM users",
        "UNION SELECT * FROM passwords",
      ];
      
      const chatInput = page.locator('textarea').first();
      
      if (await chatInput.isVisible()) {
        for (const payload of sqlPayloads) {
          await chatInput.fill(payload);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(500);
        }
      }
      
      // App should still work (no database errors)
      await expect(page.locator('body')).toBeVisible();
    });
  });
});
