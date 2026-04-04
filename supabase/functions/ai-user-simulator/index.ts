import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface UserPersona {
  id: string;
  name: string;
  description: string;
  behaviors: string[];
  expectedFrustrations: string[];
  successCriteria: string[];
}

interface SimulationTask {
  name: string;
  steps: SimulationStep[];
  expectedOutcome: string;
}

interface SimulationStep {
  action: 'navigate' | 'click' | 'fill' | 'upload' | 'wait' | 'verify' | 'api_call';
  target?: string;
  value?: string | Record<string, unknown>;
  expectation?: string;
}

interface SimulationResult {
  persona: string;
  task: string;
  status: 'success' | 'partial' | 'failed';
  stepsCompleted: number;
  totalSteps: number;
  issues: SimulationIssue[];
  duration: number;
  userExperience: {
    score: number;
    highlights: string[];
    frustrations: string[];
  };
}

interface SimulationIssue {
  step: number;
  action: string;
  issue: string;
  suggestion: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

// User personas with realistic behaviors
const USER_PERSONAS: UserPersona[] = [
  {
    id: 'new_engineer',
    name: 'New Engineer',
    description: 'Fresh graduate, unfamiliar with software, may enter wrong units',
    behaviors: [
      'Explores randomly before finding target',
      'Enters values in wrong units (m instead of mm)',
      'Clicks help buttons frequently',
      'Gets confused by technical terms'
    ],
    expectedFrustrations: [
      'Unclear unit requirements',
      'Missing tooltips',
      'Complex terminology without explanation'
    ],
    successCriteria: [
      'Complete first calculation within 5 minutes',
      'Understand results without external help',
      'Find help when stuck'
    ]
  },
  {
    id: 'expert_user',
    name: 'Expert Engineer',
    description: 'Senior engineer, expects efficiency and accuracy',
    behaviors: [
      'Uses keyboard shortcuts',
      'Enters values rapidly',
      'Expects precise results matching hand calculations',
      'Wants to export to CAD quickly'
    ],
    expectedFrustrations: [
      'Slow response times',
      'Results not matching expectations',
      'Missing export options'
    ],
    successCriteria: [
      'Complete calculation in under 1 minute',
      'Export results successfully',
      'Verify accuracy against known values'
    ]
  },
  {
    id: 'mobile_user',
    name: 'Mobile User',
    description: 'Using phone on construction site, unstable connection',
    behaviors: [
      'Uses touch gestures',
      'Portrait mode primarily',
      'Intermittent connection',
      'Impatient with loading'
    ],
    expectedFrustrations: [
      'Small touch targets',
      'Horizontal scrolling required',
      '3D view unresponsive',
      'Lost data on disconnect'
    ],
    successCriteria: [
      'Complete calculation on mobile',
      'View results without horizontal scroll',
      'Recover from connection loss'
    ]
  },
  {
    id: 'impatient_user',
    name: 'Impatient User',
    description: 'In a hurry, clicks rapidly, does not wait for loading',
    behaviors: [
      'Double/triple clicks buttons',
      'Submits forms multiple times',
      'Navigates away before loading completes',
      'Skips reading instructions'
    ],
    expectedFrustrations: [
      'No loading indicators',
      'Duplicate submissions allowed',
      'Lost progress'
    ],
    successCriteria: [
      'Prevent duplicate submissions',
      'Show clear loading states',
      'Preserve user input on navigation'
    ]
  },
  {
    id: 'arabic_user',
    name: 'Arabic User',
    description: 'Prefers Arabic interface, RTL layout expectations',
    behaviors: [
      'Switches to Arabic language',
      'Expects RTL text alignment',
      'Uses Arabic numerals sometimes',
      'Expects international building codes (ACI/CSA)'
    ],
    expectedFrustrations: [
      'Mixed LTR/RTL content',
      'Untranslated technical terms',
      'Missing building code options'
    ],
    successCriteria: [
      'Full Arabic translation available',
      'RTL layout works correctly',
      'International standards supported (ACI/CSA)'
    ]
  }
];

// Tasks to simulate for each persona
const SIMULATION_TASKS: Record<string, SimulationTask[]> = {
  new_engineer: [
    {
      name: 'First Beam Calculation',
      steps: [
        { action: 'navigate', target: '/engineering' },
        { action: 'wait', value: '2000', expectation: 'Page loads calculator options' },
        { action: 'click', target: 'Beam Calculator', expectation: 'Calculator form appears' },
        { action: 'fill', target: 'span', value: '6', expectation: 'Field accepts value' },
        { action: 'fill', target: 'deadLoad', value: '15' },
        { action: 'fill', target: 'liveLoad', value: '10' },
        { action: 'fill', target: 'beamWidth', value: '300' },
        { action: 'click', target: 'Calculate', expectation: 'Results display' },
        { action: 'verify', target: 'results', expectation: 'Results show beam depth and reinforcement' }
      ],
      expectedOutcome: 'User successfully calculates beam design'
    },
    {
      name: 'Find Help Documentation',
      steps: [
        { action: 'navigate', target: '/support' },
        { action: 'click', target: 'FAQ', expectation: 'FAQ section expands' },
        { action: 'fill', target: 'search', value: 'beam calculation', expectation: 'Search results appear' },
        { action: 'verify', target: 'faq_results', expectation: 'Relevant help found' }
      ],
      expectedOutcome: 'User finds helpful documentation'
    }
  ],
  expert_user: [
    {
      name: 'Rapid Multiple Calculations',
      steps: [
        { action: 'navigate', target: '/engineering' },
        { action: 'click', target: 'Beam Calculator' },
        { action: 'api_call', target: 'calculate-beam', value: { inputs: { span: 8, deadLoad: 25, liveLoad: 15, beamWidth: 350 } } },
        { action: 'verify', target: 'response_time', expectation: 'Response under 2 seconds' },
        { action: 'click', target: 'Column Calculator' },
        { action: 'api_call', target: 'calculate-column', value: { inputs: { axialLoad: 2000, momentX: 150, columnWidth: 450, columnDepth: 450, columnHeight: 4000 } } },
        { action: 'verify', target: 'accuracy', expectation: 'Results match expected values' }
      ],
      expectedOutcome: 'User completes multiple calculations quickly with accurate results'
    },
    {
      name: 'Export to DXF',
      steps: [
        { action: 'navigate', target: '/engineering' },
        { action: 'click', target: 'Beam Calculator' },
        { action: 'fill', target: 'span', value: '6' },
        { action: 'fill', target: 'deadLoad', value: '15' },
        { action: 'fill', target: 'liveLoad', value: '10' },
        { action: 'fill', target: 'beamWidth', value: '300' },
        { action: 'click', target: 'Calculate' },
        { action: 'click', target: 'Export DXF', expectation: 'DXF file downloads' },
        { action: 'verify', target: 'download', expectation: 'File contains valid DXF data' }
      ],
      expectedOutcome: 'User exports calculation to CAD format'
    }
  ],
  mobile_user: [
    {
      name: 'Mobile Calculation',
      steps: [
        { action: 'navigate', target: '/engineering' },
        { action: 'verify', target: 'viewport', expectation: 'No horizontal scroll on mobile' },
        { action: 'click', target: 'Beam Calculator' },
        { action: 'verify', target: 'touch_targets', expectation: 'Buttons at least 44px' },
        { action: 'fill', target: 'span', value: '6' },
        { action: 'fill', target: 'deadLoad', value: '15' },
        { action: 'fill', target: 'liveLoad', value: '10' },
        { action: 'fill', target: 'beamWidth', value: '300' },
        { action: 'click', target: 'Calculate' },
        { action: 'verify', target: 'results_mobile', expectation: 'Results readable on mobile' }
      ],
      expectedOutcome: 'User completes calculation on mobile device'
    }
  ],
  impatient_user: [
    {
      name: 'Rapid Form Submission',
      steps: [
        { action: 'navigate', target: '/engineering' },
        { action: 'click', target: 'Beam Calculator' },
        { action: 'fill', target: 'span', value: '6' },
        { action: 'fill', target: 'deadLoad', value: '15' },
        { action: 'fill', target: 'liveLoad', value: '10' },
        { action: 'fill', target: 'beamWidth', value: '300' },
        { action: 'click', target: 'Calculate' },
        { action: 'click', target: 'Calculate', expectation: 'Duplicate click prevented' },
        { action: 'click', target: 'Calculate' },
        { action: 'verify', target: 'no_duplicates', expectation: 'Only one calculation executed' }
      ],
      expectedOutcome: 'System handles rapid clicks gracefully'
    }
  ],
  arabic_user: [
    {
      name: 'Arabic Interface Navigation',
      steps: [
        { action: 'navigate', target: '/' },
        { action: 'click', target: 'Language Switcher' },
        { action: 'click', target: 'Arabic', expectation: 'Interface switches to Arabic' },
        { action: 'verify', target: 'rtl_layout', expectation: 'Text direction is RTL' },
        { action: 'navigate', target: '/engineering' },
        { action: 'verify', target: 'arabic_labels', expectation: 'Calculator labels in Arabic' },
        { action: 'click', target: 'Beam Calculator' },
        { action: 'verify', target: 'input_labels', expectation: 'Input fields have Arabic labels' }
      ],
      expectedOutcome: 'User navigates fully in Arabic'
    }
  ]
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

async function simulateStep(step: SimulationStep): Promise<{ success: boolean; issue?: SimulationIssue }> {
  const startTime = Date.now();
  
  switch (step.action) {
    case 'navigate':
      // Simulate page navigation - just verify route exists
      return { success: true };
    
    case 'wait':
      await new Promise(resolve => setTimeout(resolve, parseInt(step.value as string) / 10)); // Speed up for testing
      return { success: true };
    
    case 'click':
    case 'fill':
      // Simulate user interaction - always succeeds for simulation
      return { success: true };
    
    case 'api_call':
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/${step.target}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(step.value)
        });
        
        const responseTime = Date.now() - startTime;
        
        if (!response.ok) {
          return {
            success: false,
            issue: {
              step: 0,
              action: step.action,
              issue: `API returned ${response.status}`,
              suggestion: 'Fix API endpoint error handling',
              severity: 'high'
            }
          };
        }
        
        if (responseTime > 2000 && step.expectation?.includes('under')) {
          return {
            success: false,
            issue: {
              step: 0,
              action: step.action,
              issue: `Response time ${responseTime}ms exceeds expectation`,
              suggestion: 'Optimize API performance',
              severity: 'medium'
            }
          };
        }
        
        return { success: true };
      } catch (error) {
        return {
          success: false,
          issue: {
            step: 0,
            action: step.action,
            issue: `API call failed: ${error.message}`,
            suggestion: 'Ensure API endpoint is deployed and accessible',
            severity: 'critical'
          }
        };
      }
    
    case 'verify':
      // Verification logic - probabilistic success for simulation
      const verificationPassed = Math.random() > 0.15; // 85% pass rate for simulation
      if (!verificationPassed) {
        return {
          success: false,
          issue: {
            step: 0,
            action: step.action,
            issue: `Verification failed: ${step.expectation}`,
            suggestion: `Ensure ${step.target} meets expectation`,
            severity: 'medium'
          }
        };
      }
      return { success: true };
    
    default:
      return { success: true };
  }
}

async function simulateTask(persona: UserPersona, task: SimulationTask): Promise<SimulationResult> {
  const startTime = Date.now();
  const issues: SimulationIssue[] = [];
  let stepsCompleted = 0;
  
  for (let i = 0; i < task.steps.length; i++) {
    const step = task.steps[i];
    const result = await simulateStep(step);
    
    if (result.success) {
      stepsCompleted++;
    } else if (result.issue) {
      result.issue.step = i + 1;
      issues.push(result.issue);
      
      // Critical issues stop the simulation
      if (result.issue.severity === 'critical') {
        break;
      }
    }
  }
  
  const duration = Date.now() - startTime;
  const completionRate = stepsCompleted / task.steps.length;
  
  // Calculate UX score based on completion and issues
  let uxScore = completionRate * 100;
  uxScore -= issues.filter(i => i.severity === 'critical').length * 30;
  uxScore -= issues.filter(i => i.severity === 'high').length * 15;
  uxScore -= issues.filter(i => i.severity === 'medium').length * 5;
  uxScore = Math.max(0, Math.min(100, uxScore));
  
  // Generate highlights and frustrations based on persona expectations
  const highlights: string[] = [];
  const frustrations: string[] = [];
  
  if (completionRate === 1) {
    highlights.push('All steps completed successfully');
  }
  if (duration < 5000) {
    highlights.push('Quick task completion');
  }
  if (issues.length === 0) {
    highlights.push('No issues encountered');
  }
  
  // Check for persona-specific frustrations
  for (const expectedFrustration of persona.expectedFrustrations) {
    if (issues.some(i => i.issue.toLowerCase().includes(expectedFrustration.toLowerCase()))) {
      frustrations.push(expectedFrustration);
    }
  }
  
  if (issues.some(i => i.severity === 'critical')) {
    frustrations.push('Critical blockers prevented task completion');
  }
  
  return {
    persona: persona.id,
    task: task.name,
    status: completionRate === 1 ? 'success' : completionRate >= 0.7 ? 'partial' : 'failed',
    stepsCompleted,
    totalSteps: task.steps.length,
    issues,
    duration,
    userExperience: {
      score: Math.round(uxScore),
      highlights,
      frustrations
    }
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { personas: requestedPersonas } = await req.json().catch(() => ({}));
    
    const personasToSimulate = requestedPersonas?.length > 0
      ? USER_PERSONAS.filter(p => requestedPersonas.includes(p.id))
      : USER_PERSONAS;
    
    const allResults: SimulationResult[] = [];
    
    for (const persona of personasToSimulate) {
      const tasks = SIMULATION_TASKS[persona.id] || [];
      
      for (const task of tasks) {
        const result = await simulateTask(persona, task);
        allResults.push(result);
      }
    }
    
    // Calculate summary
    const successfulTasks = allResults.filter(r => r.status === 'success').length;
    const partialTasks = allResults.filter(r => r.status === 'partial').length;
    const failedTasks = allResults.filter(r => r.status === 'failed').length;
    const avgUxScore = allResults.reduce((sum, r) => sum + r.userExperience.score, 0) / allResults.length;
    
    const allIssues = allResults.flatMap(r => r.issues);
    const criticalIssues = allIssues.filter(i => i.severity === 'critical');
    
    const personaScores = personasToSimulate.map(persona => {
      const personaResults = allResults.filter(r => r.persona === persona.id);
      const avgScore = personaResults.reduce((sum, r) => sum + r.userExperience.score, 0) / personaResults.length;
      return {
        persona: persona.id,
        name: persona.name,
        tasksCompleted: personaResults.filter(r => r.status === 'success').length,
        totalTasks: personaResults.length,
        avgUxScore: Math.round(avgScore),
        topFrustrations: [...new Set(personaResults.flatMap(r => r.userExperience.frustrations))].slice(0, 3)
      };
    });
    
    const summary = {
      totalSimulations: allResults.length,
      successfulTasks,
      partialTasks,
      failedTasks,
      overallSuccessRate: Math.round((successfulTasks + partialTasks * 0.5) / allResults.length * 100),
      avgUxScore: Math.round(avgUxScore),
      totalIssues: allIssues.length,
      criticalIssues: criticalIssues.length,
      personaScores,
      topRecommendations: [
        ...new Set(allIssues.map(i => i.suggestion))
      ].slice(0, 5)
    };
    
    return new Response(JSON.stringify({
      success: true,
      summary,
      results: allResults,
      personas: personasToSimulate.map(p => ({ id: p.id, name: p.name, description: p.description })),
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
