import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface ResponseTimeResult {
  intent: string;
  testName: string;
  ttft_ms: number;  // Time to first token
  totalTime_ms: number;
  success: boolean;
  error?: string;
}

interface PercentileStats {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Test prompts for different intents
const TEST_PROMPTS: Record<string, { name: string; prompt: string; expectedMaxTime: number }[]> = {
  chat: [
    { name: 'Simple greeting', prompt: 'Hello!', expectedMaxTime: 3000 },
    { name: 'Short question', prompt: 'What time is it?', expectedMaxTime: 3000 },
    { name: 'Help request', prompt: 'How can you help me?', expectedMaxTime: 4000 },
  ],
  engineering: [
    { name: 'Beam question', prompt: 'What is a good span-to-depth ratio for a concrete beam?', expectedMaxTime: 5000 },
    { name: 'Code reference', prompt: 'What ACI section covers shear design?', expectedMaxTime: 5000 },
    { name: 'Design guidance', prompt: 'How do I design a retaining wall?', expectedMaxTime: 6000 },
  ],
  image: [
    { name: 'Simple image', prompt: 'A blue sky with clouds', expectedMaxTime: 15000 },
    { name: 'Complex scene', prompt: 'A modern office building at sunset', expectedMaxTime: 20000 },
  ],
};

// SLO targets per intent
const SLO_TARGETS: Record<string, { ttft: number; total: number }> = {
  chat: { ttft: 1000, total: 3000 },
  engineering: { ttft: 2000, total: 5000 },
  image: { ttft: 5000, total: 15000 },
};

function calculatePercentiles(times: number[]): PercentileStats {
  if (times.length === 0) return { p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0 };
  
  const sorted = [...times].sort((a, b) => a - b);
  const p50Index = Math.floor(sorted.length * 0.5);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p99Index = Math.floor(sorted.length * 0.99);
  
  return {
    p50: sorted[p50Index] || 0,
    p95: sorted[p95Index] || sorted[sorted.length - 1] || 0,
    p99: sorted[p99Index] || sorted[sorted.length - 1] || 0,
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    min: sorted[0] || 0,
    max: sorted[sorted.length - 1] || 0,
  };
}

async function measureAYNResponse(prompt: string, intent: string): Promise<{ ttft: number; total: number; success: boolean; error?: string }> {
  const startTime = Date.now();
  let ttft = 0;
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ayn-unified`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        intent,
        stream: false,
      }),
    });
    
    // TTFT is when we get the response headers
    ttft = Date.now() - startTime;
    
    if (!response.ok) {
      return { ttft, total: Date.now() - startTime, success: false, error: `HTTP ${response.status}` };
    }
    
    // Wait for full response
    await response.json();
    const total = Date.now() - startTime;
    
    return { ttft, total, success: true };
  } catch (error) {
    return { 
      ttft: ttft || Date.now() - startTime, 
      total: Date.now() - startTime, 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const { intents = ['chat', 'engineering'], iterations = 3 } = await req.json().catch(() => ({}));
    
    const results: ResponseTimeResult[] = [];
    const byIntent: Record<string, { 
      ttftStats: PercentileStats; 
      totalStats: PercentileStats;
      sloCompliance: { ttft: number; total: number };
      results: ResponseTimeResult[];
    }> = {};
    
    // Run tests for each intent
    for (const intent of intents) {
      const intentPrompts = TEST_PROMPTS[intent] || TEST_PROMPTS.chat;
      const intentResults: ResponseTimeResult[] = [];
      const ttftTimes: number[] = [];
      const totalTimes: number[] = [];
      
      for (const test of intentPrompts) {
        for (let i = 0; i < iterations; i++) {
          const { ttft, total, success, error } = await measureAYNResponse(test.prompt, intent);
          
          const result: ResponseTimeResult = {
            intent,
            testName: test.name,
            ttft_ms: ttft,
            totalTime_ms: total,
            success,
            error,
          };
          
          results.push(result);
          intentResults.push(result);
          
          if (success) {
            ttftTimes.push(ttft);
            totalTimes.push(total);
          }
        }
      }
      
      const ttftStats = calculatePercentiles(ttftTimes);
      const totalStats = calculatePercentiles(totalTimes);
      const slo = SLO_TARGETS[intent] || SLO_TARGETS.chat;
      
      byIntent[intent] = {
        ttftStats,
        totalStats,
        sloCompliance: {
          ttft: ttftTimes.filter(t => t <= slo.ttft).length / ttftTimes.length * 100,
          total: totalTimes.filter(t => t <= slo.total).length / totalTimes.length * 100,
        },
        results: intentResults,
      };
    }
    
    // Calculate overall stats
    const allTtft = results.filter(r => r.success).map(r => r.ttft_ms);
    const allTotal = results.filter(r => r.success).map(r => r.totalTime_ms);
    const successRate = results.filter(r => r.success).length / results.length * 100;
    
    // Determine overall rating
    let overallRating: 'excellent' | 'good' | 'needs_improvement' | 'poor' = 'excellent';
    const avgTotal = allTotal.reduce((a, b) => a + b, 0) / allTotal.length;
    if (avgTotal > 10000 || successRate < 80) overallRating = 'poor';
    else if (avgTotal > 5000 || successRate < 90) overallRating = 'needs_improvement';
    else if (avgTotal > 3000 || successRate < 95) overallRating = 'good';
    
    // Store metrics in database
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    await supabase.from('stress_test_metrics').insert({
      test_name: 'AI Response Time Benchmark',
      concurrent_users: 1,
      avg_response_time_ms: Math.round(avgTotal),
      p95_response_time_ms: Math.round(calculatePercentiles(allTotal).p95),
      error_rate: 100 - successRate,
    });
    
    return new Response(JSON.stringify({
      success: true,
      summary: {
        totalTests: results.length,
        successRate: `${successRate.toFixed(1)}%`,
        avgTTFT: `${Math.round(calculatePercentiles(allTtft).avg)}ms`,
        avgTotal: `${Math.round(avgTotal)}ms`,
        p95Total: `${Math.round(calculatePercentiles(allTotal).p95)}ms`,
        overallRating,
      },
      byIntent,
      sloTargets: SLO_TARGETS,
      results,
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
    
  } catch (error) {
    console.error('Response time tester error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
