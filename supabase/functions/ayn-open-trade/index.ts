import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

// ── Adaptive position sizing ─────────────────────────────────────────────────
async function calculateAdaptiveRisk(
  supabase: ReturnType<typeof createClient>,
  confidence: number,
  marketContext: any
): Promise<{ riskPercent: number; reasoning: string[] }> {
  const reasons: string[] = [];

  // FACTOR 1: Confidence tier (baseline)
  let baseRisk: number;
  if (confidence >= 85) {
    baseRisk = 3.0; reasons.push('High confidence (85%+) → 3% base');
  } else if (confidence >= 75) {
    baseRisk = 2.5; reasons.push('Strong confidence (75-84%) → 2.5% base');
  } else if (confidence >= 65) {
    baseRisk = 2.0; reasons.push('Medium confidence (65-74%) → 2% base');
  } else {
    baseRisk = 1.5; reasons.push('Lower confidence (60-64%) → 1.5% base');
  }

  // Fetch account state once for factors 3, 4, 7
  const { data: account } = await supabase
    .from('ayn_account_state')
    .select('current_balance, starting_balance, current_win_streak, current_loss_streak, profit_factor')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .single();

  // FACTOR 2: Recent 10-trade win rate
  const { data: recentTrades } = await supabase
    .from('ayn_paper_trades')
    .select('pnl_dollars')
    .in('status', ['CLOSED_WIN', 'CLOSED_LOSS', 'STOPPED_OUT'])
    .order('exit_time', { ascending: false })
    .limit(10);

  if (recentTrades && recentTrades.length >= 5) {
    const recentWinRate = recentTrades.filter(t => Number(t.pnl_dollars) > 0).length / recentTrades.length;
    if (recentWinRate >= 0.7) {
      baseRisk *= 1.2;
      reasons.push(`Hot streak (${(recentWinRate * 100).toFixed(0)}% recent win rate) → +20%`);
    } else if (recentWinRate <= 0.3) {
      baseRisk *= 0.7;
      reasons.push(`Cold streak (${(recentWinRate * 100).toFixed(0)}% recent win rate) → -30%`);
    }
  }

  // FACTOR 3: Current streak
  if (account) {
    const winStreak = account.current_win_streak ?? 0;
    const lossStreak = account.current_loss_streak ?? 0;
    if (winStreak >= 5) {
      baseRisk *= 1.1;
      reasons.push(`${winStreak}-trade win streak → +10%`);
    } else if (lossStreak >= 3) {
      baseRisk *= 0.6;
      reasons.push(`${lossStreak}-trade loss streak → -40% (recovery mode)`);
    }
  }

  // FACTOR 4: Account drawdown / growth
  if (account) {
    const currentBalance = Number(account.current_balance);
    const startingBalance = Number(account.starting_balance);
    const drawdownPct = startingBalance > 0 ? ((startingBalance - currentBalance) / startingBalance) * 100 : 0;

    if (drawdownPct > 20) {
      baseRisk *= 0.5;
      reasons.push(`Account down ${drawdownPct.toFixed(1)}% → -50% (RECOVERY MODE)`);
    } else if (drawdownPct > 15) {
      baseRisk *= 0.6;
      reasons.push(`Significant drawdown (-${drawdownPct.toFixed(1)}%) → -40%`);
    } else if (drawdownPct > 10) {
      baseRisk *= 0.8;
      reasons.push(`Moderate drawdown (-${drawdownPct.toFixed(1)}%) → -20%`);
    } else if (currentBalance > startingBalance * 1.3) {
      baseRisk *= 1.15;
      reasons.push(`Account up ${(((currentBalance / startingBalance) - 1) * 100).toFixed(1)}% → +15%`);
    }
  }

  // FACTOR 5: Market volatility from context
  const volatility = marketContext?.volatility || 'normal';
  if (volatility === 'extreme') {
    baseRisk *= 0.5;
    reasons.push('Extreme market volatility → -50%');
  } else if (volatility === 'high') {
    baseRisk *= 0.75;
    reasons.push('High market volatility → -25%');
  }

  // FACTOR 6: Session liquidity (UTC hour)
  const hour = new Date().getUTCHours();
  if (hour >= 13 && hour <= 20) {
    baseRisk *= 1.05;
    reasons.push('Peak liquidity (NY/London session) → +5%');
  } else if (hour < 8 || hour > 21) {
    baseRisk *= 0.85;
    reasons.push('Low liquidity (Asian/after-hours) → -15%');
  }

  // FACTOR 7: Profit factor
  if (account) {
    const pf = Number(account.profit_factor ?? 0);
    if (pf >= 2.5) {
      baseRisk *= 1.1;
      reasons.push(`Strong profit factor (${pf.toFixed(2)}) → +10%`);
    } else if (pf > 0 && pf < 1.0) {
      baseRisk *= 0.7;
      reasons.push(`Weak profit factor (${pf.toFixed(2)}) → -30%`);
    }
  }

  const finalRisk = Math.max(0.5, Math.min(baseRisk, 3.0));
  console.log(`[ADAPTIVE RISK] Final: ${finalRisk.toFixed(2)}% | Factors: ${reasons.join(' | ')}`);

  return { riskPercent: finalRisk, reasoning: reasons };
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const {
      ticker, timeframe, signal, entryPrice, stopLoss,
      takeProfit1, takeProfit2, confidence, setupType,
      reasoning, marketContext, chartImageUrl,
    } = body;

    console.log(`[ayn-open-trade] Received: ${signal} ${ticker} @ ${entryPrice}, confidence: ${confidence}`);

    // Validate signal
    if (!signal || signal === 'WAIT' || signal === 'NEUTRAL') {
      return new Response(JSON.stringify({ opened: false, reason: 'Signal is WAIT/NEUTRAL' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!confidence || confidence < 60) {
      return new Response(JSON.stringify({ opened: false, reason: `Confidence ${confidence}% < 60% threshold` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check standard circuit breakers (kill switch, daily loss limit, etc.)
    const { data: breakers } = await supabase
      .from('ayn_circuit_breakers')
      .select('breaker_type, is_tripped, reason')
      .eq('is_tripped', true);

    if (breakers && breakers.length > 0) {
      const tripped = breakers[0];
      console.log(`[ayn-open-trade] Circuit breaker tripped: ${tripped.breaker_type}. Aborting.`);
      return new Response(JSON.stringify({
        opened: false,
        reason: `Circuit breaker active: ${tripped.breaker_type} — ${tripped.reason || 'Trading halted'}`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── FEATURE 3: Consecutive loss streak breaker ────────────────────────────
    const { data: acctStateStreak } = await supabase
      .from('ayn_account_state')
      .select('current_loss_streak')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    const lossStreak = acctStateStreak?.current_loss_streak ?? 0;
    if (lossStreak >= 3) {
      await supabase
        .from('ayn_circuit_breakers')
        .upsert({
          breaker_type: 'CONSECUTIVE_LOSSES',
          is_tripped: true,
          tripped_at: new Date().toISOString(),
          reason: `${lossStreak} consecutive losses — manual reset required to resume trading`,
          threshold_value: 3,
          current_value: lossStreak,
          auto_reset: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'breaker_type' });

      console.log(`[ayn-open-trade] CONSECUTIVE_LOSSES breaker tripped at ${lossStreak} losses.`);
      return new Response(JSON.stringify({
        opened: false,
        reason: `Trading paused: ${lossStreak} consecutive losses. Go to Performance dashboard → Resume Trading to reset.`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check max open positions (3)
    const { count } = await supabase
      .from('ayn_paper_trades')
      .select('id', { count: 'exact', head: true })
      .in('status', ['OPEN', 'PARTIAL_CLOSE']);

    if ((count || 0) >= 3) {
      return new Response(JSON.stringify({ opened: false, reason: `Max positions reached (${count}/3)` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for duplicate ticker
    const { count: dupeCount } = await supabase
      .from('ayn_paper_trades')
      .select('id', { count: 'exact', head: true })
      .eq('ticker', ticker)
      .in('status', ['OPEN', 'PARTIAL_CLOSE']);

    if ((dupeCount || 0) > 0) {
      return new Response(JSON.stringify({ opened: false, reason: `Already in ${ticker}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get account balance
    const { data: account } = await supabase
      .from('ayn_account_state')
      .select('current_balance')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    if (!account) throw new Error('Account state not found');

    const balance = Number(account.current_balance);

    // ── FEATURE 2: Adaptive position sizing ──────────────────────────────────
    const adaptiveRisk = await calculateAdaptiveRisk(supabase, confidence, marketContext);
    const riskPercent = adaptiveRisk.riskPercent;
    const riskDollars = balance * (riskPercent / 100);

    const stopDistance = Math.abs(Number(entryPrice) - Number(stopLoss));
    if (stopDistance <= 0) {
      return new Response(JSON.stringify({ opened: false, reason: 'Invalid stop distance (0)' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sharesOrCoins = riskDollars / stopDistance;
    const positionSizeDollars = sharesOrCoins * Number(entryPrice);

    if (positionSizeDollars > balance * 0.5) {
      return new Response(JSON.stringify({ opened: false, reason: 'Position too large for account (>50%)' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert trade
    const { data: trade, error } = await supabase
      .from('ayn_paper_trades')
      .insert({
        ticker,
        timeframe: timeframe || 'unknown',
        signal: signal === 'BUY' || signal === 'BULLISH' ? 'BUY' : 'SELL',
        entry_price: Number(entryPrice),
        entry_time: new Date().toISOString(),
        position_size_percent: Math.round(riskPercent * 100) / 100,
        position_size_dollars: Math.round(positionSizeDollars * 100) / 100,
        shares_or_coins: sharesOrCoins,
        stop_loss_price: Number(stopLoss),
        take_profit_1_price: takeProfit1 ? Number(takeProfit1) : null,
        take_profit_2_price: takeProfit2 ? Number(takeProfit2) : null,
        take_profit_1_percent: 50,
        take_profit_2_percent: 50,
        confidence_score: confidence,
        setup_type: setupType || null,
        reasoning: reasoning || null,
        chart_image_url: chartImageUrl || null,
        market_context: marketContext || null,
        position_sizing_reasoning: adaptiveRisk.reasoning,
        status: 'OPEN',
      })
      .select()
      .single();

    if (error) {
      console.error('[ayn-open-trade] Insert error:', error);
      throw error;
    }

    // Deduct position size from available balance
    await supabase
      .from('ayn_account_state')
      .update({
        current_balance: balance - positionSizeDollars,
        updated_at: new Date().toISOString(),
      })
      .eq('id', '00000000-0000-0000-0000-000000000001');

    console.log(`[ayn-open-trade] ✅ Trade opened: ${signal} ${ticker} @ $${entryPrice} | Risk: ${riskPercent.toFixed(2)}% ($${riskDollars.toFixed(2)}) | Size: $${positionSizeDollars.toFixed(2)} | Balance: $${(balance - positionSizeDollars).toFixed(2)}`);

    return new Response(JSON.stringify({
      opened: true,
      trade,
      summary: `${signal} ${ticker} @ $${entryPrice} | ${riskPercent.toFixed(2)}% risk ($${riskDollars.toFixed(2)}) | Stop: $${stopLoss}`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[ayn-open-trade] Error:', err);
    return new Response(JSON.stringify({ opened: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
