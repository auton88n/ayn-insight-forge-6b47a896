import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { logAynActivity } from "../_shared/aynLogger.ts";
import { sendTelegramMessage } from "../_shared/telegramHelper.ts";
import { formatNatural } from "../_shared/aynBrand.ts";
import { logReflection } from "../_shared/employeeState.ts";
import { notifyFounder } from "../_shared/proactiveAlert.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


const EMPLOYEE_ID = 'customer_success';

// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');

    let body: any = {};
    try { body = await req.json(); } catch {}
    const mode = body.mode || 'check_retention';
    const insights: string[] = [];

    if (mode === 'new_application' && body.record) {
      const app = body.record;
      insights.push(`New friend alert! ${app.full_name || 'Someone new'} just applied for ${app.service_type || 'our services'} 🎉`);

      await supabase.from('ayn_mind').insert({
        type: 'employee_report',
        content: formatNatural(EMPLOYEE_ID, `new applicant! ${app.full_name} (${app.email}) wants ${app.service_type}. pending review — let's not keep them waiting.`, 'casual'),
        context: { from_employee: EMPLOYEE_ID, application_id: app.id },
        shared_with_admin: false,
      });

      await notifyFounder(supabase, {
        employee_id: EMPLOYEE_ID,
        message: `new application from ${app.full_name || 'someone'} for ${app.service_type || 'our services'}. want me to draft a reply or should you handle this one?`,
        priority: 'info',
        needs_approval: true,
        details: { application_id: app.id, name: app.full_name, service: app.service_type },
      });
    } else if (mode === 'negative_feedback' && body.record) {
      const rating = body.record;
      const ago24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('message_ratings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', rating.user_id)
        .eq('rating', 'negative')
        .gte('created_at', ago24h);

      if (count && count >= 3) {
        insights.push(`user ${rating.user_id?.slice(0, 8)} gave ${count} negative ratings in 24h — churn signal.`);
        await supabase.from('ayn_mind').insert({
          type: 'employee_report',
          content: formatNatural(EMPLOYEE_ID, `worried about user ${rating.user_id?.slice(0, 8)}. ${count} negative ratings in 24h. churn signal — should we reach out?`, 'incident'),
          context: { from_employee: EMPLOYEE_ID, user_id: rating.user_id, negative_count: count },
          shared_with_admin: false,
        });

        await notifyFounder(supabase, {
          employee_id: EMPLOYEE_ID,
          message: `heads up — user ${rating.user_id?.slice(0, 8)} gave ${count} negative ratings in the last 24h. looks like a churn signal. want me to reach out to them?`,
          priority: 'warning',
          needs_approval: true,
          details: { user_id: rating.user_id, negative_count: count },
        });
      }
    } else {
      // Cron mode: retention checks
      const ago7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const ago4h = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

      // 1. Users inactive 7+ days
      const { data: inactiveUsers } = await supabase
        .from('profiles')
        .select('user_id, contact_person, last_login')
        .lt('last_login', ago7d)
        .not('last_login', 'is', null)
        .limit(20);

      if (inactiveUsers?.length) {
        insights.push(`${inactiveUsers.length} user(s) haven't logged in for 7+ days — they might be slipping away 😟`);
      }

      // 2. Pending applications older than 4 hours
      const { data: staleApps } = await supabase
        .from('service_applications')
        .select('id, full_name, service_type, created_at')
        .eq('status', 'pending')
        .lt('created_at', ago4h);

      if (staleApps?.length) {
        insights.push(`${staleApps.length} application(s) have been waiting 4+ hours: ${staleApps.map(a => a.full_name).join(', ')} — let's get back to them!`);
      }

      // 3. Recent negative feedback ratio
      const ago24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentRatings } = await supabase
        .from('message_ratings')
        .select('rating')
        .gte('created_at', ago24h);

      if (recentRatings?.length) {
        const negative = recentRatings.filter((r: any) => r.rating === 'negative').length;
        const total = recentRatings.length;
        const ratio = Math.round((negative / total) * 100);
        if (ratio > 30) {
          insights.push(`⚠️ Feedback health: ${negative}/${total} negative (${ratio}%) — that's higher than we'd like`);
        } else {
          insights.push(`Feedback looking healthy! ${negative}/${total} negative (${ratio}%) — our users are happy 😊`);
        }
      }

      // 4. Active user engagement
      const { count: activeToday } = await supabase
        .from('messages')
        .select('user_id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      insights.push(`${activeToday || 0} message(s) sent in the last 24h — ${(activeToday || 0) > 10 ? 'nice engagement!' : 'could be more active'}`);

      // Report
      if (insights.length > 0) {
        await supabase.from('ayn_mind').insert({
          type: 'employee_report',
          content: formatNatural(EMPLOYEE_ID, insights.join('. '), 'casual'),
          context: {
            from_employee: EMPLOYEE_ID,
            inactive_users: inactiveUsers?.length || 0,
            stale_apps: staleApps?.length || 0,
          },
          shared_with_admin: false,
        });

        await logReflection(supabase, {
          employee_id: EMPLOYEE_ID,
          action_ref: 'retention_check',
          reasoning: `Checked ${inactiveUsers?.length || 0} inactive users, ${staleApps?.length || 0} stale apps.`,
          expected_outcome: 'Early churn detection leads to proactive outreach',
          confidence: 0.7,
          what_would_change_mind: 'If inactive users return on their own without intervention',
        });
      }
    }

    await logAynActivity(supabase, 'customer_success_check', `Customer pulse: ${insights.length} insight(s)`, {
      details: { insights },
      triggered_by: EMPLOYEE_ID,
    });

    return new Response(JSON.stringify({ success: true, insights }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('ayn-customer-success error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
