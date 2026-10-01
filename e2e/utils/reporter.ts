import { Page, TestInfo } from '@playwright/test';

interface TestResult {
  testSuite: string;
  testName: string;
  status: 'passed' | 'failed' | 'skipped' | 'flaky';
  durationMs: number;
  errorMessage?: string;
  browser: string;
  viewport?: string;
  retryCount: number;
}

interface StressMetric {
  testName: string;
  concurrentUsers: number;
  requestsPerSecond: number;
  avgResponseTimeMs: number;
  p50ResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;
  errorRate: number;
  successCount: number;
  failureCount: number;
}

const SUPABASE_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw';

let currentRunId: string | null = null;

/**
 * Initialize a new test run
 */
export async function initTestRun(runName: string, environment = 'production'): Promise<string> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/test_runs`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      run_name: runName,
      environment,
      triggered_by: 'playwright',
    }),
  });

  if (!response.ok) {
    console.error('Failed to init test run:', await response.text());
    currentRunId = crypto.randomUUID();
    return currentRunId;
  }

  const data = await response.json();
  currentRunId = data[0]?.id || crypto.randomUUID();
  return currentRunId;
}

/**
 * Report a test result to Supabase
 */
export async function reportTestResult(result: TestResult): Promise<void> {
  if (!currentRunId) {
    currentRunId = crypto.randomUUID();
  }

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/test_results`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        run_id: currentRunId,
        test_suite: result.testSuite,
        test_name: result.testName,
        status: result.status,
        duration_ms: result.durationMs,
        error_message: result.errorMessage,
        browser: result.browser,
        viewport: result.viewport,
        retry_count: result.retryCount,
      }),
    });
  } catch (error) {
    console.error('Failed to report test result:', error);
  }
}

/**
 * Report stress test metrics
 */
export async function reportStressMetric(metric: StressMetric): Promise<void> {
  if (!currentRunId) {
    currentRunId = crypto.randomUUID();
  }

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/stress_test_metrics`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        run_id: currentRunId,
        test_name: metric.testName,
        concurrent_users: metric.concurrentUsers,
        requests_per_second: metric.requestsPerSecond,
        avg_response_time_ms: metric.avgResponseTimeMs,
        p50_response_time_ms: metric.p50ResponseTimeMs,
        p95_response_time_ms: metric.p95ResponseTimeMs,
        p99_response_time_ms: metric.p99ResponseTimeMs,
        error_rate: metric.errorRate,
        success_count: metric.successCount,
        failure_count: metric.failureCount,
      }),
    });
  } catch (error) {
    console.error('Failed to report stress metric:', error);
  }
}

/**
 * Finalize test run with summary
 */
export async function finalizeTestRun(summary: {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  durationMs: number;
}): Promise<void> {
  if (!currentRunId) return;

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/test_runs?id=eq.${currentRunId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        total_tests: summary.totalTests,
        passed_tests: summary.passedTests,
        failed_tests: summary.failedTests,
        skipped_tests: summary.skippedTests,
        duration_ms: summary.durationMs,
        completed_at: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error('Failed to finalize test run:', error);
  }
}

/**
 * Create a reporter function for Playwright
 */
export function createPlaywrightReporter() {
  return {
    onTestEnd: async (test: any, result: any) => {
      await reportTestResult({
        testSuite: test.parent?.title || 'Unknown',
        testName: test.title,
        status: result.status as TestResult['status'],
        durationMs: result.duration,
        errorMessage: result.error?.message,
        browser: test.parent?.project?.name || 'unknown',
        retryCount: result.retry,
      });
    },
  };
}

/**
 * Generate HTML report from results
 */
export function generateHTMLReport(results: TestResult[], metrics: StressMetric[]): string {
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const total = results.length;
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0';

  return `
<!DOCTYPE html>
<html>
<head>
  <title>AYN Test Report</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; background: #0a0a0b; color: #fff; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem; }
    .card { background: #1a1a1b; padding: 1.5rem; border-radius: 0.5rem; }
    .card h3 { margin: 0 0 0.5rem; color: #888; font-size: 0.875rem; }
    .card .value { font-size: 2rem; font-weight: bold; }
    .passed { color: #22c55e; }
    .failed { color: #ef4444; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #333; }
    th { color: #888; }
    .status-passed { color: #22c55e; }
    .status-failed { color: #ef4444; }
  </style>
</head>
<body>
  <h1>AYN Platform Test Report</h1>
  <p>Generated: ${new Date().toLocaleString()}</p>
  
  <div class="summary">
    <div class="card">
      <h3>Pass Rate</h3>
      <div class="value passed">${passRate}%</div>
    </div>
    <div class="card">
      <h3>Total Tests</h3>
      <div class="value">${total}</div>
    </div>
    <div class="card">
      <h3>Passed</h3>
      <div class="value passed">${passed}</div>
    </div>
    <div class="card">
      <h3>Failed</h3>
      <div class="value failed">${failed}</div>
    </div>
  </div>

  <h2>Test Results</h2>
  <table>
    <thead>
      <tr>
        <th>Suite</th>
        <th>Test</th>
        <th>Status</th>
        <th>Duration</th>
        <th>Browser</th>
      </tr>
    </thead>
    <tbody>
      ${results.map(r => `
        <tr>
          <td>${r.testSuite}</td>
          <td>${r.testName}</td>
          <td class="status-${r.status}">${r.status}</td>
          <td>${r.durationMs}ms</td>
          <td>${r.browser}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  ${metrics.length > 0 ? `
  <h2>Stress Test Metrics</h2>
  <table>
    <thead>
      <tr>
        <th>Test</th>
        <th>Users</th>
        <th>Avg Response</th>
        <th>P95</th>
        <th>Error Rate</th>
      </tr>
    </thead>
    <tbody>
      ${metrics.map(m => `
        <tr>
          <td>${m.testName}</td>
          <td>${m.concurrentUsers}</td>
          <td>${m.avgResponseTimeMs}ms</td>
          <td>${m.p95ResponseTimeMs}ms</td>
          <td>${(m.errorRate * 100).toFixed(1)}%</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}
</body>
</html>
  `;
}
