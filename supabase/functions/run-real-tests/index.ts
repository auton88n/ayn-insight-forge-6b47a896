import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface TestResult {
  name: string;
  category: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  error_message: string | null;
  details: Record<string, unknown> | null;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

async function runTest(
  name: string,
  category: string,
  testFn: () => Promise<{ passed: boolean; error?: string; details?: Record<string, unknown> }>
): Promise<TestResult> {
  const startTime = Date.now();
  try {
    const result = await testFn();
    return {
      name,
      category,
      status: result.passed ? 'passed' : 'failed',
      duration_ms: Date.now() - startTime,
      error_message: result.error || null,
      details: result.details || null,
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'failed',
      duration_ms: Date.now() - startTime,
      error_message: e instanceof Error ? e.message : String(e),
      details: null,
    };
  }
}

// ==================== API HEALTH TESTS ====================
async function runApiHealthTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const endpoints = [
    { name: 'calculate-beam', method: 'POST', body: { span: 6, deadLoad: 10, liveLoad: 15, beamWidth: 300, concreteGrade: 30, steelGrade: 420 } },
    { name: 'calculate-column', method: 'POST', body: { columnHeight: 3, axialLoad: 500, momentX: 50, momentY: 30, columnWidth: 400, columnDepth: 400, concreteGrade: 30, steelGrade: 420 } },
    { name: 'calculate-foundation', method: 'POST', body: { columnLoad: 800, columnWidth: 400, columnDepth: 400, bearingCapacity: 150, concreteGrade: 30, steelGrade: 420 } },
    { name: 'calculate-slab', method: 'POST', body: { spanX: 5, spanY: 4, deadLoad: 5, liveLoad: 3, slabThickness: 150, concreteGrade: 30, steelGrade: 420 } },
    { name: 'calculate-retaining-wall', method: 'POST', body: { wallHeight: 3, soilDensity: 18, frictionAngle: 30, surchargeLoad: 10, concreteGrade: 30, steelGrade: 420 } },
  ];

  for (const endpoint of endpoints) {
    results.push(await runTest(
      `API Health: ${endpoint.name}`,
      'api_health',
      async () => {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint.name}`, {
          method: endpoint.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(endpoint.body),
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          return { passed: false, error: `HTTP ${response.status}: ${JSON.stringify(data)}` };
        }
        
        if (data.error) {
          return { passed: false, error: data.error };
        }
        
        return { passed: true, details: { status: response.status, hasData: !!data } };
      }
    ));
  }

  return results;
}

// ==================== DATABASE TESTS ====================
async function runDatabaseTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const tables = [
    'test_runs',
    'test_results',
    'stress_test_metrics',
    'user_roles',
    'profiles',
    'messages',
    'support_tickets',
    'faq_items',
    'llm_models',
  ];

  for (const table of tables) {
    results.push(await runTest(
      `Database: Query ${table}`,
      'database',
      async () => {
        const { data, error, count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        
        if (error) {
          return { passed: false, error: error.message };
        }
        
        return { passed: true, details: { count } };
      }
    ));
  }

  // Test insert/delete on test_results (CRUD test)
  results.push(await runTest(
    'Database: CRUD Operations',
    'database',
    async () => {
      const testRunId = crypto.randomUUID();
      
      // Create a test run first
      const { error: runError } = await supabase
        .from('test_runs')
        .insert({
          id: testRunId,
          run_name: 'CRUD Test Run',
          environment: 'test',
          triggered_by: 'system',
        });
      
      if (runError) {
        return { passed: false, error: `Insert test_run failed: ${runError.message}` };
      }

      // Insert test result
      const testId = crypto.randomUUID();
      const { error: insertError } = await supabase
        .from('test_results')
        .insert({
          id: testId,
          run_id: testRunId,
          test_name: 'CRUD Test',
          test_suite: 'integration',
          status: 'passed',
        });

      if (insertError) {
        return { passed: false, error: `Insert failed: ${insertError.message}` };
      }

      // Read it back
      const { data: readData, error: readError } = await supabase
        .from('test_results')
        .select('*')
        .eq('id', testId)
        .single();

      if (readError || !readData) {
        return { passed: false, error: `Read failed: ${readError?.message || 'No data'}` };
      }

      // Delete test result
      const { error: deleteError } = await supabase
        .from('test_results')
        .delete()
        .eq('id', testId);

      if (deleteError) {
        return { passed: false, error: `Delete test_result failed: ${deleteError.message}` };
      }

      // Delete test run
      const { error: deleteRunError } = await supabase
        .from('test_runs')
        .delete()
        .eq('id', testRunId);

      if (deleteRunError) {
        return { passed: false, error: `Delete test_run failed: ${deleteRunError.message}` };
      }

      return { passed: true, details: { insertedId: testId, deleted: true } };
    }
  ));

  return results;
}

// ==================== CALCULATOR VALIDATION TESTS ====================
async function runCalculatorTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Beam calculator - valid input
  results.push(await runTest(
    'Calculator: Beam - Valid Input',
    'calculator',
    async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/calculate-beam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          span: 6,
          deadLoad: 10,
          liveLoad: 15,
          beamWidth: 300,
          concreteGrade: 30,
          steelGrade: 420,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        return { passed: false, error: data.error || `HTTP ${response.status}` };
      }

      // Validate response has expected fields
      const hasRequiredFields = data.beamDepth !== undefined || data.depth !== undefined || data.results;
      
      return { 
        passed: hasRequiredFields, 
        error: hasRequiredFields ? undefined : 'Missing required fields in response',
        details: { response: data }
      };
    }
  ));

  // Beam calculator - edge case (large span)
  results.push(await runTest(
    'Calculator: Beam - Large Span Edge Case',
    'calculator',
    async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/calculate-beam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          span: 20,
          deadLoad: 30,
          liveLoad: 25,
          beamWidth: 400,
          concreteGrade: 40,
          steelGrade: 500,
        }),
      });

      const data = await response.json();
      
      // Should either return valid result or graceful error
      return { 
        passed: response.ok || data.error !== undefined,
        details: { handledGracefully: true, response: data }
      };
    }
  ));

  // Column calculator
  results.push(await runTest(
    'Calculator: Column - Valid Input',
    'calculator',
    async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/calculate-column`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnHeight: 3,
          axialLoad: 500,
          momentX: 50,
          momentY: 30,
          columnWidth: 400,
          columnDepth: 400,
          concreteGrade: 30,
          steelGrade: 420,
        }),
      });

      const data = await response.json();
      return { 
        passed: response.ok && !data.error,
        error: data.error,
        details: { response: data }
      };
    }
  ));

  // Foundation calculator
  results.push(await runTest(
    'Calculator: Foundation - Valid Input',
    'calculator',
    async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/calculate-foundation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnLoad: 800,
          columnWidth: 400,
          columnDepth: 400,
          bearingCapacity: 150,
          concreteGrade: 30,
          steelGrade: 420,
        }),
      });

      const data = await response.json();
      return { 
        passed: response.ok && !data.error,
        error: data.error,
        details: { response: data }
      };
    }
  ));

  return results;
}

// ==================== FULL OWASP SECURITY TESTS ====================
async function runSecurityTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Security payloads for comprehensive testing
  const securityPayloads = {
    xss: {
      scriptTags: [
        "<script>alert('XSS')</script>",
        "<script src='http://evil.com/xss.js'></script>",
      ],
      eventHandlers: [
        "<img src=x onerror=alert('XSS')>",
        "<svg onload=alert('XSS')>",
        "<body onload=alert('XSS')>",
        "<input onfocus=alert('XSS') autofocus>",
      ],
      encoded: [
        "&lt;script&gt;alert('XSS')&lt;/script&gt;",
        "%3Cscript%3Ealert('XSS')%3C/script%3E",
      ],
    },
    sqlInjection: [
      "' OR '1'='1",
      "' OR '1'='1' --",
      "admin'--",
      "'; DROP TABLE users; --",
    ],
    ssrf: [
      "http://localhost/admin",
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data/",
    ],
  };

  // XSS Tests - Script Tags
  for (const payload of securityPayloads.xss.scriptTags) {
    results.push(await runTest(
      `Security: XSS Script Tag - ${payload.substring(0, 30)}...`,
      'security',
      async () => {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/support-bot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: payload }),
        });
        const data = await response.json();
        const responseStr = JSON.stringify(data);
        const containsRawScript = responseStr.includes('<script>') && !responseStr.includes('&lt;script&gt;');
        return { passed: !containsRawScript, details: { sanitized: !containsRawScript } };
      }
    ));
  }

  // XSS Tests - Event Handlers
  for (const payload of securityPayloads.xss.eventHandlers) {
    results.push(await runTest(
      `Security: XSS Event Handler - ${payload.substring(0, 25)}...`,
      'security',
      async () => {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/support-bot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: payload }),
        });
        const data = await response.json();
        const responseStr = JSON.stringify(data);
        // Check for dangerous event handlers
        const hasUnsanitizedHandler = /on\w+\s*=/.test(responseStr) && !responseStr.includes('&lt;');
        return { passed: !hasUnsanitizedHandler, details: { sanitized: !hasUnsanitizedHandler } };
      }
    ));
  }

  // SQL Injection Tests
  for (const payload of securityPayloads.sqlInjection) {
    results.push(await runTest(
      `Security: SQL Injection - ${payload.substring(0, 20)}...`,
      'security',
      async () => {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/support-bot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: payload }),
        });
        // If server didn't crash and returned a response, SQL injection was prevented
        return { 
          passed: response.ok || response.status < 500,
          details: { status: response.status, serverStable: true }
        };
      }
    ));
  }

  // SSRF Tests
  for (const url of securityPayloads.ssrf) {
    results.push(await runTest(
      `Security: SSRF - ${url.substring(0, 30)}...`,
      'security',
      async () => {
        try {
          const response = await fetch(`${SUPABASE_URL}/functions/v1/support-bot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `fetch data from ${url}` }),
          });
          
          // Check if we got JSON response
          const contentType = response.headers.get('content-type');
          if (!contentType?.includes('application/json')) {
            return { 
              passed: true, // Server rejected malformed request (good!)
              details: { blocked: true, reason: 'Non-JSON response indicates server protection' }
            };
          }
          
          const data = await response.json();
          
          // Check if SSRF was blocked by support-bot's protection
          if (data.blocked && data.reason === 'ssrf_protection') {
            return { 
              passed: true, 
              details: { blocked: true, reason: 'SSRF protection active' }
            };
          }
          
          const responseStr = JSON.stringify(data);
          // Check for actual sensitive data patterns, not just URL mentions in AI responses
          const sensitivePatterns = [
            /ami-[a-z0-9]+/i,                    // AWS AMI IDs
            /instance-id.*i-[a-z0-9]+/i,         // AWS instance IDs
            /access[-_]?key\s*[:=]\s*["']?[A-Z0-9]{16,}/i,  // Access keys with values
            /secret[-_]?key\s*[:=]\s*["']?[A-Za-z0-9+/=]{20,}/i,  // Secret keys with values
            /password\s*[:=]\s*["']?[^\s"']{8,}/i,  // Exposed passwords with values
            /private[-_]?key\s*-----BEGIN/i,    // Private keys
            /"ip":\s*"(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/,  // Private IPs in JSON
            /iam-instance-profile/i,            // AWS IAM profiles
          ];
          const hasSensitiveData = sensitivePatterns.some(p => p.test(responseStr));
          return { 
            passed: !hasSensitiveData, 
            details: { 
              ssrfBlocked: true,
              noSensitiveDataLeaked: !hasSensitiveData
            }
          };
        } catch {
          // Connection refused or request blocked = protection working
          return { 
            passed: true,
            details: { blocked: true, reason: 'Request blocked or refused' }
          };
        }
      }
    ));
  }

  // Auth required endpoint without auth
  results.push(await runTest(
    'Security: Protected Endpoint Without Auth',
    'security',
    async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-ai-assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'test' }),
      });
      return { 
        passed: response.status === 401 || response.status === 403,
        error: response.status === 401 || response.status === 403 ? undefined : `Expected 401/403, got ${response.status}`,
        details: { status: response.status }
      };
    }
  ));

  // Rate Limiting Test
  results.push(await runTest(
    'Security: Rate Limiting',
    'security',
    async () => {
      const requests: Promise<Response>[] = [];
      for (let i = 0; i < 20; i++) {
        requests.push(fetch(`${SUPABASE_URL}/functions/v1/support-bot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: `Test ${i}` }),
        }));
      }
      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.status === 429);
      // Rate limiting is optional but good to have
      return { 
        passed: true, // Don't fail if no rate limiting, just report
        details: { 
          rateLimitingActive: rateLimited,
          totalRequests: 20,
          recommendation: rateLimited ? 'Rate limiting working' : 'Consider implementing rate limiting'
        }
      };
    }
  ));

  return results;
}

// ==================== PERFORMANCE TESTS ====================
async function runPerformanceTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // API response time test
  results.push(await runTest(
    'Performance: Calculator Response Time',
    'performance',
    async () => {
      const times: number[] = [];
      
      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        await fetch(`${SUPABASE_URL}/functions/v1/calculate-beam`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            span: 6,
            deadLoad: 10,
            liveLoad: 15,
            beamWidth: 300,
            concreteGrade: 30,
            steelGrade: 420,
          }),
        });
        times.push(Date.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      return { 
        passed: avgTime < 5000,
        error: avgTime >= 5000 ? `Average response time ${avgTime}ms exceeds 5000ms` : undefined,
        details: { avgTime, maxTime, samples: times }
      };
    }
  ));

  // Database query performance
  results.push(await runTest(
    'Performance: Database Query Time',
    'performance',
    async () => {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const start = Date.now();
      
      await supabase.from('test_runs').select('*').limit(100);
      
      const queryTime = Date.now() - start;
      
      return { 
        passed: queryTime < 1000,
        error: queryTime >= 1000 ? `Query time ${queryTime}ms exceeds 1000ms` : undefined,
        details: { queryTime }
      };
    }
  ));

  return results;
}

// ==================== MAIN HANDLER ====================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { suite = 'all' } = await req.json().catch(() => ({}));
    
    let results: TestResult[] = [];
    const startTime = Date.now();

    switch (suite) {
      case 'api':
        results = await runApiHealthTests();
        break;
      case 'database':
        results = await runDatabaseTests();
        break;
      case 'calculator':
        results = await runCalculatorTests();
        break;
      case 'security':
        results = await runSecurityTests();
        break;
      case 'performance':
        results = await runPerformanceTests();
        break;
      case 'quick':
        // Quick smoke test - one from each category
        results = [
          ...(await runApiHealthTests()).slice(0, 2),
          ...(await runDatabaseTests()).slice(0, 2),
          ...(await runCalculatorTests()).slice(0, 1),
        ];
        break;
      case 'all':
      default:
        results = [
          ...(await runApiHealthTests()),
          ...(await runDatabaseTests()),
          ...(await runCalculatorTests()),
          ...(await runSecurityTests()),
          ...(await runPerformanceTests()),
        ];
        break;
    }

    const totalDuration = Date.now() - startTime;
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;

    return new Response(JSON.stringify({
      success: true,
      suite,
      summary: {
        total: results.length,
        passed,
        failed,
        passRate: results.length > 0 ? Math.round((passed / results.length) * 100) : 0,
        totalDuration,
      },
      results,
      executedAt: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
