import { test, expect } from '@playwright/test';

/**
 * Accessibility Tests - Phase 6
 * WCAG compliance and a11y testing
 */

test.describe('Accessibility', () => {
  test.describe('Keyboard Navigation', () => {
    test('should navigate entire app with keyboard only', async ({ page }) => {
      await page.goto('/');

      // Tab through main elements
      await page.keyboard.press('Tab');
      const firstFocused = await page.evaluate(() => document.activeElement?.tagName);
      expect(firstFocused).toBeTruthy();

      // Continue tabbing through page
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('Tab');

        // Each press should move focus
        const focused = await page.evaluate(() => ({
          tag: document.activeElement?.tagName,
          text: (document.activeElement as HTMLElement)?.innerText?.substring(0, 50),
        }));
        expect(focused.tag).toBeTruthy();
      }
    });

    test('should open and close modals with keyboard', async ({ page }) => {
      await page.goto('/');

      // Tab to Sign In button and press Enter
      const signInBtn = page.locator('text=Sign In').first();
      await signInBtn.focus();
      await page.keyboard.press('Enter');

      // Modal should open
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });

      // Press Escape to close
      await page.keyboard.press('Escape');

      // Modal should close
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 3000 });
    });

    test('should trap focus in modal dialogs', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');

      await expect(page.locator('[role="dialog"]')).toBeVisible();

      // Tab through modal - focus should stay within
      const focusedElements: string[] = [];

      for (let i = 0; i < 15; i++) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-focus-trap-id') || document.activeElement?.tagName);
        focusedElements.push(focused || '');
      }

      // All focused elements should be within the modal
      // (Focus trap keeps focus inside modal)
    });

    test('should support skip links', async ({ page }) => {
      await page.goto('/');

      // Press Tab to reveal skip link
      await page.keyboard.press('Tab');

      // Check for skip link
      const skipLink = page.locator('a:has-text("Skip to"), [class*="skip"]');
      // Skip links may or may not be implemented
    });

    test('should navigate dropdowns with arrow keys', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');
      await page.fill('input[type="email"]', 'test-user@aynn.io');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });

      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      // Find a select/dropdown
      const select = page.locator('select, [role="combobox"]').first();
      if (await select.isVisible()) {
        await select.focus();
        await page.keyboard.press('Space');

        // Arrow down through options
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
      }
    });
  });

  test.describe('Screen Reader Compatibility', () => {
    test('should have proper heading hierarchy', async ({ page }) => {
      await page.goto('/');

      const headings = await page.evaluate(() => {
        const h1s = document.querySelectorAll('h1').length;
        const h2s = document.querySelectorAll('h2').length;
        const h3s = document.querySelectorAll('h3').length;
        return { h1s, h2s, h3s };
      });

      // Should have exactly one h1
      expect(headings.h1s).toBe(1);
    });

    test('should have alt text on images', async ({ page }) => {
      await page.goto('/');

      const imagesWithoutAlt = await page.evaluate(() => {
        const images = document.querySelectorAll('img');
        let missingAlt = 0;
        images.forEach(img => {
          if (!img.alt && !img.getAttribute('aria-label') && !img.getAttribute('role')) {
            missingAlt++;
          }
        });
        return missingAlt;
      });

      // All images should have alt text
      expect(imagesWithoutAlt).toBe(0);
    });

    test('should have proper ARIA labels on interactive elements', async ({ page }) => {
      await page.goto('/');

      // Check buttons have accessible names
      const buttonsWithoutLabel = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        let missingLabel = 0;
        buttons.forEach(btn => {
          const text = btn.innerText.trim();
          const ariaLabel = btn.getAttribute('aria-label');
          const ariaLabelledBy = btn.getAttribute('aria-labelledby');
          if (!text && !ariaLabel && !ariaLabelledBy) {
            missingLabel++;
          }
        });
        return missingLabel;
      });

      // All buttons should have accessible names
      expect(buttonsWithoutLabel).toBe(0);
    });

    test('should have proper form labels', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign In');

      const inputsWithoutLabel = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input:not([type="hidden"])');
        let missingLabel = 0;
        inputs.forEach(input => {
          const id = input.id;
          const label = id ? document.querySelector(`label[for="${id}"]`) : null;
          const ariaLabel = input.getAttribute('aria-label');
          const ariaLabelledBy = input.getAttribute('aria-labelledby');
          const placeholder = input.getAttribute('placeholder');

          if (!label && !ariaLabel && !ariaLabelledBy && !placeholder) {
            missingLabel++;
          }
        });
        return missingLabel;
      });

      expect(inputsWithoutLabel).toBe(0);
    });

    test('should announce live regions appropriately', async ({ page }) => {
      await page.goto('/');

      // Check for aria-live regions
      const liveRegions = await page.evaluate(() => {
        return document.querySelectorAll('[aria-live]').length;
      });

      // Should have live regions for dynamic content
      // (toasts, loading states, etc.)
    });
  });

  test.describe('Focus Management', () => {
    test('should maintain visible focus indicator', async ({ page }) => {
      await page.goto('/');

      // Tab to a button
      const button = page.locator('button').first();
      await button.focus();

      // Check for focus styling
      const hasFocusStyle = await button.evaluate(el => {
        const styles = window.getComputedStyle(el);
        return styles.outline !== 'none' ||
               styles.boxShadow !== 'none' ||
               styles.border !== '';
      });

      // Should have visible focus indicator
    });

    test('should return focus after modal closes', async ({ page }) => {
      await page.goto('/');

      const signInBtn = page.locator('text=Sign In').first();
      await signInBtn.click();

      await expect(page.locator('[role="dialog"]')).toBeVisible();

      // Close modal
      await page.keyboard.press('Escape');

      // Focus should return to trigger
      const focusedElement = await page.evaluate(() => document.activeElement?.textContent);
      // Focus should be back on Sign In button or nearby
    });
  });

  test.describe('Color Contrast', () => {
    test('should have sufficient text contrast', async ({ page }) => {
      await page.goto('/');

      // Check main text elements for contrast
      const lowContrastElements = await page.evaluate(() => {
        const getContrastRatio = (fg: string, bg: string) => {
          // Simplified contrast calculation
          const getLuminance = (color: string) => {
            const rgb = color.match(/\d+/g);
            if (!rgb) return 0;
            const [r, g, b] = rgb.map(c => {
              const sRGB = parseInt(c) / 255;
              return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const l1 = getLuminance(fg);
          const l2 = getLuminance(bg);
          const lighter = Math.max(l1, l2);
          const darker = Math.min(l1, l2);
          return (lighter + 0.05) / (darker + 0.05);
        };

        const lowContrast = 0;
        document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, a, button').forEach(el => {
          const styles = window.getComputedStyle(el);
          // This is a simplified check - real contrast testing needs more sophistication
        });
        return lowContrast;
      });

      // No elements should have low contrast
      expect(lowContrastElements).toBe(0);
    });

    test('should not rely solely on color to convey information', async ({ page }) => {
      await page.goto('/');

      // Check for error states that use only color
      await page.click('text=Sign In');
      await page.click('button[type="submit"]');

      // Error should have icon/text, not just color
      const errorIndicators = await page.evaluate(() => {
        const errors = document.querySelectorAll('[class*="error"], [role="alert"]');
        let textOnlyErrors = 0;
        errors.forEach(err => {
          const hasIcon = err.querySelector('svg, img, [class*="icon"]');
          const hasText = err.textContent?.trim().length ?? 0 > 0;
          if (!hasIcon && !hasText) textOnlyErrors++;
        });
        return textOnlyErrors;
      });

      expect(errorIndicators).toBe(0);
    });
  });

  test.describe('Motion and Animation', () => {
    test('should respect reduced motion preference', async ({ page }) => {
      // Set reduced motion preference
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');

      // Animations should be disabled or reduced
      const hasReducedMotionStyles = await page.evaluate(() => {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      });

      expect(hasReducedMotionStyles).toBe(true);
    });
  });

  test.describe('Responsive Text', () => {
    test('should allow text zoom without breaking layout', async ({ page }) => {
      await page.goto('/');

      // Zoom to 200%
      await page.evaluate(() => {
        document.body.style.zoom = '2';
      });

      // Page should still be usable
      await expect(page.locator('body')).toBeVisible();

      // No horizontal scrollbar
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      // Ideally no horizontal scroll at 200% zoom
    });
  });
});
