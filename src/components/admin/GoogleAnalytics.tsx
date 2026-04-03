import { useState, useEffect, useCallback } from 'react';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { RefreshCw, Users, Eye, Globe, TrendingUp, Activity, Clock } from 'lucide-react';

interface VisitorStats {
  today: number;
  week: number;
  month: number;
  uniqueToday: number;
  uniqueWeek: number;
  topPages: { page: string; views: number }[];
  topCountries: { country: string; visits: number }[];
  byHour: { hour: number; visits: number }[];
  totalAllTime: number;
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white/3 border border-white/8 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-white/40 text-sm">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-bold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {sub && <div className="text-white/30 text-xs mt-1">{sub}</div>}
    </div>
  );
}

export const GoogleAnalytics = () => {
  const [stats, setStats] = useState<VisitorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_visitor_analytics', { p_days: 30 });
      if (error) throw error;
      const d = data as any;

      setStats({
        today: d.today_views || 0,
        week: d.week_views || 0,
        month: d.month_views || 0,
        uniqueToday: d.today_sessions || 0,
        uniqueWeek: d.week_sessions || 0,
        topPages: (d.top_pages || []).slice(0, 8).map((p: any) => ({ page: p.page_path, views: p.views })),
        topCountries: (d.by_country || []).slice(0, 6).map((c: any) => ({ country: c.country, visits: c.sessions })),
        byHour: [],
        totalAllTime: d.total_views || 0,
      });
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Analytics error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white/3 border border-white/8 rounded-xl p-5 h-24 animate-pulse" />
        ))}
      </div>
    </div>
  );

  if (!stats) return (
    <div className="p-6 text-center text-white/40">No analytics data available</div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold">Visitor Analytics</h2>
          <p className="text-white/30 text-sm">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Live data from aynn.io'}
          </p>
        </div>
        <button onClick={fetchStats} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-white/60 text-sm transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Today's Pageviews" value={stats.today} sub={`${stats.uniqueToday} unique sessions`}
          icon={Eye} color="bg-blue-500/20 text-blue-400" />
        <StatCard label="This Week" value={stats.week} sub={`${stats.uniqueWeek} unique visitors`}
          icon={TrendingUp} color="bg-green-500/20 text-green-400" />
        <StatCard label="This Month" value={stats.month} sub="pageviews"
          icon={Activity} color="bg-purple-500/20 text-purple-400" />
        <StatCard label="All Time" value={stats.totalAllTime} sub="total pageviews"
          icon={Globe} color="bg-amber-500/20 text-amber-400" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Top Pages */}
        <div className="bg-white/3 border border-white/8 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-4 h-4 text-white/40" />
            <span className="text-white font-medium text-sm">Top Pages (7 days)</span>
          </div>
          <div className="space-y-2">
            {stats.topPages.length === 0 ? (
              <div className="text-white/30 text-sm">No data</div>
            ) : stats.topPages.map(({ page, views }) => {
              const max = stats.topPages[0]?.views || 1;
              const pct = (views / max) * 100;
              return (
                <div key={page}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/60 truncate max-w-[180px]">{page || '/'}</span>
                    <span className="text-white/40">{views.toLocaleString()}</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full">
                    <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Countries */}
        <div className="bg-white/3 border border-white/8 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-4 h-4 text-white/40" />
            <span className="text-white font-medium text-sm">Top Countries (today)</span>
          </div>
          <div className="space-y-2">
            {stats.topCountries.length === 0 ? (
              <div className="text-white/30 text-sm">No country data</div>
            ) : stats.topCountries.map(({ country, visits }) => {
              const max = stats.topCountries[0]?.visits || 1;
              const pct = (visits / max) * 100;
              return (
                <div key={country}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/60">{country}</span>
                    <span className="text-white/40">{visits.toLocaleString()}</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full">
                    <div className="h-full bg-green-500/60 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="text-white/20 text-xs text-center">
        Data from internal visitor_analytics table • 28,978+ total events tracked
      </div>
    </div>
  );
};
