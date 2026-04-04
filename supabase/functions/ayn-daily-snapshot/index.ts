import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
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

    const today = new Date().toISOString().split('T')[0];
    const todayMidnight = `${today}T00:00:00.000Z`;

    // Fetch everything in parallel
    const [acctRes, openRes, yesterdayRes, todayTradesRes] = await Promise.all([
      supabase
        .from('ayn_account_state')
        .select('current_balance, starting_balance, total_trades')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .single(),
      supabase
        .from('ayn_paper_trades')
        .select('id')
        .in('status', ['OPEN', 'PARTIAL_CLOSE']),
      supabase
        .from('ayn_daily_snapshots')
        .select('balance, snapshot_date')
        .lt('snapshot_date', today)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('ayn_paper_trades')
        .select('pnl_dollars, pnl_percent')
        .gte('exit_time', todayMidnight)
        .in('status', ['CLOSED_WIN', 'CLOSED_LOSS', 'STOPPED_OUT']),
    ]);

    if (acctRes.error) throw acctRes.error;

    const account = acctRes.data;
    const balance = Number(account.current_balance);
    const yesterdayBalance = yesterdayRes.data?.balance ?? Number(account.starting_balance ?? 10000);

    const dailyPnLDollars = balance - Number(yesterdayBalance);
    const dailyPnLPercent = Number(yesterdayBalance) > 0
      ? (dailyPnLDollars / Number(yesterdayBalance)) * 100
      : 0;

    const todayTrades = todayTradesRes.data ?? [];
    const winsToday = todayTrades.filter(t => Number(t.pnl_dollars) > 0).length;
    const lossesToday = todayTrades.filter(t => Number(t.pnl_dollars) <= 0).length;

    const snapshot = {
      snapshot_date:       today,
      balance:             Math.round(balance * 100) / 100,
      daily_pnl_dollars:   Math.round(dailyPnLDollars * 100) / 100,
      daily_pnl_percent:   Math.round(dailyPnLPercent * 100) / 100,
      open_positions:      openRes.data?.length ?? 0,
      trades_closed_today: todayTrades.length,
      wins_today:          winsToday,
      losses_today:        lossesToday,
    };

    const { error: upsertErr } = await supabase
      .from('ayn_daily_snapshots')
      .upsert(snapshot, { onConflict: 'snapshot_date' });

    if (upsertErr) throw upsertErr;

    console.log(`[ayn-daily-snapshot] ✅ Snapshot for ${today}: balance=$${balance}, daily_pnl=$${dailyPnLDollars.toFixed(2)} (${dailyPnLPercent.toFixed(2)}%)`);

    return new Response(JSON.stringify({ success: true, snapshot }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ayn-daily-snapshot] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
