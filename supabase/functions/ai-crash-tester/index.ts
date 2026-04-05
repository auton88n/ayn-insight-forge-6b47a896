import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface TestResult {
  endpoint: string;
  category: string;
  testName: string;
  status: 'pass' | 'fail' | 'skip';
  httpStatus: number;
  responseTime: number;
  error?: string;
  details?: Record<string, unknown>;
}

interface EndpointConfig {
  name: string;
  validPayload: Record<string, unknown>;
}

// All endpoints to test
const ENDPOINTS: EndpointConfig[] = [
  {
    name: 'calculate-beam',
    validPayload: { span: 6, deadLoad: 25, liveLoad: 15, beamWidth: 300, concreteGrade: 'C30' }
  },
  {
    name: 'calculate-column',
    validPayload: { axialLoad: 1500, momentX: 50, momentY: 30, columnWidth: 400, columnDepth: 400, columnHeight: 3.5 }
  },
  {
    name: 'calculate-foundation',
    validPayload: { columnLoad: 1200, momentX: 50, momentY: 30, columnWidth: 400, columnDepth: 400, bearingCapacity: 200 }
  },
  {
    name: 'calculate-slab',
    validPayload: { spanX: 6, spanY: 5, deadLoad: 5, liveLoad: 3, slabType: 'two_way' }
  },
  {
    name: 'calculate-retaining-wall',
    validPayload: { wallHeight: 4, stemThickness: 350, baseThickness: 400, toeLength: 1.2, heelLength: 2, soilDensity: 18, frictionAngle: 30, bearingCapacity: 150 }
  },
  {
    name: 'ayn-unified',
    validPayload: { messages: [{ role: 'user', content: 'Hello' }], intent: 'chat', stream: false }
  },
  {
    name: 'engineering-ai-chat',
    validPayload: { calculatorType: 'beam', question: 'What is moment?', currentInputs: {}, stream: false }
  },
  {
    name: 'support-bot',
    validPayload: { message: 'How do I reset my password?' }
  }
];

// Edge case categories
const EDGE_CASES: Record<string, (validPayload: Record<string, unknown>) => Record<string, unknown>[]> = {
  'null_inputs': (valid) => {
    const cases: Record<string, unknown>[] = [];
    for (const key of Object.keys(valid)) {
      cases.push({ ...valid, [key]: null });
    }
    return cases;
  },
  'undefined_inputs': (valid) => {
    const cases: Record<string, unknown>[] = [];
    for (const key of Object.keys(valid)) {
      const copy = { ...valid };
      delete copy[key];
      cases.push(copy);
    }
    return cases;
  },
  'empty_request': () => [
    {},
    [],
    '',
    'string',
    123
  ] as unknown as Record<string, unknown>[],
  'wrong_types': (valid) => {
    const cases: Record<string, unknown>[] = [];
    for (const key of Object.keys(valid)) {
      if (typeof valid[key] === 'number') {
        cases.push({ ...valid, [key]: 'not_a_number' });
        cases.push({ ...valid, [key]: true });
        cases.push({ ...valid, [key]: [] });
      } else if (typeof valid[key] === 'string') {
        cases.push({ ...valid, [key]: 12345 });
        cases.push({ ...valid, [key]: {} });
      }
    }
    return cases;
  },
  'negative_values': (valid) => {
    const cases: Record<string, unknown>[] = [];
    for (const key of Object.keys(valid)) {
      if (typeof valid[key] === 'number') {
        cases.push({ ...valid, [key]: -Math.abs(valid[key] as number) });
      }
    }
    return cases;
  },
  'extreme_large': (valid) => {
    const cases: Record<string, unknown>[] = [];
    for (const key of Object.keys(valid)) {
      if (typeof valid[key] === 'number') {
        cases.push({ ...valid, [key]: 999999999999 });
        cases.push({ ...valid, [key]: Number.MAX_SAFE_INTEGER });
      }
    }
    return cases;
  },
  'extreme_small': (valid) => {
    const cases: Record<string, unknown>[] = [];
    for (const key of Object.keys(valid)) {
      if (typeof valid[key] === 'number') {
        cases.push({ ...valid, [key]: 0.000000001 });
        cases.push({ ...valid, [key]: 0 });
      }
    }
    return cases;
  },
  'special_characters': (valid) => {
    const cases: Record<string, unknown>[] = [];
    for (const key of Object.keys(valid)) {
      if (typeof valid[key] === 'number') {
        cases.push({ ...valid, [key]: '∞' });
        cases.push({ ...valid, [key]: 'NaN' });
        cases.push({ ...valid, [key]: 'Infinity' });
      }
    }
    return cases;
  },
  'xss_injection': (valid) => [
    { ...valid, message: '<script>alert("xss")</script>' },
    { ...valid, question: '<img src=x onerror=alert(1)>' },
    { ...valid, userId: '<svg onload=alert(1)>' }
  ],
  'sql_injection': (valid) => [
    { ...valid, message: "'; DROP TABLE users; --" },
    { ...valid, userId: "1' OR '1'='1" },
    { ...valid, question: "UNION SELECT * FROM users" }
  ],
  'unicode_emoji': (valid) => {
    const cases: Record<string, unknown>[] = [];
    for (const key of Object.keys(valid)) {
      if (typeof valid[key] === 'number') {
        cases.push({ ...valid, [key]: '6️⃣' });
        cases.push({ ...valid, [key]: '🔧' });
      } else if (typeof valid[key] === 'string') {
        cases.push({ ...valid, [key]: '🚀💻🎉' });
      }
    }
    return cases;
  }
};

async function testEndpoint(endpoint: EndpointConfig, category: string, payload: unknown): Promise<TestResult> {
  const startTime = Date.now();
  const url = `${SUPABASE_URL}/functions/v1/${endpoint.name}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY
      },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload)
    });
    
    const responseTime = Date.now() - startTime;
    let responseBody: unknown;
    
    try {
      responseBody = await response.json();
    } catch {
      responseBody = await response.text();
    }
    
    // Success criteria:
    // - 200/201 = PASS (valid request)
    // - 400 = PASS (validation working correctly)
    // - 401/403 = PASS (auth working)
    // - 429/402 = SKIP (rate limit/payment)
    // - 500+ = FAIL (server crash!)
    
    let status: 'pass' | 'fail' | 'skip' = 'pass';
    if (response.status >= 500) {
      status = 'fail';
    } else if (response.status === 429 || response.status === 402) {
      status = 'skip';
    }
    
    return {
      endpoint: endpoint.name,
      category,
      testName: `${category}_${Object.keys(payload as object || {}).join('_').slice(0, 30)}`,
      status,
      httpStatus: response.status,
      responseTime,
      details: {
        payload: typeof payload === 'object' ? payload : { raw: payload },
        response: responseBody
      }
    };
  } catch (error) {
    return {
      endpoint: endpoint.name,
      category,
      testName: `${category}_error`,
      status: 'fail',
      httpStatus: 0,
      responseTime: Date.now() - startTime,
      error: error.message
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { endpoints: requestedEndpoints, categories: requestedCategories } = await req.json().catch(() => ({}));
    
    const endpointsToTest = requestedEndpoints?.length 
      ? ENDPOINTS.filter(e => requestedEndpoints.includes(e.name))
      : ENDPOINTS;
    
    const categoriesToTest = requestedCategories?.length
      ? Object.entries(EDGE_CASES).filter(([key]) => requestedCategories.includes(key))
      : Object.entries(EDGE_CASES);
    
    const results: TestResult[] = [];
    const startTime = Date.now();
    
    // Test each endpoint with each category
    for (const endpoint of endpointsToTest) {
      // First, test with valid payload
      const validResult = await testEndpoint(endpoint, 'valid_request', endpoint.validPayload);
      results.push(validResult);
      
      // Then test each edge case category
      for (const [category, generator] of categoriesToTest) {
        const testCases = generator(endpoint.validPayload);
        
        // Run up to 3 cases per category per endpoint to avoid timeout
        for (const testCase of testCases.slice(0, 3)) {
          const result = await testEndpoint(endpoint, category, testCase);
          results.push(result);
        }
      }
    }
    
    const totalTime = Date.now() - startTime;
    
    // Calculate summary
    const summary = {
      totalTests: results.length,
      passed: results.filter(r => r.status === 'pass').length,
      failed: results.filter(r => r.status === 'fail').length,
      skipped: results.filter(r => r.status === 'skip').length,
      crashRate: (results.filter(r => r.status === 'fail').length / results.length * 100).toFixed(1) + '%',
      avgResponseTime: Math.round(results.reduce((sum, r) => sum + r.responseTime, 0) / results.length),
      totalTime
    };
    
    // Group by endpoint
    const byEndpoint: Record<string, { passed: number; failed: number; skipped: number }> = {};
    for (const result of results) {
      if (!byEndpoint[result.endpoint]) {
        byEndpoint[result.endpoint] = { passed: 0, failed: 0, skipped: 0 };
      }
      byEndpoint[result.endpoint][result.status === 'pass' ? 'passed' : result.status === 'fail' ? 'failed' : 'skipped']++;
    }
    
    // Group by category
    const byCategory: Record<string, { passed: number; failed: number; skipped: number }> = {};
    for (const result of results) {
      if (!byCategory[result.category]) {
        byCategory[result.category] = { passed: 0, failed: 0, skipped: 0 };
      }
      byCategory[result.category][result.status === 'pass' ? 'passed' : result.status === 'fail' ? 'failed' : 'skipped']++;
    }
    
    // Get failed tests details
    const failures = results.filter(r => r.status === 'fail').map(r => ({
      endpoint: r.endpoint,
      category: r.category,
      httpStatus: r.httpStatus,
      error: r.error,
      payload: r.details?.payload
    }));
    
    // Store results in database
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    await supabase.from('stress_test_metrics').insert({
      test_type: 'crash_test',
      metric_name: 'crash_test_run',
      metric_value: summary.passed / summary.totalTests * 100,
      metadata: {
        summary,
        byEndpoint,
        byCategory,
        failureCount: failures.length
      }
    });

    return new Response(JSON.stringify({
      success: true,
      summary,
      byEndpoint,
      byCategory,
      failures,
      results: results.slice(0, 50) // Limit detail results to avoid huge response
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Crash tester error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
