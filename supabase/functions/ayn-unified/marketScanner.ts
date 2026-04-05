// marketScanner.ts — Technical indicator helpers for the enhanced market scanner
// Imported by ayn-unified/index.ts

export function scannerMean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

export function scannerStdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const avg = scannerMean(arr);
  return Math.sqrt(scannerMean(arr.map(n => Math.pow(n - avg, 2))));
}

export function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  const slice = closes.slice(-(period + 1));
  for (let i = 1; i < slice.length; i++) {
    const change = slice[i] - slice[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export function calculateEMA(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

export function calculateMACD(closes: number[]): { macd: number; signal: number } {
  if (closes.length < 26) return { macd: 0, signal: 0 };
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdValue = ema12 - ema26;

  // Build 9-bar MACD history for signal line
  const macdHistory: number[] = [];
  const startIdx = Math.max(0, closes.length - 9);
  for (let i = startIdx; i < closes.length; i++) {
    const slice = closes.slice(0, i + 1);
    if (slice.length < 26) { macdHistory.push(0); continue; }
    macdHistory.push(calculateEMA(slice, 12) - calculateEMA(slice, 26));
  }
  const signal = calculateEMA(macdHistory, 9);
  return { macd: macdValue, signal };
}

export function calculateBollingerBands(closes: number[], period = 20, multiplier = 2): {
  upper: number; middle: number; lower: number;
} {
  if (closes.length < period) {
    const last = closes[closes.length - 1] ?? 0;
    return { upper: last * 1.05, middle: last, lower: last * 0.95 };
  }
  const slice = closes.slice(-period);
  const middle = scannerMean(slice);
  const std = scannerStdDev(slice);
  return {
    upper: middle + std * multiplier,
    middle,
    lower: middle - std * multiplier,
  };
}

export function calculateTrendStrength(closes: number[]): number {
  if (closes.length < 20) return 50;
  const slice = closes.slice(-20);
  const ma20 = scannerMean(slice);
  const aboveMA = slice.filter(c => c > ma20).length;
  return (aboveMA / 20) * 100;
}

export interface KlineSignals {
  rsi: number;
  aboveMA20: boolean;
  aboveMA50: boolean;
  ma20AboveMA50: boolean;
  volumeIncrease: number;
  trendStrength: number;
  nearLowerBand: boolean;
  nearUpperBand: boolean;
  macdBullish: boolean;
  // Phase 3.5 additions:
  nearBullishOB: boolean;
  wyckoffPhase: 'ACCUMULATION' | 'MARKUP' | 'NEUTRAL';
  fillingBullishFVG: boolean;
  summary: string[];
}

// ── Phase 3.5: Order Block Detection ─────────────────────────────────────────
export function detectOrderBlocks(klines: any[]): Array<{ type: string; price: number }> {
  const blocks: Array<{ type: string; price: number }> = [];

  for (let i = 1; i < klines.length - 1; i++) {
    const prev = klines[i - 1];
    const curr = klines[i];
    const next = klines[i + 1];

    const currOpen  = parseFloat(curr[1] ?? curr.open  ?? '0');
    const currHigh  = parseFloat(curr[2] ?? curr.high  ?? '0');
    const currLow   = parseFloat(curr[3] ?? curr.low   ?? '0');
    const currClose = parseFloat(curr[4] ?? curr.close ?? '0');
    const nextOpen  = parseFloat(next[1] ?? next.open  ?? '0');
    const nextClose = parseFloat(next[4] ?? next.close ?? '0');

    // Bullish OB: bearish candle whose high is subsequently broken to the upside
    if (currClose < currOpen && nextClose > nextOpen && nextClose > currHigh) {
      blocks.push({ type: 'BULLISH_OB', price: currLow });
    }

    // Bearish OB: bullish candle whose low is subsequently broken to the downside
    if (currClose > currOpen && nextClose < nextOpen && nextClose < currLow) {
      blocks.push({ type: 'BEARISH_OB', price: currHigh });
    }
  }

  // Keep only the 5 most recent to avoid stale structure
  return blocks.slice(-5);
}

// ── Phase 3.5: Wyckoff Phase Detection ───────────────────────────────────────
export function detectWyckoffPhase(klines: any[]): 'ACCUMULATION' | 'MARKUP' | 'NEUTRAL' {
  if (klines.length < 30) return 'NEUTRAL';

  const closes  = klines.map(k => parseFloat(k[4] ?? k.close  ?? '0'));
  const volumes = klines.map(k => parseFloat(k[5] ?? k.volume ?? '0'));

  const recentVol    = scannerMean(volumes.slice(-10));
  const olderVol     = scannerMean(volumes.slice(-30, -10));
  const last20Slice  = closes.slice(-20);
  const priceRange   = Math.max(...last20Slice) - Math.min(...last20Slice);
  const currentPrice = closes[closes.length - 1];
  const ma20         = scannerMean(last20Slice);

  // Accumulation: tight range + declining volume + price above midpoint
  if (
    currentPrice > 0 &&
    priceRange / currentPrice < 0.05 &&
    recentVol < olderVol * 0.8 &&
    currentPrice > ma20
  ) {
    return 'ACCUMULATION';
  }

  // Markup: new 20-period high + volume surge
  const prev20High = Math.max(...closes.slice(-21, -1));
  if (currentPrice > prev20High && recentVol > olderVol * 1.3) {
    return 'MARKUP';
  }

  return 'NEUTRAL';
}

// ── Phase 3.5: Fair Value Gap Detection ──────────────────────────────────────
export function detectFairValueGaps(klines: any[]): Array<{ type: string; top: number; bottom: number }> {
  const gaps: Array<{ type: string; top: number; bottom: number }> = [];

  for (let i = 2; i < klines.length; i++) {
    const prev2 = klines[i - 2];
    const curr  = klines[i];

    const prev2High = parseFloat(prev2[2] ?? prev2.high ?? '0');
    const prev2Low  = parseFloat(prev2[3] ?? prev2.low  ?? '0');
    const currHigh  = parseFloat(curr[2]  ?? curr.high  ?? '0');
    const currLow   = parseFloat(curr[3]  ?? curr.low   ?? '0');

    // Bullish FVG: gap up (current low > candle-2 high)
    if (currLow > prev2High) {
      gaps.push({ type: 'BULLISH_FVG', top: currLow, bottom: prev2High });
    }

    // Bearish FVG: gap down (current high < candle-2 low)
    if (currHigh < prev2Low) {
      gaps.push({ type: 'BEARISH_FVG', top: prev2Low, bottom: currHigh });
    }
  }

  // Keep only the 10 most recent (older FVGs are usually filled)
  return gaps.slice(-10);
}

export function analyzeKlines(klines: any[], currentPrice: number, recentVolumes: number[]): KlineSignals {
  const closes = klines.map(k => parseFloat(k[4] ?? k.close ?? '0'));
  const volumes = klines.map(k => parseFloat(k[5] ?? k.volume ?? '0'));

  const rsi = calculateRSI(closes, 14);

  const ma20 = scannerMean(closes.slice(-20));
  const ma50 = closes.length >= 50 ? scannerMean(closes.slice(-50)) : scannerMean(closes);
  const aboveMA20 = currentPrice > ma20;
  const aboveMA50 = currentPrice > ma50;
  const ma20AboveMA50 = ma20 > ma50;

  // Volume: compare last 10 klines vs prior 20
  const recentVol = scannerMean(volumes.slice(-10));
  const olderVol = scannerMean(volumes.slice(-30, -10));
  const volumeIncrease = olderVol > 0 ? ((recentVol - olderVol) / olderVol) * 100 : 0;

  const trendStrength = calculateTrendStrength(closes);
  const bb = calculateBollingerBands(closes, 20, 2);
  const nearLowerBand = currentPrice < bb.lower * 1.05;
  const nearUpperBand = currentPrice > bb.upper * 0.95;

  const macdData = calculateMACD(closes);
  const macdBullish = macdData.macd > macdData.signal;

  // Phase 3.5: Order Blocks
  const orderBlocks = detectOrderBlocks(klines);
  const nearBullishOB = orderBlocks
    .filter(ob => ob.type === 'BULLISH_OB')
    .some(ob => ob.price > 0 && Math.abs(currentPrice - ob.price) / ob.price < 0.03);

  // Phase 3.5: Wyckoff
  const wyckoffPhase = detectWyckoffPhase(klines);

  // Phase 3.5: Fair Value Gaps
  const fvgs = detectFairValueGaps(klines);
  const fillingBullishFVG = fvgs
    .filter(fvg => fvg.type === 'BULLISH_FVG')
    .some(fvg => currentPrice >= fvg.bottom && currentPrice <= fvg.top);

  const summary: string[] = [];
  if (rsi >= 30 && rsi <= 45) summary.push(`RSI ${rsi.toFixed(0)} — oversold recovering (buy zone)`);
  else if (rsi >= 50 && rsi <= 65) summary.push(`RSI ${rsi.toFixed(0)} — bullish momentum`);
  else if (rsi > 75) summary.push(`RSI ${rsi.toFixed(0)} — overbought (caution)`);
  if (ma20AboveMA50 && aboveMA20) summary.push('Golden cross (bullish trend)');
  if (volumeIncrease > 50) summary.push(`Volume surge +${volumeIncrease.toFixed(0)}%`);
  if (macdBullish) summary.push('MACD bullish');
  if (nearLowerBand) summary.push('Near Bollinger lower band (oversold)');
  if (nearBullishOB) summary.push('Order block retest (institutional support)');
  if (wyckoffPhase === 'ACCUMULATION') summary.push('Wyckoff accumulation (spring zone)');
  else if (wyckoffPhase === 'MARKUP') summary.push('Wyckoff markup (breakout phase)');
  if (fillingBullishFVG) summary.push('Filling bullish Fair Value Gap');

  return {
    rsi, aboveMA20, aboveMA50, ma20AboveMA50, volumeIncrease, trendStrength,
    nearLowerBand, nearUpperBand, macdBullish,
    nearBullishOB, wyckoffPhase, fillingBullishFVG,
    summary,
  };
}

export function calculateEnhancedScore(
  priceChange: number,
  volume: number,
  signals: KlineSignals
): number {
  let score = 50;

  // RSI zones
  if (signals.rsi >= 30 && signals.rsi <= 45) score += 15;
  else if (signals.rsi >= 50 && signals.rsi <= 65) score += 10;
  else if (signals.rsi > 75) score -= 15;
  else if (signals.rsi < 25) score -= 10;

  // Trend (MA alignment)
  if (signals.aboveMA20 && signals.aboveMA50 && signals.ma20AboveMA50) score += 15;
  else if (signals.aboveMA20 && signals.ma20AboveMA50) score += 10;
  else if (!signals.aboveMA20 && !signals.aboveMA50) score -= 10;

  // Volume confirmation
  if (signals.volumeIncrease > 50) score += 12;
  else if (signals.volumeIncrease > 25) score += 8;
  else if (signals.volumeIncrease < -30) score -= 8;

  // Bollinger Bands
  if (signals.nearLowerBand) score += 8;
  else if (signals.nearUpperBand) score -= 5;

  // MACD
  if (signals.macdBullish) score += 7;

  // Trend strength
  if (signals.trendStrength > 70) score += 8;
  else if (signals.trendStrength < 30) score -= 5;

  // Liquidity bonus
  if (volume > 1000000) score += 5;

  // Overextended penalty
  if (priceChange > 20) score -= 15;

  // Phase 3.5: Order Block retest
  if (signals.nearBullishOB) score += 12;

  // Phase 3.5: Wyckoff phase
  if (signals.wyckoffPhase === 'ACCUMULATION') score += 15;
  else if (signals.wyckoffPhase === 'MARKUP') score += 10;

  // Phase 3.5: Fair Value Gap fill
  if (signals.fillingBullishFVG) score += 10;

  return score;
}

// Funding rates: Pionex REST API does not expose a public funding-rate endpoint
// (perpetual/public/fundingRate returns 404). Removed to avoid 404 on every scan.

// Pionex klines interval format: 1M, 5M, 15M, 30M, 60M (minutes), 4H, 8H, 12H, 1D. Scanner uses 15M for fresher data.
export async function fetchKlines(
  symbol: string,
  interval: string,
  limit: number,
  apiKey: string,
  apiSecret: string
): Promise<any[] | null> {
  console.log(`[SCANNER] fetchKlines called: symbol=${symbol} interval=${interval} limit=${limit}`);

  let res: Response;
  try {
    const enc = new TextEncoder();
    const ts = Date.now().toString();
    const path = `/api/v1/market/klines`;
    const params: Record<string, string> = { interval, limit: String(limit), symbol, timestamp: ts };
    // Sort params by key (ASCII) per Pionex docs
    const sortedKeys = Object.keys(params).sort();
    const queryStr = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
    const message = `GET${path}?${queryStr}`;
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(apiSecret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    const signature = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

    res = await fetch(`https://api.pionex.com${path}?${queryStr}`, {
      headers: {
        'PIONEX-KEY': apiKey,
        'PIONEX-SIGNATURE': signature,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
  } catch (fetchErr) {
    console.warn(`[SCANNER] Klines fetch threw: symbol=${symbol}`, fetchErr);
    return null;
  }

  if (!res.ok) {
    const errBody = await res.text();
    console.warn(`[SCANNER] Klines fetch failed: symbol=${symbol} status=${res.status} body=${errBody.slice(0, 300)}`);
    return null;
  }

  let data: any;
  try {
    data = await res.json();
  } catch (parseErr) {
    console.warn(`[SCANNER] Klines response JSON parse error: symbol=${symbol}`, parseErr);
    return null;
  }

  const klines = data?.data?.klines ?? data?.data ?? null;

  if (!Array.isArray(klines)) {
    console.log(`[SCANNER] Klines not array or missing: symbol=${symbol} type=${typeof klines} keys=${data ? Object.keys(data).join(',') : 'no data'}`);
    return null;
  }
  if (klines.length === 0) {
    console.log(`[SCANNER] Klines empty: symbol=${symbol}`);
    return klines;
  }

  // Log last candle timestamp to verify data is current (not stale/delayed)
  const getTime = (k: any) => (k && typeof k === 'object' && 'time' in k ? k.time : k?.[0]);
  const sorted = [...klines].sort((a, b) => getTime(a) - getTime(b));
  const last = sorted[sorted.length - 1];
  const lastTimeMs = getTime(last);
  if (typeof lastTimeMs === 'number') {
    const nowMs = Date.now();
    const ageSec = (nowMs - lastTimeMs) / 1000;
    const within15Min = ageSec < 900;
    console.log(
      `[SCANNER] Last kline timestamp: ${lastTimeMs} ms (${new Date(lastTimeMs).toISOString()}), now: ${nowMs} ms, age: ${ageSec.toFixed(0)}s, symbol: ${symbol}`
    );
    console.log(
      `[SCANNER] Last candle age check: ${ageSec.toFixed(0)}s ${within15Min ? '(OK: under 15 min)' : '(WARN: over 15 min)'}`
    );
  } else {
    console.log(`[SCANNER] Last kline has no time field: symbol=${symbol} sample=${JSON.stringify(last).slice(0, 120)}`);
  }

  return klines;
}

// ── Full Market Scanner (called by ayn-unified for autonomous trading) ──────
export async function scanMarketOpportunities(): Promise<{ opportunities: any[]; scannedPairs: number } | null> {
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

    // Phase 1: basic momentum filter
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
      let basicScore = 50;
      if (priceChange > 0 && priceChange <= 5) basicScore += 10;
      else if (priceChange > 5 && priceChange <= 15) basicScore += 15;
      if (volume > 1000000) basicScore += 8;
      if (Math.abs(priceChange) < 2) basicScore += 5;
      if (priceChange < -15) basicScore += 10;
      if (priceChange > 20) basicScore -= 15;
      if (basicScore >= 55) phase1Candidates.push({ symbol, price, volume, priceChange, t });
    }

    console.log(`[SCANNER] Scanning ${phase1Candidates.length} tickers`);

    // Phase 2: fetch klines and score with technical indicators
    const opportunities: any[] = [];
    const getKlineTime = (k: any) => (k && typeof k === 'object' && 'time' in k ? k.time : k?.[0]);

    for (const candidate of phase1Candidates) {
      const klines = await fetchKlines(candidate.symbol, '15M', 100, apiKey, apiSecret);
      let score: number;
      let signals: string[];
      let lastCandleTimeMs: number | null = null;

      if (!klines || klines.length < 20) {
        score = 50 + (candidate.priceChange > 0 && candidate.priceChange <= 15 ? 15 : 0) + (candidate.volume > 1000000 ? 8 : 0);
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
          ticker: candidate.symbol, score, price: candidate.price,
          volume24h: candidate.volume, priceChange24h: candidate.priceChange,
          signals, lastCandleTimeMs,
        });
      }
    }

    opportunities.sort((a, b) => b.score - a.score);
    const top = opportunities.slice(0, 3);
    console.log(`[SCAN] Phase 2: ${opportunities.length} qualified (score≥70), returning top ${top.length}`);
    return { opportunities: top, scannedPairs: tickers.length };
  } catch (err) {
    console.error('[SCAN] Market scan error:', err);
    return null;
  }
}
