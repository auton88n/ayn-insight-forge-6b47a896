import { useState, useMemo } from 'react';
import { AlertTriangle, RefreshCw, Clock, Mail, TrendingDown } from 'lucide-react';
import { useAdminChurnAlerts, adminKeys } from '@/admin-app/hooks/useAdminQuery';
import { useQueryClient } from '@tanstack/react-query';

interface ChurnUser {
  id: string; display_name: string; email: string; auth_provider: string;
  subscription_tier: string; total_messages: number; messages_30d: number;
  last_active_at: string | null; signed_up_at: string; days_inactive: number;
}

function riskLevel(u: ChurnUser): { label: string; color: string } {
  if (u.total_messages === 0) return { label: 'Never Used', color: 'bg-red-500/15 text-red-400 border-red-500/20' };
  if (u.days_inactive > 60) return { label: 'High Risk', color: 'bg-red-500/15 text-red-400 border-red-500/20' };
  if (u.days_inactive > 30) return { label: 'Medium Risk', color: 'bg-orange-500/15 text-orange-400 border-orange-500/20' };
  return { label: 'At Risk', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' };
}

export const ChurnAlerts = () => {
  const queryClient = useQueryClient();
  const { data: rawData, isLoading: loading } = useAdminChurnAlerts();
  const users = useMemo(() => {
    const arr = Array.isArray(rawData) ? rawData : [];
    return arr.map((u: any) => ({
      ...u,
      display_name: u.display_name || u.email || 'Unknown',
      days_inactive: Number(u.days_inactive || 0),
      total_messages: Number(u.total_messages || 0)
    })) as ChurnUser[];
  }, [rawData]);
  const [threshold, setThreshold] = useState(14);

  const neverUsed = users.filter(u => u.total_messages === 0).length;
  const highRisk = users.filter(u => u.days_inactive > 60 && u.total_messages > 0).length;
  const paid = users.filter(u => u.subscription_tier !== 'free').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-medium flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-400" />Churn Alerts</h3>
          <p className="text-white/30 text-xs">{users.length} users need attention</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/30 text-xs">Inactive for</span>
          <select value={threshold} onChange={e => setThreshold(Number(e.target.value))}
            className="bg-white/5 border border-white/10 text-white/60 text-xs rounded-lg px-2 py-1">
            {[7,14,30,60].map(d => <option key={d} value={d}>{d}+ days</option>)}
          </select>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: adminKeys.churnAlerts() })} disabled={loading} className="p-1.5 rounded-lg bg-white/5 text-white/40">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
          <div className="text-red-400 text-xl font-bold">{neverUsed}</div>
          <div className="text-red-400/50 text-xs">Never Used</div>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 text-center">
          <div className="text-orange-400 text-xl font-bold">{highRisk}</div>
          <div className="text-orange-400/50 text-xs">High Risk (60d+)</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
          <div className="text-amber-400 text-xl font-bold">{paid}</div>
          <div className="text-amber-400/50 text-xs">Paid + At Risk</div>
        </div>
      </div>

      <div className="space-y-2">
        {loading ? <div className="text-center py-8 text-white/30 text-sm">Loading...</div>
        : users.length === 0 ? <div className="text-center py-8 text-white/30 text-sm">No users at risk 🎉</div>
        : users.map(u => {
          const risk = riskLevel(u);
          return (
            <div key={u.id} className="flex items-center gap-4 px-4 py-3 bg-white/2 border border-white/6 rounded-xl hover:bg-white/4 transition-colors">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 text-sm flex-shrink-0">
                {(u.display_name || u.email)[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white/80 text-sm font-medium">{u.display_name}</div>
                <div className="text-white/30 text-xs">{u.email}</div>
              </div>
              <div className="text-center">
                <div className="text-white/60 text-sm font-medium">{u.total_messages}</div>
                <div className="text-white/25 text-xs">messages</div>
              </div>
              <div className="text-center">
                <div className="flex items-center gap-1 text-white/50 text-sm"><Clock className="w-3 h-3" />{u.days_inactive}d</div>
                <div className="text-white/25 text-xs">inactive</div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${risk.color}`}>{risk.label}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${u.subscription_tier === 'free' ? 'bg-white/5 text-white/30 border-white/10' : 'bg-purple-500/10 text-purple-400 border-purple-500/20'}`}>
                {u.subscription_tier}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
