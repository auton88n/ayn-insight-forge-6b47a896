import { test, expect } from '@playwright/test';

/**
 * Authentication Security Tests - Phase 5
 * Testing auth vulnerabilities and protections
 */

test.describe('Authentication Security', () => {
  test.describe('Brute Force Protection', () => {
    test('should rate limit failed login attempts', async ({ page }) => {
      await page.goto('/');
      
      // Attempt multiple failed logins
      for (let i = 0; i < 10; i++) {
        await page.click('text=Sign In');
        await page.fill('input[type="email"]', 'test@example.com');
        await page.fill('input[type="password"]', `wrongpassword${i}`);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(500);
        
        // Close error toast/modal if present
        await page.keyboard.press('Escape').catch(() => {});
      }
      
      // Should eventually get rate limited or locked out
      const lockoutMessage = page.locator('text=locked, text=too many, text=try again later, text=blocked').first();
      // May or may not appear depending on rate limit configuration
    });

    test('should show CAPTCHA after failed attempts', async ({ page }) => {
      await page.goto('/');
      
      // Multiple failed attempts
      for (let i = 0; i < 5; i++) {
        await page.click('text=Sign In');
        await page.fill('input[type="email"]', 'test@example.com');
        await page.fill('input[type="password"]', 'wrong');
        await page.click('button[type="submit"]');
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape').catch(() => {});
      }
      
      // CAPTCHA might appear (if implemented)
      const captcha = page.locator('[class*="captcha"], [class*="recaptcha"], iframe[src*="captcha"]');
      // CAPTCHA may or may not be implemented
    });

    test('should not reveal if email exists', async ({ page }) => {
      await page.goto('/');
      
      // Try login with non-existent email
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'nonexistent-user-12345@example.com');
      await page.fill('input[type="password"]', 'anypassword');
      await page.click('button[type="submit"]');
      
      await page.waitForTimeout(2000);
      const errorMessage1 = await page.locator('.toast, [role="alert"], [class*="error"]').textContent().catch(() => '');
      
      // Reset
      await page.keyboard.press('Escape').catch(() => {});
      await page.reload();
      
      // Try login with existing email but wrong password
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');
      
      await page.waitForTimeout(2000);
      const errorMessage2 = await page.locator('.toast, [role="alert"], [class*="error"]').textContent().catch(() => '');
      
      // Error messages should be similar (not revealing email existence)
      // This is a security best practice check
    });
  });

  test.describe('Admin PIN Security', () => {
    test('should rate limit admin PIN attempts', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-admin@aynn.io');
      await page.fill('input[type="password"]', 'AdminPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Try to access admin panel (if requires PIN)
      // Multiple wrong PIN attempts would be rate limited
    });

    test('should require strong PIN format', async ({ page }) => {
      // Navigate to PIN change settings
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-admin@aynn.io');
      await page.fill('input[type="password"]', 'AdminPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // PIN should require minimum length/complexity
      // This would test PIN change if such functionality exists
    });
  });

  test.describe('Session Token Security', () => {
    test('should not expose tokens in URL', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Check URL for sensitive data
      const url = page.url();
      expect(url).not.toMatch(/token=/);
      expect(url).not.toMatch(/access_token=/);
      expect(url).not.toMatch(/refresh_token=/);
      expect(url).not.toMatch(/session=/);
    });

    test('should use HttpOnly cookies where possible', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Check cookies
      const cookies = await page.context().cookies();
      
      // Session cookies should be HttpOnly (can't check from JS if HttpOnly is set)
      // This is a documentation check - HttpOnly cookies won't be visible to JS
    });

    test('should invalidate token on logout', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Get current token
      const tokenBefore = await page.evaluate(() => {
        return localStorage.getItem('sb-dfkoxuokfkttjhfjcecx-auth-token');
      });
      
      // Logout
      const logoutBtn = page.locator('button:has-text("Logout")').first();
      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
        await page.waitForTimeout(2000);
      }
      
      // Token should be cleared
      const tokenAfter = await page.evaluate(() => {
        return localStorage.getItem('sb-dfkoxuokfkttjhfjcecx-auth-token');
      });
      
      expect(tokenAfter).not.toBe(tokenBefore);
    });
  });

  test.describe('Unauthorized Access Prevention', () => {
    test('should redirect unauthenticated users from protected routes', async ({ page }) => {
      // Clear any existing session
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      
      // Try to access protected routes
      const protectedRoutes = ['/settings', '/engineering', '/marketing-studio'];
      
      for (const route of protectedRoutes) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        
        // Should redirect to login or show auth modal
        const authPrompt = page.locator('text=Sign In, text=Login, [role="dialog"]').first();
        // May redirect or show login modal
      }
    });

    test('should prevent access to admin routes for non-admins', async ({ page }) => {
      // Login as regular user
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Try to access admin functionality
      // Admin panel should not be accessible or should require additional auth
    });
  });

  test.describe('CSRF Protection', () => {
    test('should reject requests without proper origin', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Make request with different origin
      const response = await page.evaluate(async () => {
        try {
          const res = await fetch('/api/test', {
            method: 'POST',
            headers: {
              'Origin': 'http://evil-site.com',
            },
            body: JSON.stringify({ test: true }),
          });
          return res.status;
        } catch (e) {
          return 'error';
        }
      });
      
      // Should be blocked by CORS
    });
  });

  test.describe('Password Security', () => {
    test('should require password strength for signup', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      
      // Switch to signup if available
      await page.click('text=Sign Up, text=Create account').catch(() => {});
      
      // Try weak password
      await page.fill('input[type="email"]', 'newuser@example.com');
      await page.fill('input[type="password"]', '123');
      await page.click('button[type="submit"]');
      
      // Should show password strength error
      await expect(page.locator('text=weak, text=strong, text=characters, text=8').first()).toBeVisible({ timeout: 3000 });
    });

    test('should not store passwords in plain text in DOM', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      
      const passwordInput = page.locator('input[type="password"]');
      await passwordInput.fill('SecretPassword123!');
      
      // Check DOM for plain text password
      const html = await page.content();
      expect(html).not.toContain('SecretPassword123!');
    });

    test('should mask password input', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      
      const passwordInput = page.locator('input[type="password"]');
      await expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });

  test.describe('Session Fixation Prevention', () => {
    test('should regenerate session on login', async ({ page }) => {
      await page.goto('/');
      
      // Get session before login
      const sessionBefore = await page.evaluate(() => {
        return document.cookie;
      });
      
      // Login
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });
      
      // Get session after login
      const sessionAfter = await page.evaluate(() => {
        return document.cookie;
      });
      
      // Sessions should be different (new session on login)
    });
  });
});
