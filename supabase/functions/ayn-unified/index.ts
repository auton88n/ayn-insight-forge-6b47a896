import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { detectResponseEmotion, detectUserEmotion, detectLanguage } from "./emotionDetector.ts";
import { detectIntent } from "./intentDetector.ts";
import { buildSystemPrompt } from "./systemPrompts.ts";
import { sanitizeUserPrompt, detectInjectionAttempt, INJECTION_GUARD } from "../_shared/sanitizePrompt.ts";
import { activateMaintenanceMode } from "../_shared/maintenanceGuard.ts";
import { analyzeKlines, calculateEnhancedScore, fetchKlines } from "./marketScanner.ts";

// ── Extracted modules ───────────────────────────────────────
import { corsHeaders as getCorsHeadersFn, handleCors } from "../_shared/cors.ts";
import { callWithFallback, needsDeepReasoning, FALLBACK_CHAINS } from "./llmGateway.ts";
import { generateImage, uploadImageIfDataUrl } from "./imageHandler.ts";
import { extractAndSaveMemories, stripMemoryTags } from "./memoryHandler.ts";
import { performWebSearch, scrapeAndInjectUrl } from "./searchHandler.ts";
import {
  getMarketSnapshot, getUserContext, getMarketPrices,
  getCountryIntelligence, detectCountries, needsMarketData,
  checkUserLimit, checkAndSendCreditWarning, buildIntelligenceContext,
} from "./contextBuilder.ts";

// Wrapper to maintain existing getCorsHeaders(req) signature
function getCorsHeaders(req: Request) {
  return getCorsHeadersFn(req);
}

// Credit costs (premium features)
const DOCUMENT_CREDIT_COST = {
  pdf: 30,
  excel: 25
};


// FALLBACK_CHAINS and needsDeepReasoning imported from ./llmGateway.ts

async function getTradeFlows(supabase: ReturnType<typeof createClient>, countryCodes: string[]): Promise<Record<string, unknown>[]> {
  if (countryCodes.length === 0) return [];
  try {
    const { data } = await supabase
      .from('ayn_trade_flows')
      .select('country_code, country_name, top_exports, top_imports, trade_balance, opportunities, dependencies, intelligence_brief')
      .in('country_code', countryCodes);
    return data || [];
  } catch { return []; }
}


export const AYN_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_market_prices",
      description: "Gets the latest live prices for commodities, crypto, and currencies.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_business_news",
      description: "Gets the latest top business and market news headlines.",
      parameters: { 
        type: "object", 
        properties: { country_codes: { type: "array", items: { type: "string" }, description: "e.g. ['US', 'SA']" } }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_geopolitical_risks",
      description: "Retrieves active conflicts, trade tensions, and sanctions globally.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the live internet for ANY information you don't have — recent events, company details, people, regulations, technologies, market data. ALWAYS search when you're not 100% certain of current facts. The user expects up-to-date insight.",
      parameters: { 
        type: "object", 
        properties: { query: { type: "string" } },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_sector_intelligence",
      description: "Gets specific intelligence reports for various sectors: startups, jobs, supply_chain, real_estate, consumer, health, tech, energy, gov_policy, education. Use this when analyzing industry trends.",
      parameters: { 
        type: "object", 
        properties: { sector: { type: "string", enum: ["startups", "jobs", "supply_chain", "real_estate", "consumer", "health", "tech", "energy", "gov_policy", "education"] } },
        required: ["sector"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_country_profile",
      description: "Gets deep intelligence on a specific country: economy, hot sectors, government reforms, regional dynamics. Use when the user asks about doing business or investing in a specific country.",
      parameters: {
        type: "object",
        properties: { country_codes: { type: "array", items: { type: "string" }, description: "e.g. ['SA', 'US', 'AE']" } },
        required: ["country_codes"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_trade_flows",
      description: "Gets data on imports, exports, and trade dependencies for specific countries.",
      parameters: {
        type: "object",
        properties: { country_codes: { type: "array", items: { type: "string" }, description: "e.g. ['CN', 'SA']" } },
        required: ["country_codes"]
      }
    }
  },
  // ─── WorldMonitor Live Intelligence Tools ───────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_live_conflict_data",
      description: "Gets LIVE real-time conflict zone data from WorldMonitor: active war zones, escalation signals, ceasefire status, casualty estimates, territorial changes. Use when the user asks about wars, conflicts, military operations, or geopolitical flashpoints.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_military_signals",
      description: "Gets live military deployment data: troop movements, naval vessel positions, military exercises, airspace violations, defense spending alerts. Use for questions about military power, army movements, or defense situations.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_maritime_intelligence",
      description: "Gets live maritime and shipping intelligence: AIS ship tracking, chokepoint status (Hormuz, Suez, Malacca, Bab-el-Mandeb), port disruptions, Houthi attack alerts, piracy incidents. ALWAYS call this for shipping, supply chain, or maritime questions.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_sanctions_data",
      description: "Searches live OFAC, EU, and UN sanctions lists. Can check if a specific entity, company, or individual is sanctioned. Use for compliance questions or when analyzing sanctioned countries/entities.",
      parameters: {
        type: "object",
        properties: { entity: { type: "string", description: "Entity name or country to search (optional)" } }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_cyber_threats",
      description: "Gets live cyberattack intelligence: active APT groups, ransomware campaigns, infrastructure attacks, DDoS incidents, nation-state cyber operations. Use for cybersecurity or digital warfare questions.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_natural_disasters",
      description: "Gets live natural disaster data: earthquakes (5.0+), tsunamis, active wildfires, volcanic eruptions, severe weather events. Use for disaster, climate, or humanitarian crisis questions.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_infrastructure_status",
      description: "Gets live global infrastructure status: power grid outages, undersea cable cuts, data center incidents, critical infrastructure disruptions. Use for energy security or infrastructure vulnerability questions.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_global_forecast",
      description: "Gets AI-powered geopolitical forecasts: probability-weighted predictions for conflict escalation, regime changes, election outcomes, economic crises. Similar to Polymarket but for geopolitical events.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_aviation_intelligence",
      description: "Gets live aviation intelligence: airspace closures, NOTAM alerts, military aviation incidents, commercial flight disruptions, drone activity reports. Use for air travel safety or airspace questions.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_satellite_imagery",
      description: "Gets satellite-derived intelligence: troop buildup detection, facility construction, environmental changes, ship/vehicle movement patterns detected from satellite imagery analysis.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  }
];

// ─── WorldMonitor live data fetcher ────────────────────────────────────────
async function worldMonitorFetch(domain: string, entity?: string): Promise<any> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const params = new URLSearchParams({ domain });
    if (entity) params.set('entity', entity);
    const res = await fetch(
      `${supabaseUrl}/functions/v1/worldmonitor-proxy?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok) return { status: 'WorldMonitor proxy error', http: res.status };
    return await res.json();
  } catch (err) {
    console.error(`[ayn-unified] worldMonitorFetch(${domain}) error:`, err);
    return { status: 'WorldMonitor data temporarily unavailable', domain };
  }
}

export async function executeTool(toolCall: any, supabase: any): Promise<any> {
  const name = toolCall?.function?.name;
  let args: any = {};
  if (toolCall?.function?.arguments) {
    try { args = JSON.parse(toolCall.function.arguments); } catch { /* ignore */ }
  }
  
  try {
    if (name === 'get_market_prices') {
      const { data } = await supabase.from('ayn_market_prices').select('*').eq('singleton_key', 1).maybeSingle();
      return data || { status: 'No data available' };
    }
    if (name === 'get_business_news') {
      const codes = args.country_codes || ['US', 'SA', 'GB'];
      const { data } = await supabase.from('ayn_business_news').select('*').in('country_code', codes).limit(5);
      return data || { status: 'No news found' };
    }
    if (name === 'get_geopolitical_risks') {
      const { data } = await supabase.from('ayn_geopolitical').select('*').eq('singleton_key', 1).maybeSingle();
      return data || { status: 'No data' };
    }
    if (name === 'search_web' && args.query) {
      // Note: relying on performWebSearch from earlier in file
      const res = await performWebSearch(args.query);
      return { search_results: res };
    }
    if (name === 'get_sector_intelligence') {
      const sec = args.sector;
      if (sec === 'startups') return (await supabase.from('ayn_startup_intel').select('*').eq('singleton_key', 1).maybeSingle()).data;
      if (sec === 'supply_chain') return (await supabase.from('ayn_supply_chain').select('*').eq('singleton_key', 1).maybeSingle()).data;
      if (sec === 'tech') return (await supabase.from('ayn_tech_disruption').select('*').eq('singleton_key', 1).maybeSingle()).data;
      if (sec === 'jobs') return (await supabase.from('ayn_job_market').select('*').in('country_code', ['SA', 'US']).limit(2)).data;
      if (sec === 'real_estate') return (await supabase.from('ayn_real_estate').select('*').in('country_code', ['SA', 'US']).limit(2)).data;
      if (sec === 'consumer') return (await supabase.from('ayn_consumer_sentiment').select('*').in('country_code', ['SA', 'US']).limit(2)).data;
      if (sec === 'health') return (await supabase.from('ayn_health_intel').select('*').in('country_code', ['SA', 'US']).limit(2)).data;
      // Map new sectors to generic news/intel if specific prep-table doesn't exist yet, or to existing tables if they do
      if (sec === 'energy') return (await supabase.from('ayn_business_news').select('*').ilike('category', '%energy%').limit(2)).data || { status: 'No specific energy intel found' };
      if (sec === 'gov_policy') return (await supabase.from('ayn_geopolitical').select('*').eq('singleton_key', 1).maybeSingle()).data;
      if (sec === 'education') return { status: 'Education sector focus is emerging, check cross-sector tech/startup data.' };
      return { status: 'Sector not found' };
    }
    if (name === 'get_country_profile') {
      const codes = args.country_codes || [];
      if (codes.length === 0) return { status: 'No country codes provided' };
      const { data } = await supabase.from('ayn_country_intelligence').select('country_code, country_name, region, economy, government, hot_sectors, opportunities, intelligence_brief').in('country_code', codes);
      return data || { status: 'No profiles found' };
    }
    if (name === 'get_trade_flows') {
      const codes = args.country_codes || [];
      if (codes.length === 0) return { status: 'No country codes provided' };
      const { data } = await supabase.from('ayn_trade_flows').select('country_code, country_name, top_exports, top_imports, opportunities, dependencies, intelligence_brief').in('country_code', codes);
      return data || { status: 'No trade data found' };
    }
    // ─── WorldMonitor Live Tools ─────────────────────────────────────────────
    if (name === 'get_live_conflict_data') {
      return await worldMonitorFetch('conflict');
    }
    if (name === 'get_military_signals') {
      return await worldMonitorFetch('military');
    }
    if (name === 'get_maritime_intelligence') {
      return await worldMonitorFetch('maritime');
    }
    if (name === 'get_sanctions_data') {
      return await worldMonitorFetch('sanctions', args.entity);
    }
    if (name === 'get_cyber_threats') {
      return await worldMonitorFetch('cyber');
    }
    if (name === 'get_natural_disasters') {
      // Fetch both seismology and wildfire in parallel
      const [seismo, wildfire] = await Promise.all([
        worldMonitorFetch('seismology'),
        worldMonitorFetch('wildfire'),
      ]);
      return { earthquakes: seismo, wildfires: wildfire };
    }
    if (name === 'get_infrastructure_status') {
      return await worldMonitorFetch('infrastructure');
    }
    if (name === 'get_global_forecast') {
      return await worldMonitorFetch('forecast');
    }
    if (name === 'get_aviation_intelligence') {
      return await worldMonitorFetch('aviation');
    }
    if (name === 'get_satellite_imagery') {
      return await worldMonitorFetch('satellite');
    }
  } catch (err) {
    return { error: String(err) };
  }
  return { status: 'Tool not recognized or arguments missing.' };
}


// Detect if message is asking about prices/markets/trade
async function scanMarketOpportunities(): Promise<{ opportunities: any[]; scannedPairs: number } | null> {
  console.log('[SCANNER] scanMarketOpportunities started');
  const apiKey = Deno.env.get('PIONEX_API_KEY');
  const apiSecret = Deno.env.get('PIONEX_API_SECRET');
  if (!apiKey || !apiSecret) {
    console.warn('[SCAN] Pionex credentials not configured');
    return null;
  }

  try {
    const enc = new TextEncoder();
    async function signReq(method: string, path: string, params: Record<string, string>): Promise<{ signature: string; queryString: string }> {
      const sortedKeys = Object.keys(params).sort();
      const queryString = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
      const message = `${method}${path}?${queryString}`;
      const key = await crypto.subtle.importKey('raw', enc.encode(apiSecret!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
      const signature = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
      return { signature, queryString };
    }

    const ts = Date.now().toString();
    const { signature: tickerSig, queryString: tickerQs } = await signReq('GET', '/api/v1/market/tickers', { timestamp: ts });

    const res = await fetch(`https://api.pionex.com/api/v1/market/tickers?${tickerQs}`, {
      headers: { 'PIONEX-KEY': apiKey, 'PIONEX-SIGNATURE': tickerSig },
    });

    if (!res.ok) {
      console.error('[SCAN] Pionex tickers fetch failed:', res.status);
      return null;
    }

    const data = await res.json();
    const tickers = data?.data?.tickers || [];
    console.log(`[SCAN] Fetched ${tickers.length} tickers from Pionex`);

    // ── Phase 1: basic momentum filter (narrows to ~30–50 candidates) ─────────
    const phase1Candidates: any[] = [];

    for (const t of tickers) {
      const symbol = t.symbol || '';
      if (!symbol.endsWith('_USDT')) continue;
      if (symbol.startsWith('USDC_') || symbol.startsWith('USDT_') || symbol.startsWith('DAI_') || symbol.startsWith('TUSD_')) continue;

      const volume = parseFloat(t.amount || '0');
      if (volume < 100000) continue;

      const open = parseFloat(t.open || '0');
      const price = parseFloat(t.close || t.last || '0');
      const priceChange = open > 0 ? ((price - open) / open) * 100 : 0;

      // Quick basic score — keep anything ≥ 55 for phase 2
      let basicScore = 50;
      if (priceChange > 0 && priceChange <= 5) basicScore += 10;
      else if (priceChange > 5 && priceChange <= 15) basicScore += 15;
      if (volume > 1000000) basicScore += 8;
      if (Math.abs(priceChange) < 2) basicScore += 5;
      if (priceChange < -15) basicScore += 10;
      if (priceChange > 20) basicScore -= 15;

      if (basicScore >= 55) {
        phase1Candidates.push({ symbol, price, volume, priceChange, t });
      }
    }

    const tickerList = phase1Candidates.map((c: { symbol: string }) => c.symbol);
    console.log(`[SCANNER] Scanning ${phase1Candidates.length} tickers:`, tickerList.join(', '));

    // ── Phase 2: fetch klines and score with technical indicators ─────────────
    const opportunities: any[] = [];

    const getKlineTime = (k: any) => (k && typeof k === 'object' && 'time' in k ? k.time : k?.[0]);

    for (const candidate of phase1Candidates) {
      // Use 15M (not 60M) so last candle is at most ~15 min old; 60M = up to 1h stale
      const klines = await fetchKlines(candidate.symbol, '15M', 100, apiKey, apiSecret);

      let score: number;
      let signals: string[];
      let lastCandleTimeMs: number | null = null;

      if (!klines || klines.length < 20) {
        // Fallback: use basic score if klines unavailable
        score = 50 + (candidate.priceChange > 0 && candidate.priceChange <= 15 ? 15 : 0)
               + (candidate.volume > 1000000 ? 8 : 0);
        signals = [`Momentum ${candidate.priceChange.toFixed(1)}%`, candidate.volume > 1000000 ? 'High liquidity' : ''];
        if (klines?.length) {
          const sorted = [...klines].sort((a, b) => getKlineTime(a) - getKlineTime(b));
          const t = getKlineTime(sorted[sorted.length - 1]);
          if (typeof t === 'number') lastCandleTimeMs = t;
        }
      } else {
        const technicals = analyzeKlines(klines, candidate.price, []);
        score = calculateEnhancedScore(candidate.priceChange, candidate.volume, technicals);
        signals = technicals.summary;
        const sorted = [...klines].sort((a, b) => getKlineTime(a) - getKlineTime(b));
        const t = getKlineTime(sorted[sorted.length - 1]);
        if (typeof t === 'number') lastCandleTimeMs = t;
      }

      if (score >= 70) {
        opportunities.push({
          ticker: candidate.symbol,
          score,
          price: candidate.price,
          volume24h: candidate.volume,
          priceChange24h: candidate.priceChange,
          signals,
          lastCandleTimeMs,
        });
      }
    }

    opportunities.sort((a, b) => b.score - a.score);

    // Funding rates: Pionex REST does not expose a public funding-rate endpoint (404), so skipped.

    const top = opportunities.slice(0, 3);
    if (top.length > 0) {
      const lastMs = top[0].lastCandleTimeMs;
      if (typeof lastMs === 'number') {
        const ageSec = (Date.now() - lastMs) / 1000;
        console.log(`[SCANNER] Top ticker last candle age: ${ageSec.toFixed(0)}s`);
      } else {
        console.log('[SCANNER] Top ticker last candle age: unknown (no kline time)');
      }
    }
    console.log(`[SCAN] Phase 2: ${opportunities.length} qualified opportunities (score≥70), returning top ${top.length}`);
    return { opportunities: top, scannedPairs: tickers.length };
  } catch (err) {
    console.error('[SCAN] Market scan error:', err);
    return null;
  }
}


serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Service client for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from token
    const token = authHeader.replace('Bearer ', '');
    
    // Check if this is an internal service call (using service role key)
    let userId: string;
    let isInternalCall = false;

    console.log('[ayn-unified] Request received, checking auth...');

    if (token === supabaseServiceKey) {
      // Internal service call (from evaluator, tests, etc.) - use synthetic user ID
      userId = 'internal-evaluator';
      isInternalCall = true;
      console.log('[ayn-unified] Internal service call detected - bypassing user auth');
    } else {
      // Normal user call - validate JWT using getClaims (recommended for signing-keys)
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      
      const { data, error: claimsError } = await authClient.auth.getClaims(token);
      
      if (claimsError || !data?.claims?.sub) {
        console.log('[ayn-unified] Auth failed:', claimsError?.message || 'no claims');
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      userId = data.claims.sub as string;
      console.log('[ayn-unified] User authenticated:', userId.substring(0, 8) + '...');
    }

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const { messages: rawMessages, intent: forcedIntent, context = {}, stream = true, sessionId, _internal_warm } = body;

    // Fast-return for keep-warm pings — just confirms function is alive
    if (_internal_warm) {
      return new Response(JSON.stringify({ status: 'warm', ts: Date.now() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!rawMessages || !Array.isArray(rawMessages)) {
      return new Response(JSON.stringify({ error: 'Messages array required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Trim conversation history to avoid exceeding token limits (~1M tokens)
    // 1. Keep only last 20 messages
    const MAX_CONTEXT_MESSAGES = 20;
    let messages = rawMessages;
    if (rawMessages.length > MAX_CONTEXT_MESSAGES) {
      const systemMsgs = rawMessages.filter((m: any) => m.role === 'system');
      const nonSystemMsgs = rawMessages.filter((m: any) => m.role !== 'system');
      messages = [...systemMsgs, ...nonSystemMsgs.slice(-MAX_CONTEXT_MESSAGES)];
      console.log(`[ayn-unified] Trimmed messages from ${rawMessages.length} to ${messages.length}`);
    }
    // 2. Truncate individual messages that are too long (e.g. base64 images, large files)
    const MAX_CHARS_PER_MESSAGE = 50000; // ~12K tokens
    messages = messages.map((m: any) => {
      if (typeof m.content === 'string' && m.content.length > MAX_CHARS_PER_MESSAGE) {
        console.log(`[ayn-unified] Truncating message (role=${m.role}) from ${m.content.length} to ${MAX_CHARS_PER_MESSAGE} chars`);
        return { ...m, content: m.content.substring(0, MAX_CHARS_PER_MESSAGE) + '\n[...truncated for length]' };
      }
      // Handle array content (vision messages with images)
      if (Array.isArray(m.content)) {
        return { ...m, content: m.content.filter((part: any) => part.type === 'text').slice(0, 2) };
      }
      return m;
    });

    // Detect intent from last message or use forced intent
    const lastMessage = messages[messages.length - 1]?.content || '';
    const fileContext = context?.fileContext;
    const hasImageFile = !!(fileContext && fileContext.type && fileContext.type.startsWith('image/'));
    let intent = (forcedIntent && forcedIntent !== 'chat') ? forcedIntent : detectIntent(lastMessage, hasImageFile);
    console.log(`Detected intent: ${intent}`);

    // === PROMPT INJECTION DEFENSE ===
    if (detectInjectionAttempt(lastMessage)) {
      supabase
        .from('security_logs')
        .insert({
          action: 'prompt_injection_attempt',
          user_id: userId === 'internal-evaluator' ? null : userId,
          details: { input_preview: lastMessage.slice(0, 200), function: 'ayn-unified' },
          severity: 'high'
        })
        .then(() => {})
        .catch(() => {});
    }

    // === SERVER-SIDE CHAT LIMIT ENFORCEMENT ===
    // Enforce 100 messages per chat session to prevent abuse and manage context
    const MAX_MESSAGES_PER_CHAT = 100;
    
    if (sessionId && !isInternalCall) {
      const { count, error: countError } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('user_id', userId);
      
      if (!countError && count !== null && count >= MAX_MESSAGES_PER_CHAT) {
        console.log(`[ayn-unified] Chat limit reached: ${count}/${MAX_MESSAGES_PER_CHAT} for session ${sessionId}`);
        return new Response(JSON.stringify({ 
          error: 'Chat limit reached',
          message: 'This chat has reached the 100 message limit. Please start a new chat to continue.',
          chatLimitExceeded: true,
          messageCount: count,
          limit: MAX_MESSAGES_PER_CHAT
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // PARALLEL DB OPERATIONS - Critical for 30K user scale (saves 200-300ms)
    // Performance keywords to detect if user is asking about paper trading account
    const performanceKeywords = [
      'performance', 'win rate', 'balance', 'trades', 'p&l', 'profit', 'loss',
      'portfolio', 'how are you doing', "how's your account", 'paper trading',
      'track record', 'open positions', 'how many trades', 'account'
    ];
    const isPerformanceQuery = intent === 'trading-coach';

    // Autonomous trading detection (with typo-tolerant matching)
    const autonomousTradingKeywords = [
      'find best token', 'scan market', 'look for trade', 'find opportunity',
      'paper testing', 'pepar testing', 'peper testing', 'papar testing',
      'start trading', 'trade for me', 'what should i buy',
      'find best setup', 'hunt for trades', 'scan for opportunities',
      'do paper testing', 'find winning trade', 'find me a trade',
      'scan pairs', 'best crypto', 'what to buy', 'best token',
      'chose the best', 'choose the best', 'pick the best', 'pick a token',
      'make money', 'making money', 'open a trade', 'execute trade',
      'ابحث عن', 'تداول لي', 'افضل عملة',
    ];
    const msgLower = lastMessage.toLowerCase();
    const wantsAutonomousTrading = intent === 'trading-coach' &&
      autonomousTradingKeywords.some(kw => msgLower.includes(kw));

    // Detect countries mentioned in the user's message
    const mentionedCountries = detectCountries(lastMessage);

    const [limitCheck, userContext, marketSnapshot, chartHistory, accountPerformance, scanResults, countryProfiles, marketPrices, tradeFlows, superBrainIntel] = await Promise.all([
      isInternalCall ? Promise.resolve({ allowed: true }) : checkUserLimit(supabase, userId, intent),
      isInternalCall ? Promise.resolve({}) : getUserContext(supabase, userId),
      getMarketSnapshot(supabase),
      supabase.from('chart_analyses')
        .select('ticker, asset_type, timeframe, prediction_signal, confidence, sentiment_score, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5),
      // Fetch real paper trading data when relevant
      isPerformanceQuery ? (async () => {
        try {
          const [accountRes, openRes, recentRes] = await Promise.all([
            supabase.from('ayn_account_state').select('*').maybeSingle(),
            supabase.from('ayn_paper_trades').select('*').in('status', ['OPEN', 'PARTIAL_CLOSE']),
            supabase.from('ayn_paper_trades').select('*').in('status', ['CLOSED_WIN', 'CLOSED_LOSS', 'STOPPED_OUT']).order('exit_time', { ascending: false }).limit(5),
          ]);
          return {
            account: accountRes.data,
            openPositions: openRes.data || [],
            recentTrades: recentRes.data || [],
          };
        } catch (err) {
          console.error('[ayn-unified] Failed to fetch account performance:', err);
          return null;
        }
      })() : Promise.resolve(null),
      // Scan market for autonomous trading
      wantsAutonomousTrading ? scanMarketOpportunities() : Promise.resolve(null),
      // Country intelligence profiles for mentioned countries
      mentionedCountries.length > 0 ? getCountryIntelligence(supabase, mentionedCountries) : Promise.resolve([]),
      // Market prices (commodities, currencies, crypto) - fetch when relevant
      needsMarketData(lastMessage) ? getMarketPrices(supabase) : Promise.resolve({}),
      // Trade flows for mentioned countries
      mentionedCountries.length > 0 ? getTradeFlows(supabase, mentionedCountries) : Promise.resolve([]),
      // Super brain: news, gov, sectors, jobs, health, geo, tech, supply chain, real estate
      Promise.resolve({}) /* superbrain replaced by true tools */
    ]);

    // Check user limits
    if (!limitCheck.allowed) {
      return new Response(JSON.stringify({ 
        error: 'Daily limit reached',
        reason: (limitCheck as { reason?: string }).reason,
        limitExceeded: true
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Language detection — always from CURRENT message, never from stale saved preference
    // detectLanguage() now supports 15+ languages via script + word pattern matching
    const language = detectLanguage(lastMessage);

    // Memory extraction now happens AFTER the AI responds (parses [MEMORY:] tags from response)

    // Build chart history context for AYN
    const chartSection = chartHistory?.data?.length
      ? `\n\nUSER'S RECENT CHART ANALYSES (reference when they ask about their trading history):\n${chartHistory.data.map((c: Record<string, unknown>) =>
          `- ${c.ticker || 'Unknown'} (${c.asset_type || 'N/A'}): ${c.prediction_signal} signal, ${c.confidence}% confidence, ${c.timeframe} timeframe (${new Date(c.created_at as string).toLocaleDateString()})`
        ).join('\n')}`
      : '';

    // Inject real paper trading performance data into context if available
    let performanceContext = '';
    if (accountPerformance?.account) {
      const acct = accountPerformance.account;
      const openPos = accountPerformance.openPositions;
      const recentTrades = accountPerformance.recentTrades;
      
      performanceContext = `\n\nREAL PAPER TRADING DATA (FROM DATABASE — USE THIS, DO NOT FABRICATE):
Balance: $${Number(acct.current_balance).toFixed(2)}
Starting: $${Number(acct.starting_balance).toFixed(2)}
Total P&L: $${Number(acct.total_pnl_dollars).toFixed(2)} (${Number(acct.total_pnl_percent).toFixed(2)}%)
Total Trades: ${acct.total_trades}
Win Rate: ${Number(acct.win_rate).toFixed(1)}%
Winning: ${acct.winning_trades} | Losing: ${acct.losing_trades}
Open Positions: ${openPos.length}${openPos.length > 0 ? '\n' + openPos.map((t: Record<string, unknown>) => `  - ${t.ticker} ${t.signal} @ $${t.entry_price} (size: $${Number(t.position_size_dollars).toFixed(2)})`).join('\n') : ''}
Recent Closed Trades: ${recentTrades.length}${recentTrades.length > 0 ? '\n' + recentTrades.map((t: Record<string, unknown>) => `  - ${t.ticker} ${t.signal}: entry $${t.entry_price} → exit $${t.exit_price} | P&L: $${Number(t.pnl_dollars as number).toFixed(2)} (${Number(t.pnl_percent as number).toFixed(2)}%) | ${t.status}`).join('\n') : ''}`;
      
      console.log('[ayn-unified] Injected real performance data into trading context');
    } else if (isPerformanceQuery) {
      // Performance query but no account data found
      performanceContext = `\n\nREAL PAPER TRADING DATA — INJECTED FROM DATABASE:
Balance: $10,000.00 | Starting: $10,000.00 | P&L: $0.00 (0.00%)
Total Trades: 0 | Win Rate: N/A
Open Positions: NONE
Closed Trades: NONE
STATUS: Account launched. Zero trades executed.

MANDATORY RESPONSE FOR THIS STATE:
Your answer MUST say: "My paper trading account is live with $10,000. No trades yet — I'm being selective and waiting for an 80%+ confidence setup."
DO NOT DEVIATE. DO NOT ADD FICTIONAL TRADES. DO NOT ADD FICTIONAL PRICES. DO NOT INVENT BALANCES OTHER THAN $10,000.`;
      
      console.log('[ayn-unified] No account data found, injected default state');
    }

    // Inject market scan results for autonomous trading
    let scanContext = '';
    if (scanResults && scanResults.opportunities.length > 0) {
      scanContext = `\n\nMARKET SCAN RESULTS (LIVE FROM PIONEX API — USE THIS DATA):
Scanned: ${scanResults.scannedPairs} pairs
Top Opportunities: ${scanResults.opportunities.length}

${scanResults.opportunities.map((opp: any, i: number) => `${i + 1}. ${opp.ticker}
   Score: ${opp.score}/100
   Price: $${opp.price}
   24h Change: ${opp.priceChange24h > 0 ? '+' : ''}${opp.priceChange24h.toFixed(2)}%
   Volume: $${(opp.volume24h / 1e6).toFixed(1)}M
   Signals: ${opp.signals.join(', ')}`).join('\n\n')}

You are AUTHORIZED to pick the best one and open a trade. Include EXECUTE_TRADE JSON at the end of your response.`;
      console.log(`[ayn-unified] Injected scan results: ${scanResults.opportunities.length} opportunities from ${scanResults.scannedPairs} pairs`);
    } else if (wantsAutonomousTrading) {
      scanContext = `\n\nMARKET SCAN RESULTS: Scanned ${scanResults?.scannedPairs || 'all'} pairs. NO opportunities scored above threshold.
You MUST tell the user: "I scanned ${scanResults?.scannedPairs || 'the market'} pairs — no high-conviction setups right now. I won't force a trade."
DO NOT fabricate or invent any trade. DO NOT make up prices. DO NOT suggest a specific coin with a specific price. Just report the scan result honestly.`;
      console.log('[ayn-unified] Market scan found no qualifying opportunities');
    } else if (intent === 'trading-coach') {
      // ANTI-FABRICATION: When NOT in autonomous mode, prevent the AI from inventing trades
      scanContext += `\n\nCRITICAL ANTI-FABRICATION RULE:
You do NOT have live market data right now. DO NOT invent specific prices, entry points, or trade recommendations with made-up numbers.
If the user asks you to trade or pick a token, tell them to say "do paper testing" or "find best token" so you can scan real Pionex market data first.
NEVER say "I'm buying X at $Y" unless you have MARKET SCAN RESULTS above with real prices from Pionex.
You may discuss trading concepts, strategy, and education freely — just don't fabricate specific prices.`;
    }

    // Build intelligence context from market snapshot
    let intelligenceContext = '';
    if (marketSnapshot && Object.keys(marketSnapshot).length > 0) {
      const brief = marketSnapshot.intelligence_brief as string[] || [];
      const ageHours = marketSnapshot.snapshot_age_hours || 'unknown';
      if (brief.length > 0) {
        // Build extended context with demographics and market data
        const demo = marketSnapshot.demographics as any;
        const tourismData = marketSnapshot.tourism_market as any;
        const regIntel = marketSnapshot.regional_intel as any;

        let marketContext = '';

        // Demographics context
        if (demo?.insights?.length > 0) {
          marketContext += `\n\nSAUDI MARKET DEMOGRAPHICS (World Bank data):\n${(demo.insights as string[]).join('\n')}`;
          if (demo.gcc_populations) {
            const gcc = Object.entries(demo.gcc_populations as Record<string, any>)
              .map(([k, v]) => `${v.name}: ${v.population}`)
              .join(', ');
            marketContext += `\nGCC populations: ${gcc}`;
          }
        }

        // Tourism market data
        if (tourismData?.international_arrivals?.latest) {
          const arr = tourismData.international_arrivals.latest;
          marketContext += `\n\nSAUDI TOURISM MARKET:\n- International arrivals: ${(arr.value/1000000).toFixed(1)}M (${arr.year}, ${tourismData.international_arrivals.trend})`;
        }
        if (tourismData?.tourism_receipts?.latest) {
          const rec = tourismData.tourism_receipts.latest;
          marketContext += `\n- Tourism revenue: $${(rec.value/1000000000).toFixed(1)}B (${rec.year})`;
        }

        // Regional competitor intel
        if (regIntel?.adventure_tourism_pricing?.results?.length > 0) {
          const hits = (regIntel.adventure_tourism_pricing.results as any[]).slice(0, 2);
          marketContext += `\n\nCOMPETITOR PRICING INTELLIGENCE:\n${hits.map((h: any) => `- ${h.title}: ${h.snippet?.substring(0, 200)}`).join('\n')}`;
        }
        if (regIntel?.saudi_luxury_travel?.results?.length > 0) {
          const hits = (regIntel.saudi_luxury_travel.results as any[]).slice(0, 2);
          marketContext += `\n\nLUXURY TRAVEL MARKET SIGNALS:\n${hits.map((h: any) => `- ${h.title}: ${h.snippet?.substring(0, 200)}`).join('\n')}`;
        }
        if (regIntel?.saudi_expat_spending?.results?.length > 0) {
          const hits = (regIntel.saudi_expat_spending.results as any[]).slice(0, 1);
          marketContext += `\n\nEXPAT SPENDING SIGNALS:\n${hits.map((h: any) => `- ${h.title}: ${h.snippet?.substring(0, 200)}`).join('\n')}`;
        }

        intelligenceContext = `\n\nBACKGROUND INTELLIGENCE (for context only — do NOT recite this unless the user specifically asks about markets or world events):
${brief.join('\n')}${marketContext}

RULE: This data is background context. If the user said "hello", "how are you", or anything casual — ignore this entirely. Only use it when they ask about markets, business strategy, world events, or investment. Never open a response by citing these numbers unprompted.`;

        // Inject country intelligence profiles if countries were detected
        const profiles = countryProfiles as any[];
        if (profiles && profiles.length > 0) {
          let countryContext = '\n\nCOUNTRY INTELLIGENCE PROFILES (live data):';
          for (const profile of profiles) {
            const brief = (profile.intelligence_brief as string[]) || [];
            const eco = profile.economy as any;
            const con = profile.consumer as any;
            const health = profile.health_sector as any;
            const age = profile.fetched_at ? `updated ${Math.round((Date.now() - new Date(profile.fetched_at).getTime()) / 3600000)}h ago` : '';

            countryContext += `\n\n${profile.country_name} (${age}):`;
            if (brief.length > 0) countryContext += '\n' + brief.slice(0, 8).join('\n');

            // Hot sectors
            const hot = profile.hot_sectors as any[];
            if (hot?.length > 0) {
              const sector = hot[0];
              countryContext += `\nHot sectors: ${sector.snippet || sector.title || ''}`;
            }

            // Opportunities
            const opps = profile.opportunities as any[];
            if (opps?.length > 0) {
              countryContext += `\nMarket gap: ${opps[0].snippet || opps[0].title || ''}`;
            }

            // Job market
            const jobs = profile.job_market as any[];
            if (jobs?.length > 0) {
              countryContext += `\nJobs: ${jobs[0].snippet || jobs[0].title || ''}`;
            }

            // Health sector
            if (health?.market_intel?.length > 0) {
              countryContext += `\nHealth market: ${health.market_intel[0].snippet || health.market_intel[0].title || ''}`;
            }

            // Emerging
            const emerging = profile.emerging as any[];
            if (emerging?.length > 0) {
              countryContext += `\nEmerging: ${emerging[0].snippet || emerging[0].title || ''}`;
            }
          }
          intelligenceContext += countryContext;
        }

        // Inject live commodity/market prices when relevant
        const prices = marketPrices as any;
        if (prices && Object.keys(prices).length > 0) {
          const narrative = (prices.narrative as string[]) || [];
          const corr = (prices.correlations as any)?.signals || [];
          if (narrative.length > 0) {
            intelligenceContext += `\n\nLIVE COMMODITY & MARKET PRICES (updated every 2h):\n${narrative.slice(0, 15).join('\n')}`;
          }
          if (corr.length > 0) {
            intelligenceContext += `\n\nMARKET CORRELATIONS (what's moving together):\n${corr.join('\n')}`;
          }
        }

        // Inject trade flows for mentioned countries
        const flows = tradeFlows as any[];
        if (flows && flows.length > 0) {
          let tradeContext = '\n\nTRADE FLOWS (exports & imports):';
          for (const flow of flows) {
            const brief = (flow.intelligence_brief as string[]) || [];
            if (brief.length > 0) tradeContext += '\n' + brief.join('\n');
            const exports = flow.top_exports as any[];
            const imports = flow.top_imports as any[];
            if (exports?.length > 0) tradeContext += `\nTop exports: ${exports.slice(0,2).map((e: any) => e.snippet || e.title).join(' | ')}`;
            if (imports?.length > 0) tradeContext += `\nTop imports: ${imports.slice(0,2).map((i: any) => i.snippet || i.title).join(' | ')}`;
            const opps = flow.opportunities as any[];
            if (opps?.length > 0) tradeContext += `\nTrade opportunity: ${opps[0].snippet || opps[0].title || ''}`;
          }
          intelligenceContext += tradeContext;
        }

        // Inject super brain intelligence
        const sb = superBrainIntel as any;
        if (sb && Object.keys(sb).length > 0) {
          let sbContext = '';

          // Business news
          if (sb.news?.length > 0) {
            const newsItems = sb.news.flatMap((n: any) => {
              const headlines = (n.headlines as any[] || []).slice(0, 2);
              return headlines.map((h: any) => h.snippet || h.title).filter(Boolean);
            }).slice(0, 4);
            if (newsItems.length > 0) sbContext += `\n\nBUSINESS NEWS:\n${newsItems.join('\n')}`;
          }

          // Gov policies
          if (sb.gov?.length > 0) {
            const govBrief = sb.gov.flatMap((g: any) => (g.intelligence_brief as string[] || []).slice(0, 2)).filter(Boolean).slice(0, 4);
            if (govBrief.length > 0) sbContext += `\n\nGOVERNMENT POLICY:\n${govBrief.join('\n')}`;
          }

          // Sector intel
          if (sb.sectors?.length > 0) {
            const secBrief = sb.sectors.flatMap((s: any) => (s.intelligence_brief as string[] || []).slice(0, 2)).filter(Boolean).slice(0, 3);
            if (secBrief.length > 0) sbContext += `\n\nSECTOR INTELLIGENCE:\n${secBrief.join('\n')}`;
          }

          // Startups
          if (sb.startups) {
            const stBrief = (sb.startups.intelligence_brief as string[] || []).slice(0, 3).filter(Boolean);
            if (stBrief.length > 0) sbContext += `\n\nSTARTUP & VC MARKET:\n${stBrief.join('\n')}`;
          }

          // Jobs
          if (sb.jobs?.length > 0) {
            const jobBrief = sb.jobs.flatMap((j: any) => (j.intelligence_brief as string[] || []).slice(0, 2)).filter(Boolean).slice(0, 4);
            if (jobBrief.length > 0) sbContext += `\n\nJOB MARKET:\n${jobBrief.join('\n')}`;
          }

          // Supply chain
          if (sb.supply_chain) {
            const supBrief = (sb.supply_chain.intelligence_brief as string[] || []).slice(0, 3).filter(Boolean);
            if (supBrief.length > 0) sbContext += `\n\nSUPPLY CHAIN:\n${supBrief.join('\n')}`;
          }

          // Real estate
          if (sb.real_estate?.length > 0) {
            const reBrief = sb.real_estate.flatMap((r: any) => (r.intelligence_brief as string[] || []).slice(0, 2)).filter(Boolean).slice(0, 3);
            if (reBrief.length > 0) sbContext += `\n\nREAL ESTATE:\n${reBrief.join('\n')}`;
          }

          // Consumer
          if (sb.consumer?.length > 0) {
            const conBrief = sb.consumer.flatMap((c: any) => (c.intelligence_brief as string[] || []).slice(0, 2)).filter(Boolean).slice(0, 3);
            if (conBrief.length > 0) sbContext += `\n\nCONSUMER SENTIMENT:\n${conBrief.join('\n')}`;
          }

          // Geopolitical
          if (sb.geopolitical) {
            const geoBrief = (sb.geopolitical.intelligence_brief as string[] || []).slice(0, 4).filter(Boolean);
            if (geoBrief.length > 0) sbContext += `\n\nGEOPOLITICAL:\n${geoBrief.join('\n')}`;
          }

          // Health
          if (sb.health?.length > 0) {
            const hlBrief = sb.health.flatMap((h: any) => (h.intelligence_brief as string[] || []).slice(0, 2)).filter(Boolean).slice(0, 3);
            if (hlBrief.length > 0) sbContext += `\n\nHEALTH SECTOR:\n${hlBrief.join('\n')}`;
          }

          // Tech
          if (sb.tech) {
            const techBrief = (sb.tech.intelligence_brief as string[] || []).slice(0, 3).filter(Boolean);
            if (techBrief.length > 0) sbContext += `\n\nTECH DISRUPTION:\n${techBrief.join('\n')}`;
          }

          if (sbContext) intelligenceContext += sbContext;
        }
      }
    }

    // Build system prompt with user message for language detection AND user memories
    let systemPrompt = buildSystemPrompt(intent, language, context, lastMessage, userContext) + intelligenceContext + performanceContext + chartSection + scanContext + INJECTION_GUARD;

    // === FIRECRAWL + LIVE PIONEX INTEGRATION FOR TRADING COACH ===
    if (intent === 'trading-coach') {
      const { scrapeUrl: urlToScrape, searchQuery, ticker: ctxTicker, assetType: ctxAssetType, timeframe: ctxTimeframe } = context;

      const firecrawlTasks: Promise<void>[] = [];

      // --- Ticker detection from user message ---
      const CRYPTO_MAP: Record<string, string> = {
        'bitcoin': 'BTC', 'btc': 'BTC',
        'ethereum': 'ETH', 'eth': 'ETH', 'ether': 'ETH',
        'solana': 'SOL', 'sol': 'SOL',
        'xrp': 'XRP', 'ripple': 'XRP',
        'dogecoin': 'DOGE', 'doge': 'DOGE',
        'cardano': 'ADA', 'ada': 'ADA',
        'polkadot': 'DOT', 'dot': 'DOT',
        'avalanche': 'AVAX', 'avax': 'AVAX',
        'chainlink': 'LINK', 'link': 'LINK',
        'polygon': 'POL', 'matic': 'POL', 'pol': 'POL',
        'litecoin': 'LTC', 'ltc': 'LTC',
        'uniswap': 'UNI', 'uni': 'UNI',
        'shiba': 'SHIB', 'shib': 'SHIB',
        'tron': 'TRX', 'trx': 'TRX',
        'cosmos': 'ATOM', 'atom': 'ATOM',
        'near': 'NEAR', 'near protocol': 'NEAR',
        'aptos': 'APT', 'apt': 'APT',
        'sui': 'SUI',
        'arbitrum': 'ARB', 'arb': 'ARB',
        'optimism': 'OP', 'op': 'OP',
        'filecoin': 'FIL', 'fil': 'FIL',
        'pepe': 'PEPE',
        'bonk': 'BONK',
        'render': 'RENDER',
        'injective': 'INJ', 'inj': 'INJ',
        'sei': 'SEI',
        'celestia': 'TIA', 'tia': 'TIA',
        'jupiter': 'JUP', 'jup': 'JUP',
        'bnb': 'BNB', 'binance coin': 'BNB',
        'ton': 'TON', 'toncoin': 'TON',
      };

      function detectTickerFromMessage(msg: string): string | null {
        const lower = msg.toLowerCase();
        // Check longer names first to avoid partial matches
        const sorted = Object.entries(CRYPTO_MAP).sort((a, b) => b[0].length - a[0].length);
        for (const [name, symbol] of sorted) {
          // Use word boundary matching
          const regex = new RegExp(`\\b${name}\\b`, 'i');
          if (regex.test(lower)) return symbol;
        }
        return null;
      }

      const mentionedSymbol = detectTickerFromMessage(lastMessage);
      const cleanCtxTicker = ctxTicker ? ctxTicker.replace(/\/USDT|\/USD|\/BUSD/i, '').toUpperCase() : null;
      
      // Determine which tickers to fetch
      const tickersToFetch = new Set<string>();
      if (cleanCtxTicker && ctxAssetType === 'crypto' && ctxTicker !== 'UNKNOWN') {
        tickersToFetch.add(cleanCtxTicker);
      }
      if (mentionedSymbol && mentionedSymbol !== cleanCtxTicker) {
        tickersToFetch.add(mentionedSymbol);
      }

      // Anti-hallucination guard
      systemPrompt += `\n\nCRITICAL RULE: NEVER fabricate, guess, or hallucinate any price, market data, or statistics. If you do NOT have live data for a specific coin or asset provided below, you MUST say "I don't have live data for that coin right now." Do NOT make up numbers.`;

      // Fetch live Pionex data for all detected tickers
      for (const ticker of tickersToFetch) {
        firecrawlTasks.push((async () => {
          try {
            const apiKey = Deno.env.get('PIONEX_API_KEY');
            const apiSecret = Deno.env.get('PIONEX_API_SECRET');
            if (!apiKey || !apiSecret) return;

            const symbol = `${ticker}_USDT`;
            console.log('[DEBUG ayn-unified] Ticker mapping:', ticker, '->', symbol);
            const intervalMap: Record<string, string> = {
              '1m': '1M', '5m': '5M', '15m': '15M', '30m': '30M',
              '1H': '60M', '4H': '4H', '8H': '8H', '12H': '12H',
              'Daily': '1D', 'Weekly': '1D', 'Monthly': '1D', 'unknown': '60M',
            };
            const interval = intervalMap[ctxTimeframe || 'unknown'] || '60M';

            async function signReq(method: string, path: string, params: Record<string, string>): Promise<{ signature: string; queryString: string }> {
              const sortedKeys = Object.keys(params).sort();
              const queryString = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
              const message = `${method}${path}?${queryString}`;
              const enc = new TextEncoder();
              const key = await crypto.subtle.importKey('raw', enc.encode(apiSecret!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
              const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
              const signature = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
              return { signature, queryString };
            }

            const ts = Date.now().toString();
            const baseUrl = 'https://api.pionex.com';

            // Fetch ticker 24h stats
            const tickerSigned = await signReq('GET', '/api/v1/market/tickers', { symbol, timestamp: ts });
            const tickerRes = await fetch(`${baseUrl}/api/v1/market/tickers?${tickerSigned.queryString}`, {
              headers: { 'PIONEX-KEY': apiKey, 'PIONEX-SIGNATURE': tickerSigned.signature },
            });

            let liveBlock = '';
            if (tickerRes.ok) {
              const tickerData = await tickerRes.json();
              console.log('[DEBUG ayn-unified] Raw ticker response for', symbol, ':', JSON.stringify(tickerData).slice(0, 500));
              const t = tickerData?.data?.tickers?.[0];
              if (t) {
                const price = parseFloat(t.close || t.last || '0');
                console.log('[DEBUG ayn-unified] Price extracted:', price, 'from fields close:', t.close, 'last:', t.last, 'open:', t.open);
                const open = parseFloat(t.open || '0');
                const change = open > 0 ? ((price - open) / open * 100).toFixed(2) : 'N/A';
                liveBlock = `\n\n📊 LIVE MARKET DATA for ${ticker} (Pionex, just fetched):\nSymbol: ${symbol}\nCurrent Price: ${price}\n24h Change: ${change}%\n24h High: ${t.high || 'N/A'}\n24h Low: ${t.low || 'N/A'}\n24h Volume: ${t.amount ? parseFloat(t.amount).toLocaleString() + ' USDT' : 'N/A'}\n\nUse this live data to give accurate answers about ${ticker}. Reference these numbers when the user asks about ${ticker}.`;
              }
            } else {
              await tickerRes.text();
            }

            // Fetch last 10 candles
            const klinesPath = `/api/v1/market/klines?symbol=${symbol}&interval=${interval}&limit=10&timestamp=${ts}`;
            const klinesSig = await signReq(klinesPath);
            const klinesRes = await fetch(`${baseUrl}${klinesPath}`, {
              headers: { 'PIONEX-KEY': apiKey, 'PIONEX-SIGNATURE': klinesSig },
            });

            if (klinesRes.ok) {
              const klinesData = await klinesRes.json();
              console.log('[DEBUG ayn-unified] Raw klines response for', symbol, ':', JSON.stringify(klinesData).slice(0, 500));
              const klines = klinesData?.data?.klines || [];
              if (klines.length > 0) {
                const candles = klines.slice(-5).map((k: any) => `O:${k.open} H:${k.high} L:${k.low} C:${k.close}`).join(' | ');
                liveBlock += `\nRecent ${interval} candles for ${ticker}: ${candles}`;
              }
            } else {
              await klinesRes.text();
            }

            if (liveBlock) {
              systemPrompt += liveBlock;
              console.log(`[ayn-unified] Injected live Pionex data for ${symbol}`);
            }
          } catch (err) {
            console.warn(`[ayn-unified] Pionex fetch error for ${ticker}:`, err);
          }
        })());
      }

      if (urlToScrape && typeof urlToScrape === 'string') {
        firecrawlTasks.push((async () => {
          try {
            const { scrapeUrl: scrapeUrlFn } = await import("../_shared/firecrawlHelper.ts");
            const { sanitizeForPrompt, FIRECRAWL_CONTENT_GUARD } = await import("../_shared/sanitizeFirecrawl.ts");
            const scraped = await scrapeUrlFn(urlToScrape);
            if (scraped.success && scraped.markdown) {
              const title = scraped.metadata?.title || 'Article';
              const safeContent = sanitizeForPrompt(scraped.markdown, 3000);
              systemPrompt += `\n\n${FIRECRAWL_CONTENT_GUARD}\nARTICLE CONTENT (user shared this URL - "${title}"):\n${safeContent}`;
              console.log(`[ayn-unified] Scraped URL for trading coach: ${urlToScrape.substring(0, 60)}`);
            }
          } catch (err) {
            console.error('[ayn-unified] Firecrawl scrape error:', err);
          }
        })());
      }

      // Backend fallback: generate searchQuery if frontend didn't send one but we have context
      let effectiveSearchQuery = (searchQuery && typeof searchQuery === 'string') ? searchQuery : null;
      if (!effectiveSearchQuery && mentionedSymbol) {
        // Check if the message is asking a market/price question
        const marketQuestion = /\b(price|buy|sell|hold|dump|pump|crash|surge|news|happening|analysis|forecast|prediction|why|should|worth|bullish|bearish)\b/i;
        if (marketQuestion.test(lastMessage) || lastMessage.includes('?')) {
          effectiveSearchQuery = `${mentionedSymbol} crypto latest price analysis today`;
          console.log(`[ayn-unified] Backend fallback search query: "${effectiveSearchQuery}"`);
        }
      }

      if (effectiveSearchQuery) {
        firecrawlTasks.push((async () => {
          try {
            const { searchWeb } = await import("../_shared/firecrawlHelper.ts");
            const { sanitizeForPrompt, FIRECRAWL_CONTENT_GUARD } = await import("../_shared/sanitizeFirecrawl.ts");
            const results = await searchWeb(effectiveSearchQuery!, { limit: 5 });
            if (results.success && results.data?.length) {
              const newsLines = results.data.map((r: { title: string; description: string; url: string }) =>
                `- ${sanitizeForPrompt(r.title, 200)}: ${sanitizeForPrompt(r.description, 300)} (${r.url})`
              ).join('\n');
              systemPrompt += `\n\n${FIRECRAWL_CONTENT_GUARD}\nLIVE MARKET NEWS (from web search for "${effectiveSearchQuery}"):\n${newsLines}\n\nUse this info naturally. Cite sources when relevant. Never reveal you used Firecrawl or web search tools.`;
              console.log(`[ayn-unified] Web search for trading coach: "${effectiveSearchQuery}" - ${results.data.length} results`);
            }
          } catch (err) {
            console.error('[ayn-unified] Firecrawl search error:', err);
          }
        })());
      }

      if (firecrawlTasks.length > 0) {
        await Promise.all(firecrawlTasks);
      }
    }

    // Handle image generation intent (LAB mode)
    if (intent === 'image') {
      try {
        const { imageUrl: rawImageUrl, revisedPrompt } = await generateImage(lastMessage);
        
        // Upload to storage for permanent URL
        const imageUrl = await uploadImageIfDataUrl(rawImageUrl, userId);
        
        // Log usage
        try {
          await supabase.from('llm_usage_logs').insert({
            user_id: userId,
            intent_type: 'image',
            was_fallback: false
          });
        } catch (logError) {
          console.error('Failed to log image usage:', logError);
        }

        return new Response(JSON.stringify({
          content: revisedPrompt,
          imageUrl,
          revisedPrompt,
          model: 'AYN',
          wasFallback: false,
          intent: 'image'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (imageError) {
        console.error('[ayn-unified] Image generation failed:', imageError);
        return new Response(JSON.stringify({
          content: "sorry, couldn't generate that image right now. try describing it differently?",
          error: imageError instanceof Error ? imageError.message : 'Image generation failed',
          intent: 'image'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Handle document generation intent
    if (intent === 'document') {
      try {
        console.log('[ayn-unified] Document generation requested');
        
        // === PREMIUM FEATURE: Check subscription tier AND admin role ===
        const [{ data: subscription }, { data: adminRole }] = await Promise.all([
          supabase
            .from('user_subscriptions')
            .select('tier')
            .eq('user_id', userId)
            .maybeSingle(),
          supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', userId)
            .eq('role', 'admin')
            .maybeSingle()
        ]);
        
        const userTier = subscription?.tier || 'free';
        const isAdmin = !!adminRole;
        
        // Block free tier users (unless they're admin or internal call)
        if (userTier === 'free' && !isInternalCall && !isAdmin) {
          console.log('[ayn-unified] Free user blocked from document generation');
          const upgradeMessages: Record<string, string> = {
            ar: '📄 إنشاء المستندات هو ميزة مدفوعة.\nقم بالترقية لإنشاء ملفات PDF و Excel احترافية!\n\n[ترقية الآن](/pricing)',
            fr: '📄 La génération de documents est une fonctionnalité premium.\nPassez à un forfait payant pour créer des PDF et Excel professionnels!\n\n[Mettre à niveau](/pricing)',
            en: '📄 Document generation is a premium feature.\nUpgrade to create professional PDF and Excel documents!\n\n[Upgrade Now](/pricing)'
          };
          return new Response(JSON.stringify({
            content: upgradeMessages[language] || upgradeMessages.en,
            intent: 'document',
            requiresUpgrade: true
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        if (isAdmin) {
          console.log('[ayn-unified] Admin user bypassing premium check for document generation');
        }
        
        // Get structured content from LLM (non-streaming for JSON parsing)
        const docMessages = [
          { role: 'system', content: systemPrompt },
          ...messages
        ];
        
        const llmResult = await callWithFallback('chat', docMessages, false, supabase, userId);
        const llmContent = (llmResult.response as { content: string }).content;
        
        // Parse JSON from response
        let documentData;
        try {
          // Try to extract JSON from response - handle markdown code blocks too
          let jsonStr = llmContent;
          
          // Strip markdown code fences if present
          const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1].trim();
          }
          
          // Try direct parse first
          try {
            documentData = JSON.parse(jsonStr);
          } catch {
            // Fallback: extract first JSON object from the text
            const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No JSON found in response');
            documentData = JSON.parse(jsonMatch[0]);
          }
          
          // Validate required fields
          if (!documentData.sections || !Array.isArray(documentData.sections)) {
            throw new Error('Missing or invalid sections array');
          }
        } catch (parseError) {
          console.error('[ayn-unified] Failed to parse document JSON:', parseError, 'Raw:', llmContent.substring(0, 500));
          
          // Retry once with a more explicit prompt
          try {
            const retryMessages = [
              { role: 'system', content: `You MUST respond with ONLY valid JSON. No markdown, no explanation, no code fences. Just raw JSON in this format: {"type":"pdf","language":"${language}","title":"...","sections":[{"heading":"...","content":"..."}]}` },
              ...messages,
              { role: 'assistant', content: llmContent },
              { role: 'user', content: 'Please convert your response above into the required JSON format. Respond with ONLY the JSON object, nothing else.' }
            ];
            const retryResult = await callWithFallback('chat', retryMessages, false, supabase, userId);
            const retryContent = (retryResult.response as { content: string }).content;
            
            let retryJson = retryContent;
            const retryCodeBlock = retryJson.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (retryCodeBlock) retryJson = retryCodeBlock[1].trim();
            
            try {
              documentData = JSON.parse(retryJson);
            } catch {
              const retryMatch = retryJson.match(/\{[\s\S]*\}/);
              if (!retryMatch) throw new Error('Retry also failed');
              documentData = JSON.parse(retryMatch[0]);
            }
            
            console.log('[ayn-unified] Document JSON retry succeeded');
          } catch (retryError) {
            console.error('[ayn-unified] Document JSON retry also failed:', retryError);
            const clarifyMessages: Record<string, string> = {
              ar: 'أحتاج مزيد من التفاصيل لإنشاء المستند. ماذا تريد أن يتضمن بالضبط؟',
              fr: "J'ai besoin de plus de détails pour créer le document. Que souhaitez-vous y inclure exactement?",
              en: "I need more details to create the document. What exactly would you like it to include?"
            };
            return new Response(JSON.stringify({
              content: clarifyMessages[language] || clarifyMessages.en,
              intent: 'document'
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }
        
        // Determine document type and credit cost
        const docType = documentData.type || 'pdf';
        const creditCost = docType === 'excel' ? DOCUMENT_CREDIT_COST.excel : DOCUMENT_CREDIT_COST.pdf;
        
        // === CHECK CREDITS: Ensure user has enough (admins bypass) ===
        let creditsRemaining = 999;
        let currentUsage = 0;
        let monthlyLimit = 50;
        
        if (!isAdmin && !isInternalCall) {
          const { data: userLimits } = await supabase
            .from('user_ai_limits')
            .select('monthly_messages, current_monthly_messages')
            .eq('user_id', userId)
            .maybeSingle();
          
          currentUsage = userLimits?.current_monthly_messages || 0;
          monthlyLimit = userLimits?.monthly_messages || 50;
          creditsRemaining = monthlyLimit - currentUsage;
          
          if (creditsRemaining < creditCost) {
            console.log(`[ayn-unified] Insufficient credits: ${creditsRemaining} < ${creditCost}`);
            const insufficientMessages: Record<string, string> = {
              ar: `❌ رصيدك غير كافٍ. مستندات ${docType === 'excel' ? 'Excel' : 'PDF'} تكلف ${creditCost} رصيد، لديك ${creditsRemaining} متبقي.`,
              fr: `❌ Crédits insuffisants. Les ${docType === 'excel' ? 'Excel' : 'PDF'} coûtent ${creditCost} crédits, il vous reste ${creditsRemaining}.`,
              en: `❌ Not enough credits. ${docType === 'excel' ? 'Excel' : 'PDF'} documents cost ${creditCost} credits, you have ${creditsRemaining} remaining.`
            };
            return new Response(JSON.stringify({
              content: insufficientMessages[language] || insufficientMessages.en,
              intent: 'document',
              notEnoughCredits: true,
              creditsRequired: creditCost,
              creditsRemaining
            }), {
              status: 429,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }
        
        // Call generate-document function
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const docResponse = await fetch(`${supabaseUrl}/functions/v1/generate-document`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...documentData,
            userId
          })
        });
        
        if (!docResponse.ok) {
          const errorText = await docResponse.text();
          throw new Error(`Document generation failed: ${errorText}`);
        }
        
        const { downloadUrl, filename } = await docResponse.json();
        
        // === DEDUCT CREDITS after successful generation (skip for admins) ===
        if (!isAdmin && !isInternalCall) {
          await supabase
            .from('user_ai_limits')
            .update({ current_monthly_messages: currentUsage + creditCost })
            .eq('user_id', userId);
        }
        
        console.log(`[ayn-unified] Deducted ${creditCost} credits for ${docType} document`);
        
        // Log usage
        try {
          await supabase.from('llm_usage_logs').insert({
            user_id: userId,
            intent_type: 'document',
            was_fallback: false
          });
        } catch (logError) {
          console.error('Failed to log document usage:', logError);
        }
        
        // Return friendly response with inline download link
        const docLang = documentData.language || language;
        const emoji = docType === 'excel' ? '📊' : '📄';
        const newCreditsRemaining = creditsRemaining - creditCost;
        const docTypeName = docType === 'excel' ? 'Excel' : 'PDF';
        const dlFilename = filename || `${documentData.title}.${docType === 'excel' ? 'xls' : 'pdf'}`;
        
        const successMessages: Record<string, string> = {
          ar: `تم إنشاء المستند بنجاح! ${emoji}\n\n**${documentData.title}**\n\n📥 [اضغط هنا لتحميل الملف](${downloadUrl})\n\n_(${creditCost} رصيد مخصوم • ${newCreditsRemaining} متبقي)_`,
          fr: `Document créé avec succès! ${emoji}\n\n**${documentData.title}**\n\n📥 [Cliquez ici pour télécharger](${downloadUrl})\n\n_(${creditCost} crédits déduits • ${newCreditsRemaining} restants)_`,
          en: `Document created successfully! ${emoji}\n\n**${documentData.title}**\n\n📥 [Click here to download your ${docTypeName}](${downloadUrl})\n\n_(${creditCost} credits used • ${newCreditsRemaining} remaining)_`
        };
        
        return new Response(JSON.stringify({
          content: successMessages[docLang] || successMessages.en,
          model: 'AYN',
          
          intent: 'document',
          documentUrl: downloadUrl,
          documentType: docType,
          documentName: filename || `${documentData.title}.${docType === 'excel' ? 'xlsx' : 'pdf'}`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
        
      } catch (docError) {
        console.error('[ayn-unified] Document generation failed:', docError);
        const errorMessages: Record<string, string> = {
          ar: 'عذراً، حدث خطأ أثناء إنشاء المستند. حاول مرة أخرى؟',
          fr: 'Désolé, une erreur est survenue lors de la création du document. Réessayer?',
          en: "Sorry, couldn't create that document right now. Try again?"
        };
        return new Response(JSON.stringify({
          content: errorMessages[language] || errorMessages.en,
          error: docError instanceof Error ? docError.message : 'Document generation failed',
          intent: 'document'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Handle floor plan generation intent (DISABLED - rebuilding with staged pipeline)
    /*
    if (intent === 'floor_plan') {
      // ... floor plan handler commented out for rebuild
    }
    */
    if (intent === 'floor_plan') {
      // Temporarily disabled - treat as regular chat
      intent = 'chat';
      systemPrompt = buildSystemPrompt('chat', language, context, lastMessage, userContext);
    }


    // Sanitize user messages before passing to LLM
    const sanitizedMessages = messages.map((msg: { role: string; content: any }) => ({
      ...msg,
      content: msg.role === 'user' && typeof msg.content === 'string' 
        ? sanitizeUserPrompt(msg.content) 
        : msg.content
    }));

    // URL detection — if user pastes a URL, AYN reads it automatically
    let enrichedMessages = [...sanitizedMessages];
    const urlMatch = lastMessage.match(/https?:\/\/[^\s]+/);
    if (urlMatch && (intent === 'chat' || intent === 'search' || intent === 'files')) {
      try {
        const { scrapeUrl: scrapeUrlFn } = await import("../_shared/firecrawlHelper.ts");
        const { sanitizeForPrompt, FIRECRAWL_CONTENT_GUARD } = await import("../_shared/sanitizeFirecrawl.ts");
        const detectedUrl = urlMatch[0].replace(/[.,;!?]$/, ''); // strip trailing punctuation
        const scraped = await scrapeUrlFn(detectedUrl);
        if (scraped.success && scraped.markdown) {
          const title = scraped.metadata?.title || detectedUrl;
          const safeContent = sanitizeForPrompt(scraped.markdown, 4000);
          const urlContext = `\n\n${FIRECRAWL_CONTENT_GUARD}\nWEBSITE CONTENT (user shared: "${title}"):\n${safeContent}\n\nAnswer based on this content. If the user asked something about it, use this. If they just shared it without a question, summarize what it is.`;
          enrichedMessages = [
            ...sanitizedMessages.slice(0, -1),
            {
              role: 'user',
              content: sanitizeUserPrompt(lastMessage) + urlContext
            }
          ];
          console.log('[ayn-unified] URL scraped:', detectedUrl.substring(0, 60));
        }
      } catch (err) {
        console.warn('[ayn-unified] URL scrape failed:', err);
        // Fall through to normal processing
      }
    }

    // Smart web search — AYN decides naturally when current info is needed

    const needsWebLookup = (msg: string): boolean => {
      const l = msg.toLowerCase();
      // Skip: clearly conversational or creative
      const skip = [
        /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|got it|nice|cool)/i,
        /make.*image|generate.*image|create.*image|draw/i,
        /make.*pdf|create.*pdf|generate.*pdf|make.*excel|create.*excel/i,
        /how are you|what can you do|who are you|what is ayn/i,
      ];
      if (skip.some(r => r.test(l))) return false;
      // Search: current data, prices, news, people, events
      const search = [
        /\b(today|tonight|yesterday|this week|this month|right now|currently|latest|recent|news|breaking)\b/i,
        /\b(price|stock|crypto|bitcoin|btc|eth|market|rate|exchange|gold|oil)\b/i,
        /\b(weather|temperature|forecast)\b/i,
        /\b(who is|who are|is .* still|does .* still)\b/i,
        /\b(ceo|president|prime minister|founder|owner|chairman)\b/i,
        /\b(what happened|what is happening|when did|when is|where is|how much is|how many)\b/i,
        /\b(score|result|winner|champion|standings|match|game)\b/i,
        // Business & Strategy specific
        /\b(competitors|competition|startup|company|fundraising|investors|venture capital|series a|seed round)\b/i,
        /\b(regulation|law|legal|compliance|taxes|policies|zatca|misa|pif)\b/i,
        /\b(vision 2030|giga project|neom|qiddiya|red sea project|saudization)\b/i,
        /\b(سعر|اخبار|اليوم|الان|حاليا|من هو|ما هو|كم|نتيجة|شركة|منافسين|استثمار|رؤية 2030|نظام|قانون)\b/i,
      ];
      if (search.some(r => r.test(l))) return true;
      // Long questions ending with ? about the world or business
      if (msg.trim().endsWith('?') && msg.split(' ').length > 5) return true;
      return false;
    };

    if ((intent === 'search' || intent === 'chat') && needsWebLookup(lastMessage)) {
      const searchResults = await performWebSearch(lastMessage);
      if (searchResults && !searchResults.startsWith('Search failed') && !searchResults.startsWith('No search results')) {
        enrichedMessages = [
          ...sanitizedMessages.slice(0, -1),
          {
            role: 'user',
            content: `${sanitizeUserPrompt(lastMessage)}\n\n[Current web results — use naturally without citing]\n${searchResults}`
          }
        ];
      }
    }

    // Add system prompt
    const fullMessages: Array<{ role: string; content: any }> = [
      { role: 'system', content: systemPrompt },
      ...enrichedMessages
    ];

    // === MULTIMODAL FILE SUPPORT ===
    // If fileContext is present, build multimodal content for the last user message
    const fileCtx = context?.fileContext as { name?: string; type?: string; url?: string } | undefined;
    if (fileCtx?.url && fileCtx?.type) {
      const lastIdx = fullMessages.length - 1;
      const lastTextContent = typeof fullMessages[lastIdx].content === 'string' 
        ? fullMessages[lastIdx].content 
        : '';

      if (fileCtx.type.startsWith('image/')) {
        // For images: use image_url content part so the model can SEE the image
        console.log('[ayn-unified] Building multimodal message with image:', fileCtx.name);
        fullMessages[lastIdx] = {
          role: 'user',
          content: [
            { type: 'text', text: lastTextContent },
            { type: 'image_url', image_url: { url: fileCtx.url } }
          ]
        };
      } else if (fileCtx.type === 'application/pdf' || fileCtx.type.startsWith('text/') || 
                 ['application/json', 'text/csv', 'application/xml'].includes(fileCtx.type)) {
        // For text-based files: fetch and inline the content
        try {
          console.log('[ayn-unified] Fetching file content:', fileCtx.name);
          const fileResponse = await fetch(fileCtx.url);
          if (fileResponse.ok) {
            const fileText = await fileResponse.text();
            const truncatedContent = fileText.substring(0, 15000); // Limit to ~15k chars
            fullMessages[lastIdx] = {
              role: 'user',
              content: `${lastTextContent}\n\n--- File Content: ${fileCtx.name} ---\n${truncatedContent}${fileText.length > 15000 ? '\n\n[Content truncated...]' : ''}`
            };
          }
        } catch (fetchErr) {
          console.error('[ayn-unified] Failed to fetch file content:', fetchErr);
        }
      }
    }

    // ReACT Tool Execution Loop
    let effectiveStream = wantsAutonomousTrading ? false : stream;
    let finalMessages = [...fullMessages];

    const supportsTools = (intent === 'chat' || intent === 'search' || intent === 'deep');
    let toolsToProvide = supportsTools ? AYN_TOOLS : undefined;

    let { response, modelUsed, wasFallback } = await callWithFallback(
      intent,
      finalMessages,
      supportsTools ? false : effectiveStream, // first hop must be false if using tools to easily parse tool_calls
      supabase,
      userId,
      toolsToProvide
    );

    let initialRespData = response as { content: string; tool_calls?: any[]; wasIncomplete?: boolean };
    
    // Check if the AI decided to call tools
    if (supportsTools && initialRespData.tool_calls && initialRespData.tool_calls.length > 0) {
      console.log(`[ayn-unified] AI called ${initialRespData.tool_calls.length} tools`);
      
      finalMessages.push({
        role: 'assistant',
        content: initialRespData.content || null,
        tool_calls: initialRespData.tool_calls
      });

      const toolResults = await Promise.all(
        initialRespData.tool_calls.map(async (tc: any) => {
          console.log(`[ayn-unified] Executing tool: ${tc?.function?.name}`);
          const res = await executeTool(tc, supabase);
          return {
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.function.name,
            content: JSON.stringify(res)
          };
        })
      );

      finalMessages.push(...toolResults);

      // Second hop to get final answer
      const secondHop = await callWithFallback(
        intent,
        finalMessages,
        effectiveStream,
        supabase,
        userId
      );
      response = secondHop.response;
    } else if (supportsTools && effectiveStream && !(response instanceof Response)) {
      // AI didn't call tools, but we forced stream=false. We need to simulate a stream for the frontend.
      const text = initialRespData.content || '';
      const encoder = new TextEncoder();
      const syntheticStream = new ReadableStream({
        start(controller) {
          // Send one big chunk representing the text properly escaped
          const payload = JSON.stringify({ choices: [{ delta: { content: text } }] });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          controller.close();
        }
      });
      response = new Response(syntheticStream, { 
        headers: { 'Content-Type': 'text/event-stream' } 
      });
    }

    if (effectiveStream && response instanceof Response) {
      // Return streaming response — intercept to strip MEMORY tags before they reach the user
      const rawStream = response.body!;
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      let streamBuffer = '';
      let fullStreamContent = '';

      (async () => {
        const reader = rawStream.getReader();
        const writer = writable.getWriter();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              // Flush any remaining buffer, stripping memory tags
              if (streamBuffer) {
                const cleaned = streamBuffer.replace(/\[MEMORY:[^\]]+\]/g, '').trimEnd();
                if (cleaned) await writer.write(encoder.encode(cleaned));
              }
              // Save memories from full content after stream ends
              if (fullStreamContent.includes('[MEMORY:') && userId) {
                extractAndSaveMemories(supabase, userId, fullStreamContent).catch(err =>
                  console.error('[ayn-unified] Stream memory extraction failed:', err)
                );
              }
              break;
            }
            const chunk = decoder.decode(value, { stream: true });
            fullStreamContent += chunk;
            streamBuffer += chunk;

            // Process complete SSE events from buffer
            let newlineIdx: number;
            while ((newlineIdx = streamBuffer.indexOf('\n')) !== -1) {
              const line = streamBuffer.slice(0, newlineIdx + 1);
              streamBuffer = streamBuffer.slice(newlineIdx + 1);
              // Strip memory tags from each line before forwarding
              const cleaned = line.replace(/\[MEMORY:[^\]]+\]/g, '');
              await writer.write(encoder.encode(cleaned));
            }
          }
        } catch (e) {
          console.error('[ayn-unified] Stream processing error:', e);
        } finally {
          writer.close();
        }
      })();

      return new Response(readable, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'X-Model-Used': 'AYN',
          'X-Was-Fallback': 'false'
        }
      });
    }

    // Non-streaming response
    let responseContent = (response as { content: string }).content;
    
    // === AUTO-EXECUTE TRADE: Parse EXECUTE_TRADE from AI response ===
    const tradeMatch = responseContent.match(/EXECUTE_TRADE:\s*(\{[\s\S]*?\})\s*$/m);
    let tradeResult = null;
    if (tradeMatch) {
      try {
        const tradeParams = JSON.parse(tradeMatch[1]);
        // Enrich with scan context if AI didn't include marketContext
        if (!tradeParams.marketContext && scanResults?.opportunities?.length > 0) {
          const matchedOpp = scanResults.opportunities.find((o: any) => o.ticker === tradeParams.ticker);
          if (matchedOpp) {
            tradeParams.marketContext = {
              score: matchedOpp.score,
              signals: matchedOpp.signals,
              volume24h: matchedOpp.volume24h,
              priceChange24h: matchedOpp.priceChange24h,
            };
          }
        }
        console.log('[AUTO-TRADE] AI wants to execute:', JSON.stringify(tradeParams));
        
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const tradeRes = await fetch(`${supabaseUrl}/functions/v1/ayn-open-trade`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(tradeParams),
        });
        
        if (tradeRes.ok) {
          tradeResult = await tradeRes.json();
          if (tradeResult.opened) {
            // Remove the raw EXECUTE_TRADE line and append confirmation
            responseContent = responseContent.replace(/EXECUTE_TRADE:\s*\{[\s\S]*?\}\s*$/m, '').trim();
            responseContent += `\n\n✅ Position opened successfully. Trade ID: ${tradeResult.trade?.id?.substring(0, 8) || 'confirmed'}\nTracking live on Performance tab.`;
            console.log('[AUTO-TRADE] ✅ Trade opened:', tradeResult.summary);
          } else {
            responseContent = responseContent.replace(/EXECUTE_TRADE:\s*\{[\s\S]*?\}\s*$/m, '').trim();
            responseContent += `\n\n⚠️ Trade not opened: ${tradeResult.reason}`;
            console.log('[AUTO-TRADE] Trade skipped:', tradeResult.reason);
          }
        } else {
          const errText = await tradeRes.text();
          console.error('[AUTO-TRADE] Trade function error:', errText);
          responseContent = responseContent.replace(/EXECUTE_TRADE:\s*\{[\s\S]*?\}\s*$/m, '').trim();
          responseContent += `\n\n⚠️ Could not execute trade right now. Try again.`;
        }
      } catch (e) {
        console.error('[AUTO-TRADE] Failed to parse/execute:', e);
        responseContent = responseContent.replace(/EXECUTE_TRADE:\s*\{[\s\S]*?\}\s*$/m, '').trim();
      }
    }

    // === SAFETY NET: Intercept hallucinated tool calls ===
    if (responseContent && /["']?action["']?\s*:\s*["']generate_image["']/.test(responseContent)) {
      console.log('[ayn-unified] Safety net: intercepted hallucinated image tool call');
      try {
        const promptMatch = responseContent.match(/["'](?:prompt|action_input|text)["']\s*:\s*["']([^"']+)["']/);
        const imagePrompt = promptMatch?.[1] || lastMessage;
        const { imageUrl: rawImgUrl, revisedPrompt } = await generateImage(imagePrompt);
        const imageUrl = await uploadImageIfDataUrl(rawImgUrl, userId);
        return new Response(JSON.stringify({
          content: revisedPrompt,
          imageUrl,
          revisedPrompt,
          model: 'AYN',
          wasFallback,
          intent: 'image'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (imgErr) {
        console.error('[ayn-unified] Safety net image generation failed:', imgErr);
      }
    }
    
    // Extract & strip MEMORY tags from AI response (zero extra API cost)
    if (!isInternalCall && responseContent.includes("[MEMORY:")) {
      extractAndSaveMemories(supabase, userId, responseContent).catch(err =>
        console.error("[ayn-unified] Memory extraction failed:", err)
      );
      responseContent = responseContent.replace(/\[MEMORY:[^\]]+\]/g, "").trim();
    }

    const detectedEmotion = detectResponseEmotion(responseContent);
    const userEmotion = detectUserEmotion(lastMessage);
    
    return new Response(JSON.stringify({
      content: responseContent,
      model: 'AYN',
      wasFallback,
      intent,
      emotion: detectedEmotion,
      userEmotion,
      ...(scanResults?.opportunities ? { scanResults: scanResults.opportunities } : {}),
      ...(tradeResult?.opened ? { tradeOpened: true, tradeId: tradeResult.trade?.id } : {})
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('AYN Unified error:', error);
    
    // Return friendly fallback message
    return new Response(JSON.stringify({
      content: "sorry, having some issues right now. try again in a sec?",
      error: error instanceof Error ? error.message : 'Unknown error',
      fallback: true
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
