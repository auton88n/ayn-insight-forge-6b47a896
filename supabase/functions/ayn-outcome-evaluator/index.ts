import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { logAynActivity } from "../_shared/aynLogger.ts";
import { loadEmployeeState, updateEmployeeState } from "../_shared/employeeState.ts";
import { adjustReputation, updatePeerTrust, boostInitiative } from "../_shared/politicalIntelligence.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // 1. Find unevaluated reflections
    const { data: reflections } = await supabase
      .from('employee_reflections')
      .select('*')
      .eq('outcome_evaluated', false)
      .order('created_at', { ascending: true })
      .limit(20);

    if (!reflections?.length) {
      return new Response(JSON.stringify({ success: true, message: 'No reflections to evaluate', evaluated: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let evaluated = 0;
    let beliefsAdjusted = 0;
    let reputationChanges = 0;

    // Load all discussions from last 24h for peer trust cross-referencing
    const ago24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentDiscussions } = await supabase
      .from('employee_discussions')
      .select('discussion_id, employee_id, position, confidence')
      .gte('created_at', ago24h);

    for (const ref of reflections) {
      // Try to determine actual outcome based on action type
      let actualOutcome = 'unknown';
      let outcomePositive = false;

      if (ref.action_ref?.includes('sales') || ref.action_ref?.includes('outreach')) {
        const { count } = await supabase
          .from('ayn_sales_pipeline')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'replied')
          .gte('updated_at', ref.created_at);
        outcomePositive = (count || 0) > 0;
        actualOutcome = outcomePositive ? 'positive — leads engaged' : 'no engagement detected yet';
      } else if (ref.action_ref?.includes('security') || ref.action_ref?.includes('threat')) {
        const { count } = await supabase
          .from('security_incidents')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', ref.created_at)
          .limit(1);
        outcomePositive = (count || 0) === 0;
        actualOutcome = outcomePositive ? 'threat did not materialize — good call' : 'incident occurred after assessment';
      } else if (ref.action_ref?.includes('health') || ref.action_ref?.includes('qa')) {
        const { data: healthChecks } = await supabase
          .from('system_health_checks')
          .select('is_healthy')
          .gte('checked_at', ref.created_at)
          .limit(5);
        const healthyPct = healthChecks?.length ? healthChecks.filter((h: any) => h.is_healthy).length / healthChecks.length : 1;
        outcomePositive = healthyPct > 0.8;
        actualOutcome = outcomePositive ? 'systems remained healthy' : `health degraded (${Math.round(healthyPct * 100)}% uptime)`;
      } else if (ref.action_ref?.includes('proactive_flag') || ref.action_ref?.includes('early_warning')) {
        // Initiative bonus: proactively flagged issues before escalation
        outcomePositive = true;
        actualOutcome = 'proactive flag — initiative rewarded';
        await boostInitiative(supabase, ref.employee_id, 0.1);
      } else {
        const { count: errors } = await supabase
          .from('error_logs')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', ref.created_at);
        outcomePositive = (errors || 0) < 3;
        actualOutcome = outcomePositive ? 'no significant issues followed' : `${errors} errors occurred after this action`;
      }

      // Update the reflection with actual outcome
      await supabase.from('employee_reflections').update({
        actual_outcome: actualOutcome,
        outcome_evaluated: true,
      }).eq('id', ref.id);

      // Adjust employee beliefs based on outcome
      const state = await loadEmployeeState(supabase, ref.employee_id);
      if (state) {
        const wasConfident = ref.confidence > 0.7;
        const wasRight = outcomePositive;

        if (wasConfident && !wasRight) {
          await updateEmployeeState(supabase, ref.employee_id, {
            confidence: state.confidence - 0.05,
            beliefs: {
              ...state.beliefs,
              risk_tolerance: (state.beliefs.risk_tolerance || 0.5) - 0.03,
            },
          });
          beliefsAdjusted++;
        } else if (!wasConfident && wasRight) {
          await updateEmployeeState(supabase, ref.employee_id, {
            confidence: state.confidence + 0.03,
          });
          beliefsAdjusted++;
        } else if (wasConfident && wasRight) {
          await updateEmployeeState(supabase, ref.employee_id, {
            confidence: state.confidence + 0.01,
          });
        }

        // Layer 3: Reputation adjustment (asymmetric: +0.05 right, -0.08 wrong)
        if (wasRight) {
          await adjustReputation(supabase, ref.employee_id, 0.05);
        } else {
          await adjustReputation(supabase, ref.employee_id, -0.08);
        }
        reputationChanges++;

        // Layer 3: Peer trust — agents who backed wrong prediction lose trust from dissenters
        if (!wasRight && recentDiscussions) {
          // Find discussions this employee participated in recently
          const employeeDiscussions = recentDiscussions.filter(d => d.employee_id === ref.employee_id);
          for (const disc of employeeDiscussions) {
            // Find agents in the same discussion who disagreed
            const dissenters = recentDiscussions.filter(d =>
              d.discussion_id === disc.discussion_id &&
              d.employee_id !== ref.employee_id
            );
            for (const dissenter of dissenters) {
              await updatePeerTrust(supabase, dissenter.employee_id, ref.employee_id, -0.02);
            }
          }
        }
      }

      evaluated++;
    }

    await logAynActivity(supabase, 'outcome_evaluation', `Evaluated ${evaluated} reflections, adjusted beliefs for ${beliefsAdjusted}, reputation changes: ${reputationChanges}`, {
      details: { evaluated, beliefs_adjusted: beliefsAdjusted, reputation_changes: reputationChanges },
      triggered_by: 'outcome_evaluator',
    });

    return new Response(JSON.stringify({ success: true, evaluated, beliefs_adjusted: beliefsAdjusted, reputation_changes: reputationChanges }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('ayn-outcome-evaluator error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
