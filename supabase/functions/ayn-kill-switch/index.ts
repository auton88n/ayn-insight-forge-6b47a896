import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { logAynActivity } from "../_shared/aynLogger.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json().catch(() => ({}));
    const { action, reason } = body;

    if (!action || !['trip', 'reset', 'status'].includes(action)) {
      return new Response(JSON.stringify({ error: "action must be 'trip', 'reset', or 'status'" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Always return full status
    const { data: allBreakers, error: fetchErr } = await supabase
      .from('ayn_circuit_breakers')
      .select('*')
      .order('breaker_type');

    if (fetchErr) throw fetchErr;

    if (action === 'status') {
      return new Response(JSON.stringify({ breakers: allBreakers }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'trip') {
      const { error: updateErr } = await supabase
        .from('ayn_circuit_breakers')
        .update({
          is_tripped:  true,
          tripped_at:  new Date().toISOString(),
          reason:      reason || 'Manual kill switch activated',
          updated_at:  new Date().toISOString(),
        })
        .eq('breaker_type', 'KILL_SWITCH');

      if (updateErr) throw updateErr;

      await logAynActivity(supabase, 'KILL_SWITCH_TRIPPED', `Emergency stop activated: ${reason || 'Manual override'}`, {
        target_type:  'circuit_breaker',
        triggered_by: 'admin',
        details:      { reason },
      });

      console.log(`[ayn-kill-switch] ⛔ KILL SWITCH TRIPPED: ${reason || 'Manual override'}`);

      return new Response(JSON.stringify({
        success: true,
        action: 'tripped',
        message: 'Kill switch activated — no new trades will open',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'reset') {
      const { error: resetErr } = await supabase
        .from('ayn_circuit_breakers')
        .update({
          is_tripped:  false,
          tripped_at:  null,
          reason:      null,
          updated_at:  new Date().toISOString(),
        })
        .eq('breaker_type', 'KILL_SWITCH');

      if (resetErr) throw resetErr;

      await logAynActivity(supabase, 'KILL_SWITCH_RESET', 'Trading resumed — kill switch disengaged', {
        target_type:  'circuit_breaker',
        triggered_by: 'admin',
      });

      console.log('[ayn-kill-switch] ✅ Kill switch reset — trading resumed');

      return new Response(JSON.stringify({
        success: true,
        action:  'reset',
        message: 'Kill switch reset — trading can resume',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (err) {
    console.error('[ayn-kill-switch] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
