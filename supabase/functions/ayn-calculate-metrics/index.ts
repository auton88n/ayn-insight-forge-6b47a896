import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

function sum(arr: number[]): number {
  return arr.reduce((s, n) => s + n, 0);
}

function standardDeviation(arr: number[]): number {
  if (arr.length < 2) return 0;
  const avg = mean(arr);
  const squareDiffs = arr.map(n => Math.pow(n - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

function roundN(num: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

function calculateStreaks(trades: any[]): {
  longestWin: number; longestLoss: number;
  currentWin: number; currentLoss: number;
} {
  let longestWin = 0, longestLoss = 0, currentWin = 0, currentLoss = 0;
  for (const trade of trades) {
    if (Number(trade.pnl_dollars) > 0) {
      currentWin++;
      currentLoss = 0;
      longestWin = Math.max(longestWin, currentWin);
    } else {
      currentLoss++;
      currentWin = 0;
      longestLoss = Math.max(longestLoss, currentLoss);
    }
  }
  return { longestWin, longestLoss, currentWin, currentLoss };
}

function calculateDrawdownDuration(trades: any[], startingBalance: number): number {
  let balance = startingBalance;
  let peak = startingBalance;
  let maxDuration = 0;
  let drawdownStart: Date | null = null;

  for (const trade of trades) {
    balance += Number(trade.pnl_dollars);

    if (balance >= peak) {
      peak = balance;
      drawdownStart = null;
    } else {
      if (!drawdownStart) {
        drawdownStart = new Date(trade.exit_time);
      }
      const exitTime = new Date(trade.exit_time).getTime();
      const duration = (exitTime - drawdownStart.getTime()) / (1000 * 60 * 60 * 24);
      maxDuration = Math.max(maxDuration, duration);
    }
  }
  return Math.floor(maxDuration);
}

function calculateAllMetrics(trades: any[], startingBalance: number, maxDrawdownPercent: number) {
  const returns = trades.map(t => Number(t.pnl_percent));
  const wins = trades.filter(t => Number(t.pnl_dollars) > 0);
  const losses = trades.filter(t => Number(t.pnl_dollars) <= 0);

  // Sharpe ratio (trade-level)
  const avgReturn = mean(returns);
  const stdDev = standardDeviation(returns);
  const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

  // Sortino ratio (penalise only downside)
  const downsideReturns = returns.filter(r => r < 0);
  const downsideStdDev = standardDeviation(downsideReturns);
  const sortinoRatio = downsideStdDev > 0 ? avgReturn / downsideStdDev : 0;

  // Profit factor
  const grossProfit = sum(wins.map(t => Number(t.pnl_dollars)));
  const grossLoss = Math.abs(sum(losses.map(t => Number(t.pnl_dollars))));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  // Expectancy ($)
  const winRate = trades.length > 0 ? wins.length / trades.length : 0;
  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);

  // Average trade duration (hours)
  const durations = trades
    .filter(t => t.exit_time && t.entry_time)
    .map(t => (new Date(t.exit_time).getTime() - new Date(t.entry_time).getTime()) / (1000 * 60 * 60));
  const avgDuration = mean(durations);

  // Streaks
  const streaks = calculateStreaks(trades);

  // Max drawdown duration
  const ddDuration = calculateDrawdownDuration(trades, startingBalance);

  // Recovery factor: total profit / max drawdown $
  const totalProfit = sum(trades.map(t => Number(t.pnl_dollars)));
  const maxDrawdownDollars = startingBalance * (Math.abs(maxDrawdownPercent) / 100);
  const recoveryFactor = maxDrawdownDollars > 0 ? totalProfit / maxDrawdownDollars : 0;

  return {
    sharpe_ratio: roundN(sharpeRatio, 2),
    sortino_ratio: roundN(sortinoRatio, 2),
    profit_factor: roundN(Math.min(profitFactor, 999), 2),
    expectancy: roundN(expectancy, 2),
    avg_trade_duration_hours: roundN(avgDuration, 1),
    longest_win_streak: streaks.longestWin,
    longest_loss_streak: streaks.longestLoss,
    current_win_streak: streaks.currentWin,
    current_loss_streak: streaks.currentLoss,
    max_drawdown_duration_days: ddDuration,
    recovery_factor: roundN(recoveryFactor, 2),
    avg_win_size: roundN(avgWin, 2),
    avg_loss_size: roundN(avgLoss, 2),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch all closed trades ordered chronologically
    const { data: trades, error: tradesErr } = await supabase
      .from('ayn_paper_trades')
      .select('pnl_dollars, pnl_percent, entry_time, exit_time')
      .in('status', ['CLOSED_WIN', 'CLOSED_LOSS', 'STOPPED_OUT'])
      .not('exit_time', 'is', null)
      .order('exit_time', { ascending: true });

    if (tradesErr) throw tradesErr;

    if (!trades || trades.length === 0) {
      console.log('[ayn-calculate-metrics] No closed trades yet, skipping.');
      return new Response(JSON.stringify({ message: 'No closed trades yet', metrics: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch account state for starting balance and current max drawdown
    const { data: account, error: acctErr } = await supabase
      .from('ayn_account_state')
      .select('starting_balance, max_drawdown_percent')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    if (acctErr) throw acctErr;

    const startingBalance = Number(account.starting_balance);
    const maxDrawdownPercent = Number(account.max_drawdown_percent ?? 0);

    const metrics = calculateAllMetrics(trades, startingBalance, maxDrawdownPercent);

    // Update account state
    const { error: updateErr } = await supabase
      .from('ayn_account_state')
      .update({ ...metrics, updated_at: new Date().toISOString() })
      .eq('id', '00000000-0000-0000-0000-000000000001');

    if (updateErr) throw updateErr;

    console.log(`[ayn-calculate-metrics] ✅ Calculated metrics for ${trades.length} trades:`, JSON.stringify(metrics));

    return new Response(JSON.stringify({ success: true, tradesAnalyzed: trades.length, metrics }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[ayn-calculate-metrics] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
