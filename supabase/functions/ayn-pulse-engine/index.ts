import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name',
};

// Top 15 Systemically Important Countries (S.I.C.)
const SIC_REGIONS = [
  { id: 'USA', name: 'United States', keywords: 'US economy market news' },
  { id: 'CHN', name: 'China', keywords: 'China economy market news' },
  { id: 'EU', name: 'European Union', keywords: 'Eurozone economy ECB news' },
  { id: 'GBR', name: 'United Kingdom', keywords: 'UK economy BOE news' },
  { id: 'SAU', name: 'Saudi Arabia', keywords: 'Saudi Arabia economy business news' },
  { id: 'ARE', name: 'UAE', keywords: 'UAE Dubai economy business news' },
  { id: 'JPN', name: 'Japan', keywords: 'Japan economy BOJ news' },
  { id: 'IND', name: 'India', keywords: 'India economy market news' },
  { id: 'BRA', name: 'Brazil', keywords: 'Brazil economy market news' },
  { id: 'RUS', name: 'Russia', keywords: 'Russia economy geopolitics news' },
  { id: 'IRQ', name: 'Middle East Conflict', keywords: 'Middle East conflict geopolitics news Israel Gaza Iran' },
  { id: 'KOR', name: 'South Korea', keywords: 'South Korea economy tech news' },
  { id: 'ZAF', name: 'South Africa', keywords: 'South Africa economy  news' },
  { id: 'CAN', name: 'Canada', keywords: 'Canada economy market news' },
  { id: 'AUS', name: 'Australia', keywords: 'Australia economy market news' }
];

// ─── FRED API (Macro) ────────────────────────────────────────────────────────
async function fetchFREDData(apiKey: string): Promise<Record<string, unknown>> {
  const series = [
    { id: 'FEDFUNDS', label: 'fed_funds_rate', name: 'Fed Funds Rate' },
    { id: 'CPIAUCSL', label: 'inflation_cpi', name: 'CPI Inflation' },
    { id: 'M2SL', label: 'm2_money_supply', name: 'M2 Money Supply' },
    { id: 'UNRATE', label: 'unemployment_rate', name: 'Unemployment Rate' },
    { id: 'DGS10', label: 'treasury_10yr', name: '10-Year Treasury Yield' },
    { id: 'DGS2', label: 'treasury_2yr', name: '2-Year Treasury Yield' },
  ];

  const results: Record<string, unknown> = {};

  await Promise.all(series.map(async (s) => {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=${apiKey}&limit=2&sort_order=desc&file_type=json`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const observations = data.observations || [];
      if (observations.length > 0) {
        const latest = observations[0];
        const previous = observations[1];
        const value = parseFloat(latest.value);
        const prevValue = previous ? parseFloat(previous.value) : null;
        const change = prevValue ? value - prevValue : null;
        results[s.label] = {
          name: s.name,
          value,
          change,
          date: latest.date,
          trend: change && Math.abs(change) > 0.01 ? (change > 0 ? 'rising' : 'falling') : 'stable'
        };
      }
    } catch (err) {
      console.error(`[FRED] Error fetching ${s.id}:`, err);
    }
  }));

  const t10 = results.treasury_10yr as any;
  const t2 = results.treasury_2yr as any;
  if (t10?.value && t2?.value) {
    const spread = t10.value - t2.value;
    results.yield_curve = {
      spread: spread.toFixed(2),
      inverted: spread < 0,
      signal: spread < 0 ? 'INVERTED' : spread < 0.5 ? 'FLAT' : 'NORMAL'
    };
  }
  return results;
}

// ─── ALPHA VANTAGE (Stocks & Gold) ──────────────────────────────────────────
async function fetchAlphaVantageData(apiKey: string): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  try {
    const url = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${apiKey}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      results.top_gainers = (data.top_gainers || []).slice(0, 3);
      results.top_losers = (data.top_losers || []).slice(0, 3);
      results.most_active = (data.most_actively_traded || []).slice(0, 3);
    }
    
    // Gold Price (Safe Haven Proxy)
    const goldUrl = `https://www.alphavantage.co/query?function=COMMODITY&symbol=GOLD&interval=monthly&apikey=${apiKey}`;
    const goldRes = await fetch(goldUrl);
    if (goldRes.ok) {
      const goldData = await goldRes.json();
      const goldObs = goldData.data || [];
      if (goldObs.length >= 2) {
        const latest = parseFloat(goldObs[0].value);
        const prev = parseFloat(goldObs[1].value);
        const change = ((latest - prev) / prev * 100).toFixed(2);
        results.gold = {
          price: latest,
          monthly_change_pct: change,
          signal: parseFloat(change) > 2 ? 'RISING - risk-off' : parseFloat(change) < -2 ? 'FALLING - risk-on' : 'STABLE'
        };
      }
    }
  } catch (err) {
    console.error('[AlphaVantage] Error:', err);
  }
  return results;
}

// ─── PIONEX (Crypto) ─────────────────────────────────────────────────────────
async function fetchPionexData(apiKey: string, apiSecret: string): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  try {
    const enc = new TextEncoder();
    const ts = Date.now().toString();
    const qs = `timestamp=${ts}`;
    const message = `GET/api/v1/market/tickers?${qs}`;
    const key = await crypto.subtle.importKey('raw', enc.encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    const signature = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

    const res = await fetch(`https://api.pionex.com/api/v1/market/tickers?${qs}`, {
      headers: { 'PIONEX-KEY': apiKey, 'PIONEX-SIGNATURE': signature }
    });
    if (!res.ok) return results;
    const data = await res.json();
    const tickers = data?.data?.tickers || [];

    const targets = ['BTC_USDT', 'ETH_USDT', 'SOL_USDT'];
    const prices: Record<string, unknown> = {};
    let totalVolume = 0; let btcVolume = 0;

    for (const t of tickers) {
      if (targets.includes(t.symbol)) {
        const price = parseFloat(t.close || t.last || '0');
        const open = parseFloat(t.open || '0');
        prices[t.symbol.replace('_USDT', '')] = {
          price,
          change_24h_pct: open > 0 ? ((price - open) / open * 100).toFixed(2) : '0',
          volume: t.amount
        };
        if (t.symbol === 'BTC_USDT') btcVolume = parseFloat(t.amount || '0');
      }
      totalVolume += parseFloat(t.amount || '0');
    }
    
    results.crypto_prices = prices;
    if (totalVolume > 0) {
      const dom = (btcVolume / totalVolume * 100);
      results.btc_dominance_proxy = dom.toFixed(1);
      results.crypto_signal = dom > 50 ? 'BTC dominance HIGH (Risk-off)' : 'BTC dominance LOW (Risk-on)';
    }
  } catch (err) {
    console.error('[Pionex] Error:', err);
  }
  return results;
}

// ─── MISC INDICATORS ─────────────────────────────────────────────────────────
async function fetchFearGreed(): Promise<Record<string, unknown>> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    if (!res.ok) return {};
    const current = (await res.json()).data?.[0];
    if (!current) return {};
    return {
      value: parseInt(current.value),
      classification: current.value_classification,
    };
  } catch { return {}; }
}

async function fetchPolymarket(): Promise<Record<string, unknown>> {
  try {
    const res = await fetch('https://gamma-api.polymarket.com/markets?limit=10&active=true&closed=false');
    if (!res.ok) return {};
    const relevantKeywords = ['recession', 'fed', 'rate', 'inflation', 'gdp', 'bitcoin', 'crypto', 'election', 'war', 'oil'];
    const markets = await res.json();
    const relevant = (Array.isArray(markets) ? markets : markets.markets || [])
      .filter((m: any) => relevantKeywords.some(kw => (m.question || m.title || '').toLowerCase().includes(kw)))
      .slice(0, 5)
      .map((m: any) => ({
        question: m.question || m.title,
        yes_probability: m.outcomePrices ? parseFloat(m.outcomePrices[0]) * 100 : null
      }));
    return { prediction_markets: relevant };
  } catch { return {}; }
}

// ─── BRAVE SEARCH (Real-time News for S.I.C.) ────────────────────────────────
async function fetchSystemicNews(braveApiKey: string): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  
  // We fetch news sequentially with a tiny delay to respect Brave rate limits
  for (const region of SIC_REGIONS) {
    try {
      const url = `https://api.search.brave.com/res/v1/news/search?q=${encodeURIComponent(region.keywords)}&count=3&freshness=pd`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json', 'X-Subscription-Token': braveApiKey } });
      if (res.ok) {
        const data = await res.json();
        results[region.id] = {
          name: region.name,
          news: (data.results || []).map((r: any) => ({
            title: r.title,
            description: r.description,
            url: r.url
          }))
        };
      }
    } catch (e) {
      console.error(`[Brave] Failed to fetch news for ${region.id}`);
    }
    // Rate limit buffer
    await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

// ─── AYN LLM PREDICTIONS & SYNTHESIS ─────────────────────────────────────────
async function generateAYNSynthesis(
  openRouterKey: string, 
  modelId: string, 
  rawIntel: { macro: any; crypto: any; news: any; fg: any }
): Promise<{ sic_synthesis: any; predictions: any }> {
  
  // Compress news strings for context limit saving
  const compressedNews = Object.entries(rawIntel.news).map(([id, data]: [string, any]) => {
    const headlines = data.news.map((n:any) => n.title).join(' | ');
    return `[${id}] ${headlines}`;
  }).join('\n');

  const systemPrompt = `You are AYN, the supreme global intelligence engine. 
You are synthesizing the latest live global data to provide a mission-control dashboard payload.
Be absolutely ruthless, objective, and precise. Tone: highly professional intelligence briefing.

Input Data:
Macro: ${JSON.stringify(rawIntel.macro)}
Crypto/FearGreed: ${JSON.stringify(rawIntel.crypto)} / ${JSON.stringify(rawIntel.fg)}
Global Headlines (Last 24h):
${compressedNews}

OUTPUT STRICTLY AS VALID JSON matching exactly this schema:
{
  "ayn_predictions": {
    "1W": "Specifically what you expect to happen in global markets/geopolitics next week (max 2 sentences).",
    "1M": "Specifically what you expect to happen next month.",
    "1Y": "Specifically what you expect in the next 12 months."
  },
  "sic_synthesis": {
    "USA": { "economic_posture": "Short summary", "trajectory": "Short summary" },
    "CHN": { "economic_posture": "Short summary", "trajectory": "Short summary" },
    // do this for all 15 countries provided in the headlines block
  }
}`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://aynn.io'
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'system', content: systemPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2
      })
    });

    if (!response.ok) throw new Error(`OpenRouter error ${response.status}`);
    const data = await response.json();
    const content = data.choices[0].message.content;
    const parsed = JSON.parse(content);
    
    // Merge the AI synthesis with the raw news
    const sicMerged: any = {};
    for (const region of SIC_REGIONS) {
      sicMerged[region.id] = {
        name: region.name,
        news: rawIntel.news[region.id]?.news || [],
        economic_posture: parsed.sic_synthesis?.[region.id]?.economic_posture || "Insufficient data",
        trajectory: parsed.sic_synthesis?.[region.id]?.trajectory || "Insufficient data",
      };
    }

    return { 
      sic_synthesis: sicMerged,
      predictions: parsed.ayn_predictions || { "1W": "N/A", "1M": "N/A", "1Y": "N/A" }
    };
  } catch (err) {
    console.error('[OpenRouter] LLM synthesis failed:', err);
    return { sic_synthesis: rawIntel.news, predictions: {} };
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ─── GET: Return the latest snapshot (Bypasses RLS for anon frontend users) ───
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('ayn_market_snapshot')
        .select('*')
        .eq('singleton_key', 1)
        .maybeSingle();
        
      if (error) throw error;
      
      return new Response(JSON.stringify(data || {}), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ─── POST: Execute the 4-hour sweep and AI synthesis ───

    const FRED_API_KEY = Deno.env.get('FRED_API_KEY');
    const ALPHA_VANTAGE_API_KEY = Deno.env.get('ALPHA_VANTAGE_API_KEY');
    const PIONEX_API_KEY = Deno.env.get('PIONEX_API_KEY');
    const PIONEX_API_SECRET = Deno.env.get('PIONEX_API_SECRET');
    const BRAVE_API_KEY = Deno.env.get('BRAVE_API_KEY');
    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
    
    // Use the cheapest/fastest smart model available in OpenRouter to stay within edge limits
    const LLM_MODEL = 'openai/gpt-4o-mini'; 

    console.log('[ayn-pulse-engine] Starting global S.I.C. data fetch...');
    const startTime = Date.now();

    // 1. Fetch RAW Data
    const [fred, alpha, pionex, fearGreed, polymarket, news] = await Promise.allSettled([
      FRED_API_KEY ? fetchFREDData(FRED_API_KEY) : Promise.resolve({}),
      ALPHA_VANTAGE_API_KEY ? fetchAlphaVantageData(ALPHA_VANTAGE_API_KEY) : Promise.resolve({}),
      PIONEX_API_KEY && PIONEX_API_SECRET ? fetchPionexData(PIONEX_API_KEY, PIONEX_API_SECRET) : Promise.resolve({}),
      fetchFearGreed(),
      fetchPolymarket(),
      BRAVE_API_KEY ? fetchSystemicNews(BRAVE_API_KEY) : Promise.resolve({})
    ]);

    const getData = (res: PromiseSettledResult<any>) => res.status === 'fulfilled' ? res.value : {};
    
    const rawDataMap = {
      macro: getData(fred),
      stocks: getData(alpha),
      crypto: getData(pionex),
      sentiment: getData(fearGreed),
      predictions: getData(polymarket),
      news: getData(news)
    };

    let aynSynthesis = { sic_synthesis: rawDataMap.news, predictions: {} };
    
    // 2. Pass RAW Data through LLM
    if (OPENROUTER_API_KEY && Object.keys(rawDataMap.news).length > 0) {
      console.log('[ayn-pulse-engine] Running LLM synthesis...');
      aynSynthesis = await generateAYNSynthesis(OPENROUTER_API_KEY, LLM_MODEL, {
        macro: rawDataMap.macro,
        crypto: rawDataMap.crypto,
        news: rawDataMap.news,
        fg: rawDataMap.sentiment
      });
    }

    const snapshot = {
      fetched_at: new Date().toISOString(),
      macro: rawDataMap.macro,
      markets: {
        stocks: rawDataMap.stocks,
        crypto: rawDataMap.crypto,
        sentiment: rawDataMap.sentiment
      },
      prediction_markets: rawDataMap.predictions,
      sic_intel: aynSynthesis.sic_synthesis, // Deep per-country info
      ayn_predictions: aynSynthesis.predictions // 1W, 1M, 1Y
    };

    const duration = Date.now() - startTime;
    console.log(`[ayn-pulse-engine] Complete in ${duration}ms. Updating DB.`);

    // 3. Upsert
    const { error } = await supabase
      .from('ayn_market_snapshot')
      .upsert({
        singleton_key: 1,
        snapshot,
        fetched_at: new Date().toISOString(),
        sources_used: ['FRED', 'AlphaVantage', 'Pionex', 'BraveNews', 'OpenRouter'],
        fetch_errors: []
      }, { onConflict: 'singleton_key' });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, duration_ms: duration }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[ayn-pulse-engine] Fatal error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
