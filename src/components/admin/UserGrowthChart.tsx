import { useState, useEffect, useCallback } from 'react';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { TrendingUp, RefreshCw } from 'lucide-react';

interface WeekData { week: string; signups: number; cumulative: number; }

export const UserGrowthChart = () => {
  const [data, setData] = useState<WeekData[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'weekly' | 'cumulative'>('cumulative');

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data: usersRaw } = await supabase.rpc('get_admin_user_growth');
      const users = usersRaw || [];
      const rows = (users || []) as { signed_up_at: string }[];

      // Group by week
      const weekMap = new Map<string, number>();
      rows.forEach(r => {
        const d = new Date(r.signed_up_at);
        d.setHours(0,0,0,0);
        d.setDate(d.getDate() - d.getDay()); // start of week
        const key = d.toISOString().slice(0, 10);
        weekMap.set(key, (weekMap.get(key) || 0) + 1);
      });

      const sorted = Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      let cum = 0;
      const weeks: WeekData[] = sorted.map(([week, signups]) => {
        cum += signups;
        return { week, signups, cumulative: cum };
      });
      setData(weeks);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const vals = data.map(d => view === 'cumulative' ? d.cumulative : d.signups);
  const max = Math.max(...vals, 1);
  const total = data.reduce((s, d) => s + d.signups, 0);
  const lastWeek = data[data.length - 1]?.signups || 0;
  const prevWeek = data[data.length - 2]?.signups || 0;
  const growth = prevWeek > 0 ? Math.round(((lastWeek - prevWeek) / prevWeek) * 100) : 0;

  const formatWeek = (w: string) => {
    const d = new Date(w);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-medium flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-400" />User Growth</h3>
          <p className="text-white/30 text-xs">{total} total users</p>
        </div>
        <div className="flex gap-2 items-center">
          {(['cumulative','weekly'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${view === v ? 'bg-white text-black' : 'bg-white/5 text-white/50'}`}>{v}</button>
          ))}
          <button onClick={fetch} disabled={loading} className="p-1.5 rounded-lg bg-white/5 text-white/40">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/3 border border-white/8 rounded-xl p-3 text-center">
          <div className="text-white text-xl font-bold">{total}</div>
          <div className="text-white/30 text-xs">Total Users</div>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-xl p-3 text-center">
          <div className="text-white text-xl font-bold">{lastWeek}</div>
          <div className="text-white/30 text-xs">This Week</div>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-xl p-3 text-center">
          <div className={`text-xl font-bold ${growth > 0 ? 'text-green-400' : growth < 0 ? 'text-red-400' : 'text-white/40'}`}>
            {growth > 0 ? '+' : ''}{growth}%
          </div>
          <div className="text-white/30 text-xs">WoW Growth</div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="bg-white/3 border border-white/8 rounded-xl p-5">
        {loading ? (
          <div className="h-32 flex items-center justify-center text-white/30 text-sm">Loading...</div>
        ) : data.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-white/30 text-sm">No data</div>
        ) : (
          <>
            <div className="flex items-end gap-1 h-40">
              {data.map((d, i) => {
                const val = view === 'cumulative' ? d.cumulative : d.signups;
                const h = Math.round((val / max) * 100);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                    {/* Tooltip */}
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black border border-white/10 rounded px-2 py-1 text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      {formatWeek(d.week)}: {val}
                    </div>
                    <div className="w-full bg-blue-500/70 hover:bg-blue-400 transition-colors rounded-t"
                      style={{ height: `${Math.max(h, 2)}%` }} />
                  </div>
                );
              })}
            </div>
            {/* X axis labels — show every other */}
            <div className="flex gap-1 mt-2">
              {data.map((d, i) => (
                <div key={i} className="flex-1 text-center">
                  {i % Math.max(1, Math.floor(data.length / 6)) === 0 && (
                    <span className="text-white/20 text-xs">{formatWeek(d.week)}</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
