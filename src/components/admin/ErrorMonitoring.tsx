import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, RefreshCw, Bug, Clock, User, ChevronDown, ChevronRight } from 'lucide-react';

interface ErrorGroup {
  message: string;
  count: number;
  last_seen: string;
  first_seen: string;
  user_ids: string[];
  urls: string[];
  sample_stack: string | null;
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const h = Math.floor(diff / 3600000);
  const dy = Math.floor(diff / 86400000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${dy}d ago`;
}

export const ErrorMonitoring = () => {
  const [groups, setGroups] = useState<ErrorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [totalErrors, setTotalErrors] = useState(0);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('error_logs').select('error_message, error_stack, url, user_id, created_at');
      if (timeRange !== 'all') {
        const ms = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 }[timeRange];
        query = query.gte('created_at', new Date(Date.now() - ms).toISOString());
      }
      const { data } = await query.order('created_at', { ascending: false }).limit(2000);
      const rows = data || [];
      setTotalErrors(rows.length);

      // Group by error message
      const map = new Map<string, ErrorGroup>();
      rows.forEach((r: any) => {
        const key = (r.error_message || 'Unknown error').slice(0, 120);
        if (!map.has(key)) {
          map.set(key, { message: key, count: 0, last_seen: r.created_at, first_seen: r.created_at, user_ids: [], urls: [], sample_stack: r.error_stack });
        }
        const g = map.get(key)!;
        g.count++;
        if (r.created_at > g.last_seen) g.last_seen = r.created_at;
        if (r.created_at < g.first_seen) g.first_seen = r.created_at;
        if (r.user_id && !g.user_ids.includes(r.user_id)) g.user_ids.push(r.user_id);
        if (r.url && !g.urls.includes(r.url)) g.urls.push(r.url);
      });

      setGroups(Array.from(map.values()).sort((a, b) => b.count - a.count));
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => { fetch(); }, [fetch]);

  const severityColor = (count: number) => {
    if (count > 100) return 'text-red-400 bg-red-500/10 border-red-500/20';
    if (count > 20) return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
    if (count > 5) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
    return 'text-white/40 bg-white/5 border-white/10';
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-lg flex items-center gap-2"><Bug className="w-5 h-5 text-red-400" />Error Monitoring</h2>
          <p className="text-white/30 text-sm">{totalErrors} total errors — {groups.length} unique issues</p>
        </div>
        <div className="flex gap-2 items-center">
          {(['24h','7d','30d','all'] as const).map(t => (
            <button key={t} onClick={() => setTimeRange(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${timeRange === t ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>{t}</button>
          ))}
          <button onClick={fetch} disabled={loading} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <div className="text-red-400 text-2xl font-bold">{groups.filter(g => g.count > 100).length}</div>
          <div className="text-red-400/60 text-xs mt-1">Critical (&gt;100 occurrences)</div>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
          <div className="text-orange-400 text-2xl font-bold">{groups.filter(g => g.count > 5 && g.count <= 100).length}</div>
          <div className="text-orange-400/60 text-xs mt-1">Warning (5–100)</div>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-xl p-4">
          <div className="text-white text-2xl font-bold">{groups.filter(g => g.user_ids.length > 0).length}</div>
          <div className="text-white/30 text-xs mt-1">Affecting users</div>
        </div>
      </div>

      {/* Error list */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-12 text-white/30">Loading errors...</div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12 text-white/30">No errors in this time range 🎉</div>
        ) : groups.map((g, i) => (
          <div key={i} className="border border-white/8 rounded-xl overflow-hidden">
            <button className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/3 transition-colors text-left"
              onClick={() => setExpanded(expanded === g.message ? null : g.message)}>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${severityColor(g.count)}`}>{g.count}</span>
              <div className="flex-1 min-w-0">
                <div className="text-white/80 text-sm font-mono truncate">{g.message}</div>
                <div className="text-white/30 text-xs flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Last: {timeAgo(g.last_seen)}</span>
                  {g.user_ids.length > 0 && <span className="flex items-center gap-1"><User className="w-3 h-3" />{g.user_ids.length} user{g.user_ids.length > 1 ? 's' : ''}</span>}
                  {g.urls.length > 0 && <span className="truncate max-w-48">{g.urls[0]}</span>}
                </div>
              </div>
              {expanded === g.message ? <ChevronDown className="w-4 h-4 text-white/30 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0" />}
            </button>
            {expanded === g.message && (
              <div className="border-t border-white/8 px-4 py-3 bg-white/2 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div><span className="text-white/30">First seen:</span> <span className="text-white/60">{new Date(g.first_seen).toLocaleString()}</span></div>
                  <div><span className="text-white/30">Last seen:</span> <span className="text-white/60">{new Date(g.last_seen).toLocaleString()}</span></div>
                  <div><span className="text-white/30">Affected users:</span> <span className="text-white/60">{g.user_ids.length > 0 ? g.user_ids.length : 'anonymous'}</span></div>
                  <div><span className="text-white/30">Occurrences:</span> <span className="text-white/60">{g.count}</span></div>
                </div>
                {g.sample_stack && (
                  <div>
                    <div className="text-white/30 text-xs mb-1">Stack trace (sample):</div>
                    <pre className="text-white/50 text-xs bg-black/30 rounded-lg p-3 overflow-x-auto max-h-32 font-mono whitespace-pre-wrap">{g.sample_stack.slice(0, 500)}</pre>
                  </div>
                )}
                {g.urls.length > 0 && (
                  <div>
                    <div className="text-white/30 text-xs mb-1">URLs:</div>
                    <div className="space-y-1">{g.urls.slice(0, 3).map((url, j) => (
                      <div key={j} className="text-white/50 text-xs font-mono truncate">{url}</div>
                    ))}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
