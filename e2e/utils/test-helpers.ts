import { Page, expect } from '@playwright/test';

/**
 * Wait for AI response in chat
 */
export async function waitForAIResponse(page: Page, timeout = 30000): Promise<string> {
  // Wait for typing indicator to appear and disappear
  await page.waitForSelector('[data-testid="typing-indicator"]', { state: 'visible', timeout: 5000 }).catch(() => {});
  await page.waitForSelector('[data-testid="typing-indicator"]', { state: 'hidden', timeout });
  
  // Get the last AI message
  const messages = await page.locator('[data-testid="ai-message"]').all();
  if (messages.length === 0) {
    throw new Error('No AI response received');
  }
  
  return await messages[messages.length - 1].textContent() || '';
}

/**
 * Send a chat message
 */
export async function sendChatMessage(page: Page, message: string): Promise<void> {
  const textarea = page.locator('textarea[placeholder*="Message"]').or(
    page.locator('textarea[placeholder*="رسالة"]')
  );
  await textarea.fill(message);
  await page.click('button[type="submit"]').catch(() => {
    // Fallback: press Enter
    textarea.press('Enter');
  });
}

/**
 * Navigate to engineering workspace
 */
export async function navigateToEngineering(page: Page): Promise<void> {
  await page.goto('/engineering');
  await page.waitForLoadState('networkidle');
}

/**
 * Select a calculator in engineering workspace
 */
export async function selectCalculator(
  page: Page,
  calculatorType: 'beam' | 'column' | 'foundation' | 'slab' | 'retaining_wall' | 'parking' | 'grading'
): Promise<void> {
  const calculatorMap: Record<string, string> = {
    beam: 'Beam',
    column: 'Column',
    foundation: 'Foundation',
    slab: 'Slab',
    retaining_wall: 'Retaining Wall',
    parking: 'Parking',
    grading: 'Grading',
  };
  
  await page.click(`button:has-text("${calculatorMap[calculatorType]}")`);
  await page.waitForTimeout(500); // Allow animation
}

/**
 * Fill calculator inputs
 */
export async function fillCalculatorInputs(
  page: Page,
  inputs: Record<string, string | number>
): Promise<void> {
  for (const [name, value] of Object.entries(inputs)) {
    const input = page.locator(`input[name="${name}"]`).or(
      page.locator(`input[id="${name}"]`)
    );
    
    if (await input.count() > 0) {
      await input.clear();
      await input.fill(String(value));
    }
  }
}

/**
 * Click calculate button and wait for results
 */
export async function triggerCalculation(page: Page): Promise<void> {
  await page.click('button:has-text("Calculate")');
  
  // Wait for loading to finish
  await page.waitForSelector('button:has-text("Calculate"):not([disabled])', { timeout: 30000 });
}

/**
 * Measure performance of an action
 */
export async function measurePerformance<T>(
  action: () => Promise<T>,
  label: string
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await action();
  const durationMs = performance.now() - start;
  
  console.log(`[PERF] ${label}: ${durationMs.toFixed(2)}ms`);
  
  return { result, durationMs };
}

/**
 * Take screenshot with timestamp
 */
export async function takeTimestampedScreenshot(
  page: Page,
  name: string
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({
    path: `test-results/screenshots/${name}-${timestamp}.png`,
    fullPage: true,
  });
}

/**
 * Wait for network to be idle
 */
export async function waitForNetworkIdle(page: Page, timeout = 5000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Check if element is visible with retry
 */
export async function isElementVisible(
  page: Page,
  selector: string,
  timeout = 5000
): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all console errors from page
 */
export async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  return errors;
}

/**
 * Generate random test data
 */
export function generateTestData() {
  return {
    beamInputs: {
      span: 4 + Math.random() * 8,
      deadLoad: 10 + Math.random() * 20,
      liveLoad: 5 + Math.random() * 15,
      beamWidth: 250 + Math.floor(Math.random() * 150),
    },
    columnInputs: {
      axialLoad: 500 + Math.random() * 2000,
      momentX: 50 + Math.random() * 200,
      momentY: 30 + Math.random() * 150,
      width: 300 + Math.floor(Math.random() * 200),
      depth: 300 + Math.floor(Math.random() * 200),
      height: 3000 + Math.floor(Math.random() * 2000),
    },
    foundationInputs: {
      columnLoad: 500 + Math.random() * 2000,
      momentX: 50 + Math.random() * 200,
      momentY: 30 + Math.random() * 150,
      soilBearing: 100 + Math.random() * 200,
    },
    slabInputs: {
      length: 4 + Math.random() * 4,
      width: 3 + Math.random() * 3,
      deadLoad: 5 + Math.random() * 10,
      liveLoad: 2 + Math.random() * 8,
    },
    chatMessages: [
      'Hello, how can you help me?',
      'What is a simply supported beam?',
      'Calculate the maximum moment for a 6m span beam with 20 kN/m load',
      'Explain reinforcement detailing for columns',
      'What are the ACI 318 requirements for minimum steel ratio?',
    ],
  };
}

/**
 * Stress test helper - run action multiple times
 */
export async function runStressTest(
  action: () => Promise<void>,
  iterations: number,
  label: string
): Promise<{ successCount: number; failCount: number; avgDurationMs: number }> {
  let successCount = 0;
  let failCount = 0;
  let totalDuration = 0;
  
  for (let i = 0; i < iterations; i++) {
    try {
      const start = performance.now();
      await action();
      totalDuration += performance.now() - start;
      successCount++;
    } catch (err) {
      failCount++;
      console.error(`[STRESS] ${label} iteration ${i + 1} failed:`, err);
    }
  }
  
  console.log(`[STRESS] ${label}: ${successCount}/${iterations} passed, avg ${(totalDuration / successCount).toFixed(2)}ms`);
  
  return {
    successCount,
    failCount,
    avgDurationMs: totalDuration / successCount,
  };
}
