import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface UXMetrics {
  firstResponseTime: number;
  calculatorSpeed: number;
  chatResponseTime: number;
  errorRate: number;
  availability: number;
  p95ResponseTime: number;
  supportTicketsThisWeek: number;
  successfulRequests: number;
  failedRequests: number;
}

interface IndustryBenchmark {
  metric: string;
  yourValue: number;
  industryTarget: number;
  unit: string;
  rating: 'excellent' | 'good' | 'needs_improvement' | 'poor';
  percentile: number;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Measure response time for an endpoint
async function measureEndpoint(endpoint: string, body: Record<string, unknown>): Promise<{ time: number; success: boolean }> {
  const startTime = Date.now();
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return {
      time: Date.now() - startTime,
      success: response.ok,
    };
  } catch {
    return {
      time: Date.now() - startTime,
      success: false,
    };
  }
}

// Calculate P95 from array of times
function calculateP95(times: number[]): number {
  if (times.length === 0) return 0;
  const sorted = [...times].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(index, sorted.length - 1)];
}

// Get rating based on value and target
function getRating(value: number, target: number, lowerIsBetter: boolean = true): 'excellent' | 'good' | 'needs_improvement' | 'poor' {
  const ratio = lowerIsBetter ? target / value : value / target;
  if (ratio >= 1.5) return 'excellent';
  if (ratio >= 1.0) return 'good';
  if (ratio >= 0.7) return 'needs_improvement';
  return 'poor';
}

// Calculate percentile rank
function getPercentile(value: number, target: number, lowerIsBetter: boolean = true): number {
  const ratio = lowerIsBetter ? target / value : value / target;
  return Math.min(99, Math.max(1, Math.round(ratio * 50)));
}

async function measureUX(): Promise<UXMetrics> {
  const metrics: UXMetrics = {
    firstResponseTime: 0,
    calculatorSpeed: 0,
    chatResponseTime: 0,
    errorRate: 0,
    availability: 0,
    p95ResponseTime: 0,
    supportTicketsThisWeek: 0,
    successfulRequests: 0,
    failedRequests: 0,
  };

  // Measure chat first response time
  const chatResult = await measureEndpoint('support-bot', { message: 'Hello' });
  metrics.firstResponseTime = chatResult.time;
  metrics.chatResponseTime = chatResult.time;

  // Measure calculator speed (average of multiple calls)
  const calcEndpoints = [
    { endpoint: 'calculate-beam', body: { span: 6, deadLoad: 10, liveLoad: 15, beamWidth: 300, concreteGrade: 30, steelGrade: 420 } },
    { endpoint: 'calculate-column', body: { height: 3, axialLoad: 500, momentX: 50, momentY: 30, columnWidth: 400, columnDepth: 400, concreteGrade: 30, steelGrade: 420 } },
    { endpoint: 'calculate-foundation', body: { columnLoad: 800, soilBearingCapacity: 150, foundationDepth: 1.5, concreteGrade: 30, steelGrade: 420 } },
  ];

  const calcTimes: number[] = [];
  let successful = 0;
  let failed = 0;

  for (const calc of calcEndpoints) {
    for (let i = 0; i < 3; i++) {
      const result = await measureEndpoint(calc.endpoint, calc.body);
      calcTimes.push(result.time);
      if (result.success) successful++;
      else failed++;
    }
  }

  metrics.calculatorSpeed = calcTimes.length > 0 
    ? calcTimes.reduce((a, b) => a + b, 0) / calcTimes.length 
    : 0;
  metrics.p95ResponseTime = calculateP95(calcTimes);
  metrics.successfulRequests = successful;
  metrics.failedRequests = failed;
  metrics.errorRate = (failed / (successful + failed)) * 100;
  metrics.availability = (successful / (successful + failed)) * 100;

  // Get support tickets from database
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { count } = await supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneWeekAgo);
    
    metrics.supportTicketsThisWeek = count || 0;
  } catch {
    metrics.supportTicketsThisWeek = 0;
  }

  return metrics;
}

function generateBenchmarks(metrics: UXMetrics): IndustryBenchmark[] {
  return [
    {
      metric: 'First Response Time',
      yourValue: metrics.firstResponseTime,
      industryTarget: 2000, // 2 seconds
      unit: 'ms',
      rating: getRating(metrics.firstResponseTime, 2000, true),
      percentile: getPercentile(metrics.firstResponseTime, 2000, true),
    },
    {
      metric: 'Calculator Speed',
      yourValue: metrics.calculatorSpeed,
      industryTarget: 500, // 500ms
      unit: 'ms',
      rating: getRating(metrics.calculatorSpeed, 500, true),
      percentile: getPercentile(metrics.calculatorSpeed, 500, true),
    },
    {
      metric: 'P95 Response Time',
      yourValue: metrics.p95ResponseTime,
      industryTarget: 1000, // 1 second
      unit: 'ms',
      rating: getRating(metrics.p95ResponseTime, 1000, true),
      percentile: getPercentile(metrics.p95ResponseTime, 1000, true),
    },
    {
      metric: 'Error Rate',
      yourValue: metrics.errorRate,
      industryTarget: 1, // 1%
      unit: '%',
      rating: getRating(metrics.errorRate, 1, true),
      percentile: getPercentile(metrics.errorRate, 1, true),
    },
    {
      metric: 'Availability',
      yourValue: metrics.availability,
      industryTarget: 99.9, // 99.9%
      unit: '%',
      rating: getRating(metrics.availability, 99.9, false),
      percentile: getPercentile(metrics.availability, 99.9, false),
    },
    {
      metric: 'Support Tickets',
      yourValue: metrics.supportTicketsThisWeek,
      industryTarget: 5, // 5 per week
      unit: '/week',
      rating: getRating(metrics.supportTicketsThisWeek, 5, true),
      percentile: getPercentile(metrics.supportTicketsThisWeek, 5, true),
    },
  ];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    
    // Measure all UX metrics
    const metrics = await measureUX();
    
    // Generate industry benchmarks
    const benchmarks = generateBenchmarks(metrics);
    
    // Calculate overall score
    const overallScore = Math.round(
      benchmarks.reduce((acc, b) => acc + b.percentile, 0) / benchmarks.length
    );

    // Store metrics in stress_test_metrics table
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    await supabase.from('stress_test_metrics').insert({
      test_name: 'UX Measurement',
      concurrent_users: 1,
      avg_response_time_ms: Math.round(metrics.calculatorSpeed),
      p95_response_time_ms: Math.round(metrics.p95ResponseTime),
      error_rate: metrics.errorRate / 100,
      requests_per_second: null,
      memory_usage_mb: null,
    });

    return new Response(JSON.stringify({
      success: true,
      metrics,
      benchmarks,
      overallScore,
      overallRating: overallScore >= 80 ? 'excellent' : overallScore >= 60 ? 'good' : overallScore >= 40 ? 'needs_improvement' : 'poor',
      summary: {
        firstResponseTime: `${metrics.firstResponseTime}ms`,
        calculatorSpeed: `${Math.round(metrics.calculatorSpeed)}ms avg`,
        errorRate: `${metrics.errorRate.toFixed(2)}%`,
        availability: `${metrics.availability.toFixed(1)}%`,
        supportTickets: `${metrics.supportTicketsThisWeek} this week`,
      },
      measurementDuration: Date.now() - startTime,
      measuredAt: new Date().toISOString(),
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
