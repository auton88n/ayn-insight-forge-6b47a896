import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

// User personas with distinct characteristics
interface UserPersona {
  id: string;
  name: string;
  description: string;
  language: 'en' | 'ar';
  expertise: 'beginner' | 'intermediate' | 'expert';
  patience: 'low' | 'medium' | 'high';
  deviceType: 'desktop' | 'mobile' | 'tablet';
  typingSpeed: number; // chars per second
  readingSpeed: number; // words per minute
}

interface JourneyStep {
  action: string;
  endpoint?: string;
  input?: Record<string, unknown>;
  expectedDuration: number; // ms
  criticalForSuccess: boolean;
}

interface Journey {
  id: string;
  name: string;
  description: string;
  steps: JourneyStep[];
  expectedTotalTime: number; // ms
}

interface JourneyResult {
  persona: string;
  journey: string;
  status: 'success' | 'partial' | 'failed';
  completionRate: number;
  totalDuration: number;
  uxScore: number;
  steps: Array<{
    action: string;
    status: 'passed' | 'failed' | 'slow';
    duration_ms: number;
    error?: string;
  }>;
  frustrations: string[];
  highlights: string[];
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') || '';

// Define user personas
const USER_PERSONAS: UserPersona[] = [
  {
    id: 'new_engineer',
    name: 'New Graduate Engineer',
    description: 'Fresh engineering graduate, first time using structural calculators',
    language: 'en',
    expertise: 'beginner',
    patience: 'high',
    deviceType: 'desktop',
    typingSpeed: 40,
    readingSpeed: 200,
  },
  {
    id: 'expert_engineer',
    name: 'Senior Structural Engineer',
    description: '15+ years experience, expects fast professional tools',
    language: 'en',
    expertise: 'expert',
    patience: 'low',
    deviceType: 'desktop',
    typingSpeed: 80,
    readingSpeed: 350,
  },
  {
    id: 'mobile_user',
    name: 'On-Site Engineer',
    description: 'Using phone at construction site, needs quick answers',
    language: 'en',
    expertise: 'intermediate',
    patience: 'low',
    deviceType: 'mobile',
    typingSpeed: 25,
    readingSpeed: 250,
  },
  {
    id: 'canadian_engineer',
    name: 'Canadian Engineer',
    description: 'Canadian engineer using CSA standards',
    language: 'en',
    expertise: 'intermediate',
    patience: 'medium',
    deviceType: 'desktop',
    typingSpeed: 45,
    readingSpeed: 280,
  },
  {
    id: 'impatient_user',
    name: 'Rushed Project Manager',
    description: 'Needs quick calculations for deadline, low tolerance for delays',
    language: 'en',
    expertise: 'beginner',
    patience: 'low',
    deviceType: 'desktop',
    typingSpeed: 60,
    readingSpeed: 300,
  },
];

// Define user journeys
const USER_JOURNEYS: Journey[] = [
  {
    id: 'first_beam_calculation',
    name: 'First Beam Calculation',
    description: 'New user performs their first beam calculation end-to-end',
    expectedTotalTime: 30000,
    steps: [
      { action: 'View landing page', expectedDuration: 2000, criticalForSuccess: false },
      { action: 'Navigate to engineering', expectedDuration: 1000, criticalForSuccess: true },
      { action: 'Select beam calculator', expectedDuration: 500, criticalForSuccess: true },
      { action: 'Enter span value', expectedDuration: 2000, criticalForSuccess: true },
      { action: 'Enter dead load', expectedDuration: 1500, criticalForSuccess: true },
      { action: 'Enter live load', expectedDuration: 1500, criticalForSuccess: true },
      { action: 'Enter beam width', expectedDuration: 1500, criticalForSuccess: true },
      { action: 'Submit calculation', endpoint: 'calculate-beam', input: { span: 6, deadLoad: 10, liveLoad: 15, beamWidth: 300, concreteGrade: 30, steelGrade: 420 }, expectedDuration: 3000, criticalForSuccess: true },
      { action: 'View results', expectedDuration: 2000, criticalForSuccess: true },
    ],
  },
  {
    id: 'quick_column_check',
    name: 'Quick Column Check',
    description: 'Expert user quickly checks a column design',
    expectedTotalTime: 15000,
    steps: [
      { action: 'Navigate directly to column calculator', expectedDuration: 500, criticalForSuccess: true },
      { action: 'Enter all parameters', expectedDuration: 3000, criticalForSuccess: true },
      { action: 'Submit calculation', endpoint: 'calculate-column', input: { columnHeight: 4, axialLoad: 700, momentX: 80, momentY: 50, columnWidth: 450, columnDepth: 450, concreteGrade: 35, steelGrade: 500 }, expectedDuration: 2000, criticalForSuccess: true },
      { action: 'Review adequacy', expectedDuration: 1000, criticalForSuccess: true },
    ],
  },
  {
    id: 'foundation_design_flow',
    name: 'Foundation Design Flow',
    description: 'Complete foundation design with AI assistance',
    expectedTotalTime: 45000,
    steps: [
      { action: 'Select foundation calculator', expectedDuration: 1000, criticalForSuccess: true },
      { action: 'Enter column load', expectedDuration: 2000, criticalForSuccess: true },
      { action: 'Enter column dimensions', expectedDuration: 3000, criticalForSuccess: true },
      { action: 'Enter bearing capacity', expectedDuration: 2000, criticalForSuccess: true },
      { action: 'Submit calculation', endpoint: 'calculate-foundation', input: { columnLoad: 1000, columnWidth: 450, columnDepth: 450, bearingCapacity: 175, concreteGrade: 35, steelGrade: 420 }, expectedDuration: 3000, criticalForSuccess: true },
      { action: 'Ask AI for optimization', endpoint: 'engineering-ai-chat', input: { calculatorType: 'foundation', question: 'How can I optimize this foundation design?', currentInputs: { columnLoad: 1000 }, stream: false }, expectedDuration: 5000, criticalForSuccess: false },
      { action: 'Review AI suggestion', expectedDuration: 3000, criticalForSuccess: false },
    ],
  },
  {
    id: 'support_interaction',
    name: 'Getting Help',
    description: 'User seeks help through support bot',
    expectedTotalTime: 20000,
    steps: [
      { action: 'Click help/support', expectedDuration: 500, criticalForSuccess: true },
      { action: 'Type question', expectedDuration: 3000, criticalForSuccess: true },
      { action: 'Submit question', endpoint: 'support-bot', input: { message: 'How do I interpret the reinforcement results?' }, expectedDuration: 4000, criticalForSuccess: true },
      { action: 'Read response', expectedDuration: 5000, criticalForSuccess: true },
      { action: 'Rate helpfulness', expectedDuration: 1000, criticalForSuccess: false },
    ],
  },
  {
    id: 'arabic_user_flow',
    name: 'Arabic User Experience',
    description: 'Arabic-speaking user navigates and calculates',
    expectedTotalTime: 35000,
    steps: [
      { action: 'View landing page (RTL)', expectedDuration: 2000, criticalForSuccess: false },
      { action: 'Switch language to Arabic', expectedDuration: 1000, criticalForSuccess: true },
      { action: 'Navigate to calculators', expectedDuration: 1500, criticalForSuccess: true },
      { action: 'Select beam calculator', expectedDuration: 1000, criticalForSuccess: true },
      { action: 'Enter values', expectedDuration: 5000, criticalForSuccess: true },
      { action: 'Submit calculation', endpoint: 'calculate-beam', input: { span: 5, deadLoad: 8, liveLoad: 12, beamWidth: 250, concreteGrade: 30, steelGrade: 420 }, expectedDuration: 3000, criticalForSuccess: true },
      { action: 'Ask AI in Arabic', endpoint: 'support-bot', input: { message: 'ما هو أفضل قطر للحديد؟' }, expectedDuration: 4000, criticalForSuccess: false },
    ],
  },
];

// Simulate a single step
async function simulateStep(step: JourneyStep, _persona: UserPersona): Promise<{
  status: 'passed' | 'failed' | 'slow';
  duration_ms: number;
  error?: string;
}> {
  const startTime = Date.now();
  
  // Skip delay for non-API steps - we're testing real endpoints, not human behavior
  if (!step.endpoint) {
    return {
      status: 'passed',
      duration_ms: 0,
    };
  }
  
  // Make actual API call
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${step.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(step.input),
    });
    
    const duration = Date.now() - startTime;
    const contentType = response.headers.get('content-type');
    
    // Check for valid response
    if (!contentType?.includes('application/json')) {
      return {
        status: 'failed',
        duration_ms: duration,
        error: 'Non-JSON response',
      };
    }
    
    const data = await response.json();
    
    if (!response.ok || data.error) {
      return {
        status: 'failed',
        duration_ms: duration,
        error: data.error || `HTTP ${response.status}`,
      };
    }
    
    // Check if response was slower than expected
    const isSlow = duration > step.expectedDuration * 1.5;
    
    return {
      status: isSlow ? 'slow' : 'passed',
      duration_ms: duration,
    };
    
  } catch (error) {
    return {
      status: 'failed',
      duration_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Simulate a complete journey for a persona
async function simulateJourney(journey: Journey, persona: UserPersona): Promise<JourneyResult> {
  const stepResults: JourneyResult['steps'] = [];
  const frustrations: string[] = [];
  const highlights: string[] = [];
  let totalDuration = 0;
  
  for (const step of journey.steps) {
    const result = await simulateStep(step, persona);
    stepResults.push({
      action: step.action,
      ...result,
    });
    totalDuration += result.duration_ms;
    
    // Track frustrations
    if (result.status === 'failed' && step.criticalForSuccess) {
      frustrations.push(`${step.action}: ${result.error || 'Failed'}`);
      
      // Impatient users give up quickly
      if (persona.patience === 'low' && frustrations.length >= 2) {
        frustrations.push('User abandoned journey due to multiple failures');
        break;
      }
    }
    
    if (result.status === 'slow') {
      frustrations.push(`${step.action}: Slow response (${result.duration_ms}ms)`);
    }
    
    // Track highlights
    if (result.status === 'passed' && step.criticalForSuccess && result.duration_ms < step.expectedDuration * 0.7) {
      highlights.push(`${step.action}: Fast response (${result.duration_ms}ms)`);
    }
  }
  
  // Calculate metrics
  const completedSteps = stepResults.filter(s => s.status !== 'failed').length;
  const criticalSteps = journey.steps.filter(s => s.criticalForSuccess);
  const criticalPassed = stepResults.filter((s, i) => journey.steps[i].criticalForSuccess && s.status !== 'failed').length;
  
  const completionRate = completedSteps / journey.steps.length;
  const criticalSuccess = criticalPassed / criticalSteps.length;
  
  // Calculate UX score (0-100)
  let uxScore = 50; // Base score
  
  // Completion bonus
  uxScore += criticalSuccess * 30;
  
  // Speed bonus/penalty
  const speedRatio = journey.expectedTotalTime / totalDuration;
  if (speedRatio > 1) {
    uxScore += Math.min(15, (speedRatio - 1) * 20);
  } else {
    uxScore -= Math.min(20, (1 - speedRatio) * 30);
  }
  
  // Frustration penalty
  uxScore -= frustrations.length * 5;
  
  // Highlight bonus
  uxScore += highlights.length * 3;
  
  // Clamp score
  uxScore = Math.max(0, Math.min(100, Math.round(uxScore)));
  
  // Determine status
  let status: JourneyResult['status'] = 'success';
  if (criticalSuccess < 0.5) {
    status = 'failed';
  } else if (criticalSuccess < 1 || frustrations.length > 2) {
    status = 'partial';
  }
  
  return {
    persona: persona.id,
    journey: journey.id,
    status,
    completionRate,
    totalDuration,
    uxScore,
    steps: stepResults,
    frustrations,
    highlights,
  };
}

// Generate AI analysis
async function analyzeJourneyResults(results: JourneyResult[]): Promise<string> {
  const avgScore = results.reduce((a, r) => a + r.uxScore, 0) / results.length;
  const successRate = results.filter(r => r.status === 'success').length / results.length;
  const allFrustrations = results.flatMap(r => r.frustrations);
  const allHighlights = results.flatMap(r => r.highlights);
  
  const byPersona = results.reduce((acc, r) => {
    if (!acc[r.persona]) acc[r.persona] = { scores: [], successes: 0, total: 0 };
    acc[r.persona].scores.push(r.uxScore);
    acc[r.persona].total++;
    if (r.status === 'success') acc[r.persona].successes++;
    return acc;
  }, {} as Record<string, { scores: number[]; successes: number; total: number }>);
  
  if (!LOVABLE_API_KEY) {
    return `**UX Summary**: Average score ${avgScore.toFixed(0)}/100, ${(successRate * 100).toFixed(0)}% success rate.\n\n` +
      `**By Persona**: ${Object.entries(byPersona).map(([k, v]) => `${k}: ${(v.scores.reduce((a,b)=>a+b,0)/v.scores.length).toFixed(0)}`).join(', ')}\n\n` +
      `**Common Frustrations**: ${allFrustrations.slice(0, 5).join('; ')}\n\n` +
      `**Highlights**: ${allHighlights.slice(0, 5).join('; ')}`;
  }
  
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-preview-05-20',
        messages: [{
          role: 'user',
          content: `Analyze these UX test results and provide actionable recommendations:

Overall:
- Average UX Score: ${avgScore.toFixed(0)}/100
- Journey Success Rate: ${(successRate * 100).toFixed(0)}%
- Journeys Tested: ${results.length}

By Persona:
${Object.entries(byPersona).map(([k, v]) => `- ${k}: Avg score ${(v.scores.reduce((a,b)=>a+b,0)/v.scores.length).toFixed(0)}, ${v.successes}/${v.total} successful`).join('\n')}

Top Frustrations:
${allFrustrations.slice(0, 10).map(f => `- ${f}`).join('\n')}

Highlights:
${allHighlights.slice(0, 5).map(h => `- ${h}`).join('\n')}

Provide:
1. Overall UX health (1 sentence)
2. Top 3 UX improvements needed
3. Persona-specific issues
4. Quick wins to implement`
        }],
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.choices?.[0]?.message?.content || 'Analysis unavailable';
    }
  } catch (e) {
    console.error('AI analysis failed:', e);
  }
  
  return `UX Score: ${avgScore.toFixed(0)}/100. ${(successRate * 100).toFixed(0)}% of journeys completed successfully.`;
}

// Default quick personas (3 instead of 5)
const QUICK_PERSONAS = ['new_engineer', 'expert_engineer', 'mobile_user'];

// Default quick journeys (3 instead of 5)
const QUICK_JOURNEYS = ['first_beam_calculation', 'quick_column_check', 'foundation_design_flow'];

// Main handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { personas, journeys, mode = 'quick' } = await req.json().catch(() => ({}));
    
    // Use quick defaults unless mode is 'full' or specific selections provided
    const selectedPersonas = personas 
      ? USER_PERSONAS.filter(p => personas.includes(p.id))
      : mode === 'full' 
        ? USER_PERSONAS 
        : USER_PERSONAS.filter(p => QUICK_PERSONAS.includes(p.id));
    
    const selectedJourneys = journeys
      ? USER_JOURNEYS.filter(j => journeys.includes(j.id))
      : mode === 'full'
        ? USER_JOURNEYS
        : USER_JOURNEYS.filter(j => QUICK_JOURNEYS.includes(j.id));
    
    console.log(`🎭 UX Tester (${mode} mode): Testing ${selectedJourneys.length} journeys with ${selectedPersonas.length} personas...`);
    
    const allResults: JourneyResult[] = [];
    
    // Run journeys in PARALLEL for each persona (much faster)
    for (const persona of selectedPersonas) {
      console.log(`  👤 Testing as: ${persona.name}`);
      
      // Run all journeys for this persona in parallel
      const journeyPromises = selectedJourneys.map(async (journey) => {
        console.log(`    📍 Journey: ${journey.name}`);
        const result = await simulateJourney(journey, persona);
        console.log(`       Status: ${result.status}, Score: ${result.uxScore}/100`);
        return result;
      });
      
      const personaResults = await Promise.all(journeyPromises);
      allResults.push(...personaResults);
    }
    
    // Generate AI analysis
    const analysis = await analyzeJourneyResults(allResults);
    
    // Store summary in database
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    const avgScore = allResults.reduce((a, r) => a + r.uxScore, 0) / allResults.length;
    const successRate = allResults.filter(r => r.status === 'success').length / allResults.length;
    
    await supabase.from('stress_test_metrics').insert({
      test_name: 'AI UX Journey Test',
      concurrent_users: selectedPersonas.length,
      avg_response_time_ms: allResults.reduce((a, r) => a + r.totalDuration, 0) / allResults.length,
      p95_response_time_ms: allResults.sort((a, b) => b.totalDuration - a.totalDuration)[Math.floor(allResults.length * 0.05)]?.totalDuration || 0,
      error_rate: 1 - successRate,
      details: {
        avgUxScore: avgScore,
        successRate,
        personasTested: selectedPersonas.map(p => p.id),
        journeysTested: selectedJourneys.map(j => j.id),
      },
    });
    
    // Calculate summaries - format for frontend
    const byPersona = selectedPersonas.map(persona => {
      const personaResults = allResults.filter(r => r.persona === persona.id);
      const frustrations = personaResults.filter(r => r.status === 'failed').length;
      return {
        name: persona.name,
        type: persona.id as 'new_user' | 'expert' | 'mobile' | 'arabic' | 'power_user',
        avgScore: Math.round(personaResults.reduce((a, r) => a + r.uxScore, 0) / personaResults.length),
        completedJourneys: personaResults.filter(r => r.status === 'success').length,
        totalJourneys: personaResults.length,
        frustrations,
        avgResponseTime: Math.round(personaResults.reduce((a, r) => a + r.totalDuration, 0) / personaResults.length),
      };
    });
    
    const byJourney = selectedJourneys.map(journey => {
      const journeyResults = allResults.filter(r => r.journey === journey.id);
      return {
        journey: journey.id,
        name: journey.name,
        avgScore: journeyResults.reduce((a, r) => a + r.uxScore, 0) / journeyResults.length,
        successRate: journeyResults.filter(r => r.status === 'success').length / journeyResults.length,
        personas: journeyResults.length,
      };
    });
    
    // Format results for frontend
    const formattedResults = allResults.map(r => {
      const journey = selectedJourneys.find(j => j.id === r.journey);
      const persona = selectedPersonas.find(p => p.id === r.persona);
      return {
        journey: journey?.name || r.journey,
        persona: persona?.name || r.persona,
        steps: r.steps.map((s, idx) => ({
          name: journey?.steps[idx]?.action || s.action || `Step ${idx + 1}`,
          status: s.status,
          duration_ms: s.duration_ms,
          error: s.error,
        })),
        completionRate: Math.round(r.completionRate * 100),
        uxScore: r.uxScore,
        status: r.status,
      };
    });
    
    return new Response(JSON.stringify({
      success: true,
      summary: {
        totalJourneys: allResults.length,
        avgUxScore: avgScore.toFixed(0),
        overallSuccessRate: (successRate * 100).toFixed(0) + '%',
        personasTested: selectedPersonas.length,
        journeysTested: selectedJourneys.length,
        avgResponseTime: Math.round(allResults.reduce((a, r) => a + r.totalDuration, 0) / allResults.length),
      },
      byPersona,
      byJourney,
      results: formattedResults,
      analysis,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('UX tester error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
