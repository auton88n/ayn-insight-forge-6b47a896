import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { activateMaintenanceMode } from "../_shared/maintenanceGuard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') || '';
const SCREENSHOTONE_API_KEY = Deno.env.get('SCREENSHOTONE_API_KEY') || '';

// Critical pages for quick tests
const CRITICAL_PAGES = [
  { path: '/', name: 'Landing Page', viewports: ['desktop', 'mobile'] },
  { path: '/engineering', name: 'Engineering Workspace', viewports: ['desktop'] },
  { path: '/support', name: 'Support Center', viewports: ['desktop'] },
  { path: '/settings', name: 'User Settings', viewports: ['desktop'] },
];

// Full coverage of ALL pages (16 pages)
const PAGES_TO_TEST = [
  // === PUBLIC LANDING PAGES ===
  { path: '/', name: 'Landing Page', viewports: ['desktop', 'mobile'] },
  
  // === SERVICE PAGES ===
  { path: '/services/ai-employee', name: 'AI Employee Service', viewports: ['desktop', 'mobile'] },
  { path: '/services/content-creator-sites', name: 'Influencer Sites', viewports: ['desktop', 'mobile'] },
  { path: '/services/ai-agents', name: 'AI Agents Service', viewports: ['desktop', 'mobile'] },
  { path: '/services/automation', name: 'Automation Service', viewports: ['desktop', 'mobile'] },
  { path: '/services/civil-engineering', name: 'Civil Engineering', viewports: ['desktop', 'mobile'] },
  
  // === APPLICATION FORMS ===
  { path: '/services/ai-employee/apply', name: 'AI Employee Apply', viewports: ['desktop', 'mobile'] },
  { path: '/services/content-creator-sites/apply', name: 'Influencer Apply', viewports: ['desktop', 'mobile'] },
  { path: '/services/ai-agents/apply', name: 'AI Agents Apply', viewports: ['desktop', 'mobile'] },
  { path: '/services/automation/apply', name: 'Automation Apply', viewports: ['desktop', 'mobile'] },
  
  // === CORE APP TOOLS ===
  { path: '/support', name: 'Support Center', viewports: ['desktop', 'mobile'] },
  { path: '/settings', name: 'User Settings', viewports: ['desktop', 'mobile'] },
  
  { path: '/engineering', name: 'Engineering Workspace', viewports: ['desktop'] },
  { path: '/engineering/grading', name: 'AI Grading Designer', viewports: ['desktop'] },
  
  // === UTILITY PAGES ===
  { path: '/reset-password', name: 'Password Reset', viewports: ['desktop', 'mobile'] },
];

// Viewport configurations
const VIEWPORTS: Record<string, { width: number; height: number }> = {
  desktop: { width: 1920, height: 1080 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 }
};

interface VisualIssue {
  type: 'layout' | 'visual' | 'responsive' | 'accessibility' | 'content' | 'performance';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  location?: string;
  element?: string;
  suggestion: string;
}

interface ViewportResult {
  viewport: string;
  screenshotUrl: string;
  issues: VisualIssue[];
  analysisTime: number;
}

interface PageResult {
  path: string;
  name: string;
  status: 'passed' | 'warning' | 'failed';
  analysisMethod: 'gpt4_vision';
  viewportResults: ViewportResult[];
  issues: VisualIssue[];
  metrics: {
    screenshotCount: number;
    totalIssues: number;
    analysisTime: number;
  };
}

// Capture screenshot using screenshotone.com API
async function captureScreenshot(url: string, viewport: string): Promise<{ url: string; base64: string } | null> {
  if (!SCREENSHOTONE_API_KEY) {
    console.error('SCREENSHOTONE_API_KEY not configured');
    return null;
  }

  const { width, height } = VIEWPORTS[viewport];
  
  const params = new URLSearchParams({
    access_key: SCREENSHOTONE_API_KEY,
    url: url,
    viewport_width: width.toString(),
    viewport_height: height.toString(),
    full_page: 'false',
    format: 'png',
    image_quality: '80',
    delay: '2',
    block_ads: 'true',
    block_cookie_banners: 'true',
    dark_mode: 'true',
  });
  
  const screenshotUrl = `https://api.screenshotone.com/take?${params}`;
  
  try {
    console.log(`Capturing ${viewport} screenshot for ${url}`);
    const response = await fetch(screenshotUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Screenshot failed: ${response.status} - ${errorText}`);
      return null;
    }
    
    // Convert to base64 for GPT-4 Vision
    const imageBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(imageBuffer);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);
    
    // Return both the URL for viewing and base64 for AI analysis
    return { 
      url: screenshotUrl,
      base64 
    };
  } catch (error) {
    console.error(`Screenshot capture error: ${error}`);
    return null;
  }
}

// Analyze screenshot with GPT-4 Vision
async function analyzeScreenshotWithVision(
  base64Image: string, 
  pageName: string, 
  viewport: string
): Promise<VisualIssue[]> {
  if (!LOVABLE_API_KEY) {
    console.error('LOVABLE_API_KEY not configured');
    return [{
      type: 'content',
      severity: 'low',
      description: 'AI analysis unavailable - LOVABLE_API_KEY not configured',
      suggestion: 'Configure LOVABLE_API_KEY secret'
    }];
  }

  try {
    console.log(`Analyzing ${viewport} screenshot of ${pageName} with AI Vision`);
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a UI/UX expert analyzing a ${viewport} screenshot of the "${pageName}" page.

ANALYZE FOR THESE ISSUES:
1. **Layout Issues**: Overlapping elements, misaligned content, broken grids, asymmetric spacing
2. **Visual Bugs**: Broken images, incorrect colors, missing icons, cut-off text, rendering glitches
3. **Responsive Problems**: Elements too small/large for viewport, horizontal overflow, cramped content
4. **Accessibility**: Low contrast text, tiny fonts (<12px), unclear buttons, missing focus indicators
5. **Content Issues**: Placeholder text, Lorem ipsum, undefined values, empty sections, broken links

RETURN ONLY a JSON array of issues found (max 5 most important):
[{
  "type": "layout|visual|responsive|accessibility|content",
  "severity": "critical|high|medium|low",
  "description": "Brief specific description of the issue",
  "location": "Where on the page (e.g., 'header', 'hero section', 'navigation', 'footer')",
  "suggestion": "Specific actionable fix"
}]

If the page looks good with no issues, return an empty array: []
Be strict but fair - only report genuine issues that affect user experience.`
          },
          {
            role: 'user',
            content: [
              { 
                type: 'text', 
                text: `Analyze this ${viewport} (${VIEWPORTS[viewport].width}x${VIEWPORTS[viewport].height}) screenshot of "${pageName}":` 
              },
              { 
                type: 'image_url', 
                image_url: { 
                  url: `data:image/png;base64,${base64Image}`,
                  detail: 'high'
                } 
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI Vision error: ${response.status} - ${errorText}`);
      if (response.status === 402) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        await activateMaintenanceMode(supabase, 'AI credits exhausted (402 from ai-visual-tester)');
      }
      return [{
        type: 'content',
        severity: 'low',
        description: `AI analysis failed: ${response.status}${response.status === 429 ? ' (rate limited)' : response.status === 402 ? ' (maintenance activated)' : ''}`,
        suggestion: response.status === 429 ? 'Wait a moment and retry' : response.status === 402 ? 'Credits exhausted - maintenance activated' : 'Check API configuration'
      }];
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '[]';
    
    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        jsonStr = arrayMatch[0];
      }
    }
    
    try {
      const issues = JSON.parse(jsonStr);
      return Array.isArray(issues) ? issues : [];
    } catch {
      console.error('Failed to parse AI response:', content);
      return [];
    }
  } catch (error) {
    console.error(`Vision analysis error: ${error}`);
    return [{
      type: 'content',
      severity: 'low',
      description: `Analysis error: ${error instanceof Error ? error.message : 'Unknown'}`,
      suggestion: 'Retry the visual test'
    }];
  }
}

// Analyze a single page with all its viewports
async function analyzePageWithScreenshots(
  path: string, 
  name: string, 
  viewports: string[], 
  siteUrl: string
): Promise<PageResult> {
  const fullUrl = `${siteUrl}${path}`;
  const viewportResults: ViewportResult[] = [];
  const allIssues: VisualIssue[] = [];
  let totalAnalysisTime = 0;

  for (const viewport of viewports) {
    const startTime = Date.now();
    
    // Capture screenshot
    const screenshot = await captureScreenshot(fullUrl, viewport);
    
    if (!screenshot) {
      viewportResults.push({
        viewport,
        screenshotUrl: '',
        issues: [{
          type: 'content',
          severity: 'critical',
          description: `Failed to capture ${viewport} screenshot - API key may be invalid or quota exceeded`,
          location: 'entire page',
          suggestion: 'Verify SCREENSHOTONE_API_KEY in Supabase secrets. Check screenshotone.com account for valid access key.'
        }],
        analysisTime: Date.now() - startTime
      });
      continue;
    }
    
    // Analyze with GPT-4 Vision
    const issues = await analyzeScreenshotWithVision(screenshot.base64, name, viewport);
    const analysisTime = Date.now() - startTime;
    totalAnalysisTime += analysisTime;
    
    viewportResults.push({
      viewport,
      screenshotUrl: screenshot.url,
      issues,
      analysisTime
    });
    
    allIssues.push(...issues);
  }

  // Determine status based on issues AND screenshot failures
  const criticalCount = allIssues.filter(i => i.severity === 'critical').length;
  const highCount = allIssues.filter(i => i.severity === 'high').length;
  const screenshotsFailed = viewportResults.filter(v => !v.screenshotUrl).length;
  const totalViewports = viewportResults.length;
  
  let status: 'passed' | 'warning' | 'failed' = 'passed';
  
  // Screenshot failures take priority
  if (screenshotsFailed === totalViewports) {
    status = 'failed'; // All screenshots failed
  } else if (screenshotsFailed > 0) {
    status = 'warning'; // Some screenshots failed
  } else if (criticalCount > 0) {
    status = 'failed';
  } else if (highCount > 0 || allIssues.length > 3) {
    status = 'warning';
  }

  return {
    path,
    name,
    status,
    analysisMethod: 'gpt4_vision',
    viewportResults,
    issues: allIssues,
    metrics: {
      screenshotCount: viewportResults.filter(v => v.screenshotUrl).length,
      totalIssues: allIssues.length,
      analysisTime: totalAnalysisTime
    }
  };
}

// Generate AI summary of all results
async function getAISummary(results: PageResult[]): Promise<string> {
  if (!LOVABLE_API_KEY) {
    return 'AI summary unavailable - LOVABLE_API_KEY not configured';
  }
  
  try {
    const summary = results.map(r => ({
      page: r.name,
      path: r.path,
      status: r.status,
      viewports: r.viewportResults.map(v => v.viewport),
      issueCount: r.issues.length,
      criticalIssues: r.issues.filter(i => i.severity === 'critical').map(i => i.description),
      highIssues: r.issues.filter(i => i.severity === 'high').map(i => i.description),
    }));

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: 'You are a UX/UI expert. Provide a brief, actionable summary (max 100 words) of the visual test results. Focus on the top 2-3 priorities.'
          },
          {
            role: 'user',
            content: `Summarize these GPT-4 Vision visual analysis results:\n\n${JSON.stringify(summary, null, 2)}`
          }
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });
    
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    
    const data = await response.json();
    return data.choices[0]?.message?.content || 'No summary generated';
  } catch (error) {
    console.error('AI summary failed:', error);
    return `Summary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const { pages: customPages, siteUrl: customSiteUrl, quickTest } = await req.json().catch(() => ({}));
    
    const siteUrl = customSiteUrl || 'https://aynn.io';
    const pagesToTest = customPages || (quickTest ? CRITICAL_PAGES : PAGES_TO_TEST);
    
    console.log(`Starting GPT-4 Vision visual tests for ${pagesToTest.length} pages on ${siteUrl}`);
    console.log(`Mode: ${quickTest ? 'QUICK TEST (critical pages only)' : 'FULL TEST (all pages)'}`);
    console.log(`SCREENSHOTONE_API_KEY configured: ${!!SCREENSHOTONE_API_KEY}`);
    console.log(`LOVABLE_API_KEY configured: ${!!LOVABLE_API_KEY}`);
    
    // Process pages in parallel batches for speed
    const batchSize = 3;
    const results: PageResult[] = [];
    
    for (let i = 0; i < pagesToTest.length; i += batchSize) {
      const batch = pagesToTest.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(pagesToTest.length / batchSize)}: ${batch.map(p => p.name).join(', ')}`);
      
      const batchResults = await Promise.all(
        batch.map(page => analyzePageWithScreenshots(
          page.path, 
          page.name, 
          page.viewports || ['desktop'],
          siteUrl
        ))
      );
      results.push(...batchResults);
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < pagesToTest.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Get AI summary
    const aiAnalysis = await getAISummary(results);
    
    // Calculate summary metrics
    const passedCount = results.filter(r => r.status === 'passed').length;
    const warningCount = results.filter(r => r.status === 'warning').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    
    const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
    const criticalIssues = results.flatMap(r => r.issues.filter(i => i.severity === 'critical'));
    const highIssues = results.flatMap(r => r.issues.filter(i => i.severity === 'high'));
    
    const totalScreenshots = results.reduce((sum, r) => sum + r.metrics.screenshotCount, 0);
    const avgAnalysisTime = results.reduce((sum, r) => sum + r.metrics.analysisTime, 0) / results.length;
    
    // Calculate health score accounting for screenshot failures
    const totalExpectedScreenshots = pagesToTest.reduce((sum: number, p: { viewports?: string[] }) => sum + (p.viewports?.length || 1), 0);
    const screenshotFailureRate = totalExpectedScreenshots > 0 
      ? (totalExpectedScreenshots - totalScreenshots) / totalExpectedScreenshots 
      : 0;
    
    let healthScore = 100;
    healthScore -= screenshotFailureRate * 50; // Heavy penalty for screenshot failures
    healthScore -= criticalIssues.length * 15;
    healthScore -= highIssues.length * 5;
    healthScore -= warningCount * 3;
    healthScore -= failedCount * 10;
    healthScore = Math.max(0, Math.min(100, healthScore));
    
    let overallRating: 'excellent' | 'good' | 'needs_improvement' | 'poor';
    if (healthScore >= 90) overallRating = 'excellent';
    else if (healthScore >= 70) overallRating = 'good';
    else if (healthScore >= 50) overallRating = 'needs_improvement';
    else overallRating = 'poor';
    
    // Save to database
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const runId = crypto.randomUUID();
    
    await supabase.from('stress_test_metrics').insert({
      run_id: runId,
      test_name: 'visual_test_gpt4_vision',
      success_count: passedCount,
      failure_count: failedCount,
      avg_response_time_ms: avgAnalysisTime,
      error_rate: failedCount / results.length,
    });
    
    console.log(`Visual test complete: ${passedCount} passed, ${warningCount} warnings, ${failedCount} failed`);
    
    return new Response(JSON.stringify({
      success: true,
      summary: {
        totalPages: results.length,
        totalScreenshots,
        passed: passedCount,
        warnings: warningCount,
        failed: failedCount,
        totalIssues,
        criticalIssues: criticalIssues.length,
        highIssues: highIssues.length,
        avgAnalysisTime: `${avgAnalysisTime.toFixed(0)}ms`,
        healthScore,
        overallRating,
      },
      results,
      aiAnalysis,
      testedAt: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Visual tester error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
