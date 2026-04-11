/**
 * AYN Resolution Judge — v2
 * ─────────────────────────────────────────────────────────────
 * Runs daily (cron: 0 6 * * *) to resolve predictions whose
 * target_date has passed.
 *
 * Price sources (in priority order):
 *  1. Coinbase API  — BTC, ETH, SOL (crypto)
 *  2. Metals-API    — Gold, Silver (precious metals)
 *  3. Alpha Vantage — Oil, Copper, Wheat (commodities)
 *  4. ExchangeRate  — USD/JPY, EUR/USD (forex)
 *
 * Scoring:
 *  - actual_direction = "up"       if actual_pct_change > asset_threshold
 *  - actual_direction = "down"     if actual_pct_change < -asset_threshold
 *  - actual_direction = "sideways" otherwise
 *
 *  Asset sideways thresholds (same as predictor):
 *    BTC/ETH: 2.5%  Gold: 1.5%  Silver: 2.0%
 *    Oil/Copper: 1.0%  Wheat: 1.5%  USD_JPY: 0.5%
 *
 *  was_direction_correct:
 *    true  → predicted_direction == actual_direction
 *    false → otherwise
 * ─────────────────────────────────────────────────────────────
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { corsHeaders as getCorsHeadersFn } from "../_shared/cors.ts";

const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

// ─── Asset config ────────────────────────────────────────────────────────────
const ASSET_CONFIG: Record<string, {
  sidewaysThreshold: number;  // fraction e.g. 0.025 = 2.5%
  source: "coinbase" | "alphavantage_commodity" | "alphavantage_forex" | "alphavantage_crypto";
  symbol: string;             // symbol for the price source
}> = {
  btc:     { sidewaysThreshold: 0.025, source: "coinbase",              symbol: "BTC-USD" },
  eth:     { sidewaysThreshold: 0.025, source: "coinbase",              symbol: "ETH-USD" },
  sol:     { sidewaysThreshold: 0.030, source: "coinbase",              symbol: "SOL-USD" },
  gold:    { sidewaysThreshold: 0.015, source: "alphavantage_commodity", symbol: "GOLD" },
  silver:  { sidewaysThreshold: 0.020, source: "alphavantage_commodity", symbol: "SILVER" },
  oil:     { sidewaysThreshold: 0.020, source: "alphavantage_commodity", symbol: "WTI" },
  copper:  { sidewaysThreshold: 0.010, source: "alphavantage_commodity", symbol: "COPPER" },
  wheat:   { sidewaysThreshold: 0.015, source: "alphavantage_commodity", symbol: "WHEAT" },
  usd_jpy: { sidewaysThreshold: 0.005, source: "alphavantage_forex",     symbol: "USD" },  // USD/JPY
};

// ─── Price fetchers ──────────────────────────────────────────────────────────

async function fetchCoinbasePrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.coinbase.com/v2/prices/${symbol}/spot`, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return parseFloat(data?.data?.amount ?? "0") || null;
  } catch { return null; }
}

async function fetchAlphaVantageCommodity(symbol: string, apiKey: string): Promise<number | null> {
  try {
    const url = `https://www.alphavantage.co/query?function=COMMODITY&symbol=${symbol}&interval=daily&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const series = data?.data;
    if (!series || series.length === 0) return null;
    // Most recent datapoint
    const latest = series[0];
    return parseFloat(latest.value) || null;
  } catch { return null; }
}

async function fetchAlphaVantageForex(fromCurrency: string, toCurrency: string, apiKey: string): Promise<number | null> {
  try {
    const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${fromCurrency}&to_currency=${toCurrency}&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data?.["Realtime Currency Exchange Rate"]?.["5. Exchange Rate"];
    return parseFloat(rate) || null;
  } catch { return null; }
}

async function fetchCurrentPrice(asset: string, alphaKey: string): Promise<number | null> {
  const cfg = ASSET_CONFIG[asset];
  if (!cfg) return null;

  switch (cfg.source) {
    case "coinbase":
      return fetchCoinbasePrice(cfg.symbol);

    case "alphavantage_commodity":
      return fetchAlphaVantageCommodity(cfg.symbol, alphaKey);

    case "alphavantage_forex":
      // USD/JPY — from USD to JPY
      return fetchAlphaVantageForex("USD", "JPY", alphaKey);

    default:
      return null;
  }
}

// ─── Direction logic ─────────────────────────────────────────────────────────
function classifyDirection(pctChange: number, threshold: number): "up" | "down" | "sideways" {
  if (pctChange > threshold) return "up";
  if (pctChange < -threshold) return "down";
  return "sideways";
}

function isCorrect(predicted: string, actual: string): boolean {
  return predicted === actual;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const ALPHA_KEY = Deno.env.get("ALPHA_VANTAGE_API_KEY") ?? "";
    const today = new Date().toISOString().split("T")[0];

    // 1. Find predictions whose target_date has passed and haven't been resolved yet
    const { data: pending, error: fetchErr } = await supabase
      .from("ayn_predictions")
      .select("id, asset, horizon, predicted_direction, predicted_pct_change, baseline_value, baseline_date, target_date, confidence")
      .lte("target_date", today)
      .eq("status", "active")
      .order("target_date", { ascending: true })
      .limit(50);

    if (fetchErr) throw fetchErr;
    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ success: true, resolved: 0, message: "No pending predictions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[resolution-judge] Found ${pending.length} predictions to resolve`);

    // 2. Fetch current prices — deduplicated per asset
    const assets = [...new Set(pending.map((p: any) => p.asset))];
    const priceCache: Record<string, number | null> = {};

    await Promise.all(assets.map(async (asset: string) => {
      // Small delay to avoid rate limiting Alpha Vantage (5 req/min free tier)
      await new Promise(r => setTimeout(r, Math.random() * 2000));
      const price = await fetchCurrentPrice(asset, ALPHA_KEY);
      priceCache[asset] = price;
      console.log(`[resolution-judge] ${asset} current price: ${price}`);
    }));

    // 3. Score each prediction
    let resolved = 0;
    let correct = 0;
    let skipped = 0;

    for (const pred of pending as any[]) {
      const currentPrice = priceCache[pred.asset];

      if (!currentPrice || !pred.baseline_value || pred.baseline_value <= 0) {
        // Can't resolve — mark unknown so we don't retry endlessly
        await supabase.from("ayn_predictions").update({ status: "unresolvable" }).eq("id", pred.id);
        skipped++;
        continue;
      }

      const actualPctChange = ((currentPrice - pred.baseline_value) / pred.baseline_value) * 100;
      const cfg = ASSET_CONFIG[pred.asset] ?? { sidewaysThreshold: 0.015 };

      // Scale threshold by horizon (same as predictor)
      let thresh = cfg.sidewaysThreshold;
      if (pred.horizon === "1_month") thresh *= 3.0;
      else if (pred.horizon === "1_week") thresh *= 1.5;
      else if (pred.horizon === "1_year") thresh *= 8.0;

      const actualDirection = classifyDirection(actualPctChange / 100, thresh);
      const wasCorrect = isCorrect(pred.predicted_direction, actualDirection);

      const accuracyScore = wasCorrect
        ? Math.max(50, pred.confidence - Math.abs(actualPctChange - (pred.predicted_pct_change ?? 0)) * 2)
        : Math.max(0, pred.confidence * 0.3 - 10);

      // Write outcome
      await supabase.from("ayn_prediction_outcomes").upsert({
        prediction_id: pred.id,
        resolved_at: new Date().toISOString(),
        actual_value: currentPrice,
        actual_date: today,
        actual_direction: actualDirection,
        actual_pct_change: actualPctChange,
        was_direction_correct: wasCorrect,
        value_error_pct: Math.abs(actualPctChange - (pred.predicted_pct_change ?? 0)),
        accuracy_score: accuracyScore,
        what_happened: `Baseline: $${pred.baseline_value.toFixed(2)} → Current: $${currentPrice.toFixed(2)} (${actualPctChange >= 0 ? "+" : ""}${actualPctChange.toFixed(2)}%). Predicted ${pred.predicted_direction}, actual ${actualDirection}.`,
        data_source: ASSET_CONFIG[pred.asset]?.source ?? "unknown",
      }, { onConflict: "prediction_id" });

      // Mark prediction as resolved
      await supabase.from("ayn_predictions")
        .update({ status: "resolved" })
        .eq("id", pred.id);

      if (wasCorrect) correct++;
      resolved++;

      console.log(`[resolution-judge] ${pred.asset} ${pred.horizon}: ${pred.predicted_direction} → ${actualDirection} (${wasCorrect ? "✅" : "❌"}) | ${actualPctChange.toFixed(2)}%`);
    }

    const accuracy = resolved > 0 ? Math.round((correct / resolved) * 100) : 0;
    console.log(`[resolution-judge] Done: ${resolved} resolved, ${correct} correct (${accuracy}%), ${skipped} skipped`);

    return new Response(JSON.stringify({
      success: true,
      resolved,
      correct,
      accuracy_pct: accuracy,
      skipped,
      prices_fetched: Object.keys(priceCache).length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[resolution-judge] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
