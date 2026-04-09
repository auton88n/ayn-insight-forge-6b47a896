import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, RefreshCw, GitBranch, Layers, Zap, Activity,
  AlertTriangle, CheckCircle2, HelpCircle, Globe2, TrendingUp,
  Network, ChevronDown, ChevronUp, Calendar, Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePredictionGraph, GraphCluster, GraphMember } from '@/hooks/usePredictionGraph';
import { format } from 'date-fns';

// ─── Domain config ─────────────────────────────────────────────────────────────
const DOMAIN_COLOR: Record<string, string> = {
  geopolitics:  '#f97316',
  conflicts:    '#ef4444',
  economy:      '#f59e0b',
  technology:   '#a78bfa',
  markets:      '#60a5fa',
  energy:       '#34d399',
  society:      '#f472b6',
  demographics: '#94a3b8',
  warnings:     '#fb923c',
  opportunities:'#4ade80',
};

const DOMAIN_ICON: Record<string, string> = {
  geopolitics:  '🌐',
  conflicts:    '⚔️',
  economy:      '📈',
  technology:   '💡',
  markets:      '📊',
  energy:       '⚡',
  society:      '👥',
  demographics: '📋',
  warnings:     '⚠️',
  opportunities:'🎯',
};

// ─── Confidence badge ───────────────────────────────────────────────────────────
function ConfidenceBadge({ label, size = 'sm' }: { label: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS'; size?: 'sm' | 'xs' }) {
  const config = {
    EXTRACTED:  { color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', icon: <CheckCircle2 size={10} /> },
    INFERRED:   { color: 'text-blue-400 bg-blue-400/10 border-blue-400/20',         icon: <Activity size={10} /> },
    AMBIGUOUS:  { color: 'text-amber-400 bg-amber-400/10 border-amber-400/20',      icon: <HelpCircle size={10} /> },
  }[label];
  const px = size === 'xs' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]';
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border font-medium', px, config.color)}>
      {config.icon}{label}
    </span>
  );
}

// ─── Cluster card ───────────────────────────────────────────────────────────────
function ClusterCard({ cluster, members, expanded, onToggle }: {
  cluster: GraphCluster;
  members: GraphMember[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const color = DOMAIN_COLOR[cluster.canonical_domain] || '#6b7280';
  const icon = DOMAIN_ICON[cluster.canonical_domain] || '🔹';
  const bridges = members.filter(m => m.is_bridge).length;
  const extracted = members.filter(m => m.confidence_label === 'EXTRACTED').length;
  const inferred = members.filter(m => m.confidence_label === 'INFERRED').length;
  const ambiguous = members.filter(m => m.confidence_label === 'AMBIGUOUS').length;
  const cohesionPct = Math.round((cluster.cohesion_score || 0) * 100);
  const topMembers = members.slice(0, expanded ? 8 : 3);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-black/50 border border-white/8 rounded-xl overflow-hidden hover:border-white/12 transition-all"
    >
      {/* Header */}
      <div className="p-4 cursor-pointer select-none" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: `${color}18`, border: `1px solid ${color}30` }}
            >
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-white leading-tight truncate">{cluster.label}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-white/40">{cluster.prediction_count} predictions</span>
                {bridges > 0 && (
                  <span className="text-xs text-purple-400 flex items-center gap-0.5">
                    <GitBranch size={9} />{bridges} bridge{bridges > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Cohesion ring */}
            <div className="text-right">
              <div className="text-xs font-medium" style={{ color }}>{cohesionPct}%</div>
              <div className="text-[10px] text-white/30">cohesion</div>
            </div>
            {expanded ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mt-3 flex gap-1 h-1.5 rounded-full overflow-hidden">
          <div className="bg-emerald-500/70 rounded-full" style={{ width: `${(extracted / Math.max(members.length, 1)) * 100}%` }} />
          <div className="bg-blue-500/70 rounded-full" style={{ width: `${(inferred / Math.max(members.length, 1)) * 100}%` }} />
          <div className="bg-amber-500/70 rounded-full" style={{ width: `${(ambiguous / Math.max(members.length, 1)) * 100}%` }} />
        </div>
        <div className="flex gap-3 mt-1.5">
          {extracted > 0 && <span className="text-[10px] text-emerald-400/70">{extracted} extracted</span>}
          {inferred > 0 && <span className="text-[10px] text-blue-400/70">{inferred} inferred</span>}
          {ambiguous > 0 && <span className="text-[10px] text-amber-400/70">{ambiguous} ambiguous</span>}
        </div>

        {/* Tags */}
        {cluster.top_tags?.length > 0 && (
          <div className="flex gap-1.5 mt-2.5 flex-wrap">
            {cluster.top_tags.slice(0, 5).map(tag => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/8 text-white/50">{tag}</span>
            ))}
          </div>
        )}

        {/* Shared drivers */}
        {cluster.shared_drivers?.length > 0 && (
          <div className="mt-2 text-[10px] text-white/30">
            Shared drivers: {cluster.shared_drivers.slice(0, 3).join(' · ')}
          </div>
        )}
      </div>

      {/* Expanded members list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/5 overflow-hidden"
          >
            <div className="p-3 space-y-2">
              {topMembers.map(m => (
                <div
                  key={m.prediction_id}
                  className={cn(
                    'flex items-start gap-2.5 p-2.5 rounded-lg bg-white/3 border border-white/5',
                    m.is_bridge && 'border-purple-500/20 bg-purple-500/5'
                  )}
                >
                  {m.is_bridge && (
                    <GitBranch size={11} className="text-purple-400 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-white/80 leading-snug line-clamp-2">{m.prediction?.title}</p>
                      <ConfidenceBadge label={m.confidence_label} size="xs" />
                    </div>
                    {m.prediction?.actionable_move && (
                      <p className="text-[10px] text-white/40 mt-1 line-clamp-1">→ {m.prediction.actionable_move}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-white/30">{m.prediction?.region}</span>
                      <span className="text-[10px] text-white/20">·</span>
                      <span className="text-[10px] text-white/30">{m.prediction?.horizon}</span>
                      <span className="text-[10px] text-white/20">·</span>
                      <span className="text-[10px]" style={{ color: m.prediction?.signal_quality && m.prediction.signal_quality > 70 ? '#34d399' : '#f59e0b' }}>
                        SQ {m.prediction?.signal_quality}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {members.length > 8 && (
                <p className="text-[10px] text-white/30 text-center py-1">+{members.length - 8} more predictions</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Surprise edge card ─────────────────────────────────────────────────────────
function SurpriseEdgeCard({ edge }: { edge: any }) {
  const relationColor: Record<string, string> = {
    shares_driver:      'text-blue-400 bg-blue-400/8',
    shares_region:      'text-cyan-400 bg-cyan-400/8',
    conflicts_with:     'text-red-400 bg-red-400/8',
    amplifies:          'text-emerald-400 bg-emerald-400/8',
    semantically_similar: 'text-purple-400 bg-purple-400/8',
  };
  const scoreColor = edge.surprise_score >= 8 ? 'text-red-400' : edge.surprise_score >= 6 ? 'text-amber-400' : 'text-blue-400';

  return (
    <div className="p-3 bg-black/40 border border-white/6 rounded-lg hover:border-white/10 transition-all">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', relationColor[edge.relation] || 'text-white/40 bg-white/5')}>
          {edge.relation.replace(/_/g, ' ')}
        </span>
        <div className="flex items-center gap-1.5">
          <ConfidenceBadge label={edge.confidence_label} size="xs" />
          <span className={cn('text-xs font-medium', scoreColor)}>⚡{edge.surprise_score}</span>
        </div>
      </div>
      <p className="text-[11px] text-white/60 leading-relaxed">{edge.why}</p>
      {edge.shared_signals?.length > 0 && (
        <div className="flex gap-1 mt-2 flex-wrap">
          {edge.shared_signals.slice(0, 4).map((s: string) => (
            <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-white/4 border border-white/6 text-white/40">{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────
export default function PredictionGraphPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = usePredictionGraph();
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'clusters' | 'connections' | 'runs'>('clusters');
  const [domainFilter, setDomainFilter] = useState<string>('all');

  const filteredClusters = data?.clusters.filter(c =>
    domainFilter === 'all' || c.canonical_domain === domainFilter
  ) || [];

  const domains = [...new Set(data?.clusters.map(c => c.canonical_domain) || [])];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Network size={32} className="text-white/20 animate-pulse" />
          <p className="text-sm text-white/30">Building prediction graph...</p>
        </div>
      </div>
    );
  }

  const hasData = data && data.clusters.length > 0;

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#080808]/95 backdrop-blur-md border-b border-white/6">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-white/40 hover:text-white/70 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-sm font-medium text-white flex items-center gap-2">
                <Network size={15} className="text-purple-400" />
                Prediction Graph
              </h1>
              <p className="text-[10px] text-white/30">
                {data?.latestRun
                  ? `Last run ${format(new Date(data.latestRun.created_at), 'MMM d, HH:mm')}`
                  : 'No graph run yet'}
              </p>
            </div>
          </div>
          <button
            onClick={reload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/50 hover:text-white/80 border border-white/8 hover:border-white/14 rounded-lg transition-all"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Stats row */}
        {hasData && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {[
              { label: 'Predictions', value: data.totalPredictions, icon: <Layers size={13} />, color: 'text-white' },
              { label: 'Clusters', value: data.clusters.length, icon: <Network size={13} />, color: 'text-purple-400' },
              { label: 'Connections', value: data.latestRun?.edges_out || 0, icon: <GitBranch size={13} />, color: 'text-blue-400' },
              { label: 'Bridge nodes', value: data.totalBridges, icon: <Zap size={13} />, color: 'text-amber-400' },
              { label: 'Surprises', value: data.edges.length, icon: <AlertTriangle size={13} />, color: 'text-red-400' },
            ].map(stat => (
              <div key={stat.label} className="bg-black/40 border border-white/6 rounded-xl p-3 text-center">
                <div className={cn('flex justify-center mb-1', stat.color)}>{stat.icon}</div>
                <div className={cn('text-xl font-medium', stat.color)}>{stat.value.toLocaleString()}</div>
                <div className="text-[10px] text-white/30 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Confidence legend */}
        {hasData && (
          <div className="flex items-center gap-4 mb-5 px-1">
            <span className="text-[10px] text-white/30 font-medium uppercase tracking-wide">Confidence:</span>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={10} className="text-emerald-400" />
              <span className="text-[11px] text-emerald-400">EXTRACTED — explicit shared signal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Activity size={10} className="text-blue-400" />
              <span className="text-[11px] text-blue-400">INFERRED — model-reasoned link</span>
            </div>
            <div className="flex items-center gap-1.5">
              <HelpCircle size={10} className="text-amber-400" />
              <span className="text-[11px] text-amber-400">AMBIGUOUS — contradictory signals</span>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-white/6">
          {(['clusters', 'connections', 'runs'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 text-xs font-medium capitalize transition-all border-b-2 -mb-px',
                activeTab === tab
                  ? 'border-purple-400 text-purple-400'
                  : 'border-transparent text-white/40 hover:text-white/60'
              )}
            >
              {tab}
              {tab === 'clusters' && data && <span className="ml-1.5 text-[10px] bg-white/8 px-1.5 py-0.5 rounded">{data.clusters.length}</span>}
              {tab === 'connections' && data && <span className="ml-1.5 text-[10px] bg-white/8 px-1.5 py-0.5 rounded">{data.edges.length}</span>}
            </button>
          ))}
        </div>

        {/* No data state */}
        {!hasData && !loading && (
          <div className="text-center py-20">
            <Network size={40} className="text-white/10 mx-auto mb-4" />
            <h2 className="text-base font-medium text-white/40 mb-2">No graph data yet</h2>
            <p className="text-sm text-white/25 max-w-sm mx-auto">
              The prediction graph runs every Sunday at 02:00 UTC. It will automatically cluster all world predictions and show results here.
            </p>
            <div className="mt-4 text-xs text-white/20 flex items-center justify-center gap-1.5">
              <Clock size={11} />
              Next run: Sunday 02:00 UTC
            </div>
          </div>
        )}

        {/* CLUSTERS TAB */}
        {activeTab === 'clusters' && hasData && (
          <>
            {/* Domain filter */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <button
                onClick={() => setDomainFilter('all')}
                className={cn('text-[11px] px-2.5 py-1 rounded-lg border transition-all',
                  domainFilter === 'all'
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'border-white/6 text-white/40 hover:border-white/12')}
              >
                All
              </button>
              {domains.map(d => (
                <button
                  key={d}
                  onClick={() => setDomainFilter(d)}
                  className={cn('text-[11px] px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1',
                    domainFilter === d
                      ? 'border-white/20 text-white'
                      : 'border-white/6 text-white/40 hover:border-white/12')}
                  style={domainFilter === d ? { background: `${DOMAIN_COLOR[d]}15`, borderColor: `${DOMAIN_COLOR[d]}40`, color: DOMAIN_COLOR[d] } : {}}
                >
                  {DOMAIN_ICON[d]} {d}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredClusters.map(cluster => (
                <ClusterCard
                  key={cluster.id}
                  cluster={cluster}
                  members={data.membersByCluster[cluster.id] || []}
                  expanded={expandedCluster === cluster.id}
                  onToggle={() => setExpandedCluster(expandedCluster === cluster.id ? null : cluster.id)}
                />
              ))}
            </div>
          </>
        )}

        {/* CONNECTIONS TAB */}
        {activeTab === 'connections' && hasData && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={13} className="text-amber-400" />
              <span className="text-xs text-white/50">
                Surprising cross-domain connections — higher score = more unexpected
              </span>
            </div>
            {data.edges.length === 0 ? (
              <div className="text-center py-12 text-white/30 text-sm">
                No surprising connections found in latest run
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {data.edges.map(edge => (
                  <SurpriseEdgeCard key={edge.id} edge={edge} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* RUNS TAB */}
        {activeTab === 'runs' && (
          <div className="space-y-2">
            {!data?.latestRun ? (
              <div className="text-center py-12 text-white/30 text-sm">No completed runs yet</div>
            ) : (
              <div className="bg-black/40 border border-white/6 rounded-xl p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-medium text-white">Latest graph run</h3>
                    <p className="text-xs text-white/30 mt-0.5 font-mono">{data.latestRun.id}</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
                    {data.latestRun.status}
                  </span>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  {[
                    { label: 'Predictions', value: data.latestRun.predictions_in },
                    { label: 'Clusters', value: data.latestRun.clusters_out },
                    { label: 'Edges', value: data.latestRun.edges_out },
                    { label: 'Bridge nodes', value: data.latestRun.bridge_nodes },
                    { label: 'Duration', value: `${((data.latestRun.duration_ms || 0) / 1000).toFixed(1)}s` },
                    { label: 'Run date', value: format(new Date(data.latestRun.created_at), 'MMM d') },
                  ].map(s => (
                    <div key={s.label} className="bg-white/3 rounded-lg p-2.5 text-center">
                      <div className="text-base font-medium text-white">{s.value}</div>
                      <div className="text-[10px] text-white/30 mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>
                {data.latestRun.notes && (
                  <p className="mt-4 text-xs text-white/30 border-t border-white/5 pt-3">{data.latestRun.notes}</p>
                )}
                <div className="mt-4 p-3 bg-white/3 rounded-lg border border-white/5">
                  <p className="text-[11px] text-white/40 flex items-center gap-1.5">
                    <Calendar size={10} />
                    Scheduled: every Sunday at 02:00 UTC (weekly cron)
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
