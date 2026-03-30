import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { searchWeb } from "../_shared/firecrawlHelper.ts";
import { sanitizeForPrompt } from "../_shared/sanitizeFirecrawl.ts";
import { INJECTION_GUARD } from "../_shared/sanitizePrompt.ts";
import { uploadImageToStorage } from "../_shared/storageUpload.ts";
import {
  getFullKnowledgeBase,
  getCompactKnowledge,
  calculatePatternReliability,
  CHART_PATTERNS,
  CANDLESTICK_PATTERNS,
  TRADING_PSYCHOLOGY,
} from "./tradingKnowledge.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

// ─── Step 1: Vision Analysis (Enhanced with Knowledge Base Checklist) ───
async function analyzeChartImage(imageUrl: string, apiKey: string) {
  console.log('[chart-analyzer] Step 1: Gemini Vision analysis with knowledge base checklist');

  const compactKnowledge = getCompactKnowledge('both');

  const prompt = `## TRADING KNOWLEDGE BASE (PRIMARY REFERENCE)
${compactKnowledge}

---

You are a professional technical analyst. Analyze this trading chart image using ONLY the patterns and indicators listed above in the knowledge base.

**CHECK PATTERNS IN THIS PRIORITY ORDER:**

**FIRST: Chart Patterns** (these show overall structure)
- Bull flag = sharp upward move (pole) + tight downward/sideways consolidation (flag body)
- Bear flag = sharp downward move + tight upward consolidation
- Ascending triangle = flat resistance + rising support (minimum 3 touches each)
- Descending triangle = flat support + falling resistance
- Symmetrical triangle = converging trendlines (lower highs + higher lows)
- Head and shoulders = left shoulder, head (higher peak), right shoulder (similar to left)
- Inverse H&S = left trough, head (lower trough), right trough
- Bull/Bear pennant = sharp move + converging triangle consolidation
- Wedge = both trendlines sloping same direction but converging
- Double top/bottom = two peaks/troughs at similar levels
- Cup and handle = rounded bottom + small consolidation at resistance

**THEN: Candlestick Patterns** (analyze last 5-10 candles for entry/exit signals)
- Bullish engulfing = large green candle completely covers prior red candle body
- Bearish engulfing = large red candle completely covers prior green candle body
- Hammer = small body at top, long lower wick (2-3x body size), appears after downtrend
- Shooting star = small body at bottom, long upper wick, appears after uptrend
- Doji = open ≈ close (indecision candle)
- Morning star = large red → small body → large green (three candle reversal)
- Evening star = large green → small body → large red

**THEN: Volume Behavior**
- Is volume increasing or decreasing over recent candles?
- Volume spike = 2x+ average volume bar height
- Calculate approximate volume ratio: current volume / recent average
- Spikes often mark: reversals (capitulation), breakouts (confirmation), or false moves
- Note WHERE spikes occur (at support, resistance, or breakout point)
- Does volume confirm the pattern? (e.g., decreasing volume during flag = bullish confirmation)

**FINALLY: Support/Resistance and Trend**
- Support = horizontal levels where price bounced up (minimum 2 touches)
- Resistance = horizontal levels where price was rejected down (minimum 2 touches)
- Bullish trend = higher highs AND higher lows
- Bearish trend = lower highs AND lower lows
- Sideways = ranging between horizontal levels

**CONFIDENCE CALIBRATION (MANDATORY):**
- HIGH (score 70-90): Textbook pattern, all rules met, volume confirms
- MEDIUM (score 50-69): Pattern present but not perfect (e.g., flag too steep, weak volume)
- LOW (score 30-49): Questionable pattern or mixed signals

**STRICT RULES:**
- If score < 70, confidence MUST be "MEDIUM" or "LOW" (NEVER "HIGH")
- If score >= 70, confidence MUST be "HIGH"
- If score < 50, confidence MUST be "LOW"
- If volume confirms pattern, add +10 to base score (may promote MEDIUM to HIGH)

**PATTERN LIMIT: Maximum 3 patterns per analysis.**
If you identify 4+ patterns, only report the 3 with HIGHEST confidence.
Reason: Too many patterns causes confusion and contradictory signals.

**CRITICAL RULES:**
- Only identify patterns that exist in the knowledge base above
- Use exact pattern names from the knowledge base (e.g., "bull_flag", "bullish_engulfing", "ascending_triangle")
- If no clear pattern matches knowledge base, say "no clear patterns detected" but still analyze trend and levels
- **Describe WHY you identified each pattern** (cite specific visual evidence from the chart)

Return ONLY valid JSON (no markdown, no code fences) with exactly this structure:
{
  "ticker": "the asset symbol visible on chart (e.g. AAPL, BTC/USDT, EUR/USD). If unclear, use UNKNOWN",
  "assetType": "one of: stock, crypto, forex, commodity, index",
  "timeframe": "detected chart timeframe e.g. 1m, 5m, 15m, 1H, 4H, Daily, Weekly, Monthly. If unclear, use unknown",
  "currentPrice": null,
  "trend": "bullish, bearish, or sideways",
  "trendReasoning": "explain the HH/HL or LH/LL structure you see, or why sideways",
  "patterns": [
    {
      "name": "exact_pattern_name_from_knowledge_base",
      "type": "BULLISH" | "BEARISH" | "NEUTRAL",
      "confidence": "HIGH" | "MEDIUM" | "LOW",
      "score": 70,
      "reasoning": "describe what you see in the chart that matches this pattern",
      "location": "where on chart (e.g., 'forming at current resistance', 'at support level')"
    }
  ],
  "support": [0.0],
  "resistance": [0.0],
  "volume": {
    "trend": "increasing" | "decreasing" | "stable",
    "currentRatio": 1.0,
    "spikes": "describe any volume spikes and their locations relative to price action",
    "significance": "does volume confirm patterns? explain how"
  },
  "indicators": {
    "rsi": null,
    "macd": null,
    "movingAverages": null,
    "volume": null,
    "other": null
  },
  "technicalSummary": "2-3 sentences describing what the chart shows overall"
}

Be specific with price levels. If you can see indicator values, include them. If not visible, set to null.`;

  const res = await fetch(AI_GATEWAY, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }],
      max_tokens: 3000,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vision API failed [${res.status}]: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Detect non-chart image responses before attempting JSON parse
  const notChartPatterns = [
    /not a.{0,20}(trading |price |stock )?chart/i,
    /cannot.{0,20}(apply|perform).{0,20}(technical )?analysis/i,
    /photograph|selfie|screenshot of.{0,10}(a |an )?(app|website|desktop)/i,
    /no.{0,10}(candlestick|price action|trading data)/i,
    /does not (appear|seem|look).{0,20}(chart|financial|trading)/i,
    /not.{0,10}(a |an )?(financial|technical|stock market)/i,
  ];
  if (notChartPatterns.some(p => p.test(content))) {
    console.log('[chart-analyzer] Non-chart image detected:', content.substring(0, 100));
    throw new Error('NOT_A_CHART');
  }

  const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    console.error('[chart-analyzer] Failed to parse vision response:', content);
    throw new Error('NOT_A_CHART');
  }
}

// ─── Step 1.5: Fetch Pionex Market Data ───
async function fetchPionexData(ticker: string, timeframe: string, assetType: string) {
  console.log(`[chart-analyzer] Step 1.5: Fetching Pionex market data for ${ticker} (${timeframe})`);

  // Only fetch for crypto assets — Pionex is a crypto exchange
  if (assetType !== 'crypto' || ticker === 'UNKNOWN') {
    console.log('[chart-analyzer] Skipping Pionex: not crypto or unknown ticker');
    return null;
  }

  const apiKey = Deno.env.get('PIONEX_API_KEY');
  const apiSecret = Deno.env.get('PIONEX_API_SECRET');
  if (!apiKey || !apiSecret) {
    console.log('[chart-analyzer] Skipping Pionex: API keys not configured');
    return null;
  }

  // Map ticker to Pionex symbol format
  const symbol = ticker.includes('_USDT') ? ticker.toUpperCase() : `${ticker.replace(/\/USDT|\/USD|\/BUSD/i, '').toUpperCase()}_USDT`;
  console.log('[DEBUG chart-analyzer] Ticker mapping:', ticker, '->', cleanTicker, '->', symbol);

  // Map timeframe to Pionex interval
  const intervalMap: Record<string, string> = {
    '1m': '1M', '5m': '5M', '15m': '15M', '30m': '30M',
    '1H': '60M', '4H': '4H', '8H': '8H', '12H': '12H',
    'Daily': '1D', 'Weekly': '1D', 'Monthly': '1D',
    'unknown': '60M',
  };
  const interval = intervalMap[timeframe] || '60M';

  // HMAC-SHA256 signing helper
  async function signRequest(method: string, path: string, params: Record<string, string>): Promise<{ signature: string; queryString: string }> {
    const sortedKeys = Object.keys(params).sort();
    const queryString = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
    const message = `${method}${path}?${queryString}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(apiSecret!),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
    const signature = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    return { signature, queryString };
  }

  try {
    const baseUrl = 'https://api.pionex.com';
    const timestamp = Date.now().toString();

    // Fetch klines (last 100 candles)
    const klinesSigned = await signRequest('GET', '/api/v1/market/klines', { symbol, interval, limit: '100', timestamp });
    const klinesRes = await fetch(`${baseUrl}/api/v1/market/klines?${klinesSigned.queryString}`, {
      headers: {
        'PIONEX-KEY': apiKey,
        'PIONEX-SIGNATURE': klinesSigned.signature,
      },
    });

    if (!klinesRes.ok) {
      const errText = await klinesRes.text();
      console.warn(`[chart-analyzer] Pionex klines failed [${klinesRes.status}]: ${errText}`);
      return null;
    }

    const klinesData = await klinesRes.json();
    console.log('[DEBUG chart-analyzer] Raw klines response:', JSON.stringify(klinesData).slice(0, 500));

    // Fetch ticker (24h stats)
    const tickerSigned = await signRequest('GET', '/api/v1/market/tickers', { symbol, timestamp });
    const tickerRes = await fetch(`${baseUrl}/api/v1/market/tickers?${tickerSigned.queryString}`, {
      headers: {
        'PIONEX-KEY': apiKey,
        'PIONEX-SIGNATURE': tickerSigned.signature,
      },
    });

    let tickerInfo: any = null;
    if (tickerRes.ok) {
      const tickerData = await tickerRes.json();
      console.log('[DEBUG chart-analyzer] Raw ticker response:', JSON.stringify(tickerData).slice(0, 500));
      const tickers = tickerData?.data?.tickers || [];
      tickerInfo = tickers.find((t: any) => t.symbol === symbol) || tickers[0] || null;
    } else {
      const errText = await tickerRes.text();
      console.warn(`[chart-analyzer] Pionex ticker failed [${tickerRes.status}]: ${errText}`);
    }

    // Parse klines into OHLCV array
    const klines = klinesData?.data?.klines || [];
    const lastCandles = klines.slice(-10).map((k: any) => ({
      time: k.time,
      open: parseFloat(k.open),
      high: parseFloat(k.high),
      low: parseFloat(k.low),
      close: parseFloat(k.close),
      volume: parseFloat(k.volume),
    }));

    const latestCandle = klines.length > 0 ? klines[klines.length - 1] : null;
    const currentPrice = latestCandle ? parseFloat(latestCandle.close) : null;
    console.log('[DEBUG chart-analyzer] Symbol:', symbol, 'Price extracted:', currentPrice, 'From candle:', JSON.stringify(latestCandle));

    // Calculate 24h change from ticker data
    const open24h = tickerInfo ? parseFloat(tickerInfo.open) : null;
    const change24h = (currentPrice && open24h && open24h > 0)
      ? ((currentPrice - open24h) / open24h * 100).toFixed(2) + '%'
      : null;

    const result = {
      symbol,
      currentPrice,
      change24h,
      high24h: tickerInfo ? parseFloat(tickerInfo.high) : null,
      low24h: tickerInfo ? parseFloat(tickerInfo.low) : null,
      volume24h: tickerInfo ? parseFloat(tickerInfo.volume) : null,
      quoteVolume24h: tickerInfo ? parseFloat(tickerInfo.amount) : null,
      lastCandles,
      totalKlines: klines.length,
      interval,
    };

    console.log(`[chart-analyzer] Pionex data: ${symbol} @ ${currentPrice}, 24h: ${change24h}, ${klines.length} candles`);
    return result;
  } catch (err) {
    console.warn('[chart-analyzer] Pionex fetch error:', err);
    return null;
  }
}

// ─── Market Intelligence from Pionex Data ───
function extractMarketIntelligence(pionexData: any): { text: string; context: any } {
  if (!pionexData) return { text: '', context: null };

  const intelligence: string[] = [];
  const open24h = pionexData.high24h && pionexData.low24h ? null : null; // We use change24h directly
  const priceChange24h = pionexData.change24h ? parseFloat(pionexData.change24h) : null;
  const volume24h = pionexData.quoteVolume24h || pionexData.volume24h || null;

  // 1. Price momentum
  if (priceChange24h !== null) {
    intelligence.push(`24h Price Change: ${priceChange24h > 0 ? '+' : ''}${priceChange24h.toFixed(2)}%`);
    if (Math.abs(priceChange24h) > 10) {
      intelligence.push(`⚠️ HIGH VOLATILITY: ${Math.abs(priceChange24h).toFixed(0)}% move in 24h`);
    }
  }

  // 2. Volume
  if (volume24h) {
    intelligence.push(`24h Volume: $${(volume24h / 1e6).toFixed(1)}M`);
    if (volume24h < 100000) {
      intelligence.push(`⚠️ VERY LOW VOLUME (<$100K) - Liquidity risk`);
    }
  }

  // 3. Session timing
  const now = new Date();
  const hourUTC = now.getUTCHours();
  let session = '';
  if (hourUTC >= 0 && hourUTC < 8) session = 'Asian Session (Low volume)';
  else if (hourUTC >= 8 && hourUTC < 13) session = 'London Session (Volume picking up)';
  else if (hourUTC >= 13 && hourUTC < 21) session = 'New York Session (Highest volume)';
  else session = 'After Hours (Lower liquidity)';
  intelligence.push(`Current Session: ${session}`);

  // 4. Weekend warning
  const dayOfWeek = now.getUTCDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (isWeekend) {
    intelligence.push(`⚠️ WEEKEND TRADING: Lower liquidity, avoid large positions`);
  }

  const volatility: 'high' | 'normal' = (priceChange24h !== null && Math.abs(priceChange24h) > 10) ? 'high' : 'normal';

  const text = intelligence.length > 0 ? `
=== MARKET INTELLIGENCE ===
${intelligence.join('\n')}
Use these conditions when evaluating the trade setup.
=== END MARKET INTELLIGENCE ===
` : '';

  return {
    text,
    context: {
      priceChange24h: priceChange24h,
      volume24h: volume24h,
      session,
      isWeekend,
      volatility,
    }
  };
}

// ─── Scam Signal Detection ───
function checkScamSignals(ticker: string, pionexData: any): {
  isHighRisk: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  flags: string[];
} {
  const flags: string[] = [];
  let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

  const volume24h = pionexData?.quoteVolume24h || pionexData?.volume24h || 0;
  const priceChange24h = pionexData?.change24h ? parseFloat(pionexData.change24h) : 0;

  if (volume24h > 0 && volume24h < 100000) {
    flags.push('Very low volume (<$100K/day) - Liquidity risk');
    severity = 'HIGH';
  }

  if (Math.abs(priceChange24h) > 50) {
    flags.push('Extreme price movement (>50% in 24h) - Possible manipulation');
    severity = severity === 'HIGH' ? 'CRITICAL' : 'HIGH';
  }

  const suspiciousPatterns = [/MOON/i, /SAFE/i, /ELON/i, /\d{2,}$/];
  const cleanTicker = ticker.replace(/\/USDT|\/USD|_USDT/i, '');
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(cleanTicker)) {
      flags.push('Suspicious ticker pattern - Common in scam tokens');
      severity = severity === 'LOW' ? 'MEDIUM' : severity;
      break;
    }
  }

  return {
    isHighRisk: severity === 'CRITICAL' || severity === 'HIGH',
    severity,
    flags,
  };
}

// ─── Step 2: News Fetch via Firecrawl (with caching + filtering) ───
async function fetchTickerNews(ticker: string, assetType: string) {
  console.log(`[chart-analyzer] Step 2: Fetching news for ${ticker} (${assetType})`);
  
  if (ticker === 'UNKNOWN') {
    return { headlines: [], raw: [] };
  }

  // Check 30-minute cache first
  try {
    const supabase = getServiceClient();
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: cached } = await supabase
      .from('news_cache')
      .select('news_data')
      .eq('ticker', ticker)
      .gte('created_at', thirtyMinAgo)
      .single();
    
    if (cached?.news_data) {
      console.log(`[chart-analyzer] Using cached news for ${ticker}`);
      return cached.news_data as any;
    }
  } catch {
    // Cache miss or error, proceed with fetch
  }

  const typeLabel = assetType === 'crypto' ? 'cryptocurrency' : assetType;
  const query = `${ticker} ${typeLabel} news latest`;

  const result = await searchWeb(query, { limit: 8 });
  
  if (!result.success || !result.data?.length) {
    console.warn('[chart-analyzer] No news found:', result.error);
    return { headlines: [], raw: [] };
  }

  // Filter out chart/price index pages and generic non-news pages
  const filtered = result.data.filter((d: any) => {
    const title = (d.title || '').toLowerCase();
    const url = (d.url || '').toLowerCase();
    
    // Filter chart/price pages
    const isChartPage = title.includes('price chart') || title.includes('price index') || 
      title.includes('to usd chart') || title.includes('live chart');
    const isPriceTracker = /^[\w\/]+ price/i.test(d.title || '') && 
      !title.includes('surges') && !title.includes('drops') && 
      !title.includes('crashes') && !title.includes('jumps') && !title.includes('falls');
    
    // Filter generic non-news pages
    const isGenericPage = title.includes('converter') || title.includes('calculator') || 
      title.includes('market cap') || title.includes('token info') || title.includes('coin info');
    
    // Filter known non-news domains (unless path contains /news or /article)
    const isNonNewsDomain = (url.includes('coinmarketcap.com') || url.includes('coingecko.com')) &&
      !url.includes('/news') && !url.includes('/article');
    
    // Filter generic news aggregator titles
    const isGenericNews = title.includes('latest stock news') || title.includes('latest news update') ||
      title.includes('price today') || title.includes('live price');
    
    // Filter very short titles (usually generic pages)
    const isTooShort = (d.title || '').length < 20;
    
    return !isChartPage && !isPriceTracker && !isGenericPage && !isGenericNews && !isNonNewsDomain && !isTooShort;
  });

  console.log(`[chart-analyzer] Filtered ${result.data.length - filtered.length} non-news results`);

  const limitedNews = filtered.length < 3;
  if (limitedNews) {
    console.log(`[chart-analyzer] Warning: Only ${filtered.length} news items after filtering - sentiment may not be reliable`);
  }

  const newsResult = {
    headlines: filtered.map((d: any) => sanitizeForPrompt(d.title || '', 200)).filter(Boolean),
    raw: filtered.map((d: any) => ({
      title: sanitizeForPrompt(d.title || '', 200),
      url: d.url,
      description: sanitizeForPrompt(d.description || '', 300),
    })),
    limitedNews,
  };

  // Cache the result for 30 minutes
  try {
    const supabase = getServiceClient();
    await supabase.from('news_cache').upsert({
      ticker,
      news_data: newsResult,
      created_at: new Date().toISOString(),
    }, { onConflict: 'ticker' });
    console.log(`[chart-analyzer] Cached news for ${ticker}`);
  } catch (e) {
    console.warn('[chart-analyzer] Failed to cache news:', e);
  }

  return newsResult;
}

// ─── Step 3: Sentiment + Prediction (Enhanced with Psychology & Context) ───
async function generatePrediction(
  technical: Record<string, unknown>,
  news: { headlines: string[]; raw: Array<{ title: string; url: string; description: string }> },
  apiKey: string,
  pionexData?: any,
  marketIntelligence?: string
) {
  console.log('[chart-analyzer] Step 3: Generating prediction with psychology & context-adjusted scoring');

  const detectedAssetType = (technical as any).assetType || 'stock';
  const mappedAssetType: 'stock' | 'crypto' | 'both' = 
    detectedAssetType === 'crypto' ? 'crypto' : 
    detectedAssetType === 'stock' ? 'stock' : 'both';
  const tradingContext = getFullKnowledgeBase(mappedAssetType);

  // Calculate context-adjusted scores for each pattern
  const patterns = (technical as any).patterns || [];
  const currentPrice = (technical as any).currentPrice;
  const support = (technical as any).support || [];
  const resistance = (technical as any).resistance || [];
  const volumeObj = (technical as any).volume;
  const volumeRatio = (volumeObj && typeof volumeObj === 'object') ? (volumeObj.currentRatio || 1.0) : 1.0;
  const timeframe = (technical as any).timeframe || 'unknown';
  const trend = (technical as any).trend || 'sideways';

  const adjustedPatterns = Array.isArray(patterns)
    ? patterns.map((p: any) => {
        if (typeof p !== 'object' || !p.name) return p;
        
        const patternDef = CHART_PATTERNS[p.name] || CANDLESTICK_PATTERNS[p.name];
        const assetCtx: 'stock' | 'crypto' = mappedAssetType === 'both' ? 'stock' : mappedAssetType;
        
        const isNearSupport = currentPrice && support.length > 0 && 
          support.some((s: number) => Math.abs(currentPrice - s) / currentPrice < 0.02);
        const isNearResistance = currentPrice && resistance.length > 0 && 
          resistance.some((r: number) => Math.abs(currentPrice - r) / currentPrice < 0.02);

        if (patternDef && patternDef.successRate) {
          const adjusted = calculatePatternReliability(patternDef, {
            timeframe,
            assetType: assetCtx,
            volumeRatio,
            atSupport: isNearSupport,
            atResistance: isNearResistance,
            inTrend: trend !== 'sideways'
          });
          
          return {
            ...p,
            adjustedScore: adjusted.adjustedScore,
            adjustedReliability: adjusted.adjustedReliability,
            adjustments: adjusted.breakdown,
            baseSuccessRate: patternDef.successRate.overall,
            failureMode: patternDef.failureMode || null,
            invalidationLevel: patternDef.invalidation || null,
            source: patternDef.successRate.source,
          };
        }
        
        return p;
      })
    : [];

  // Calculate technical score from adjusted pattern data
  const scoredPatterns = adjustedPatterns.filter((p: any) => typeof p === 'object' && (p.adjustedScore || p.score));
  const technicalScore = scoredPatterns.length > 0
    ? Math.round(scoredPatterns.reduce((sum: number, p: any) => sum + (p.adjustedScore || p.score || 50), 0) / scoredPatterns.length)
    : 40;

  console.log(`[chart-analyzer] Technical score from ${scoredPatterns.length} patterns: ${technicalScore}`);

  // Determine if psychology warnings should be included
  const shouldIncludePsychology = volumeRatio >= 2.0 || 
    (currentPrice && (
      support.some((s: number) => Math.abs(currentPrice - s) / currentPrice < 0.02) ||
      resistance.some((r: number) => Math.abs(currentPrice - r) / currentPrice < 0.02)
    ));

  const psychologyContext = shouldIncludePsychology ? `

## 🧠 PSYCHOLOGY CONTEXT (Include psychologyWarnings in response)
Market cycle emotions: ${JSON.stringify(TRADING_PSYCHOLOGY.market_psychology.market_cycle_emotions)}
Common biases: Confirmation bias, FOMO, Loss aversion, Gamblers fallacy, Recency bias
Why retail loses: ${JSON.stringify(TRADING_PSYCHOLOGY.market_psychology.why_retail_loses)}

Assess: What stage of the market cycle? What emotions are driving price? What mistakes will traders make?
` : `

## Psychology: Skip psychologyWarnings (normal price action, no extremes detected). Set psychologyWarnings to null.
`;

  const prompt = `${marketIntelligence || ''}

## TRADING KNOWLEDGE BASE
${tradingContext}

---

You are a DIRECT TRADING ADVISOR. Generate CLEAR, ACTIONABLE signals with exact parameters. Be DECISIVE — no hedging, no "consider", no "if you decide to enter". Give a direct BUY, SELL, or WAIT signal.

## Technical Analysis (from chart vision - weight: 60%)
${JSON.stringify(technical, null, 2)}

## Context-Adjusted Pattern Scores
${JSON.stringify(adjustedPatterns, null, 2)}

**Pre-calculated technical score: ${technicalScore}** (based on context-adjusted pattern scores)
**Current Price: ${currentPrice || 'unknown'}**
**Support Levels: ${JSON.stringify(support)}**
**Resistance Levels: ${JSON.stringify(resistance)}**
**Volume Ratio: ${volumeRatio}x average**
${pionexData ? `
## 📊 Live Market Data (from Pionex API)
**Current Price: ${pionexData.currentPrice}**
**24h Change: ${pionexData.change24h || 'N/A'}**
**24h High/Low: ${pionexData.high24h || 'N/A'} / ${pionexData.low24h || 'N/A'}**
**24h Volume: ${pionexData.quoteVolume24h ? pionexData.quoteVolume24h.toLocaleString() + ' USDT' : 'N/A'}**
**Last ${pionexData.lastCandles?.length || 0} candles (${pionexData.interval}): ${JSON.stringify(pionexData.lastCandles)}**

IMPORTANT: Use the Pionex live data to CROSS-REFERENCE the visual patterns from the chart image.
- Use exact Pionex prices for entry/stop/TP levels instead of estimated chart values
- Volume from Pionex should validate or invalidate the volume analysis from the image
${(() => {
  const chartPrice = currentPrice;
  const livePrice = pionexData.currentPrice;
  if (chartPrice && livePrice && chartPrice > 0) {
    const diffPercent = Math.abs(livePrice - chartPrice) / chartPrice * 100;
    if (diffPercent > 5) {
      return `
⚠️ STALE CHART WARNING: The uploaded chart appears OUTDATED.
- Chart shows: ~${chartPrice}
- Live price: ${livePrice} (${diffPercent.toFixed(1)}% difference)

DEFAULT BEHAVIOR: Use the LIVE Pionex price (${livePrice}) for ALL entry/SL/TP calculations.
Tell the user clearly: "Your chart appears outdated (shows ~${chartPrice}, but the live price is ${livePrice}).
I've based my analysis on the current live price. If you want me to analyze purely based on the chart image, just let me know."
DO NOT silently use the old chart price. The live price is the truth.`;
    }
  }
  return '';
})()}
` : ''}

## Recent News Headlines (weight: 40%)
${news.headlines.length > 0 ? news.headlines.map((h: string, i: number) => `${i + 1}. ${h}`).join('\n') : 'No recent news found.'}
${psychologyContext}
---

## SCORING RULES:
1. Combined score = (technicalScore × 0.6) + (newsSentimentScore × 0.4)
   - newsSentimentScore: map overallSentiment (-1 to +1) to (0 to 100) scale
2. Signal determination:
   - BUY: combinedScore > 55 AND technicalScore >= 60
   - SELL: combinedScore < 45 AND technicalScore <= 40
   - WAIT: everything else (including when confidence < 50%)
3. If confidence < 50% → signal MUST be "WAIT" regardless of other factors
4. If technical and news conflict, technical takes priority (60% weight)
5. **Confidence cap: 95.** Very high conviction setups can reach 95%.

## ENTRY TIMING RULES:
- If signal is SELL and currentPrice is near a support level → status "WAIT", risk of bounce
- If signal is BUY and currentPrice is near a resistance level → status "WAIT", risk of rejection
- If price is at ideal entry zone away from conflicting levels → status "READY"
- "Near" means within 1-2% of the level
- Always provide both aggressive and conservative options

## CONSISTENCY RULES (CRITICAL):
- entry_zone, entryTiming.aggressive, entryTiming.conservative, and actionablePlan MUST all reference the SAME price levels
- stop_loss and take_profit must be consistent across all sections

## BOT CONFIGURATION RULES:
- Position size: 1-5% of account (higher confidence = higher position)
- Leverage: 1x-5x (match to confidence and volatility)
- Trailing stop: enable for trending setups, disable for range-bound
- Order type: LIMIT for entries at specific levels, MARKET for breakout entries

Return ONLY valid JSON (no markdown, no code fences):
{
  "newsSentiment": [
    {"headline": "...", "sentiment": 0.0, "impact": "high/medium/low"}
  ],
  "overallSentiment": 0.0,
  "signal": "BUY" | "SELL" | "WAIT",
  "confidence": 0,
  "technicalScore": ${technicalScore},
  "reasoning": "2 sentences max. State the signal and the key reason. No fluff.",
  "entry_zone": "price range or 'N/A'",
  "stop_loss": "price or 'N/A'",
  "take_profit": "price range or 'N/A'",
  "risk_reward": "ratio or 'N/A'",
  "tradingSignal": {
    "action": "BUY" | "SELL" | "WAIT",
    "reasoning": "One-line signal rationale",
    "entry": {
      "price": 0.0,
      "orderType": "LIMIT" | "MARKET",
      "timeInForce": "GTC"
    },
    "stopLoss": {
      "price": 0.0,
      "percentage": 0.0
    },
    "takeProfits": [
      { "level": 1, "price": 0.0, "percentage": 0.0, "closePercent": 50 },
      { "level": 2, "price": 0.0, "percentage": 0.0, "closePercent": 50 }
    ],
    "riskReward": 0.0,
    "botConfig": {
      "positionSize": 2,
      "leverage": 1,
      "trailingStop": {
        "enabled": false,
        "activateAt": "TP1",
        "trailPercent": 1.0
      }
    },
    "invalidation": {
      "price": 0.0,
      "condition": "Describe what invalidates this trade"
    }
  },
  "confidenceBreakdown": {
    "technicalScore": ${technicalScore},
    "newsScore": 0,
    "conflictPenalty": 0,
    "calculation": "Technical (X) × 60% + News (Y) × 40% + penalties = Z%",
    "explanation": "One sentence."
  },
  "entryTiming": {
    "status": "READY" | "WAIT",
    "reason": "One sentence.",
    "aggressive": "One line with price levels only",
    "conservative": "One line with price levels only"
  },
  "actionablePlan": {
    "current": "One line.",
    "ifBullishBreakout": "One line with levels.",
    "ifBearishBreakdown": "One line with levels."
  },
  "riskManagement": "One sentence.",
  "patternBreakdown": [
    {
      "name": "pattern_name",
      "baseScore": 68,
      "adjustments": ["Timeframe 15m: -5%", "At support: +20%"],
      "finalScore": 78,
      "historicalSuccess": "68% overall, 78% with current context",
      "failureMode": "Breaks below support (32% of cases)",
      "invalidation": "Close below 0.044"
    }
  ],
  "psychologyWarnings": ${shouldIncludePsychology ? `{
    "marketStage": "optimism | excitement | thrill | euphoria | anxiety | denial | panic | capitulation",
    "crowdPosition": "early adopters | early majority | late majority | laggards",
    "emotionalDrivers": ["FOMO", "fear", "greed"],
    "commonMistakes": ["..."],
    "contrarian_insight": "Smart money is likely [doing opposite of crowd]"
  }` : 'null'},
  "disciplineReminders": {
    "positionSizing": "Max 10 words.",
    "stopLoss": "Max 10 words.",
    "emotionalCheck": "Max 10 words.",
    "invalidation": "Max 10 words."
  }
}

Rules:
- Sentiment scores: -1.0 (very bearish) to +1.0 (very bullish)
- Confidence: 0-95 (cap at 95)
- Be DIRECT and DECISIVE - give clear BUY/SELL/WAIT
- Include exact prices in tradingSignal for bot configuration
- If no news, base prediction purely on technicals
${INJECTION_GUARD}`;

  const res = await fetch(AI_GATEWAY, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 3500,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Prediction API failed [${res.status}]: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  try {
    return JSON.parse(jsonStr);
  } catch {
    console.error('[chart-analyzer] Failed to parse prediction:', content);
    throw new Error('Failed to parse prediction from AI');
  }
}

// ─── Step 4: Store in DB ───
async function storeAnalysis(
  userId: string,
  sessionId: string | null,
  imageUrl: string,
  technical: Record<string, unknown>,
  newsData: unknown[],
  prediction: Record<string, unknown>
) {
  console.log('[chart-analyzer] Step 4: Storing analysis in DB');
  const supabase = getServiceClient();

  const { data, error } = await supabase.from('chart_analyses').insert({
    user_id: userId,
    session_id: sessionId,
    image_url: imageUrl,
    ticker: (technical as any).ticker || null,
    asset_type: (technical as any).assetType || null,
    timeframe: (technical as any).timeframe || null,
    technical_analysis: technical,
    news_data: newsData,
    sentiment_score: (prediction as any).overallSentiment ?? null,
    prediction_signal: (prediction as any).signal || null,
    confidence: (prediction as any).confidence ?? null,
    prediction_details: prediction,
  }).select('id').single();

  if (error) {
    console.error('[chart-analyzer] DB insert failed:', error.message);
    return null;
  }
  return data?.id;
}

// ─── Main Handler ───
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub as string;

    // Parse request
    const { imageBase64, imageUrl: directImageUrl, sessionId } = await req.json();
    if (!imageBase64 && !directImageUrl) {
      return new Response(JSON.stringify({ error: 'imageBase64 or imageUrl is required' }), { status: 400, headers: corsHeaders });
    }

    // Upload image to storage
    console.log('[chart-analyzer] Preparing chart image...');
    const imageUrl = directImageUrl || await uploadImageToStorage(imageBase64, userId);

    // Step 1: Vision analysis (enhanced with knowledge base checklist)
    const technical = await analyzeChartImage(imageUrl, LOVABLE_API_KEY);

    // Step 2: News fetch
    const news = await fetchTickerNews(technical.ticker, technical.assetType);

    // Step 2.5: Pionex market data (crypto only, graceful fallback)
    const pionexData = await fetchPionexData(technical.ticker, technical.timeframe, technical.assetType);

    // Step 2.6: Extract market intelligence + scam detection from Pionex data
    const marketIntel = extractMarketIntelligence(pionexData);
    const scamCheck = checkScamSignals(technical.ticker, pionexData);
    let marketIntelText = marketIntel.text;
    if (scamCheck.isHighRisk) {
      marketIntelText += `\n⚠️ RISK FLAGS DETECTED:\n${scamCheck.flags.map(f => `- ${f}`).join('\n')}\nSeverity: ${scamCheck.severity}\n${scamCheck.severity === 'CRITICAL' ? 'RECOMMENDATION: DO NOT TRADE' : 'RECOMMENDATION: EXTREME CAUTION - Reduce position 75%'}\n`;
    }

    // Step 3: Sentiment + Prediction (enhanced with psychology & context + market data)
    const prediction = await generatePrediction(technical, news, LOVABLE_API_KEY, pionexData, marketIntelText);

    // Step 4: Store in DB
    const analysisId = await storeAnalysis(
      userId, sessionId || null, imageUrl, technical, news.raw, prediction
    );

    // Step 5: Build result (preserve rich pattern objects for frontend)
    const rawPatterns = technical.patterns || [];
    const richPatterns = Array.isArray(rawPatterns)
      ? rawPatterns.map((p: any) => {
          if (typeof p === 'object' && p.name) {
            return {
              name: p.name,
              type: p.type || 'NEUTRAL',
              confidence: p.confidence || 'MEDIUM',
              score: p.score || 50,
              reasoning: p.reasoning || '',
              location: p.location || '',
            };
          }
          return { name: String(p), type: 'NEUTRAL', confidence: 'MEDIUM', score: 50, reasoning: '', location: '' };
        })
      : [];

    // Build volume description from structured volume object (backward compat string)
    const volumeObj = (technical as any).volume;
    const volumeDesc = volumeObj && typeof volumeObj === 'object'
      ? `${volumeObj.trend || 'unknown'} volume. ${volumeObj.significance || ''} ${volumeObj.spikes || ''}`.trim()
      : (technical as any).indicators?.volume || null;

    // Structured volume analysis for frontend
    const volumeAnalysis = volumeObj && typeof volumeObj === 'object'
      ? { trend: volumeObj.trend || 'unknown', spikes: volumeObj.spikes || '', significance: volumeObj.significance || '' }
      : null;

    // Build key observations from technical summary + trend reasoning
    const keyObs = [
      (technical as any).technicalSummary,
      (technical as any).trendReasoning ? `Trend: ${(technical as any).trendReasoning}` : null,
    ].filter(Boolean).join(' ');

    // Build reasoning with actionable plan
    let reasoning = prediction.reasoning || '';
    if (prediction.actionablePlan) {
      const plan = prediction.actionablePlan;
      const planParts = [
        plan.current ? `\n\n📋 ${plan.current}` : '',
        plan.ifBullishBreakout ? `\n🟢 ${plan.ifBullishBreakout}` : '',
        plan.ifBearishBreakdown ? `\n🔴 ${plan.ifBearishBreakdown}` : '',
      ].filter(Boolean).join('');
      if (planParts) reasoning += planParts;
    }
    if (prediction.riskManagement) {
      reasoning += `\n\n⚠️ Risk: ${prediction.riskManagement}`;
    }

    const result = {
      ticker: technical.ticker,
      assetType: technical.assetType,
      timeframe: technical.timeframe,
      technical: {
        trend: technical.trend,
        patterns: richPatterns,
        support: technical.support || [],
        resistance: technical.resistance || [],
        indicators: {
          ...(technical.indicators || {}),
          volume: volumeDesc,
        },
        keyObservations: keyObs || (technical as any).keyObservations || '',
        ...(volumeAnalysis ? { volumeAnalysis } : {}),
      },
      news: news.raw.map((n, i) => ({
        ...n,
        sentiment: prediction.newsSentiment?.[i]?.sentiment ?? 0,
        impact: prediction.newsSentiment?.[i]?.impact ?? 'low',
      })),
      prediction: {
        signal: prediction.signal,
        confidence: Math.min(prediction.confidence || 0, 95), // Cap at 95
        timeframe: technical.timeframe,
        assetType: technical.assetType,
        reasoning,
        entry_zone: prediction.entry_zone,
        stop_loss: prediction.stop_loss,
        take_profit: prediction.take_profit,
        risk_reward: prediction.risk_reward,
        overallSentiment: prediction.overallSentiment,
        ...(prediction.entryTiming ? { entryTiming: prediction.entryTiming } : {}),
        ...(prediction.patternBreakdown ? { patternBreakdown: prediction.patternBreakdown } : {}),
        ...(prediction.psychologyWarnings ? { psychologyWarnings: prediction.psychologyWarnings } : {}),
        ...(prediction.disciplineReminders ? { disciplineReminders: prediction.disciplineReminders } : {}),
        ...(prediction.confidenceBreakdown ? { confidenceBreakdown: prediction.confidenceBreakdown } : {}),
        ...(prediction.tradingSignal ? { tradingSignal: prediction.tradingSignal } : {}),
      },
      imageUrl,
      analysisId: analysisId || null,
      disclaimer: 'Paper trading signals — tracked on AYN\'s live performance page.',
      ...(marketIntel.context ? { marketContext: marketIntel.context } : {}),
      ...(scamCheck.flags.length > 0 ? { scamWarning: scamCheck } : {}),
    };

    console.log('[chart-analyzer] ✅ Analysis complete for', technical.ticker, '| Signal:', prediction.signal, '| Confidence:', result.prediction.confidence);

    // Auto-open paper trade if signal is actionable
    const actionSignal = prediction.signal;
    const conf = result.prediction.confidence;
    if ((actionSignal === 'BUY' || actionSignal === 'SELL' || actionSignal === 'BULLISH' || actionSignal === 'BEARISH') && conf >= 60) {
      try {
        const tradingSignal = prediction.tradingSignal;
        const entryPrice = tradingSignal?.entry?.price || (prediction.entry_zone ? parseFloat(String(prediction.entry_zone).replace(/[^0-9.]/g, '')) : null);
        const stopLoss = tradingSignal?.stopLoss?.price || (prediction.stop_loss ? parseFloat(String(prediction.stop_loss).replace(/[^0-9.]/g, '')) : null);
        const tp1 = tradingSignal?.takeProfits?.[0]?.price || null;
        const tp2 = tradingSignal?.takeProfits?.[1]?.price || null;

        if (entryPrice && stopLoss && entryPrice > 0 && stopLoss > 0) {
          const serviceClient = getServiceClient();
          const tradeUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ayn-open-trade`;
          
          console.log('[chart-analyzer] Opening paper trade:', JSON.stringify({ ticker: technical.ticker, signal: actionSignal, entryPrice, stopLoss, tp1, tp2, confidence: conf }));
          const tradeRes = await fetch(tradeUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              ticker: technical.ticker,
              timeframe: technical.timeframe,
              signal: (actionSignal === 'BULLISH' ? 'BUY' : actionSignal === 'BEARISH' ? 'SELL' : actionSignal),
              entryPrice,
              stopLoss,
              takeProfit1: tp1,
              takeProfit2: tp2,
              confidence: conf,
              setupType: prediction.patternBreakdown?.[0]?.name || null,
              reasoning: prediction.reasoning || '',
              marketContext: result.marketContext || null,
              chartImageUrl: imageUrl || null,
            }),
          });
          const tradeResult = await tradeRes.text();
          console.log('[chart-analyzer] Paper trade result:', tradeRes.status, tradeResult);
        } else {
          console.log('[chart-analyzer] Skipping paper trade: missing entry/stop prices');
        }
      } catch (tradeErr) {
        console.warn('[chart-analyzer] Paper trade setup error (non-blocking):', tradeErr);
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[chart-analyzer] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';

    if (msg === 'NOT_A_CHART') {
      return new Response(JSON.stringify({
        error: "This doesn't appear to be a trading chart. Please upload a screenshot of a price chart (candlesticks, line chart, or bar chart) for analysis."
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
