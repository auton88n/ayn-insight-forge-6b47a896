import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { AYN_BRAND, getEmployeeSystemPrompt } from "../_shared/aynBrand.ts";
import { scrapeUrl, searchWeb } from "../_shared/firecrawlHelper.ts";
import { sanitizeForPrompt, FIRECRAWL_CONTENT_GUARD } from "../_shared/sanitizeFirecrawl.ts";
import { sanitizeUserPrompt, INJECTION_GUARD } from "../_shared/sanitizePrompt.ts";
import { logAynActivity } from "../_shared/aynLogger.ts";
import { notifyFounder } from "../_shared/proactiveAlert.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const apiKey = Deno.env.get('LOVABLE_API_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { mode = 'analyze_pipeline', command, source } = body;

    console.log(`[marketing-strategist] Mode: ${mode}, Command: ${command || 'none'}`);

    let result: any;

    switch (mode) {
      case 'campaign':
        result = await handleCampaign(supabase, body, apiKey);
        break;
      case 'email_copy':
        result = await handleEmailCopy(supabase, body, apiKey);
        break;
      case 'positioning':
        result = await handlePositioning(supabase, body, apiKey);
        break;
      case 'content_plan':
        result = await handleContentPlan(supabase, body, apiKey);
        break;
      case 'analyze_pipeline':
        result = await handleAnalyzePipeline(supabase, body, apiKey);
        break;
      default:
        result = await handleAnalyzePipeline(supabase, body, apiKey);
    }

    await logAynActivity(supabase, 'marketing_strategist', `Mode: ${mode}`, {
      triggered_by: 'marketing',
      details: { mode, command, result_summary: typeof result?.strategy === 'string' ? result.strategy.substring(0, 200) : 'completed' },
    });

    // Notify founder with summary
    const summary = typeof result?.strategy === 'string' ? result.strategy.substring(0, 200) : (typeof result?.analysis === 'string' ? result.analysis.substring(0, 200) : `${mode} complete`);
    await notifyFounder(supabase, {
      employee_id: 'marketing',
      message: `${mode} done. ${summary}${summary.length >= 200 ? '...' : ''} want me to dig deeper or take action?`,
      priority: 'info',
      details: { mode, leads_found: result?.leads_found, total_leads: result?.total_leads },
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[marketing-strategist] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ─── Load pipeline leads ───
async function loadPipelineLeads(supabase: any, filters?: { industry?: string; status?: string; limit?: number }) {
  let query = supabase.from('ayn_sales_pipeline').select('*').order('updated_at', { ascending: false });
  if (filters?.industry) query = query.ilike('industry', `%${filters.industry}%`);
  if (filters?.status) query = query.eq('status', filters.status);
  query = query.limit(filters?.limit || 20);
  const { data, error } = await query;
  if (error) console.error('[marketing] Pipeline load error:', error.message);
  return data || [];
}

// ─── Load investigator dossiers from employee_tasks ───
async function loadDossiers(supabase: any, companyNames?: string[]) {
  const query = supabase.from('employee_tasks')
    .select('*')
    .eq('to_employee', 'investigator')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(20);
  const { data } = await query;
  if (!data) return [];
  if (companyNames && companyNames.length > 0) {
    return data.filter((t: any) => {
      const taskStr = JSON.stringify(t.input_data || {}).toLowerCase();
      return companyNames.some(n => taskStr.includes(n.toLowerCase()));
    });
  }
  return data;
}

// ─── Load strategic context ───
async function loadStrategicContext(supabase: any) {
  const { data: mind } = await supabase.from('ayn_mind')
    .select('content, type')
    .order('created_at', { ascending: false })
    .limit(5);
  const { data: directives } = await supabase.from('founder_directives')
    .select('directive, category, priority')
    .eq('is_active', true)
    .order('priority', { ascending: true });
  return { insights: mind || [], directives: directives || [] };
}

// ─── LLM call helper ───
async function callLLM(apiKey: string, systemPrompt: string, userPrompt: string, maxTokens = 800): Promise<string> {
  if (!apiKey) return '[Marketing needs AI gateway configured]';
  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) {
      console.error('[marketing] LLM error:', res.status);
      return '[Could not generate — AI gateway error]';
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '[No response generated]';
  } catch (e) {
    console.error('[marketing] LLM call failed:', e);
    return '[LLM call failed]';
  }
}

// ─── Build marketing system prompt ───
function buildMarketingSystem(context: string): string {
  const personality = getEmployeeSystemPrompt('marketing');
  const services = AYN_BRAND.services.map(s => `- ${s.name}: ${s.desc}`).join('\n');
  return `${personality}

AYN Services you can recommend:
${services}

Brand voice rules:
${AYN_BRAND.voice.rules.join('\n')}

Email standards: Write like a founder texting a smart contact. No buzzwords. No em-dashes. Short sentences. Professional but warm. Sign off with "AYN AI | Intelligent Automation Solutions".

${context}

${AYN_BRAND.identityProtection}`;
}

// ─── MODE: Campaign ───
async function handleCampaign(supabase: any, body: any, apiKey: string) {
  const { target_audience, industry, command } = body;
  const searchTerm = industry || target_audience || command || '';

  const [leads, strategic] = await Promise.all([
    loadPipelineLeads(supabase, { industry: searchTerm, limit: 15 }),
    loadStrategicContext(supabase),
  ]);

  const companyNames = leads.map((l: any) => l.company_name);
  const dossiers = await loadDossiers(supabase, companyNames);

  const leadsContext = leads.length > 0
    ? leads.map((l: any) => `- ${l.company_name} (${l.industry || 'unknown'}) | ${l.status} | Pain: ${(l.pain_points || []).join(', ') || 'unknown'} | Services: ${(l.recommended_services || []).join(', ') || 'TBD'}`).join('\n')
    : 'No leads found for this criteria.';

  const dossierContext = dossiers.length > 0
    ? dossiers.map((d: any) => `- Dossier: ${JSON.stringify(d.output_data || {}).substring(0, 300)}`).join('\n')
    : 'No investigator dossiers available.';

  const directivesContext = strategic.directives.length > 0
    ? strategic.directives.map((d: any) => `[P${d.priority}] ${d.directive}`).join('; ')
    : 'None';

  const systemPrompt = buildMarketingSystem(`MODE: Campaign Strategy\nYou're creating a targeted outreach campaign.`);

  const userPrompt = `Create a marketing campaign for: "${searchTerm || 'all pipeline leads'}"

PIPELINE LEADS (${leads.length}):
${leadsContext}

INVESTIGATOR DOSSIERS:
${dossierContext}

FOUNDER DIRECTIVES: ${directivesContext}

Create:
1. For each lead with enough data: a personalized email template (subject + body, casual founder tone)
2. Value propositions matched to their pain points
3. Recommended outreach sequence (email 1 → follow-up timing → email 2)
4. Which leads need more research before outreach (recommend Investigator)

Be specific. Use real company names. Match services to pain points.`;

  const strategy = await callLLM(apiKey, systemPrompt, userPrompt, 1200);

  return {
    success: true,
    mode: 'campaign',
    target: searchTerm,
    leads_found: leads.length,
    dossiers_available: dossiers.length,
    strategy,
    leads_summary: leads.map((l: any) => ({ name: l.company_name, industry: l.industry, status: l.status })),
  };
}

// ─── MODE: Email Copy ───
async function handleEmailCopy(supabase: any, body: any, apiKey: string) {
  const { lead_id, industry, company_name, command } = body;

  let lead: any = null;
  if (lead_id) {
    const { data } = await supabase.from('ayn_sales_pipeline').select('*').eq('id', lead_id).single();
    lead = data;
  } else if (company_name) {
    const { data } = await supabase.from('ayn_sales_pipeline').select('*').ilike('company_name', `%${company_name}%`).limit(1).single();
    lead = data;
  }

  const context = lead
    ? `Lead: ${lead.company_name} (${lead.industry || 'unknown'})\nContact: ${lead.contact_name || lead.contact_email}\nPain points: ${(lead.pain_points || []).join(', ') || 'unknown'}\nRecommended services: ${(lead.recommended_services || []).join(', ') || 'TBD'}\nStatus: ${lead.status}\nEmails sent: ${lead.emails_sent}`
    : `Target: ${industry || command || 'general outreach'}`;

  const systemPrompt = buildMarketingSystem(`MODE: Email Copy\nDraft a marketing email. Casual, founder tone. No buzzwords.`);

  const userPrompt = `Draft a marketing email for:
${context}

Requirements:
- Subject line: 3-6 words, casual, no colons or brand prefixes
- Body: Short (under 150 words), like a founder sending from their phone
- Lead with their pain point, then bridge to our solution
- End with a soft CTA (not pushy)
- Sign off: "AYN AI | Intelligent Automation Solutions"
- NO: "bespoke", "leverage", "streamline", "synergy", "cutting-edge", em-dashes`;

  const emailDraft = await callLLM(apiKey, systemPrompt, userPrompt, 600);

  return {
    success: true,
    mode: 'email_copy',
    lead: lead ? { name: lead.company_name, email: lead.contact_email } : null,
    email_draft: emailDraft,
  };
}

// ─── MODE: Positioning ───
async function handlePositioning(supabase: any, body: any, apiKey: string) {
  const { competitor_url, command } = body;
  const url = competitor_url || command || '';

  if (!url || (!url.includes('.') && !url.startsWith('http'))) {
    return { success: false, error: 'I need a competitor URL to analyze. Try: "position us against https://competitor.com"' };
  }

  console.log('[marketing] Scraping competitor:', url);
  const scraped = await scrapeUrl(url);

  const competitorContent = scraped.success
    ? `COMPETITOR WEBSITE CONTENT:\nTitle: ${scraped.metadata?.title || 'Unknown'}\nURL: ${scraped.metadata?.sourceURL || url}\n\n${sanitizeForPrompt((scraped.markdown || ''), 3000)}`
    : `Could not scrape ${url}. Analyzing based on URL alone.`;

  const systemPrompt = buildMarketingSystem(`MODE: Competitive Positioning\nAnalyze a competitor and recommend how AYN should position against them.\n${FIRECRAWL_CONTENT_GUARD}`) + INJECTION_GUARD;

  const userPrompt = `Analyze this competitor and tell me how we beat them:

${competitorContent}

For each of AYN's 6 services, explain:
1. Does the competitor offer anything similar?
2. Where are they weak that we're strong?
3. A one-line positioning statement we can use in outreach

End with 2-3 suggested taglines for emails targeting companies currently using this competitor.`;

  const analysis = await callLLM(apiKey, systemPrompt, userPrompt, 1000);

  return {
    success: true,
    mode: 'positioning',
    competitor_url: url,
    scraped: scraped.success,
    analysis,
  };
}

// ─── MODE: Content Plan ───
async function handleContentPlan(supabase: any, body: any, apiKey: string) {
  const [leads, strategic] = await Promise.all([
    loadPipelineLeads(supabase, { limit: 20 }),
    loadStrategicContext(supabase),
  ]);

  // Analyze industries in pipeline
  const industryCounts: Record<string, number> = {};
  leads.forEach((l: any) => {
    const ind = l.industry || 'Unknown';
    industryCounts[ind] = (industryCounts[ind] || 0) + 1;
  });

  const systemPrompt = buildMarketingSystem(`MODE: Content Plan\nCreate a marketing content plan based on current pipeline.`);

  const userPrompt = `Create a marketing content plan based on our current pipeline:

PIPELINE BREAKDOWN:
${Object.entries(industryCounts).map(([k, v]) => `- ${k}: ${v} leads`).join('\n')}

TOP LEADS:
${leads.slice(0, 8).map((l: any) => `- ${l.company_name} (${l.industry || '?'}) — ${l.status}`).join('\n')}

STRATEGIC INSIGHTS:
${strategic.insights.slice(0, 3).map((i: any) => `- ${i.content.substring(0, 150)}`).join('\n') || 'None'}

DIRECTIVES:
${strategic.directives.map((d: any) => `[P${d.priority}] ${d.directive}`).join('\n') || 'None'}

Create:
1. Top 3 industries to focus content on (and why)
2. 5 content themes that would resonate with these leads
3. Email campaign ideas for the top 2 industries
4. What we should say differently to each industry`;

  const plan = await callLLM(apiKey, systemPrompt, userPrompt, 1000);

  return {
    success: true,
    mode: 'content_plan',
    pipeline_size: leads.length,
    industries: industryCounts,
    plan,
  };
}

// ─── MODE: Analyze Pipeline ───
async function handleAnalyzePipeline(supabase: any, body: any, apiKey: string) {
  const leads = await loadPipelineLeads(supabase, { limit: 30 });

  // Compute stats
  const statusCounts: Record<string, number> = {};
  const industryCounts: Record<string, number> = {};
  let needsNurturing = 0;
  let noServices = 0;
  let noPainPoints = 0;

  leads.forEach((l: any) => {
    statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
    industryCounts[l.industry || 'Unknown'] = (industryCounts[l.industry || 'Unknown'] || 0) + 1;
    if (l.status === 'new' || l.status === 'researched') needsNurturing++;
    if (!l.recommended_services || l.recommended_services.length === 0) noServices++;
    if (!l.pain_points || l.pain_points.length === 0) noPainPoints++;
  });

  const systemPrompt = buildMarketingSystem(`MODE: Pipeline Analysis\nReview the sales pipeline and recommend marketing priorities.`);

  const userPrompt = `Review our pipeline and tell me where marketing should focus:

PIPELINE STATS:
- Total leads: ${leads.length}
- By status: ${Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}
- By industry: ${Object.entries(industryCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}
- Needs nurturing (new/researched): ${needsNurturing}
- Missing service recommendations: ${noServices}
- Missing pain points: ${noPainPoints}

TOP LEADS:
${leads.slice(0, 10).map((l: any) => `- ${l.company_name} | ${l.industry || '?'} | ${l.status} | Emails: ${l.emails_sent} | Pain: ${(l.pain_points || []).join(', ') || 'none'}`).join('\n')}

Tell me:
1. Which leads should we prioritize for outreach and why?
2. Which industries are underserved (lots of leads, few emails sent)?
3. Which leads need Investigator research before we can market to them?
4. Top 3 marketing actions I should take right now`;

  const analysis = await callLLM(apiKey, systemPrompt, userPrompt, 800);

  return {
    success: true,
    mode: 'analyze_pipeline',
    total_leads: leads.length,
    status_breakdown: statusCounts,
    industry_breakdown: industryCounts,
    needs_nurturing: needsNurturing,
    missing_pain_points: noPainPoints,
    analysis,
  };
}
