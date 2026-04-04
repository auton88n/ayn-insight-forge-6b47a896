import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { logAynActivity } from "../_shared/aynLogger.ts";
import { sendTelegramMessage } from "../_shared/telegramHelper.ts";
import { formatNatural, detectToneContext } from "../_shared/aynBrand.ts";
import { loadCompanyState, logReflection } from "../_shared/employeeState.ts";
import { notifyFounder } from "../_shared/proactiveAlert.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

const EMPLOYEE_ID = 'qa_watchdog';
const CRITICAL_FUNCTIONS = ['health', 'ayn-unified', 'support-bot'];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const source = body.source || 'manual';
    
    // Handle ping checks
    if (body.ping) {
      return new Response(JSON.stringify({ pong: true, source }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const companyState = await loadCompanyState(supabase);
    const healthResults: any[] = [];
    let criticalIssues = 0;

    // 1. Ping critical edge functions
    for (const fn of CRITICAL_FUNCTIONS) {
      const start = Date.now();
      let statusCode = 0;
      let isHealthy = true;
      let errorMessage: string | null = null;

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ping: true }),
          signal: AbortSignal.timeout(10000),
        });
        statusCode = res.status;
        if (statusCode >= 400) {
          isHealthy = false;
          errorMessage = `HTTP ${statusCode}`;
          criticalIssues++;
        }
      } catch (e) {
        isHealthy = false;
        errorMessage = e instanceof Error ? e.message : 'Timeout or network error';
        criticalIssues++;
      }

      healthResults.push({
        function_name: fn,
        response_time_ms: Date.now() - start,
        status_code: statusCode,
        is_healthy: isHealthy,
        error_message: errorMessage,
      });
    }

    if (healthResults.length > 0) {
      await supabase.from('system_health_checks').insert(healthResults);
    }

    // 2. Check error spikes
    const ago10m = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count: recentErrors } = await supabase
      .from('error_logs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', ago10m);

    if (recentErrors && recentErrors >= 5) criticalIssues++;

    // 3. Check LLM failures
    const { count: recentLlmFails } = await supabase
      .from('llm_failures')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', ago10m);

    if (recentLlmFails && recentLlmFails >= 3) criticalIssues++;

    // Build natural report — no borders, no boxes
    const avgResponseTime = healthResults.length > 0
      ? Math.round(healthResults.reduce((sum: number, h: any) => sum + h.response_time_ms, 0) / healthResults.length)
      : 0;

    const uptimePct = healthResults.length > 0
      ? Math.round((healthResults.filter((h: any) => h.is_healthy).length / healthResults.length) * 100)
      : 100;

    let reportContent: string;
    if (criticalIssues > 0) {
      const issues = healthResults.filter(h => !h.is_healthy).map(h => `${h.function_name}: ${h.error_message}`);
      reportContent = `${criticalIssues} issue${criticalIssues > 1 ? 's' : ''} need attention. ${issues.join('. ')}. avg response: ${avgResponseTime}ms, uptime: ${uptimePct}%. errors (10min): ${recentErrors || 0}, LLM fails: ${recentLlmFails || 0}. keeping a close eye on this.`;
    } else {
      reportContent = `all clear. ${uptimePct}% uptime, avg ${avgResponseTime}ms. ${recentErrors || 0} errors, ${recentLlmFails || 0} LLM fails in last 10min. systems nominal.`;
    }

    // Determine tone based on severity and company stress
    const tone = detectToneContext(
      criticalIssues > 0 ? 'critical alert down' : reportContent,
      companyState?.stress_level
    );

    // Save employee report
    await supabase.from('ayn_mind').insert({
      type: 'employee_report',
      content: formatNatural(EMPLOYEE_ID, reportContent, tone),
      context: {
        from_employee: EMPLOYEE_ID,
        critical_issues: criticalIssues,
        health_results: healthResults,
        avg_response_ms: avgResponseTime,
        uptime_pct: uptimePct,
      },
      shared_with_admin: false,
    });

    // Notify founder — both critical issues AND all-clear
    await notifyFounder(supabase, {
      employee_id: EMPLOYEE_ID,
      message: criticalIssues > 0
        ? `${criticalIssues} system${criticalIssues > 1 ? 's' : ''} down. ${healthResults.filter(h => !h.is_healthy).map(h => h.function_name).join(', ')}. avg response: ${avgResponseTime}ms. want me to keep monitoring or escalate?`
        : `all systems green. ${uptimePct}% uptime, avg ${avgResponseTime}ms. nothing to worry about.`,
      priority: criticalIssues > 0 ? 'critical' : 'info',
      needs_approval: criticalIssues > 0,
      details: { critical_issues: criticalIssues, uptime_pct: uptimePct, avg_response_ms: avgResponseTime },
    });

    // Reflection
    await logReflection(supabase, {
      employee_id: EMPLOYEE_ID,
      action_ref: 'health_check',
      reasoning: `Checked ${CRITICAL_FUNCTIONS.length} functions. ${criticalIssues} critical issues found.`,
      expected_outcome: criticalIssues > 0 ? 'Issues get resolved within next check cycle' : 'Systems remain stable',
      confidence: 0.8,
      what_would_change_mind: 'Repeated failures across multiple check cycles',
    });

    // Cleanup old health checks
    await supabase.from('system_health_checks')
      .delete()
      .lt('checked_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    await logAynActivity(supabase, 'qa_watchdog_check', `health: ${uptimePct}% uptime, ${criticalIssues} critical`, {
      details: { critical_issues: criticalIssues, uptime_pct: uptimePct },
      triggered_by: EMPLOYEE_ID,
    });

    return new Response(JSON.stringify({ success: true, critical_issues: criticalIssues, uptime_pct: uptimePct }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('ayn-qa-watchdog error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
