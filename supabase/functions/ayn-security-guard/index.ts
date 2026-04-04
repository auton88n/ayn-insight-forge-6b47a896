import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { logAynActivity } from "../_shared/aynLogger.ts";
import { sendTelegramMessage } from "../_shared/telegramHelper.ts";
import { formatNatural } from "../_shared/aynBrand.ts";
import { loadCompanyState, logReflection } from "../_shared/employeeState.ts";
import { notifyFounder } from "../_shared/proactiveAlert.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


const EMPLOYEE_ID = 'security_guard';

// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body */ }
    const source = body.source || 'manual';
    const mode = body.mode || 'check_threats';
    
    // Handle ping checks
    if (body.ping) {
      return new Response(JSON.stringify({ pong: true, source }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: string[] = [];

    if (mode === 'reply_detected' && body.record) {
      const record = body.record;
      const userId = record.user_id;
      if (userId) {
        await handleStrike(supabase, userId, record.action, record.details, results, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);
      }
    } else {
      // Cron mode: scan for threats
      const ago6h = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const ago1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // 1. Check prompt injection attempts in last 6h
      const { data: injections } = await supabase
        .from('security_logs')
        .select('user_id, created_at')
        .eq('action', 'prompt_injection_attempt')
        .gte('created_at', ago6h)
        .not('user_id', 'is', null);

      const userAttempts: Record<string, number> = {};
      for (const inj of injections || []) {
        if (inj.user_id) userAttempts[inj.user_id] = (userAttempts[inj.user_id] || 0) + 1;
      }

      for (const [userId, count] of Object.entries(userAttempts)) {
        if (count >= 2) {
          await handleStrike(supabase, userId, 'prompt_injection', { attempts: count, window: '6h' }, results, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);
        }
      }

      // 2. Check for rapid-fire message abuse (50+ messages/hour)
      const { data: recentMsgs } = await supabase
        .from('messages')
        .select('user_id')
        .gte('created_at', ago1h);

      const msgCounts: Record<string, number> = {};
      for (const m of recentMsgs || []) {
        if (m.user_id) msgCounts[m.user_id] = (msgCounts[m.user_id] || 0) + 1;
      }

      for (const [userId, count] of Object.entries(msgCounts)) {
        if (count >= 50) {
          await handleStrike(supabase, userId, 'message_abuse', { messages_per_hour: count }, results, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);
        }
      }

      // 3. Check repeated rate limit violations
      const { data: violators } = await supabase
        .from('api_rate_limits')
        .select('user_id, violation_count, endpoint')
        .gte('violation_count', 3);

      for (const v of violators || []) {
        if (v.violation_count >= 5) {
          await handleStrike(supabase, v.user_id, 'repeated_rate_limit', { violations: v.violation_count, endpoint: v.endpoint }, results, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);
        }
      }

      if (results.length === 0) {
        results.push('Perimeter secure. All sectors clear. No hostile activity detected.');
      }
    }

    // Natural tone report
    const companyState = await loadCompanyState(supabase);
    const hasThreats = results.some(r => !r.includes('secure'));
    const reportContent = hasThreats
      ? `${results.length} issue(s) found. ${results.join('. ')}. response deployed, monitoring continues.`
      : `all clear. ${results.join('. ')}. standing watch.`;

    const tone = hasThreats ? 'incident' as const : 'casual' as const;

    await supabase.from('ayn_mind').insert({
      type: 'employee_report',
      content: formatNatural(EMPLOYEE_ID, reportContent, tone),
      context: { from_employee: EMPLOYEE_ID, timestamp: new Date().toISOString() },
      shared_with_admin: false,
    });

    // Notify founder via unified channel (Telegram + Command Center)
    await notifyFounder(supabase, {
      employee_id: EMPLOYEE_ID,
      message: hasThreats
        ? `${results.filter(r => !r.includes('secure')).length} threat(s) detected. ${results.filter(r => r.includes('blocked')).length > 0 ? 'already blocked the bad actors.' : 'monitoring closely.'} ${results.slice(0, 3).join('. ')}. should I tighten restrictions?`
        : `perimeter secure. all clear. standing watch.`,
      priority: results.some(r => r.includes('blocked')) ? 'critical' : hasThreats ? 'warning' : 'info',
      needs_approval: hasThreats,
      details: { findings: results },
    });

    await logReflection(supabase, {
      employee_id: EMPLOYEE_ID,
      action_ref: 'security_sweep',
      reasoning: `Scanned injection attempts, message abuse, rate limits. ${hasThreats ? 'Threats found.' : 'All clear.'}`,
      expected_outcome: hasThreats ? 'Blocked users stop malicious activity' : 'Systems remain secure',
      confidence: 0.8,
      what_would_change_mind: 'If blocked user circumvents via new account',
    });

    await logAynActivity(supabase, 'security_scan', `Security sweep: ${results.length} finding(s)`, {
      details: { findings: results },
      triggered_by: EMPLOYEE_ID,
    });

    return new Response(JSON.stringify({ success: true, findings: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('ayn-security-guard error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleStrike(
  supabase: any, userId: string, incidentType: string, details: any,
  results: string[], botToken?: string, chatId?: string
) {
  // Check if user is admin/duty — never touch admins
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  if (roles?.some((r: any) => r.role === 'admin' || r.role === 'duty')) {
    results.push(`Friendly: ${userId.slice(0, 8)} (admin/duty) — stood down on ${incidentType}`);
    return;
  }

  // Count existing strikes
  const { data: existing } = await supabase
    .from('security_incidents')
    .select('id, strike_count')
    .eq('user_id', userId)
    .eq('incident_type', incidentType)
    .eq('status', 'detected')
    .order('created_at', { ascending: false })
    .limit(1);

  const currentStrikes = (existing?.[0]?.strike_count || 0) + 1;

  let status = 'detected';
  let actionTaken = 'warned';
  let blockedUntil: string | null = null;

  if (currentStrikes >= 5) {
    blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    status = 'blocked';
    actionTaken = 'blocked_24h';
    await supabase.from('api_rate_limits')
      .upsert({ user_id: userId, endpoint: 'all', blocked_until: blockedUntil, violation_count: currentStrikes }, { onConflict: 'user_id,endpoint' });
  } else if (currentStrikes >= 3) {
    blockedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    status = 'blocked';
    actionTaken = 'blocked_30min';
    await supabase.from('api_rate_limits')
      .upsert({ user_id: userId, endpoint: 'all', blocked_until: blockedUntil, violation_count: currentStrikes }, { onConflict: 'user_id,endpoint' });
  } else {
    status = 'warned';
    actionTaken = `warning_${currentStrikes}`;
  }

  // Upsert incident
  if (existing?.[0]?.id) {
    await supabase.from('security_incidents').update({
      strike_count: currentStrikes, status, action_taken: actionTaken,
      blocked_until: blockedUntil, details,
    }).eq('id', existing[0].id);
  } else {
    await supabase.from('security_incidents').insert({
      user_id: userId, incident_type: incidentType, severity: currentStrikes >= 3 ? 'high' : 'medium',
      strike_count: currentStrikes, status, action_taken: actionTaken,
      blocked_until: blockedUntil, details,
    });
  }

  const summary = `Target ${userId.slice(0, 8)} — ${incidentType} — Strike ${currentStrikes} — Action: ${actionTaken.toUpperCase()}`;
  results.push(summary);

  // Telegram alert for blocks only
  if (status === 'blocked' && botToken && chatId) {
    await sendTelegramMessage(botToken, chatId, formatNatural(EMPLOYEE_ID, `block enforced. ${summary}`, 'incident'));
  }
}
