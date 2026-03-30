import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { logAynActivity } from "../_shared/aynLogger.ts";
import { formatNatural } from "../_shared/aynBrand.ts";
import { loadEmployeeState, updateEmployeeState, logReflection, buildEmployeeContext } from "../_shared/employeeState.ts";
import { recordEmotionalEvent } from "../_shared/politicalIntelligence.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMPLOYEE_ID = 'hr_manager';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const ago24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const ago7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Count actions per employee (24h)
    const { data: recentActions } = await supabase
      .from('ayn_activity_log')
      .select('triggered_by, action_type')
      .gte('created_at', ago24h);

    const actionCounts: Record<string, number> = {};
    for (const action of recentActions || []) {
      actionCounts[action.triggered_by] = (actionCounts[action.triggered_by] || 0) + 1;
    }

    // 2. Check reflections for outcome accuracy (7d)
    const { data: evaluatedReflections } = await supabase
      .from('employee_reflections')
      .select('employee_id, confidence, actual_outcome, expected_outcome')
      .eq('outcome_evaluated', true)
      .gte('created_at', ago7d);

    const accuracyByEmployee: Record<string, { correct: number; total: number }> = {};
    for (const ref of evaluatedReflections || []) {
      if (!accuracyByEmployee[ref.employee_id]) {
        accuracyByEmployee[ref.employee_id] = { correct: 0, total: 0 };
      }
      accuracyByEmployee[ref.employee_id].total++;
      if (ref.actual_outcome && ref.expected_outcome &&
          ref.actual_outcome.toLowerCase().includes('success')) {
        accuracyByEmployee[ref.employee_id].correct++;
      }
    }

    // 3. Load all employee states
    const { data: allStates } = await supabase
      .from('employee_states')
      .select('employee_id, performance_metrics, confidence, beliefs, reputation_score, initiative_score, cognitive_load, emotional_memory');

    // 4. Update performance metrics + Layer 3 health checks
    const performanceUpdates: string[] = [];
    for (const state of allStates || []) {
      const eid = state.employee_id;
      const actions = actionCounts[eid] || 0;
      const accuracy = accuracyByEmployee[eid];
      const successRate = accuracy ? Math.round((accuracy.correct / accuracy.total) * 100) : null;

      const newMetrics = {
        ...(state.performance_metrics || {}),
        actions_24h: actions,
        ...(successRate !== null ? { success_rate: successRate } : {}),
      };

      await updateEmployeeState(supabase, eid, { performance_metrics: newMetrics });

      if (actions === 0 && eid !== 'system' && eid !== 'chief_of_staff') {
        performanceUpdates.push(`${eid}: no activity in 24h`);
      }
      if (successRate !== null && successRate < 50) {
        performanceUpdates.push(`${eid}: low success rate (${successRate}%) — may need prompt tuning`);
      }

      // Layer 3: Reputation trend (flag declining agents)
      const repScore = state.reputation_score ?? 0.5;
      if (repScore < 0.35) {
        performanceUpdates.push(`${eid}: reputation declining (${repScore.toFixed(2)}) — needs attention`);
      }

      // Layer 3: Emotional health check (3+ negative memories with intensity > 0.3)
      const emotionalMemory = state.emotional_memory || [];
      const highIntensityNegative = emotionalMemory.filter(
        (m: any) => m.intensity > 0.3 && (m.event?.includes('reject') || m.event?.includes('override') || m.event?.includes('conflict'))
      );
      if (highIntensityNegative.length >= 3) {
        performanceUpdates.push(`${eid}: emotional stress detected (${highIntensityNegative.length} high-intensity events) — consider personality softening`);
      }

      // Layer 3: Cognitive overload check (load > 0.7)
      const cogLoad = state.cognitive_load ?? 0.2;
      if (cogLoad > 0.7) {
        performanceUpdates.push(`${eid}: cognitive overload (${cogLoad.toFixed(2)}) — recommend task redistribution`);
      }
    }

    // 5. Generate HR assessment via AI
    const employeeContext = await buildEmployeeContext(supabase, EMPLOYEE_ID);

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{
          role: 'system',
          content: `You are AYN's HR Manager. You assess workforce performance naturally — no formatted reports unless asked.

${employeeContext}

Be constructive. Flag underperformers with specific suggestions. Celebrate high performers briefly.`,
        }, {
          role: 'user',
          content: `Activity (24h): ${JSON.stringify(actionCounts)}
Performance flags: ${performanceUpdates.length > 0 ? performanceUpdates.join('; ') : 'no issues'}
Evaluated reflections (7d): ${evaluatedReflections?.length || 0}

Write a brief performance note. Highlight concerns and strengths.`,
        }],
      }),
    });

    let assessment = 'could not generate assessment';
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      assessment = aiData.choices?.[0]?.message?.content?.trim() || assessment;
    }

    // 6. Save report
    await supabase.from('ayn_mind').insert({
      type: 'employee_report',
      content: formatNatural(EMPLOYEE_ID, assessment, 'casual'),
      context: {
        from_employee: EMPLOYEE_ID,
        action_counts: actionCounts,
        performance_flags: performanceUpdates,
      },
      shared_with_admin: false,
    });

    await logReflection(supabase, {
      employee_id: EMPLOYEE_ID,
      action_ref: 'daily_performance_review',
      reasoning: `Reviewed ${allStates?.length || 0} employees. ${performanceUpdates.length} flags.`,
      expected_outcome: 'Identify underperformers early and maintain quality',
      confidence: 0.7,
      what_would_change_mind: 'If performance data is too thin for meaningful assessment',
    });

    await logAynActivity(supabase, 'hr_performance_review', `Daily review: ${performanceUpdates.length} flags across ${allStates?.length || 0} employees`, {
      details: { flags: performanceUpdates, action_counts: actionCounts },
      triggered_by: EMPLOYEE_ID,
    });

    return new Response(JSON.stringify({ success: true, flags: performanceUpdates }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('ayn-hr-manager error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
