import { Page, BrowserContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface TestUser {
  email: string;
  password: string;
  fullName?: string;
}

export const TEST_USERS = {
  standard: {
    email: 'test-user@aynn.io',
    password: 'TestPassword123!',
    fullName: 'Test User',
  },
  admin: {
    email: 'test-admin@aynn.io',
    password: 'AdminPassword123!',
    fullName: 'Test Admin',
  },
  stress: (index: number): TestUser => ({
    email: `stress-user-${index}@test.aynn.io`,
    password: 'StressTest123!',
    fullName: `Stress User ${index}`,
  }),
};

/**
 * Login via Supabase and inject session into browser
 */
export async function loginAsTestUser(
  page: Page,
  user: TestUser = TEST_USERS.standard
): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });

    if (error || !data.session) {
      console.error('Login failed:', error?.message);
      return false;
    }

    // Inject session into browser localStorage
    await page.addInitScript(
      (session) => {
        localStorage.setItem(
          'sb-dfkoxuokfkttjhfjcecx-auth-token',
          JSON.stringify(session)
        );
      },
      data.session
    );

    return true;
  } catch (err) {
    console.error('Auth helper error:', err);
    return false;
  }
}

/**
 * Login via UI (for testing auth flow itself)
 */
export async function loginViaUI(
  page: Page,
  user: TestUser = TEST_USERS.standard
): Promise<void> {
  await page.goto('/');
  
  // Click the sign in button
  await page.click('button:has-text("Sign In")');
  
  // Wait for auth modal
  await page.waitForSelector('[role="dialog"]');
  
  // Fill credentials
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  
  // Submit
  await page.click('button[type="submit"]:has-text("Sign In")');
  
  // Wait for navigation to dashboard
  await page.waitForURL('/', { timeout: 15000 });
}

/**
 * Logout current user
 */
export async function logout(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('sb-dfkoxuokfkttjhfjcecx-auth-token');
  });
  await page.reload();
}

/**
 * Check if user is currently logged in
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  const session = await page.evaluate(() => {
    return localStorage.getItem('sb-dfkoxuokfkttjhfjcecx-auth-token');
  });
  return session !== null;
}

/**
 * Create a test user if not exists
 */
export async function ensureTestUserExists(user: TestUser): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email: user.email,
    password: user.password,
    options: {
      data: {
        full_name: user.fullName,
      },
    },
  });

  // Ignore "already exists" errors
  if (error && !error.message.includes('already')) {
    console.warn('Failed to create test user:', error.message);
  }
}

/**
 * Clean up test user session
 */
export async function cleanupSession(context: BrowserContext): Promise<void> {
  await context.clearCookies();
  const pages = context.pages();
  for (const page of pages) {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  }
}
