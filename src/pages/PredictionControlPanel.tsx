import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { spineApi } from '@/lib/spineApi';
import { spineAuth } from '@/lib/spineAuth';
import {
  ArrowLeft, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Clock, TrendingUp, TrendingDown, Eye, Zap, Shield,
  BarChart3, Activity, ExternalLink, Edit3, Save
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface MasterPrediction {
  id: string; title: string; thesis: string; horizon: string;
  target_date: string; probability_pct: number; confidence: number;
  who_wins: string; who_loses: string; actionable_move: string;
  what_to_watch: string; domain: string; region: string;
  graph_coherence: number; signal_quality: number;
  check_status: string; checked_at: string | null;
  evidence_found: string | null; evidence_url: string | null;
  verified_correct: boolean | null; what_happened: string | null;
  accuracy_score: number | null; is_happening_now: boolean | null;
  admin_override: boolean | null; admin_notes: string | null;
  created_at: string;
}

interface Scorecard {
  total_checked: number; correct: number; wrong: number;
  partial: number; happening_now: number; pending: number;
  total_predictions: number; accuracy_pct: number;
  avg_accuracy_score: number; avg_coherence: number;
  last_verified_at: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: JSX.Element }> = {
  pending:   { label: 'Pending', color: 'text-white/40', bg: 'bg-white/5 border-white/10', icon: <Clock size={11} /> },
  happening: { label: 'Happening', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/25', icon: <Activity size={11} /> },
  correct:   { label: 'Correct ✓', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/25', icon: <CheckCircle2 size={11} /> },
  partial:   { label: 'Partial', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/25', icon: <AlertTriangle size={11} /> },
  wrong:     { label: 'Wrong ✗', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/25', icon: <XCircle size={11} /> },
  expired:   { label: 'Expired', color: 'text-white/30', bg: 'bg-white/3 border-white/8', icon: <Clock size={11} /> },
};

const DOMAIN_COLOR: Record<string, string> = {
  geopolitics: '#f97316', conflicts: '#ef4444', economy: '#f59e0b',
  technology: '#a78bfa', markets: '#60a5fa', energy: '#34d399',
  society: '#f472b6', demographics: '#94a3b8', warnings: '#fb923c',
};

export default function PredictionControlPanel() {
  const navigate = useNavigate();
  const [predictions, setPredictions] = useState<MasterPrediction[]>([]);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [preds, sc] = await Promise.all([
        spineApi.req<MasterPrediction[]>('GET', '/admin/predictions/master').catch(() => []),
        spineApi.req<Scorecard>('GET', '/admin/predictions/scorecard').catch(() => null),
      ]);
      if (preds) setPredictions(preds);
      if (sc) setScorecard(sc);
    } catch (e) {
      console.error('[PredictionControlPanel] load error:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runChecker = async () => {
    setRunning(true);
    try {
      await spineApi.req('POST', '/admin/predictions/run-checker', { source: 'admin_manual' });
    } catch {}
    setTimeout(() => { load(); setRunning(false); }, 45000);
  };

  const saveOverride = async (id: string) => {
    try {
      await spineApi.req('PATCH', `/admin/predictions/${id}`, { admin_notes: editNotes, check_status: editStatus, admin_override: true });
    } catch {}
    setEditingId(null);
    load();
  };

  const filteredPreds = predictions.filter(p =>
    filter === 'all' || p.check_status === filter
  );

  const statCards = [
    { label: 'Total predictions', value: scorecard?.total_predictions ?? predictions.length, color: 'text-white' },
    { label: 'Accuracy', value: scorecard?.accuracy_pct ? `${scorecard.accuracy_pct}%` : '—', color: scorecard?.accuracy_pct && scorecard.accuracy_pct >= 70 ? 'text-emerald-400' : 'text-amber-400' },
    { label: 'Happening now', value: scorecard?.happening_now ?? 0, color: 'text-emerald-400' },
    { label: 'Correct', value: scorecard?.correct ?? 0, color: 'text-emerald-400' },
    { label: 'Wrong', value: scorecard?.wrong ?? 0, color: 'text-red-400' },
    { label: 'Pending check', value: scorecard?.pending ?? predictions.filter(p => p.check_status === 'pending').length, color: 'text-white/40' },
  ];

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
                <Shield size={14} className="text-purple-400" />
                Prediction Control Panel
              </h1>
              <p className="text-[10px] text-white/30">Monitor, verify, and override AYN predictions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/50 hover:text-white/80 border border-white/8 hover:border-white/14 rounded-lg transition-all">
              <RefreshCw size={11} />Refresh
            </button>
            <button onClick={runChecker} disabled={running}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all',
                running ? 'text-white/30 border-white/5' : 'text-emerald-400 border-emerald-500/30 hover:border-emerald-500/50 bg-emerald-500/5 hover:bg-emerald-500/10')}>
              <Activity size={11} className={running ? 'animate-pulse' : ''} />
              {running ? 'Checking…' : 'Run checker now'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Scorecard */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          {statCards.map(s => (
            <div key={s.label} className="bg-black/40 border border-white/6 rounded-xl p-3 text-center">
              <div className={cn('text-xl font-medium', s.color)}>{s.value}</div>
              <div className="text-[10px] text-white/30 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Accuracy bar */}
        {scorecard && scorecard.total_checked > 0 && (
          <div className="mb-6 p-4 bg-black/40 border border-white/6 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/50">AYN accuracy track record</span>
              <span className="text-xs font-medium text-white">{scorecard.accuracy_pct}% ({scorecard.correct} correct of {scorecard.total_checked} checked)</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden flex">
              <div className="bg-emerald-500/80" style={{ width: `${(scorecard.correct / scorecard.total_checked) * 100}%` }} />
              <div className="bg-amber-500/60" style={{ width: `${(scorecard.partial / scorecard.total_checked) * 100}%` }} />
              <div className="bg-red-500/60" style={{ width: `${(scorecard.wrong / scorecard.total_checked) * 100}%` }} />
            </div>
            <div className="flex gap-4 mt-2 text-[10px] text-white/30">
              <span className="text-emerald-400/70">■ Correct</span>
              <span className="text-amber-400/70">■ Partial</span>
              <span className="text-red-400/70">■ Wrong</span>
              <span className="ml-auto">Last checked: {scorecard.last_verified_at ? format(new Date(scorecard.last_verified_at), 'MMM d HH:mm') : 'never'}</span>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 mb-4 border-b border-white/6">
          {['all', 'happening', 'pending', 'correct', 'partial', 'wrong'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('px-3 py-2 text-xs capitalize transition-all border-b-2 -mb-px',
                filter === f ? 'border-purple-400 text-purple-400' : 'border-transparent text-white/30 hover:text-white/50')}>
              {f}
              <span className="ml-1.5 text-[10px] opacity-60">
                {f === 'all' ? predictions.length : predictions.filter(p => p.check_status === f).length}
              </span>
            </button>
          ))}
        </div>

        {/* Predictions list */}
        <div className="space-y-3">
          {filteredPreds.map(pred => {
            const status = STATUS_CONFIG[pred.check_status] || STATUS_CONFIG.pending;
            const domainCol = DOMAIN_COLOR[pred.domain?.toLowerCase()] || '#6b7280';
            const isEditing = editingId === pred.id;
            const isExpired = pred.target_date < new Date().toISOString().split('T')[0];

            return (
              <motion.div key={pred.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="bg-black/50 border border-white/8 rounded-xl overflow-hidden">

                <div className="p-4">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border', status.bg, status.color)}>
                        {status.icon}{status.label}
                      </span>
                      {pred.is_happening_now && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 animate-pulse">
                          LIVE
                        </span>
                      )}
                      {pred.admin_override && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400">
                          Admin verified
                        </span>
                      )}
                      <span className="text-[9px] font-mono text-white/25">{pred.horizon?.replace(/_/g, ' ')} · expires {pred.target_date} {isExpired ? '(EXPIRED)' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className="text-[11px] font-medium text-white/70">{pred.probability_pct}%</div>
                        <div className="text-[9px] text-white/25">prob</div>
                      </div>
                      {pred.accuracy_score !== null && (
                        <div className="text-right">
                          <div className={cn('text-[11px] font-medium', pred.accuracy_score >= 70 ? 'text-emerald-400' : pred.accuracy_score >= 40 ? 'text-amber-400' : 'text-red-400')}>
                            {pred.accuracy_score}
                          </div>
                          <div className="text-[9px] text-white/25">score</div>
                        </div>
                      )}
                      <div className="text-right">
                        <div className="text-[11px] font-medium" style={{ color: pred.graph_coherence >= 80 ? '#34d399' : '#f59e0b' }}>{pred.graph_coherence}%</div>
                        <div className="text-[9px] text-white/25">coherence</div>
                      </div>
                      <button onClick={() => { setEditingId(isEditing ? null : pred.id); setEditStatus(pred.check_status); setEditNotes(pred.admin_notes || ''); }}
                        className="p-1.5 rounded-lg bg-white/4 hover:bg-white/8 text-white/30 hover:text-white/60 transition-all">
                        <Edit3 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Title + domain */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[7px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                      style={{ color: domainCol, background: `${domainCol}18`, border: `1px solid ${domainCol}30` }}>
                      {pred.domain}
                    </span>
                    <span className="text-[9px] text-white/25">{pred.region}</span>
                  </div>
                  <h3 className="text-[13px] font-medium text-white/90 mb-1.5">{pred.title}</h3>

                  {/* Winners / Losers */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="text-[10px]">
                      <span className="text-emerald-400/60 font-medium">↑ </span>
                      <span className="text-white/50">{pred.who_wins}</span>
                    </div>
                    <div className="text-[10px]">
                      <span className="text-red-400/60 font-medium">↓ </span>
                      <span className="text-white/50">{pred.who_loses}</span>
                    </div>
                  </div>

                  {/* Watch signal */}
                  {pred.what_to_watch && (
                    <div className="text-[10px] text-amber-400/60 mb-2">
                      <Eye size={9} className="inline mr-1" />Watch: {pred.what_to_watch}
                    </div>
                  )}

                  {/* Evidence found */}
                  {pred.evidence_found && (
                    <div className="mt-2 p-2.5 rounded-lg bg-white/3 border border-white/6">
                      <div className="text-[8px] font-medium text-white/30 uppercase mb-1 flex items-center gap-1">
                        <BarChart3 size={8} /> Real-world evidence
                        {pred.checked_at && <span className="ml-auto font-normal">checked {format(new Date(pred.checked_at), 'MMM d HH:mm')}</span>}
                      </div>
                      <p className="text-[10px] text-white/55 leading-relaxed">{pred.evidence_found}</p>
                      {pred.evidence_url && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {pred.evidence_url.split(', ').slice(0, 2).map((u, i) => (
                            <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                              className="text-[9px] text-blue-400/60 hover:text-blue-400 flex items-center gap-0.5 transition-colors">
                              <ExternalLink size={8} />source {i + 1}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {pred.what_happened && (
                    <p className="mt-1.5 text-[10px] text-white/35 italic">{pred.what_happened}</p>
                  )}

                  {pred.admin_notes && (
                    <div className="mt-2 text-[10px] text-purple-300/60 border-l-2 border-purple-500/30 pl-2">
                      {pred.admin_notes}
                    </div>
                  )}

                  {/* Manual override form */}
                  {isEditing && (
                    <div className="mt-3 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20 space-y-2">
                      <div className="text-[10px] text-purple-400/70 font-medium mb-2">Manual override</div>
                      <div className="flex gap-1.5 flex-wrap">
                        {['happening', 'correct', 'partial', 'wrong', 'pending'].map(s => (
                          <button key={s} onClick={() => setEditStatus(s)}
                            className={cn('text-[9px] px-2 py-1 rounded border capitalize transition-all',
                              editStatus === s ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' : 'border-white/10 text-white/30 hover:border-white/20')}>
                            {s}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={editNotes}
                        onChange={e => setEditNotes(e.target.value)}
                        placeholder="Your notes (optional)…"
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-[11px] text-white/70 placeholder-white/20 resize-none focus:outline-none focus:border-purple-500/30"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button onClick={() => saveOverride(pred.id)}
                          className="flex items-center gap-1 text-[10px] px-3 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 transition-all">
                          <Save size={10} />Save override
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="text-[10px] px-3 py-1.5 rounded-lg border border-white/8 text-white/30 hover:border-white/15 transition-all">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}

          {filteredPreds.length === 0 && !loading && (
            <div className="text-center py-12 text-white/25 text-sm">
              No predictions with status "{filter}"
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="mt-8 p-4 bg-white/2 border border-white/5 rounded-xl">
          <div className="text-[10px] font-medium text-white/40 uppercase tracking-wider mb-3">How the control system works</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              { icon: <Activity size={13} />, title: 'Daily auto-check', desc: 'Every morning at 08:00 UTC, AYN searches Brave news for evidence of each prediction and asks Gemini to judge it.' },
              { icon: <CheckCircle2 size={13} />, title: 'Status labels', desc: 'Happening = unfolding now. Correct = confirmed. Partial = right direction, wrong timing or magnitude. Wrong = contradicted.' },
              { icon: <Edit3 size={13} />, title: 'You override', desc: 'Click the edit icon on any prediction to manually set the verdict. Your override locks it and is never changed by the auto-checker.' },
              { icon: <Zap size={13} />, title: 'AYN learns', desc: 'Wrong and partial verdicts automatically write lessons into ayn_intelligence_lessons. Next graph engine run uses those lessons.' },
            ].map(item => (
              <div key={item.title} className="flex gap-2.5">
                <div className="text-purple-400/60 mt-0.5 shrink-0">{item.icon}</div>
                <div>
                  <div className="text-[10px] font-medium text-white/50 mb-0.5">{item.title}</div>
                  <div className="text-[9px] text-white/25 leading-relaxed">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
