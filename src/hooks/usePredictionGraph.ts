import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface GraphCluster {
  id: string;
  label: string;
  canonical_domain: string;
  prediction_count: number;
  cohesion_score: number;
  bridge_factor: number;
  top_tags: string[];
  top_regions: string[];
  shared_drivers: string[];
  run_id: string;
  created_at: string;
}

export interface GraphMember {
  prediction_id: string;
  cluster_id: string;
  confidence_label: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';
  centrality_score: number;
  is_bridge: boolean;
  // joined from ayn_world_predictions
  prediction?: {
    title: string;
    domain: string;
    region: string;
    confidence: number;
    signal_quality: number;
    horizon: string;
    what_is_happening?: string;
    actionable_move?: string;
    key_drivers: string[];
    tags: string[];
  };
}

export interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relation: string;
  confidence_label: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';
  surprise_score: number;
  why: string;
  shared_signals: string[];
  // joined titles
  source_title?: string;
  target_title?: string;
}

export interface GraphRun {
  id: string;
  created_at: string;
  predictions_in: number;
  clusters_out: number;
  edges_out: number;
  bridge_nodes: number;
  duration_ms: number;
  status: string;
  notes: string;
}

export interface PredictionGraphData {
  clusters: GraphCluster[];
  edges: GraphEdge[];
  latestRun: GraphRun | null;
  membersByCluster: Record<string, GraphMember[]>;
  totalPredictions: number;
  totalBridges: number;
  domainStats: Record<string, { count: number; extracted: number; inferred: number; ambiguous: number }>;
}

export function usePredictionGraph() {
  const [data, setData] = useState<PredictionGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // Latest run
      const { data: runs } = await supabase
        .from('ayn_graph_runs' as any)
        .select('*')
        .eq('status', 'complete')
        .order('created_at', { ascending: false })
        .limit(1) as any;

      const latestRun = runs?.[0] || null;
      if (!latestRun) {
        setData({ clusters: [], edges: [], latestRun: null, membersByCluster: {}, totalPredictions: 0, totalBridges: 0, domainStats: {} });
        setLoading(false);
        return;
      }

      // Clusters from latest run
      const { data: clusters } = await (supabase
        .from('ayn_prediction_clusters' as any)
        .select('*')
        .eq('run_id', latestRun.id)
        .order('prediction_count', { ascending: false }) as any);

      // Top surprising edges from latest run
      const { data: edges } = await (supabase
        .from('ayn_prediction_graph_edges' as any)
        .select('*')
        .eq('run_id', latestRun.id)
        .order('surprise_score', { ascending: false })
        .limit(30) as any);

      // Members with prediction details
      const clusterIds = (clusters || []).map((c: GraphCluster) => c.id);
      const { data: members } = await (supabase
        .from('ayn_prediction_cluster_members' as any)
        .select(`
          prediction_id, cluster_id, confidence_label, centrality_score, is_bridge,
          ayn_world_predictions!inner(title, domain, region, confidence, signal_quality, horizon, what_is_happening, actionable_move, key_drivers, tags)
        `)
        .in('cluster_id', clusterIds)
        .order('centrality_score', { ascending: false }) as any);

      // Build membersByCluster
      const membersByCluster: Record<string, GraphMember[]> = {};
      for (const m of (members || []) as any[]) {
        const clusterId = m.cluster_id;
        if (!membersByCluster[clusterId]) membersByCluster[clusterId] = [];
        membersByCluster[clusterId].push({
          prediction_id: m.prediction_id,
          cluster_id: m.cluster_id,
          confidence_label: m.confidence_label,
          centrality_score: m.centrality_score,
          is_bridge: m.is_bridge,
          prediction: m.ayn_world_predictions,
        });
      }

      // Domain stats
      const domainStats: Record<string, { count: number; extracted: number; inferred: number; ambiguous: number }> = {};
      for (const m of (members || []) as any[]) {
        const domain = m.ayn_world_predictions?.domain || 'unknown';
        if (!domainStats[domain]) domainStats[domain] = { count: 0, extracted: 0, inferred: 0, ambiguous: 0 };
        domainStats[domain].count++;
        if (m.confidence_label === 'EXTRACTED') domainStats[domain].extracted++;
        else if (m.confidence_label === 'INFERRED') domainStats[domain].inferred++;
        else domainStats[domain].ambiguous++;
      }

      const totalBridges = (members || []).filter((m: any) => m.is_bridge).length;

      setData({
        clusters: (clusters || []) as GraphCluster[],
        edges: (edges || []) as GraphEdge[],
        latestRun,
        membersByCluster,
        totalPredictions: latestRun.predictions_in,
        totalBridges,
        domainStats,
      });
    } catch (e: any) {
      setError(e.message || 'Failed to load prediction graph');
    } finally {
      setLoading(false);
    }
  }

  return { data, loading, error, reload: load };
}
