import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

// Fee/slippage model: 0.05% entry + 0.05% exit + 0.05% slippage = ~0.15% total round-trip
function calculateCosts(positionSizeDollars: number, shares: number, exitPrice: number) {
  const entryFee  = positionSizeDollars * 0.0005;
  const exitFee   = shares * exitPrice * 0.0005;
  const slippage  = positionSizeDollars * 0.0005;
  return { entryFee, exitFee, slippage, total: entryFee + exitFee + slippage };
}

async function signPionexRequest(path: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(path));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getCurrentPrice(ticker: string): Promise<number | null> {
  const apiKey    = Deno.env.get('PIONEX_API_KEY');
  const apiSecret = Deno.env.get('PIONEX_API_SECRET');
  if (!apiKey || !apiSecret) return null;

  const cleanTicker = ticker.replace(/\/USDT|\/USD|\/BUSD/i, '').toUpperCase();
  const symbol      = `${cleanTicker}_USDT`;
  const timestamp   = Date.now().toString();
  const tickerPath  = `/api/v1/market/tickers?symbol=${symbol}&timestamp=${timestamp}`;
  const signature   = await signPionexRequest(tickerPath, apiSecret);

  try {
    const res = await fetch(`https://api.pionex.com${tickerPath}`, {
      headers: { 'PIONEX-KEY': apiKey, 'PIONEX-SIGNATURE': signature },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const info = data?.data?.tickers?.[0];
    if (info?.close) return parseFloat(info.close);
    return null;
  } catch {
    return null;
  }
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

    const body = await req.json();
    const { tradeId, reason } = body;

    if (!tradeId) {
      return new Response(JSON.stringify({ error: 'tradeId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the trade
    const { data: trade, error: fetchErr } = await supabase
      .from('ayn_paper_trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (fetchErr || !trade) {
      return new Response(JSON.stringify({ error: 'Trade not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['OPEN', 'PARTIAL_CLOSE'].includes(trade.status)) {
      return new Response(JSON.stringify({ error: `Trade already closed (status: ${trade.status})` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try to get current price; fall back to entry price (breakeven close)
    const currentPrice = await getCurrentPrice(trade.ticker) ?? Number(trade.entry_price);
    const priceSource  = currentPrice === Number(trade.entry_price) ? 'BREAKEVEN_FALLBACK' : 'LIVE_PRICE';

    const isBuy         = trade.signal === 'BUY';
    const entryPrice    = Number(trade.entry_price);
    const shares        = Number(trade.shares_or_coins);
    const prevPnl       = Number(trade.pnl_dollars ?? 0);

    // P&L on remaining shares (gross)
    const grossClosePnl = isBuy
      ? (currentPrice - entryPrice) * shares
      : (entryPrice - currentPrice) * shares;

    // Deduct fees and slippage
    const costs = calculateCosts(Number(trade.position_size_dollars), shares, currentPrice);
    const netClosePnl = grossClosePnl - costs.total;

    const totalPnlDollars  = Math.round((prevPnl + netClosePnl) * 100) / 100;
    const positionDollars  = Number(trade.position_size_dollars);
    const totalPnlPercent  = positionDollars > 0
      ? Math.round((totalPnlDollars / positionDollars) * 10000) / 100
      : 0;

    const finalStatus = totalPnlDollars > 0 ? 'CLOSED_WIN' : 'CLOSED_LOSS';
    const exitReason  = reason || 'MANUAL_CLOSE';

    const { error: updateErr } = await supabase
      .from('ayn_paper_trades')
      .update({
        exit_price:    currentPrice,
        exit_time:     new Date().toISOString(),
        exit_reason:   exitReason,
        pnl_dollars:   totalPnlDollars,
        pnl_percent:   totalPnlPercent,
        fees_paid:     Math.round((costs.entryFee + costs.exitFee) * 100) / 100,
        slippage_cost: Math.round(costs.slippage * 100) / 100,
        status:        finalStatus,
        updated_at:    new Date().toISOString(),
      })
      .eq('id', tradeId);

    if (updateErr) throw updateErr;

    // Return position capital + net P&L to available balance
    const { data: acct } = await supabase
      .from('ayn_account_state')
      .select('current_balance')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    const newBalance = Number(acct?.current_balance ?? 0) + positionDollars + totalPnlDollars;
    await supabase
      .from('ayn_account_state')
      .update({ current_balance: Math.round(newBalance * 100) / 100, updated_at: new Date().toISOString() })
      .eq('id', '00000000-0000-0000-0000-000000000001');

    console.log(`[ayn-close-trade] ✅ Closed ${trade.ticker} @ $${currentPrice} (${priceSource}) | Gross: $${grossClosePnl.toFixed(2)}, Fees: $${costs.total.toFixed(2)}, Net: $${totalPnlDollars} (${totalPnlPercent}%) | Reason: ${exitReason} | New balance: $${newBalance.toFixed(2)}`);

    return new Response(JSON.stringify({
      success: true,
      priceSource,
      trade: {
        id:          tradeId,
        ticker:      trade.ticker,
        signal:      trade.signal,
        exitPrice:   currentPrice,
        pnlDollars:  totalPnlDollars,
        pnlPercent:  totalPnlPercent,
        status:      finalStatus,
        exitReason,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[ayn-close-trade] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
