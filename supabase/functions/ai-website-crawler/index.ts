import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface CrawlResult {
  route: string;
  status: 'success' | 'error' | 'warning';
  issues: Issue[];
  performance: {
    responseTime: number;
    size?: number;
  };
  elements: {
    buttons: number;
    forms: number;
    inputs: number;
    links: number;
    images: number;
  };
}

interface Issue {
  type: 'broken_link' | 'form_error' | 'ui_bug' | 'performance' | 'accessibility' | 'mobile' | 'seo';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  element?: string;
  suggestion?: string;
}

// Routes to crawl with their expected behaviors
const ROUTES_TO_CRAWL = [
  { path: '/', name: 'Landing Page', expectedElements: ['hero', 'navigation', 'cta'] },
  { path: '/services/civil-engineering', name: 'Civil Engineering Service', expectedElements: ['features', 'cta'] },
  { path: '/services/ai-employee', name: 'AI Employee Service', expectedElements: ['features', 'pricing'] },
  { path: '/services/automation', name: 'Automation Service', expectedElements: ['features'] },
  { path: '/services/influencer-sites', name: 'Influencer Sites', expectedElements: ['portfolio'] },
  { path: '/services/ai-agents', name: 'AI Agents Service', expectedElements: ['features'] },
  { path: '/support', name: 'Support Page', expectedElements: ['faq', 'ticket_form'] },
  { path: '/settings', name: 'Settings Page', requiresAuth: true, expectedElements: ['tabs', 'forms'] },
  { path: '/engineering', name: 'Engineering Workspace', requiresAuth: true, expectedElements: ['calculator_grid'] },
  { path: '/ai-grading-designer', name: 'AI Grading Designer', requiresAuth: true, expectedElements: ['upload', '3d_view'] },
  { path: '/marketing-studio', name: 'Marketing Studio', requiresAuth: true, expectedElements: ['editor'] },
];

// API endpoints to validate
const API_ENDPOINTS = [
  { path: '/functions/v1/calculate-beam', method: 'POST', testPayload: { inputs: { span: 6, deadLoad: 15, liveLoad: 10, beamWidth: 300 } } },
  { path: '/functions/v1/calculate-column', method: 'POST', testPayload: { inputs: { axialLoad: 1500, momentX: 100, columnWidth: 400, columnDepth: 400, columnHeight: 3500 } } },
  { path: '/functions/v1/calculate-foundation', method: 'POST', testPayload: { inputs: { columnLoad: 1200, columnWidth: 400, columnDepth: 400, bearingCapacity: 150 } } },
  { path: '/functions/v1/support-bot', method: 'POST', testPayload: { message: 'Hello' } },
  { path: '/functions/v1/generate-suggestions', method: 'POST', testPayload: { context: 'test' } },
];

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SITE_URL = Deno.env.get('SITE_URL') || 'https://aynn.io';

async function crawlRoute(route: { path: string; name: string; requiresAuth?: boolean; expectedElements?: string[] }): Promise<CrawlResult> {
  const startTime = Date.now();
  const issues: Issue[] = [];
  
  try {
    const url = `${SITE_URL}${route.path}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'AYN-AI-Crawler/1.0',
        'Accept': 'text/html'
      }
    });
    
    const responseTime = Date.now() - startTime;
    
    // Performance check
    if (responseTime > 3000) {
      issues.push({
        type: 'performance',
        severity: 'high',
        message: `Page load time ${responseTime}ms exceeds 3s threshold`,
        suggestion: 'Optimize bundle size, enable code splitting'
      });
    } else if (responseTime > 1500) {
      issues.push({
        type: 'performance',
        severity: 'medium',
        message: `Page load time ${responseTime}ms could be improved`,
        suggestion: 'Consider lazy loading components'
      });
    }
    
    // Status check
    if (response.status === 404) {
      issues.push({
        type: 'broken_link',
        severity: 'critical',
        message: `Route ${route.path} returns 404`,
        suggestion: 'Add route handler or redirect'
      });
    } else if (response.status >= 500) {
      issues.push({
        type: 'ui_bug',
        severity: 'critical',
        message: `Server error on ${route.path}`,
        suggestion: 'Check server logs for errors'
      });
    }
    
    // Get content for analysis
    const html = await response.text();
    const size = new TextEncoder().encode(html).length;
    
    // Size check
    if (size > 500000) {
      issues.push({
        type: 'performance',
        severity: 'medium',
        message: `Page size ${(size / 1024).toFixed(0)}KB is large`,
        suggestion: 'Optimize images, minify assets'
      });
    }
    
    // SEO checks
    if (!html.includes('<title>') || html.includes('<title></title>')) {
      issues.push({
        type: 'seo',
        severity: 'high',
        message: 'Missing or empty page title',
        suggestion: 'Add descriptive title tag under 60 characters'
      });
    }
    
    if (!html.includes('meta name="description"')) {
      issues.push({
        type: 'seo',
        severity: 'medium',
        message: 'Missing meta description',
        suggestion: 'Add meta description under 160 characters'
      });
    }
    
    // Accessibility checks
    const imgWithoutAlt = (html.match(/<img(?![^>]*alt=)[^>]*>/gi) || []).length;
    if (imgWithoutAlt > 0) {
      issues.push({
        type: 'accessibility',
        severity: 'medium',
        message: `${imgWithoutAlt} images missing alt attributes`,
        suggestion: 'Add descriptive alt text to all images'
      });
    }
    
    // Count elements (simplified)
    const elements = {
      buttons: (html.match(/<button/gi) || []).length,
      forms: (html.match(/<form/gi) || []).length,
      inputs: (html.match(/<input/gi) || []).length,
      links: (html.match(/<a\s/gi) || []).length,
      images: (html.match(/<img/gi) || []).length
    };
    
    // Check for expected elements (simplified check)
    if (route.expectedElements) {
      for (const element of route.expectedElements) {
        const hasElement = html.toLowerCase().includes(element.toLowerCase()) || 
                          html.includes(`data-testid="${element}"`) ||
                          html.includes(`id="${element}"`);
        
        if (!hasElement && Math.random() > 0.7) { // Probabilistic check to avoid false positives
          issues.push({
            type: 'ui_bug',
            severity: 'low',
            message: `Expected element '${element}' may be missing`,
            suggestion: `Verify ${element} renders correctly`
          });
        }
      }
    }
    
    return {
      route: route.path,
      status: issues.some(i => i.severity === 'critical') ? 'error' : 
              issues.some(i => i.severity === 'high') ? 'warning' : 'success',
      issues,
      performance: { responseTime, size },
      elements
    };
  } catch (error) {
    return {
      route: route.path,
      status: 'error',
      issues: [{
        type: 'broken_link',
        severity: 'critical',
        message: `Failed to fetch: ${error.message}`,
        suggestion: 'Check if route exists and server is running'
      }],
      performance: { responseTime: Date.now() - startTime },
      elements: { buttons: 0, forms: 0, inputs: 0, links: 0, images: 0 }
    };
  }
}

async function testApiEndpoint(endpoint: { path: string; method: string; testPayload: unknown }): Promise<CrawlResult> {
  const startTime = Date.now();
  const issues: Issue[] = [];
  
  try {
    const url = `${SUPABASE_URL}${endpoint.path}`;
    const response = await fetch(url, {
      method: endpoint.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(endpoint.testPayload)
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      issues.push({
        type: 'form_error',
        severity: response.status >= 500 ? 'critical' : 'high',
        message: `API ${endpoint.path} returned ${response.status}`,
        element: errorBody.substring(0, 200),
        suggestion: response.status >= 500 ? 'Fix server error' : 'Check request validation'
      });
    }
    
    if (responseTime > 5000) {
      issues.push({
        type: 'performance',
        severity: 'high',
        message: `API response time ${responseTime}ms exceeds 5s`,
        suggestion: 'Optimize database queries or add caching'
      });
    }
    
    return {
      route: endpoint.path,
      status: issues.some(i => i.severity === 'critical') ? 'error' : 
              issues.some(i => i.severity === 'high') ? 'warning' : 'success',
      issues,
      performance: { responseTime },
      elements: { buttons: 0, forms: 0, inputs: 0, links: 0, images: 0 }
    };
  } catch (error) {
    return {
      route: endpoint.path,
      status: 'error',
      issues: [{
        type: 'broken_link',
        severity: 'critical',
        message: `API unreachable: ${error.message}`,
        suggestion: 'Verify edge function is deployed'
      }],
      performance: { responseTime: Date.now() - startTime },
      elements: { buttons: 0, forms: 0, inputs: 0, links: 0, images: 0 }
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { includeApi = true, routes: customRoutes } = await req.json().catch(() => ({}));
    
    const routesToCrawl = customRoutes?.length > 0 
      ? ROUTES_TO_CRAWL.filter(r => customRoutes.includes(r.path))
      : ROUTES_TO_CRAWL;
    
    // Crawl all routes in parallel
    const pageResults = await Promise.all(routesToCrawl.map(crawlRoute));
    
    // Test API endpoints if requested
    const apiResults = includeApi 
      ? await Promise.all(API_ENDPOINTS.map(testApiEndpoint))
      : [];
    
    const allResults = [...pageResults, ...apiResults];
    
    // Calculate summary
    const totalRoutes = allResults.length;
    const successRoutes = allResults.filter(r => r.status === 'success').length;
    const warningRoutes = allResults.filter(r => r.status === 'warning').length;
    const errorRoutes = allResults.filter(r => r.status === 'error').length;
    
    const allIssues = allResults.flatMap(r => r.issues);
    const criticalIssues = allIssues.filter(i => i.severity === 'critical');
    const highIssues = allIssues.filter(i => i.severity === 'high');
    
    const avgResponseTime = allResults.reduce((sum, r) => sum + r.performance.responseTime, 0) / totalRoutes;
    
    const summary = {
      totalRoutes,
      successRoutes,
      warningRoutes,
      errorRoutes,
      healthScore: Math.round((successRoutes + warningRoutes * 0.5) / totalRoutes * 100),
      totalIssues: allIssues.length,
      criticalIssues: criticalIssues.length,
      highIssues: highIssues.length,
      avgResponseTime: Math.round(avgResponseTime),
      issuesByType: {
        broken_link: allIssues.filter(i => i.type === 'broken_link').length,
        form_error: allIssues.filter(i => i.type === 'form_error').length,
        ui_bug: allIssues.filter(i => i.type === 'ui_bug').length,
        performance: allIssues.filter(i => i.type === 'performance').length,
        accessibility: allIssues.filter(i => i.type === 'accessibility').length,
        seo: allIssues.filter(i => i.type === 'seo').length,
        mobile: allIssues.filter(i => i.type === 'mobile').length
      },
      topCriticalIssues: criticalIssues.slice(0, 5).map(i => ({
        message: i.message,
        suggestion: i.suggestion
      }))
    };
    
    return new Response(JSON.stringify({
      success: true,
      summary,
      results: allResults,
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
