import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { activateMaintenanceMode } from "../_shared/maintenanceGuard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Improvement {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'bug' | 'performance' | 'ux' | 'accuracy' | 'security' | 'feature';
  title: string;
  description: string;
  impact: string;
  effort: 'trivial' | 'small' | 'medium' | 'large' | 'epic';
  affectedArea: string;
  suggestedFix?: string;
  codeLocation?: string;
  estimatedHours?: number;
  businessValue: number; // 1-10
  technicalDebt: number; // 1-10
}

interface DataSources {
  testResults?: unknown[];
  bugHunterResults?: unknown;
  securityResults?: unknown;
  uxMetrics?: unknown;
  userFeedback?: unknown[];
  supportTickets?: unknown[];
  engineeringValidation?: unknown;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

async function callAI(prompt: string): Promise<string> {
  if (!LOVABLE_API_KEY) {
    console.error('LOVABLE_API_KEY not configured');
    return '';
  }

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000
      })
    });
    
    if (response.status === 429) {
      console.error('AI rate limited');
      return 'AI analysis temporarily unavailable due to rate limits. Please try again shortly.';
    }
    if (response.status === 402) {
      console.error('AI credits exhausted');
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      await activateMaintenanceMode(supabase, 'AI credits exhausted (402 from ai-improvement-advisor)');
      return 'Service temporarily unavailable. Please try again later.';
    }
    
    if (response.ok) {
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    }
    
    console.error('AI gateway error:', response.status);
  } catch (e) {
    console.error('Lovable AI error:', e);
  }
  
  return '';
}

async function gatherData(supabase: ReturnType<typeof createClient>): Promise<DataSources> {
  const data: DataSources = {};
  
  // Get recent test results
  try {
    const { data: testResults } = await supabase
      .from('test_results')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    data.testResults = testResults || [];
  } catch (e) {
    console.error('Error fetching test results:', e);
  }
  
  // Get recent support tickets
  try {
    const { data: tickets } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    data.supportTickets = tickets || [];
  } catch (e) {
    console.error('Error fetching support tickets:', e);
  }
  
  return data;
}

function analyzeTestResults(testResults: unknown[]): Improvement[] {
  const improvements: Improvement[] = [];
  
  if (!Array.isArray(testResults)) return improvements;
  
  // Find failed tests
  const failedTests = testResults.filter((t: any) => t.status === 'failed');
  const errorsByType: Record<string, number> = {};
  
  for (const test of failedTests) {
    const errorType = (test as any).error_message?.split(':')[0] || 'Unknown';
    errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
  }
  
  // Generate improvements for common failures
  for (const [errorType, count] of Object.entries(errorsByType)) {
    if (count >= 2) {
      improvements.push({
        id: `test_${errorType.toLowerCase().replace(/\s/g, '_')}`,
        priority: count >= 5 ? 'critical' : count >= 3 ? 'high' : 'medium',
        category: 'bug',
        title: `Fix ${errorType} errors (${count} occurrences)`,
        description: `Multiple tests are failing with ${errorType} errors, indicating a systematic issue.`,
        impact: `${count} tests will pass after fix`,
        effort: count >= 5 ? 'medium' : 'small',
        affectedArea: 'Test Suite',
        businessValue: Math.min(count * 2, 10),
        technicalDebt: Math.min(count, 10)
      });
    }
  }
  
  // Check for slow tests
  const slowTests = testResults.filter((t: any) => (t.duration_ms || 0) > 5000);
  if (slowTests.length > 0) {
    improvements.push({
      id: 'slow_tests',
      priority: 'medium',
      category: 'performance',
      title: `Optimize ${slowTests.length} slow tests`,
      description: 'Some tests take more than 5 seconds to complete.',
      impact: 'Faster CI/CD pipeline, better developer experience',
      effort: 'medium',
      affectedArea: 'Testing',
      businessValue: 4,
      technicalDebt: 6
    });
  }
  
  return improvements;
}

function analyzeSecurityResults(securityResults: any): Improvement[] {
  const improvements: Improvement[] = [];
  
  if (!securityResults) return improvements;
  
  // Check for failed security tests
  const failedSecurityTests = securityResults.results?.filter((r: any) => r.status === 'failed') || [];
  
  for (const test of failedSecurityTests) {
    const category = test.test_name?.toLowerCase() || '';
    
    let priority: 'critical' | 'high' | 'medium' | 'low' = 'high';
    if (category.includes('xss') || category.includes('sql') || category.includes('ssrf')) {
      priority = 'critical';
    }
    
    improvements.push({
      id: `security_${test.id || Date.now()}`,
      priority,
      category: 'security',
      title: `Fix security vulnerability: ${test.test_name}`,
      description: test.error_message || 'Security test failed',
      impact: 'Prevents potential data breach or system compromise',
      effort: 'small',
      affectedArea: 'Security',
      businessValue: 10,
      technicalDebt: 9
    });
  }
  
  return improvements;
}

function analyzeEngineeringAccuracy(validationResults: any): Improvement[] {
  const improvements: Improvement[] = [];
  
  if (!validationResults?.results) return improvements;
  
  for (const calc of validationResults.results) {
    if (calc.overallAccuracy < 95) {
      improvements.push({
        id: `accuracy_${calc.calculator}`,
        priority: calc.overallAccuracy < 85 ? 'high' : 'medium',
        category: 'accuracy',
        title: `Improve ${calc.calculator} calculator accuracy (${calc.overallAccuracy}%)`,
        description: calc.issues?.join('; ') || 'Calculation accuracy below target',
        impact: 'More reliable engineering calculations, increased user trust',
        effort: 'medium',
        affectedArea: `Engineering - ${calc.calculator}`,
        suggestedFix: calc.suggestions?.join('\n'),
        businessValue: 8,
        technicalDebt: 5
      });
    }
    
    // Check individual standard compliance
    if (!calc.standardsCompliance?.ACI_318) {
      improvements.push({
        id: `compliance_aci_${calc.calculator}`,
        priority: 'high',
        category: 'accuracy',
        title: `Fix ACI 318 compliance for ${calc.calculator}`,
        description: 'Calculator does not fully comply with ACI 318-19 standards',
        impact: 'Legal and professional liability reduction',
        effort: 'medium',
        affectedArea: `Engineering - ${calc.calculator}`,
        businessValue: 9,
        technicalDebt: 7
      });
    }
  }
  
  return improvements;
}

function analyzeSupportTickets(tickets: unknown[]): Improvement[] {
  const improvements: Improvement[] = [];
  
  if (!Array.isArray(tickets) || tickets.length === 0) return improvements;
  
  // Group tickets by common themes
  const themes: Record<string, number> = {};
  
  for (const ticket of tickets) {
    const subject = ((ticket as any).subject || '').toLowerCase();
    
    if (subject.includes('error') || subject.includes('bug')) {
      themes['bugs'] = (themes['bugs'] || 0) + 1;
    }
    if (subject.includes('slow') || subject.includes('loading')) {
      themes['performance'] = (themes['performance'] || 0) + 1;
    }
    if (subject.includes('confus') || subject.includes('help') || subject.includes('how')) {
      themes['usability'] = (themes['usability'] || 0) + 1;
    }
    if (subject.includes('feature') || subject.includes('add') || subject.includes('want')) {
      themes['features'] = (themes['features'] || 0) + 1;
    }
  }
  
  for (const [theme, count] of Object.entries(themes)) {
    if (count >= 3) {
      improvements.push({
        id: `support_${theme}`,
        priority: count >= 10 ? 'high' : 'medium',
        category: theme === 'bugs' ? 'bug' : theme === 'performance' ? 'performance' : 'ux',
        title: `Address ${count} user-reported ${theme} issues`,
        description: `Users have submitted ${count} tickets related to ${theme}`,
        impact: 'Improved user satisfaction, reduced support burden',
        effort: 'large',
        affectedArea: 'User-facing',
        businessValue: Math.min(count, 10),
        technicalDebt: 3
      });
    }
  }
  
  return improvements;
}

function prioritizeImprovements(improvements: Improvement[]): Improvement[] {
  // Calculate priority score
  const scored = improvements.map(imp => {
    let score = 0;
    
    // Priority weight
    score += imp.priority === 'critical' ? 100 : imp.priority === 'high' ? 75 : imp.priority === 'medium' ? 50 : 25;
    
    // Business value
    score += imp.businessValue * 5;
    
    // Technical debt
    score += imp.technicalDebt * 3;
    
    // Effort (inverse - easier is better)
    score += imp.effort === 'trivial' ? 30 : imp.effort === 'small' ? 25 : imp.effort === 'medium' ? 15 : imp.effort === 'large' ? 5 : 0;
    
    return { ...imp, _score: score };
  });
  
  // Sort by score
  scored.sort((a, b) => b._score - a._score);
  
  // Remove score from output
  return scored.map(({ _score, ...imp }) => imp);
}

async function generateAISuggestions(improvements: Improvement[]): Promise<string> {
  if (improvements.length === 0) {
    return 'No significant issues found. The system is performing well.';
  }
  
  const criticalCount = improvements.filter(i => i.priority === 'critical').length;
  const highCount = improvements.filter(i => i.priority === 'high').length;
  
  const prompt = `As a senior software architect, analyze these improvement items and provide a brief executive summary and recommended action plan:

Critical Issues: ${criticalCount}
High Priority: ${highCount}
Total Items: ${improvements.length}

Top 5 items:
${improvements.slice(0, 5).map((i, idx) => `${idx + 1}. [${i.priority.toUpperCase()}] ${i.title} - ${i.description}`).join('\n')}

Provide:
1. A 2-3 sentence executive summary
2. Recommended sprint priorities (what to fix first)
3. One key architectural recommendation

Keep response under 300 words.`;

  const aiResponse = await callAI(prompt);
  
  if (aiResponse) {
    return aiResponse;
  }
  
  // Fallback response if AI unavailable
  return `Executive Summary: Found ${improvements.length} improvement opportunities with ${criticalCount} critical and ${highCount} high-priority items requiring immediate attention.

Recommended Priorities:
1. Address all critical security and stability issues first
2. Fix high-priority bugs affecting user experience
3. Improve calculation accuracy for engineering tools
4. Optimize performance for slow operations

Key Recommendation: Focus on automated testing coverage to prevent regression of fixed issues.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { engineeringValidation, securityResults } = await req.json().catch(() => ({}));
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    // Gather data from all sources
    const data = await gatherData(supabase);
    
    // Analyze each data source
    const allImprovements: Improvement[] = [];
    
    allImprovements.push(...analyzeTestResults(data.testResults || []));
    allImprovements.push(...analyzeSecurityResults(securityResults));
    allImprovements.push(...analyzeEngineeringAccuracy(engineeringValidation));
    allImprovements.push(...analyzeSupportTickets(data.supportTickets || []));
    
    // Add some standard improvements if list is empty
    if (allImprovements.length === 0) {
      allImprovements.push({
        id: 'monitoring',
        priority: 'medium',
        category: 'feature',
        title: 'Add comprehensive error monitoring',
        description: 'Implement error tracking to catch issues proactively',
        impact: 'Faster issue detection and resolution',
        effort: 'medium',
        affectedArea: 'Infrastructure',
        businessValue: 7,
        technicalDebt: 4
      });
    }
    
    // Prioritize improvements
    const prioritized = prioritizeImprovements(allImprovements);
    
    // Generate AI analysis
    const aiAnalysis = await generateAISuggestions(prioritized);
    
    // Calculate summary stats
    const summary = {
      totalImprovements: prioritized.length,
      byPriority: {
        critical: prioritized.filter(i => i.priority === 'critical').length,
        high: prioritized.filter(i => i.priority === 'high').length,
        medium: prioritized.filter(i => i.priority === 'medium').length,
        low: prioritized.filter(i => i.priority === 'low').length
      },
      byCategory: {
        bug: prioritized.filter(i => i.category === 'bug').length,
        security: prioritized.filter(i => i.category === 'security').length,
        performance: prioritized.filter(i => i.category === 'performance').length,
        accuracy: prioritized.filter(i => i.category === 'accuracy').length,
        ux: prioritized.filter(i => i.category === 'ux').length,
        feature: prioritized.filter(i => i.category === 'feature').length
      },
      estimatedTotalEffort: prioritized.reduce((sum, i) => {
        const hours = { trivial: 1, small: 4, medium: 16, large: 40, epic: 80 };
        return sum + (i.estimatedHours || hours[i.effort] || 8);
      }, 0),
      avgBusinessValue: prioritized.length > 0 
        ? (prioritized.reduce((sum, i) => sum + i.businessValue, 0) / prioritized.length).toFixed(1)
        : 0
    };
    
    return new Response(JSON.stringify({
      success: true,
      summary,
      improvements: prioritized,
      aiAnalysis,
      topRecommendations: prioritized.slice(0, 5).map(i => ({
        title: i.title,
        priority: i.priority,
        effort: i.effort,
        impact: i.impact
      })),
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
