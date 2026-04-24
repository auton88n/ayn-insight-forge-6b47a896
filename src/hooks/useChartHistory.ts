import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ChartHistoryItem, ChartHistoryFilter, ChartAnalysisResult } from '@/types/chartAnalyzer.types';

const PAGE_SIZE = 10;

function mapRowToHistoryItem(row: any): ChartHistoryItem {
  const prediction = (row.prediction_details || {}) as any;
  const technical = (row.technical_analysis || {}) as any;
  const news = (row.news_data || []) as any[];

  const result: ChartAnalysisResult = {
    ticker: row.ticker || 'N/A',
    assetType: row.asset_type || 'stock',
    timeframe: row.timeframe || 'unknown',
    technical: {
      trend: technical.trend || 'unknown',
      patterns: technical.patterns || [],
      support: technical.support || [],
      resistance: technical.resistance || [],
      indicators: technical.indicators || {},
      keyObservations: technical.keyObservations || '',
    },
    news: news.map((n: any) => ({
      title: n.title || '',
      url: n.url || '#',
      description: n.description || '',
      sentiment: n.sentiment || 0,
      impact: n.impact || 'low',
    })),
    prediction: {
      signal: row.prediction_signal || 'NEUTRAL',
      confidence: row.confidence || 0,
      timeframe: row.timeframe || 'unknown',
      assetType: row.asset_type || 'stock',
      reasoning: prediction.reasoning || '',
      entry_zone: prediction.entry_zone || 'N/A',
      stop_loss: prediction.stop_loss || 'N/A',
      take_profit: prediction.take_profit || 'N/A',
      risk_reward: prediction.risk_reward || 'N/A',
      overallSentiment: row.sentiment_score || 0,
    },
    imageUrl: row.image_url || '',
    analysisId: row.id,
    disclaimer: 'This is AI-generated analysis for educational purposes only. Not financial advice.',
  };

  return {
    ...result,
    id: row.id,
    created_at: row.created_at,
  };
}

export function useChartHistory() {
  const [items, setItems] = useState<ChartHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<ChartHistoryFilter>({});
  const [selectedItem, setSelectedItem] = useState<ChartHistoryItem | null>(null);

  const fetchHistory = useCallback(async (offset = 0, append = false) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      let query = supabase
        .from('chart_analyses')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (filter.ticker) {
        query = query.ilike('ticker', `%${filter.ticker}%`);
      }
      if (filter.assetType) {
        query = query.eq('asset_type', filter.assetType);
      }
      if (filter.signal) {
        query = query.eq('prediction_signal', filter.signal);
      }

      const { data, error } = await query;
      if (error) throw error;

      const mapped = (data || []).map(mapRowToHistoryItem);
      setHasMore(mapped.length === PAGE_SIZE);

      if (append) {
        setItems(prev => [...prev, ...mapped]);
      } else {
        setItems(mapped);
      }
    } catch (err) {
      console.error('Failed to fetch chart history:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchHistory(items.length, true);
    }
  }, [fetchHistory, items.length, loading, hasMore]);

  const deleteItem = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('chart_analyses').delete().eq('id', id);
      if (error) throw error;
      setItems(prev => prev.filter(item => item.id !== id));
      if (selectedItem?.id === id) setSelectedItem(null);
    } catch (err) {
      console.error('Failed to delete analysis:', err);
    }
  }, [selectedItem]);

  useEffect(() => {
    fetchHistory(0, false);
  }, [fetchHistory]);

  return {
    items,
    loading,
    hasMore,
    filter,
    setFilter,
    loadMore,
    deleteItem,
    selectedItem,
    setSelectedItem,
    refresh: () => fetchHistory(0, false),
  };
}
