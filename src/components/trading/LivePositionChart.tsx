import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, LineStyle, CandlestickSeries as CandlestickSeriesDef } from 'lightweight-charts';
import { supabase } from '@/integrations/supabase/client';

interface LivePositionChartProps {
  ticker: string;
  entryPrice: number;
  stopLoss: number;
  tp1: number | null;
  tp2?: number | null;
  signal: string;
}

type Timeframe = '1m' | '5m' | '15m' | '1h';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h'];

function getTfMs(tf: Timeframe): number {
  return tf === '1m' ? 60000 : tf === '5m' ? 300000 : tf === '15m' ? 900000 : 3600000;
}

function getBucketTime(tradeTimestampMs: number, tf: Timeframe): number {
  const tfMs = getTfMs(tf);
  return Math.floor(tradeTimestampMs / tfMs) * (tfMs / 1000); // seconds
}

export default function LivePositionChart({ ticker, entryPrice, stopLoss, tp1, tp2, signal }: LivePositionChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const currentCandleRef = useRef<CandlestickData | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const [loading, setLoading] = useState(true);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buildChart = useCallback(() => {
    if (!containerRef.current) return null;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      height: 320,
      layout: {
        background: { color: 'hsl(222,47%,9%)' },
        textColor: 'hsl(215,20%,65%)',
      },
      grid: {
        vertLines: { color: 'hsl(217,33%,15%)' },
        horzLines: { color: 'hsl(217,33%,15%)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: 'hsl(217,33%,18%)',
      },
      rightPriceScale: {
        borderColor: 'hsl(217,33%,18%)',
      },
    });

    // v5 API: chart.addSeries(CandlestickSeries, options)
    const candleSeries = chart.addSeries(CandlestickSeriesDef, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    // Price level lines
    candleSeries.createPriceLine({
      price: entryPrice,
      color: '#3b82f6',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: `Entry $${entryPrice.toFixed(2)}`,
    });
    candleSeries.createPriceLine({
      price: stopLoss,
      color: '#ef4444',
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: `Stop $${stopLoss.toFixed(2)}`,
    });
    if (tp1) {
      candleSeries.createPriceLine({
        price: tp1,
        color: '#22c55e',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `TP1 $${tp1.toFixed(2)}`,
      });
    }
    if (tp2) {
      candleSeries.createPriceLine({
        price: tp2,
        color: '#22c55e',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `TP2 $${tp2.toFixed(2)}`,
      });
    }

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    return { chart, candleSeries };
  }, [entryPrice, stopLoss, tp1, tp2]);

  const connectWs = useCallback((tf: Timeframe) => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    const ws = new WebSocket('wss://dfkoxuokfkttjhfjcecx.supabase.co/functions/v1/ws-relay');
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ op: 'SUBSCRIBE', topic: 'TRADE', symbol: ticker }));
    };

    ws.onmessage = async (event) => {
      try {
        const text = event.data instanceof Blob
          ? await event.data.text()
          : (event.data as string);
        const msg = JSON.parse(text);

        // Keep connection alive
        if (msg.op === 'PING') {
          ws.send(JSON.stringify({ op: 'PONG', timestamp: msg.timestamp }));
          return;
        }

        if (msg.topic === 'TRADE' && msg.symbol === ticker && Array.isArray(msg.data) && msg.data.length > 0) {
          const trade = msg.data[0];
          const price = parseFloat(trade.price);
          if (isNaN(price)) return;
          setLivePrice(price);

          const tradeTimestampMs: number = trade.timestamp ?? Date.now();
          const bucketSec = getBucketTime(tradeTimestampMs, tf) as Time;
          const series = candleSeriesRef.current;
          if (!series) return;

          if (!currentCandleRef.current || (currentCandleRef.current.time as number) < (bucketSec as number)) {
            currentCandleRef.current = { time: bucketSec, open: price, high: price, low: price, close: price };
          } else {
            const c = currentCandleRef.current;
            currentCandleRef.current = {
              time: c.time,
              open: c.open,
              high: Math.max(c.high as number, price),
              low: Math.min(c.low as number, price),
              close: price,
            };
          }
          series.update(currentCandleRef.current);
        }
      } catch (e) {
        console.error('[LivePositionChart] WS parse error:', e);
      }
    };
  }, [ticker]);

  const loadAndConnect = useCallback(async (tf: Timeframe) => {
    setLoading(true);
    setError(null);
    setLivePrice(null);
    currentCandleRef.current = null;

    // Destroy existing chart + ws
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; candleSeriesRef.current = null; }

    const built = buildChart();
    if (!built) { setLoading(false); return; }

    // Fetch historical klines
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('get-klines', {
        body: { symbol: ticker, interval: tf, limit: 100 },
      });
      if (fnErr) {
        console.warn('[LivePositionChart] klines error (non-fatal):', fnErr);
      } else if (data?.klines && data.klines.length > 0) {
        built.candleSeries.setData(data.klines as CandlestickData[]);
        built.chart.timeScale().fitContent();
        const last = data.klines[data.klines.length - 1];
        currentCandleRef.current = { ...last };
        // Seed livePrice from the last known kline close so low-volume
        // pairs always show a price even before WS trades arrive
        setLivePrice(last.close as number);
      }
    } catch (e: any) {
      console.warn('[LivePositionChart] klines fetch error (non-fatal):', e);
      // Don't show error — chart will still work with live data only
    }

    setLoading(false);
    connectWs(tf);
  }, [ticker, buildChart, connectWs]);




  useEffect(() => {
    loadAndConnect(timeframe);
    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  }, [timeframe, loadAndConnect]);

  const isBuy = signal === 'BUY';
  const livePnlPercent = livePrice
    ? (isBuy ? (livePrice - entryPrice) / entryPrice : (entryPrice - livePrice) / entryPrice) * 100
    : null;

  return (
    <div className="mt-3 border border-border/40 rounded-lg overflow-hidden">
      {/* Header: timeframe tabs + live price */}
      <div className="flex items-center justify-between px-3 py-2 bg-card/60 border-b border-border/30">
        <div className="flex gap-1">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        {livePrice !== null && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
            </span>
            <span className="font-mono font-semibold">${livePrice.toFixed(4)}</span>
            {livePnlPercent !== null && (
              <span className={`font-medium ${livePnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {livePnlPercent >= 0 ? '+' : ''}{livePnlPercent.toFixed(2)}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="relative bg-[hsl(222,47%,9%)]" style={{ height: 320 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-card/80">
            <span className="text-xs text-muted-foreground">Loading chart…</span>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <span className="text-xs text-red-400">{error}</span>
          </div>
        )}
        <div ref={containerRef} style={{ height: 320 }} />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-3 py-2 bg-card/40 border-t border-border/30 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1 text-blue-400">
          <span className="inline-block w-4 border-b border-dashed border-blue-500" />
          Entry ${entryPrice.toFixed(2)}
        </span>
        <span className="flex items-center gap-1 text-red-400">
          <span className="inline-block w-4 border-b border-red-500" />
          Stop ${stopLoss.toFixed(2)}
        </span>
        {tp1 && (
          <span className="flex items-center gap-1 text-green-400">
            <span className="inline-block w-4 border-b border-green-500" />
            TP1 ${tp1.toFixed(2)}
          </span>
        )}
        {tp2 && (
          <span className="flex items-center gap-1 text-green-400">
            <span className="inline-block w-4 border-b border-dashed border-green-500" />
            TP2 ${tp2.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}
