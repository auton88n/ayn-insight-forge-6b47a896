/**
 * AYN Consensus Fusion Engine — v1
 * ─────────────────────────────────────────────────────────────
 * Combines two prediction sources for higher accuracy:
 *
 *  1. AYN Prediction Engine (v10) — LLM-based
 *     Uses Claude/GPT to reason from live news, macro data,
 *     Fear & Greed, Fed rates, gold/oil prices, unemployment.
 *     Strong at: regime detection, narrative-driven moves,
 *     macro inflection points, sentiment extremes.
 *     Weak at: short-term price noise, overfitting to recent news.
 *
 *  2. Perpetual ML Engine (v1) — Math-based
 *     Trains PerpetualBooster on 3 years of OHLCV price data.
 *     Features: RSI, MACD, volatility, volume z-score, returns.
 *     Strong at: momentum patterns, statistical price behavior,
 *     unbiased technical signals, noise filtering.
 *     Weak at: black swan events, macro regime shifts, news.
 *
 * FUSION LOGIC:
 *  - If both AGREE on direction → HIGH CONVICTION signal
 *    → confidence boosted by 15%, weighted 50/50
 *  - If AYN only (ML missing) → AYN signal at reduced weight
 *    → confidence capped at 70%
 *  - If ML only (AYN missing) → ML signal at reduced weight
 *    → confidence capped at 65%
 *  - If both DISAGREE → CONFLICTED signal
 *    → confidence set to max(ayn, ml) - 20%, flagged for review
 *    → consensus direction = higher confidence engine wins
 *
 * WEIGHTING:
 *  - 1W horizon: ML gets 60% weight (better at short-term momentum)
 *  - 1M horizon: 50/50 (balanced)
 *  - 1Y horizon: AYN gets 65% weight (macro reasoning better long-term)
 * ─────────────────────────────────────────────────────────────
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Normalize direction strings from both engines to UP / DOWN / NEUTRAL
function normalizeDirection(dir: string | null): 'UP' | 'DOWN' | 'NEUTRAL' {
  if (!dir) return 'NEUTRAL';
  const d = dir.toUpperCase();
  if (d === 'UP' || d === 'BULLISH' || d === 'up') return 'UP';
  if (d === 'DOWN' || d === 'BEARISH' || d === 'down') return 'DOWN';
  return 'NEUTRAL';
}

// Normalize horizon strings: '1W' → '1_week', '1M' → '1_month' etc
// AYN uses: 1_week, 1_month, 1_year
// Perpetual uses: 1W, 1M, 3M
function normalizeHorizon(horizon: string): string {
  const map: Record<string, string> = {
    '1W': '1_week',
    '1M': '1_month',
    '3M': '3_month',
    '1Y': '1_year',
  };
  return map[horizon] ?? horizon;
}

// Horizon weights: how much to trust ML vs AYN at each horizon
function getWeights(horizon: string): { aynWeight: number; mlWeight: number } {
  if (horizon === '1_week') return { aynWeight: 0.40, mlWeight: 0.60 };  // ML better short-term
  if (horizon === '1_month') return { aynWeight: 0.50, mlWeight: 0.50 }; // balanced
  return { aynWeight: 0.65, mlWeight: 0.35 };                             // AYN better long-term
}

interface AYNPrediction {
  id: string;
  asset: string;
  horizon: string;
  target_date: string;
  baseline_date: string;
  baseline_value: number;
  predicted_direction: string;
  predicted_pct_change: number;
  confidence: number;
  reasoning: string;
  key_drivers: any;
  market_context: any;
  generated_by: string;
}

interface MLPrediction {
  id: string;
  asset: string;
  horizon: string;
  target_date: string;
  baseline_date: string;
  baseline_value: number;
  predicted_direction: string;
  predicted_pct_change: number;
  confidence: number;
  reasoning: string;
  key_drivers: any;
  signal_used: any;
  fear_greed_at_prediction: number;
  generated_by: string;
}

function buildConsensus(
  asset: string,
  horizon: string,
  ayn: AYNPrediction | null,
  ml: MLPrediction | null
): Record<string, any> | null {
  if (!ayn && !ml) return null;

  const { aynWeight, mlWeight } = getWeights(horizon);

  const now = new Date().toISOString();
  const baselineValue = ayn?.baseline_value ?? ml?.baseline_value ?? 0;
  const targetDate = ayn?.target_date ?? ml?.target_date ?? '';
  const baselineDate = ayn?.baseline_date ?? ml?.baseline_date ?? '';

  // ── CASE 1: Only AYN available (ML hasn't run yet)
  if (ayn && !ml) {
    const dir = normalizeDirection(ayn.predicted_direction);
    const conf = Math.min(Math.round(ayn.confidence * 0.85), 70); // cap without ML confirmation
    const regime = (ayn.market_context as any)?.regime ?? null;
    const regimeConf = (ayn.market_context as any)?.regime_confidence ?? null;

    return {
      asset, horizon, target_date: targetDate, baseline_date: baselineDate,
      baseline_value: baselineValue,
      consensus_direction: dir,
      consensus_pct_change: ayn.predicted_pct_change,
      consensus_confidence: conf,
      consensus_strength: conf >= 65 ? 'MODERATE' : 'WEAK',
      ayn_direction: normalizeDirection(ayn.predicted_direction),
      ayn_pct_change: ayn.predicted_pct_change,
      ayn_confidence: ayn.confidence,
      ayn_reasoning: ayn.reasoning,
      ayn_key_drivers: ayn.key_drivers,
      ayn_regime: regime,
      ayn_regime_confidence: regimeConf,
      ml_direction: null, ml_pct_change: null, ml_confidence: null,
      ml_rmse: null, ml_top_drivers: null, ml_fear_greed: null,
      agreement: null,
      fusion_method: 'AYN_ONLY',
      fusion_notes: `Only AYN engine available. Confidence reduced to ${conf}% pending ML confirmation. ML engine needs GitHub secrets configured to activate.`,
      ayn_weight: 1.0, ml_weight: 0.0,
      boost_factor: null,
      status: 'active', created_at: now, updated_at: now,
    };
  }

  // ── CASE 2: Only ML available
  if (!ayn && ml) {
    const dir = normalizeDirection(ml.predicted_direction);
    const conf = Math.min(Math.round(Number(ml.confidence) * 100 * 0.80), 65);

    return {
      asset, horizon, target_date: targetDate, baseline_date: baselineDate,
      baseline_value: baselineValue,
      consensus_direction: dir,
      consensus_pct_change: ml.predicted_pct_change,
      consensus_confidence: conf,
      consensus_strength: conf >= 60 ? 'MODERATE' : 'WEAK',
      ayn_direction: null, ayn_pct_change: null, ayn_confidence: null,
      ayn_reasoning: null, ayn_key_drivers: null, ayn_regime: null, ayn_regime_confidence: null,
      ml_direction: normalizeDirection(ml.predicted_direction),
      ml_pct_change: ml.predicted_pct_change,
      ml_confidence: Number(ml.confidence) * 100,
      ml_rmse: (ml.signal_used as any)?.val_rmse ?? null,
      ml_top_drivers: ml.key_drivers,
      ml_fear_greed: ml.fear_greed_at_prediction,
      agreement: null,
      fusion_method: 'ML_ONLY',
      fusion_notes: `Only Perpetual ML engine available. Confidence reduced to ${conf}% pending AYN reasoning layer.`,
      ayn_weight: 0.0, ml_weight: 1.0,
      boost_factor: null,
      status: 'active', created_at: now, updated_at: now,
    };
  }

  // ── CASE 3: Both available — full fusion
  const aynDir = normalizeDirection(ayn!.predicted_direction);
  const mlDir = normalizeDirection(ml!.predicted_direction);
  const agree = aynDir !== 'NEUTRAL' && mlDir !== 'NEUTRAL' && aynDir === mlDir;

  // Weighted average of pct_change
  const aynPct = ayn!.predicted_pct_change;
  const mlPct = ml!.predicted_pct_change;
  const weightedPct = (aynPct * aynWeight) + (mlPct * mlWeight);

  // Weighted average of confidence
  const aynConf = ayn!.confidence;
  const mlConf = Number(ml!.confidence) * 100; // perpetual stores as 0-1 decimal
  const weightedConf = (aynConf * aynWeight) + (mlConf * mlWeight);

  let finalConf: number;
  let finalDir: 'UP' | 'DOWN' | 'NEUTRAL';
  let strength: string;
  let method: string;
  let notes: string;
  let boost: string | null = null;

  if (agree) {
    // Both agree — boost confidence by 15%
    finalConf = Math.min(Math.round(weightedConf * 1.15), 95);
    finalDir = aynDir;
    strength = finalConf >= 80 ? 'STRONG' : 'MODERATE';
    method = 'AGREEMENT_BOOST';
    boost = '+15% confidence boost — both engines agree on direction';
    const regimeName = (ayn!.market_context as any)?.regime ?? 'unknown';
    notes = `Both AYN reasoning engine and Perpetual ML model agree: ${finalDir} for ${asset} over ${horizon}. ` +
            `AYN detects ${regimeName} regime. ML technical signals confirm momentum. ` +
            `Weighted ${Math.round(aynWeight*100)}/${Math.round(mlWeight*100)} AYN/ML. ` +
            `Confidence boosted to ${finalConf}% due to cross-engine agreement.`;
  } else {
    // Disagree — conflicted signal, higher confidence engine wins direction
    const higherConf = aynConf >= mlConf ? ayn! : ml!;
    finalDir = normalizeDirection(higherConf.predicted_direction);
    finalConf = Math.max(Math.round(Math.max(aynConf, mlConf) * 0.80), 35); // penalty for disagreement
    strength = 'CONFLICTED';
    method = 'CONFLICT_RESOLUTION';
    notes = `AYN engine says ${aynDir} (${aynConf}% conf) but ML model says ${mlDir} (${mlConf.toFixed(0)}% conf). ` +
            `Using ${aynConf >= mlConf ? 'AYN' : 'ML'} as tiebreaker (higher confidence). ` +
            `Confidence reduced to ${finalConf}% due to engine conflict. Use with caution.`;
  }

  const regime = (ayn!.market_context as any)?.regime ?? null;
  const regimeConf = (ayn!.market_context as any)?.regime_confidence ?? null;

  return {
    asset, horizon, target_date: targetDate, baseline_date: baselineDate,
    baseline_value: baselineValue,
    consensus_direction: finalDir,
    consensus_pct_change: Math.round(weightedPct * 100) / 100,
    consensus_confidence: finalConf,
    consensus_strength: strength,
    ayn_direction: aynDir,
    ayn_pct_change: aynPct,
    ayn_confidence: aynConf,
    ayn_reasoning: ayn!.reasoning,
    ayn_key_drivers: ayn!.key_drivers,
    ayn_regime: regime,
    ayn_regime_confidence: regimeConf,
    ml_direction: mlDir,
    ml_pct_change: mlPct,
    ml_confidence: mlConf,
    ml_rmse: (ml!.signal_used as any)?.val_rmse ?? null,
    ml_top_drivers: ml!.key_drivers,
    ml_fear_greed: ml!.fear_greed_at_prediction,
    agreement: agree,
    fusion_method: method,
    fusion_notes: notes,
    ayn_weight: aynWeight,
    ml_weight: mlWeight,
    boost_factor: boost,
    status: 'active', created_at: now, updated_at: now,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // ── 1. Fetch latest active AYN predictions (v10)
    const { data: aynRaw } = await sb
      .from('ayn_predictions')
      .select('*')
      .eq('status', 'active')
      .eq('generated_by', 'ayn_prediction_engine_v10')
      .order('created_at', { ascending: false });

    // ── 2. Fetch latest active ML predictions (perpetual)
    const { data: mlRaw } = await sb
      .from('ayn_predictions')
      .select('*')
      .eq('status', 'active')
      .eq('generated_by', 'perpetual-ml-v1')
      .order('created_at', { ascending: false });

    // ── 3. Index by asset+horizon — keep most recent per pair
    const aynMap = new Map<string, AYNPrediction>();
    for (const p of (aynRaw ?? [])) {
      const key = `${p.asset}__${normalizeHorizon(p.horizon)}`;
      if (!aynMap.has(key)) aynMap.set(key, p);
    }

    const mlMap = new Map<string, MLPrediction>();
    for (const p of (mlRaw ?? [])) {
      const key = `${p.asset.toLowerCase()}__${normalizeHorizon(p.horizon)}`;
      if (!mlMap.has(key)) mlMap.set(key, p);
    }

    // ── 4. Build union of all asset+horizon pairs
    const allKeys = new Set<string>([
      ...Array.from(aynMap.keys()),
      ...Array.from(mlMap.keys()),
    ]);

    // ── 5. Build consensus for each pair
    const consensusRows: Record<string, any>[] = [];
    for (const key of allKeys) {
      const [asset, horizon] = key.split('__');
      const ayn = aynMap.get(key) ?? null;
      const ml = mlMap.get(key) ?? null;
      const row = buildConsensus(asset, horizon, ayn, ml);
      if (row) consensusRows.push(row);
    }

    if (consensusRows.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No active predictions found from either engine' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 6. Expire old consensus predictions
    await sb
      .from('ayn_consensus_predictions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('status', 'active');

    // ── 7. Insert new consensus predictions
    const { error: insertError } = await sb
      .from('ayn_consensus_predictions')
      .insert(consensusRows);

    if (insertError) throw insertError;

    // ── 8. Summary
    const agreed = consensusRows.filter(r => r.agreement === true).length;
    const conflicted = consensusRows.filter(r => r.consensus_strength === 'CONFLICTED').length;
    const aynOnly = consensusRows.filter(r => r.fusion_method === 'AYN_ONLY').length;
    const summary = {
      total: consensusRows.length,
      agreed,
      conflicted,
      ayn_only: aynOnly,
      ml_only: consensusRows.length - agreed - conflicted - aynOnly,
      strong_signals: consensusRows.filter(r => r.consensus_strength === 'STRONG').length,
    };

    console.log(`[consensus-fusion] Done. ${JSON.stringify(summary)}`);

    return new Response(JSON.stringify({ success: true, summary, predictions: consensusRows }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[consensus-fusion] Error:', err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
