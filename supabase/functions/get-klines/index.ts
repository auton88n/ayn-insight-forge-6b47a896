import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';

// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

// Interval mapping: frontend short-hand → Pionex API format
const INTERVAL_MAP: Record<string, string> = {
  '1m': '1M',
  '5m': '5M',
  '15m': '15M',
  '1h': '60M',
};

// Correct Pionex HMAC signing per API docs:
// 1. Sort query params by ASCII key order
// 2. Build PATH_URL = path?sorted_params
// 3. Sign METHOD + PATH_URL (e.g. "GET/api/v1/market/klines?interval=60M&...")
async function signPionexRequest(
  method: string,
  path: string,
  params: Record<string, string>,
  secret: string
): Promise<{ signature: string; queryString: string }> {
  const sortedKeys = Object.keys(params).sort();
  const queryString = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
  const message = `${method}${path}?${queryString}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const signature = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return { signature, queryString };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, interval = '1m', limit = 100 } = await req.json();

    if (!symbol) {
      return new Response(JSON.stringify({ error: 'symbol is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('PIONEX_API_KEY');
    const apiSecret = Deno.env.get('PIONEX_API_SECRET');

    if (!apiKey || !apiSecret) {
      return new Response(JSON.stringify({ error: 'Pionex API credentials not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pionexInterval = INTERVAL_MAP[interval] ?? '1MIN';
    const timestamp = Date.now().toString();

    const { signature, queryString } = await signPionexRequest('GET', '/api/v1/market/klines', {
      symbol,
      interval: pionexInterval,
      limit: String(limit),
      timestamp,
    }, apiSecret);

    const res = await fetch(`https://api.pionex.com/api/v1/market/klines?${queryString}`, {
      headers: {
        'PIONEX-KEY': apiKey,
        'PIONEX-SIGNATURE': signature,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[get-klines] Pionex API error:', errText);
      return new Response(JSON.stringify({ error: `Pionex API error: ${res.status}`, detail: errText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();

    interface PionexKline {
      time: number;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }

    const rawKlines: PionexKline[] = data?.data?.klines ?? [];

    // Log last candle time to verify data is current (not stale/delayed)
    if (rawKlines.length > 0) {
      const sorted = [...rawKlines].sort((a, b) => a.time - b.time);
      const lastCandle = sorted[sorted.length - 1];
      const nowMs = Date.now();
      const ageMs = nowMs - lastCandle.time;
      console.log(
        `[get-klines] Last candle time: ${lastCandle.time} ms (${new Date(lastCandle.time).toISOString()}), server now: ${nowMs} ms, age: ${(ageMs / 1000).toFixed(0)}s`
      );
    }

    // Map Pionex kline objects to { time (seconds), open, high, low, close }
    const klines = rawKlines
      .map((k) => ({
        time: Math.floor(k.time / 1000),
        open: parseFloat(k.open),
        high: parseFloat(k.high),
        low: parseFloat(k.low),
        close: parseFloat(k.close),
      }))
      .sort((a, b) => a.time - b.time);

    return new Response(JSON.stringify({ klines }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[get-klines] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
