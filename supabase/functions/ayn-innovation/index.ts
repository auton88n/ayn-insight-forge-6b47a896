import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { logAynActivity } from "../_shared/aynLogger.ts";
import { formatNatural } from "../_shared/aynBrand.ts";
import { loadActiveObjectives, loadServiceEconomics, loadCompanyState, logReflection, buildEmployeeContext } from "../_shared/employeeState.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMPLOYEE_ID = 'innovation';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    // Load context
    const [objectives, economics, companyState, employeeContext] = await Promise.all([
      loadActiveObjectives(supabase),
      loadServiceEconomics(supabase),
      loadCompanyState(supabase),
      buildEmployeeContext(supabase, EMPLOYEE_ID),
    ]);

    // Gather signals for innovation
    const ago7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: recentActivity },
      { data: calcHistory },
      { count: errorCount },
      { data: existingProposals },
    ] = await Promise.all([
      supabase.from('ayn_activity_log').select('action_type, summary').gte('created_at', ago7d).limit(50),
      supabase.from('calculation_history').select('calculation_type').gte('created_at', ago7d).limit(100),
      supabase.from('error_logs').select('*', { count: 'exact', head: true }).gte('created_at', ago7d),
      supabase.from('ayn_mind').select('content').eq('type', 'innovation_proposal').order('created_at', { ascending: false }).limit(5),
    ]);

    // Calculate tool usage patterns
    const calcUsage: Record<string, number> = {};
    for (const calc of calcHistory || []) {
      calcUsage[calc.calculation_type] = (calcUsage[calc.calculation_type] || 0) + 1;
    }

    // Generate innovation proposals via AI
    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{
          role: 'system',
          content: `You are AYN's Innovation Lead. You challenge the status quo and propose experiments.

${employeeContext}

Be bold but grounded. Each proposal should include: what, why, expected impact, confidence level, and what could go wrong.
Don't repeat existing proposals. Think about productizing services into SaaS, new calculators, automation opportunities.
Respond naturally — no formatted reports.`,
        }, {
          role: 'user',
          content: `Recent activity patterns (7d): ${recentActivity?.length || 0} actions
Calculator usage (7d): ${JSON.stringify(calcUsage)}
Error count (7d): ${errorCount || 0}
Company momentum: ${companyState?.momentum}
Growth velocity: ${companyState?.growth_velocity}

Service economics:
${economics.map(e => `- ${e.service_name}: ${e.category}, scalability=${e.scalability_score}/10, margin=${Math.round(e.average_margin * 100)}%`).join('\n')}

Active objectives:
${objectives.map(o => `- [P${o.priority}] ${o.title} (${o.current_value}/${o.target_value})`).join('\n')}

Previous proposals:
${existingProposals?.map(p => `- ${p.content.substring(0, 100)}`).join('\n') || 'none yet'}

Propose 1-2 concrete innovation ideas. Be specific about implementation and expected impact.`,
        }],
      }),
    });

    let proposals = 'could not generate proposals';
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      proposals = aiData.choices?.[0]?.message?.content?.trim() || proposals;
    }

    // Save as innovation proposal
    await supabase.from('ayn_mind').insert({
      type: 'innovation_proposal',
      content: formatNatural(EMPLOYEE_ID, proposals, 'strategic'),
      context: {
        from_employee: EMPLOYEE_ID,
        calc_usage: calcUsage,
        company_momentum: companyState?.momentum,
      },
      shared_with_admin: false,
    });

    // Also save as employee report for advisor to synthesize
    await supabase.from('ayn_mind').insert({
      type: 'employee_report',
      content: formatNatural(EMPLOYEE_ID, proposals, 'strategic'),
      context: { from_employee: EMPLOYEE_ID },
      shared_with_admin: false,
    });

    await logReflection(supabase, {
      employee_id: EMPLOYEE_ID,
      action_ref: 'innovation_cycle',
      reasoning: `Analyzed ${Object.keys(calcUsage).length} calculator types, ${recentActivity?.length || 0} activity patterns. Generated proposals.`,
      expected_outcome: 'At least one proposal gets approved for exploration',
      confidence: 0.6,
      what_would_change_mind: 'If all proposals are rejected or already in progress',
    });

    await logAynActivity(supabase, 'innovation_proposals', `Generated innovation proposals based on ${Object.keys(calcUsage).length} tool patterns`, {
      details: { calc_usage: calcUsage },
      triggered_by: EMPLOYEE_ID,
    });

    return new Response(JSON.stringify({ success: true, proposals }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('ayn-innovation error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
