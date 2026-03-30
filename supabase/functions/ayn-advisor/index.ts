import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { logAynActivity } from "../_shared/aynLogger.ts";
import { sendTelegramMessage } from "../_shared/telegramHelper.ts";
import { getEmployeeSystemPrompt, formatNatural, detectToneContext } from "../_shared/aynBrand.ts";
import { loadCompanyState, loadActiveObjectives, loadServiceEconomics, logReflection, buildEmployeeContext } from "../_shared/employeeState.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMPLOYEE_ID = 'advisor';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');

    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    // Check recent activity from all employees (not just 'employee_report' type)
    const ago24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: reports } = await supabase
      .from('ayn_activity_log')
      .select('action_type, summary, triggered_by, created_at')
      .gte('created_at', ago24h)
      .not('triggered_by', 'eq', 'advisor')
      .order('created_at', { ascending: false })
      .limit(30);

    if (!reports?.length || reports.length < 5) {
      await logAynActivity(supabase, 'advisor_skip', `Not enough activity to synthesize yet (${reports?.length || 0} entries in 24h)`, {
        triggered_by: EMPLOYEE_ID,
      });
      return new Response(JSON.stringify({ success: true, message: 'Not enough activity to synthesize yet.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load V2 context
    const [companyState, objectives, economics, employeeContext] = await Promise.all([
      loadCompanyState(supabase),
      loadActiveObjectives(supabase),
      loadServiceEconomics(supabase),
      buildEmployeeContext(supabase, EMPLOYEE_ID),
    ]);

    // Gather additional signals
    const [
      { count: activeUsers },
      { count: openTickets },
      { data: recentIncidents },
      { data: pipelineStats },
      { data: healthChecks },
    ] = await Promise.all([
      supabase.from('access_grants').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('security_incidents').select('incident_type, severity, status').gte('created_at', ago24h).limit(10),
      supabase.from('ayn_sales_pipeline').select('status').limit(100),
      supabase.from('system_health_checks').select('function_name, is_healthy, response_time_ms').order('checked_at', { ascending: false }).limit(10),
    ]);

    const pipelineSummary: Record<string, number> = {};
    for (const p of pipelineStats || []) {
      pipelineSummary[p.status] = (pipelineSummary[p.status] || 0) + 1;
    }

    // Synthesize with V2 personality — no rigid format
    const systemPrompt = getEmployeeSystemPrompt(EMPLOYEE_ID, `Synthesize reports from all AYN AI employees into a strategic briefing for the founder.

${employeeContext}

Be direct. Be specific. Reference actual data. No rigid numbered format — give honest strategic takes.
If something's great, say so briefly. If something's concerning, explain why and what to do.
Reference company objectives and service economics when relevant.
Express uncertainty when data is thin.`);

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{
          role: 'system',
          content: systemPrompt,
        }, {
          role: 'user',
          content: `Recent Employee Activity (last 24h):\n${reports.map((r: any) => `• [${r.triggered_by}] (${r.action_type}) ${r.summary}`).join('\n\n')}

Context:
- Active users: ${activeUsers || 0}
- Open tickets: ${openTickets || 0}
- Security incidents (24h): ${recentIncidents?.length || 0}
- Pipeline: ${JSON.stringify(pipelineSummary)}
- System health: ${healthChecks?.map((h: any) => `${h.function_name}: ${h.is_healthy ? 'OK' : 'DOWN'}`).join(', ') || 'No data'}
- Company momentum: ${companyState?.momentum || 'unknown'}
- Stress level: ${companyState?.stress_level || 0}

Give your honest strategic take. What matters right now?`,
        }],
      }),
    });

    if (!aiRes.ok) throw new Error('AI synthesis failed');

    const aiData = await aiRes.json();
    const insight = aiData.choices?.[0]?.message?.content?.trim() || 'Could not generate insights';

    // Save with natural tone
    const tone = detectToneContext(insight, companyState?.stress_level);
    await supabase.from('ayn_mind').insert({
      type: 'strategic_insight',
      content: formatNatural(EMPLOYEE_ID, insight, tone),
      context: {
        from_employee: EMPLOYEE_ID,
        reports_analyzed: reports.length,
        timestamp: new Date().toISOString(),
      },
      shared_with_admin: true,
    });

    // Send to founder via Telegram
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, formatNatural(EMPLOYEE_ID, `${reports.length} activities analyzed.\n\n${insight}`, tone));
    }

    await logReflection(supabase, {
      employee_id: EMPLOYEE_ID,
      action_ref: 'strategic_briefing',
      reasoning: `Synthesized ${reports.length} employee activities with company state and objectives context`,
      expected_outcome: 'Founder gets actionable strategic insight aligned to objectives',
      confidence: 0.7,
      what_would_change_mind: 'If activity data is too thin or contradictory to synthesize meaningfully',
    });

    await logAynActivity(supabase, 'advisor_briefing', `Strategic briefing: ${reports.length} activities analyzed`, {
      details: { reports_count: reports.length },
      triggered_by: EMPLOYEE_ID,
    });

    return new Response(JSON.stringify({ success: true, insight }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('ayn-advisor error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
