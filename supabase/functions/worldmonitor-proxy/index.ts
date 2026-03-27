import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// WorldMonitor's public API base — no auth required for public endpoints
const WM_BASE = 'https://worldmonitor.app/api';

// API key for advanced endpoints (aviation, satellite)
const WM_API_KEY = Deno.env.get('WORLDMONITOR_API_KEY') ?? '';

// Cache TTL: 10 minutes in ms
const CACHE_TTL_MS = 10 * 60 * 1000;

// Domain → endpoint mapping
const DOMAIN_ENDPOINTS: Record<string, string> = {
  conflict:       '/conflict/v1',
  military:       '/military/v1',
  maritime:       '/maritime/v1',
  sanctions:      '/sanctions/v1',
  cyber:          '/cyber/v1',
  seismology:     '/seismology/v1',
  wildfire:       '/wildfire/v1',
  infrastructure: '/infrastructure/v1',
  forecast:       '/forecast/v1',
  intelligence:   '/intelligence/v1',
  trade:          '/trade/v1',
  news:           '/news/v1',
  market:         '/market/v1',
  aviation:       '/aviation/v1',    // advanced — needs API key
  satellite:      '/satellite/v1',   // advanced — needs API key
};

// Domains that need the API key header
const ADVANCED_DOMAINS = new Set(['aviation', 'satellite']);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT — authenticated users only
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(req.url);
    const domain = url.searchParams.get('domain') ?? '';
    const entity = url.searchParams.get('entity') ?? '';  // for sanctions search

    if (!domain || !DOMAIN_ENDPOINTS[domain]) {
      return new Response(JSON.stringify({ error: `Unknown domain: ${domain}`, valid: Object.keys(DOMAIN_ENDPOINTS) }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check cache first
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const cacheKey = entity ? `${domain}:${entity}` : domain;
    const { data: cached } = await supabase
      .from('ayn_worldmonitor_cache')
      .select('response, fetched_at')
      .eq('domain', cacheKey)
      .maybeSingle();

    if (cached?.fetched_at) {
      const age = Date.now() - new Date(cached.fetched_at).getTime();
      if (age < CACHE_TTL_MS && cached.response) {
        console.log(`[worldmonitor-proxy] Cache HIT for ${cacheKey}, age ${Math.round(age/1000)}s`);
        return new Response(JSON.stringify({ ...cached.response, _cached: true, _age_s: Math.round(age/1000) }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Fetch from WorldMonitor
    const endpoint = DOMAIN_ENDPOINTS[domain];
    const wmUrl = entity
      ? `${WM_BASE}${endpoint}?entity=${encodeURIComponent(entity)}`
      : `${WM_BASE}${endpoint}`;

    const fetchHeaders: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'AYN-Intelligence/1.0',
    };

    // Add API key for advanced domains
    if (ADVANCED_DOMAINS.has(domain) && WM_API_KEY) {
      fetchHeaders['X-API-Key'] = WM_API_KEY;
    }

    console.log(`[worldmonitor-proxy] Fetching ${wmUrl}`);

    const wmRes = await fetch(wmUrl, { headers: fetchHeaders, signal: AbortSignal.timeout(12000) });

    let responseData: any;

    if (!wmRes.ok) {
      // For advanced domains without a key, return a graceful degraded response
      if (ADVANCED_DOMAINS.has(domain) && !WM_API_KEY) {
        responseData = {
          status: 'api_key_required',
          domain,
          message: `${domain} data requires a WorldMonitor API key. Set WORLDMONITOR_API_KEY in Supabase secrets.`,
          items: [],
          _live: false,
        };
      } else {
        // Try to return partial data or error
        responseData = {
          status: 'upstream_error',
          http_status: wmRes.status,
          domain,
          items: [],
          _live: false,
        };
      }
    } else {
      const text = await wmRes.text();
      try {
        responseData = JSON.parse(text);
      } catch {
        // WorldMonitor may return newline-delimited JSON or plain text
        responseData = { raw: text.substring(0, 2000), items: [], domain };
      }
      responseData._live = true;
      responseData._fetched_at = new Date().toISOString();
    }

    // Update cache
    await supabase.from('ayn_worldmonitor_cache').upsert({
      domain: cacheKey,
      response: responseData,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'domain' });

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[worldmonitor-proxy] Error:', err);
    return new Response(JSON.stringify({ error: String(err), items: [] }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
