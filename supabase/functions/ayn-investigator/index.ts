import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { logAynActivity } from "../_shared/aynLogger.ts";
import { getEmployeeSystemPrompt, formatNatural } from "../_shared/aynBrand.ts";
import { logReflection } from "../_shared/employeeState.ts";
import { scrapeUrl, mapWebsite } from "../_shared/firecrawlHelper.ts";
import { sanitizeForPrompt, FIRECRAWL_CONTENT_GUARD } from "../_shared/sanitizeFirecrawl.ts";
import { sanitizeUserPrompt, INJECTION_GUARD } from "../_shared/sanitizePrompt.ts";
import { notifyFounder } from "../_shared/proactiveAlert.ts";

const EMPLOYEE_ID = 'investigator';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    let body: any = {};
    try { body = await req.json(); } catch {}

    const taskId = body.task_id || body.record?.id;
    const leadId = body.lead_id || body.record?.input_data?.lead_id;

    if (!leadId && taskId) {
      const { data: task } = await supabase.from('employee_tasks').select('*').eq('id', taskId).single();
      if (!task) return jsonRes({ error: 'Task not found' }, 404);
      if (task.to_employee !== 'investigator') return jsonRes({ error: 'Not for investigator' }, 400);
      return await investigateLead(supabase, LOVABLE_API_KEY, task.input_data.lead_id, taskId);
    }

    if (leadId) {
      return await investigateLead(supabase, LOVABLE_API_KEY, leadId, taskId);
    }

    // Cron mode: pick up pending investigator tasks
    const { data: pendingTasks } = await supabase
      .from('employee_tasks')
      .select('*')
      .eq('to_employee', 'investigator')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(3);

    const results = [];
    for (const task of pendingTasks || []) {
      try {
        const leadId = task.input_data?.lead_id;
        if (!leadId) throw new Error('No lead_id in task input_data');
        const res = await investigateLead(supabase, LOVABLE_API_KEY, leadId, task.id);
        const data = await res.json();
        results.push({ task_id: task.id, success: data.success });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'failed';
        // Mark as failed so it doesn't retry forever
        await supabase.from('employee_tasks').update({
          status: 'failed',
          output_data: { error: errMsg },
        }).eq('id', task.id);
        results.push({ task_id: task.id, error: errMsg });
      }
    }

    return jsonRes({ success: true, processed: results.length, results });
  } catch (error) {
    console.error('ayn-investigator error:', error);
    return jsonRes({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

async function investigateLead(supabase: any, apiKey: string, leadId: string, taskId?: string) {
  const { data: lead } = await supabase.from('ayn_sales_pipeline').select('*').eq('id', leadId).single();
  if (!lead) return jsonRes({ error: 'Lead not found' }, 404);

  // Fetch website content via Firecrawl
  let websiteContent = '';
  let siteMap: string[] = [];
  if (lead.company_url) {
    try {
      const [scrapeResult, mapResult] = await Promise.all([
        scrapeUrl(lead.company_url, { onlyMainContent: true }),
        mapWebsite(lead.company_url, { limit: 30 }),
      ]);
      if (scrapeResult.success) {
        websiteContent = sanitizeForPrompt((scrapeResult.markdown || ''), 12000);
      }
      if (mapResult.success && mapResult.links) {
        siteMap = mapResult.links.slice(0, 20);
      }
    } catch (e) {
      console.error('Firecrawl fetch failed:', e);
    }
  }

  // AI deep analysis with personality
  const systemPrompt = getEmployeeSystemPrompt('investigator', `You're creating a detailed company dossier. Dig deep. Leave no stone unturned. Provide:
1. Company size estimate (employees, revenue range)
2. Tech stack they likely use (based on website)
3. Key decision makers (if visible on website)
4. Specific pain points that AYN's services could solve
5. Competitor analysis — who else serves them?
6. Best approach strategy for outreach
7. Lead quality score (1-10) with honest justification

Be thorough. I'd rather you say "insufficient data — confidence: LOW" than guess.
${FIRECRAWL_CONTENT_GUARD}
Respond in JSON:
{
  "company_size": "...",
  "estimated_revenue": "...",
  "tech_stack": ["..."],
  "decision_makers": [{"name": "...", "role": "..."}],
  "detailed_pain_points": ["..."],
  "competitors": ["..."],
  "approach_strategy": "...",
  "quality_score": 8,
  "quality_justification": "...",
  "confidence_level": "HIGH/MEDIUM/LOW",
  "dossier_summary": "..."
}`) + INJECTION_GUARD;

  const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [{
        role: 'system',
        content: systemPrompt,
      }, {
        role: 'user',
        content: `Company: ${lead.company_name}\nURL: ${lead.company_url || 'N/A'}\nIndustry: ${lead.industry || 'Unknown'}\nExisting notes: ${lead.notes || 'None'}\nPain points so far: ${lead.pain_points?.join(', ') || 'None'}\n\nSite pages: ${siteMap.length ? siteMap.join('\n') : 'N/A'}\n\nWebsite content:\n${websiteContent || 'Could not fetch'}`,
      }],
    }),
  });

  if (!aiRes.ok) return jsonRes({ error: 'AI analysis failed' }, 500);

  const aiData = await aiRes.json();
  let dossier: any;
  try {
    const content = aiData.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    dossier = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    return jsonRes({ error: 'Failed to parse dossier' }, 500);
  }

  // Update lead with dossier
  await supabase.from('ayn_sales_pipeline').update({
    context: { ...lead.context, dossier, investigated_at: new Date().toISOString() },
    notes: dossier?.dossier_summary || lead.notes,
  }).eq('id', leadId);

  // Complete task if exists
  if (taskId) {
    await supabase.from('employee_tasks').update({
      status: 'completed',
      output_data: dossier,
      completed_at: new Date().toISOString(),
    }).eq('id', taskId);
  }

  // Natural report
  const reportContent = `${lead.company_name}: quality ${dossier?.quality_score || '?'}/10 (${dossier?.confidence_level || 'unknown'} confidence). ${dossier?.dossier_summary || 'analysis incomplete'}. approach: ${dossier?.approach_strategy || 'needs more data'}.`;

  await supabase.from('ayn_mind').insert({
    type: 'employee_report',
    content: formatNatural(EMPLOYEE_ID, reportContent, 'casual'),
    context: { from_employee: EMPLOYEE_ID, lead_id: leadId, dossier_summary: dossier?.dossier_summary },
    shared_with_admin: false,
  });

  await logReflection(supabase, {
    employee_id: EMPLOYEE_ID,
    action_ref: 'investigation',
    reasoning: `Deep-dived ${lead.company_name}. Quality: ${dossier?.quality_score}/10.`,
    expected_outcome: 'Sales uses dossier for targeted outreach',
    confidence: dossier?.confidence_level === 'HIGH' ? 0.8 : dossier?.confidence_level === 'MEDIUM' ? 0.6 : 0.4,
    what_would_change_mind: 'If website data was insufficient for meaningful analysis',
  });

  await logAynActivity(supabase, 'investigation_complete', `Dossier: ${lead.company_name} — ${dossier?.quality_score}/10`, {
    target_id: leadId, target_type: 'sales_lead',
    details: { quality_score: dossier?.quality_score, confidence: dossier?.confidence_level },
    triggered_by: EMPLOYEE_ID,
  });

  const score = dossier?.quality_score || '?';
  const confidence = dossier?.confidence_level || 'unknown';
  await notifyFounder(supabase, {
    employee_id: EMPLOYEE_ID,
    message: `finished researching ${lead.company_name}. quality: ${score}/10 (${confidence} confidence). ${dossier?.dossier_summary || 'analysis complete'}. ${score >= 7 ? 'strong fit — sales should move on this.' : 'might need more data before outreach.'}`,
    priority: score >= 7 ? 'info' : 'info',
    details: { lead_id: leadId, quality_score: score, confidence },
  });

  return jsonRes({ success: true, lead_id: leadId, dossier });
}

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
  });
}
