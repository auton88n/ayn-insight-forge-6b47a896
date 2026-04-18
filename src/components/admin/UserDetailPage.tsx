import { spineApi, adminApi } from '@/lib/spineApi';
import { useState, useEffect, useCallback } from 'react';
import { adminApi as supabase } from '@/lib/adminApi';
import { Search, User, Mail, Shield, MessageSquare, Clock, TrendingUp, Activity, RefreshCw, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface UserFull {
  id: string; email: string; display_name: string; avatar_url: string | null;
  auth_provider: string; email_verified: boolean; signed_up_at: string;
  last_sign_in_at: string | null; last_active_at: string | null;
  subscription_tier: string; subscription_status: string;
  is_unlimited: boolean; monthly_messages: number; current_monthly_messages: number; bonus_credits: number;
  total_messages: number; messages_7d: number; messages_30d: number;
  active_days_total: number; role: string; company_name: string | null; contact_person: string | null;
}
interface RecentMsg { id: string; content: string; sender: string; created_at: string; }

function timeAgo(d: string | null) {
  if (!d) return 'Never';
  const diff = Date.now() - new Date(d).getTime();
  const h = Math.floor(diff / 3600000); const dy = Math.floor(diff / 86400000);
  if (h < 1) return 'Just now'; if (h < 24) return `${h}h ago`;
  if (dy < 30) return `${dy}d ago`; return `${Math.floor(dy/30)}mo ago`;
}

export const UserDetailPage = () => {
  const [users, setUsers] = useState<UserFull[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<UserFull | null>(null);
  const [recentMsgs, setRecentMsgs] = useState<RecentMsg[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const data = await adminApi.getUsers();
    setUsers((data || []) as UserFull[]);
    setLoading(false);
  }, []);

  const fetchUserMsgs = useCallback(async (uid: string) => {
    setLoadingMsgs(true);
    const data = await adminApi.getUserMessages(uid);
    setRecentMsgs((Array.isArray(data) ? data : []) as RecentMsg[]);
    setLoadingMsgs(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { if (selected) fetchUserMsgs(selected.id); }, [selected, fetchUserMsgs]);

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q || u.email.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q);
  });

  const tierColor = (t: string) => {
    if (t === 'unlimited') return 'text-emerald-400'; if (t === 'pro') return 'text-purple-400';
    if (t === 'starter') return 'text-blue-400'; return 'text-white/40';
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-lg flex items-center gap-2"><User className="w-5 h-5 text-purple-400" />User Details</h2>
          <p className="text-white/30 text-sm">Full profile drill-down for every user</p>
        </div>
        <button onClick={fetchUsers} disabled={loading} className="p-2 rounded-lg bg-white/5 text-white/40 hover:bg-white/10">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* User list */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-white/5 border-white/10 text-white placeholder-white/30 h-9 text-sm" />
          </div>
          <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
            {loading ? <div className="text-center py-8 text-white/30 text-sm">Loading...</div>
            : filtered.map(u => (
              <button key={u.id} onClick={() => setSelected(u)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors flex items-center gap-2 ${selected?.id === u.id ? 'bg-white/10 border border-white/15' : 'bg-white/2 border border-white/6 hover:bg-white/5'}`}>
                {u.avatar_url ? <img src={u.avatar_url} className="w-7 h-7 rounded-full flex-shrink-0" alt="" />
                  : <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/50 text-xs flex-shrink-0">{(u.display_name)[0].toUpperCase()}</div>}
                <div className="flex-1 min-w-0">
                  <div className="text-white/80 text-xs font-medium truncate">{u.display_name}</div>
                  <div className="text-white/30 text-xs truncate">{u.email}</div>
                </div>
                <div className={`text-xs font-medium ${tierColor(u.subscription_tier)}`}>{u.total_messages}</div>
                <ChevronRight className="w-3 h-3 text-white/20 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="col-span-2">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-white/20 text-sm border border-white/6 rounded-xl">Select a user</div>
          ) : (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center gap-4 bg-white/3 border border-white/8 rounded-xl p-4">
                {selected.avatar_url ? <img src={selected.avatar_url} className="w-14 h-14 rounded-full" alt="" />
                  : <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-white/50 text-xl font-bold">{selected.display_name[0].toUpperCase()}</div>}
                <div className="flex-1">
                  <div className="text-white text-lg font-semibold flex items-center gap-2">
                    {selected.display_name}
                    {selected.role === 'admin' && <Shield className="w-4 h-4 text-amber-400" />}
                  </div>
                  <div className="text-white/50 text-sm">{selected.email}</div>
                  {selected.company_name && <div className="text-white/30 text-xs">{selected.company_name}</div>}
                </div>
                <div className="text-right">
                  <div className={`text-sm font-medium capitalize ${tierColor(selected.subscription_tier)}`}>{selected.subscription_tier}</div>
                  <div className="text-white/30 text-xs">via {selected.auth_provider}</div>
                  {selected.email_verified ? <div className="text-green-400/60 text-xs">✓ verified</div> : <div className="text-red-400/60 text-xs">✗ unverified</div>}
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Total Msgs', value: selected.total_messages, icon: MessageSquare },
                  { label: 'This Week', value: selected.messages_7d, icon: TrendingUp },
                  { label: 'Active Days', value: selected.active_days_total, icon: Activity },
                  { label: 'Last Active', value: timeAgo(selected.last_active_at), icon: Clock },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="bg-white/3 border border-white/8 rounded-xl p-3 text-center">
                    <Icon className="w-4 h-4 text-white/30 mx-auto mb-1" />
                    <div className="text-white font-bold">{value}</div>
                    <div className="text-white/30 text-xs">{label}</div>
                  </div>
                ))}
              </div>

              {/* Two columns */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-2 text-sm">
                  <div className="text-white/40 text-xs font-medium mb-2">ACCOUNT</div>
                  <div className="flex justify-between"><span className="text-white/40">Joined</span><span className="text-white/70">{new Date(selected.signed_up_at).toLocaleDateString()}</span></div>
                  <div className="flex justify-between"><span className="text-white/40">Last sign in</span><span className="text-white/70">{timeAgo(selected.last_sign_in_at)}</span></div>
                  <div className="flex justify-between"><span className="text-white/40">Role</span><span className="text-white/70 capitalize">{selected.role}</span></div>
                  <div className="flex justify-between"><span className="text-white/40">Provider</span><span className="text-white/70 capitalize">{selected.auth_provider}</span></div>
                </div>
                <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-2 text-sm">
                  <div className="text-white/40 text-xs font-medium mb-2">SUBSCRIPTION</div>
                  <div className="flex justify-between"><span className="text-white/40">Plan</span><span className={`capitalize font-medium ${tierColor(selected.subscription_tier)}`}>{selected.subscription_tier}</span></div>
                  <div className="flex justify-between"><span className="text-white/40">Status</span><span className="text-white/70 capitalize">{selected.subscription_status}</span></div>
                  <div className="flex justify-between"><span className="text-white/40">Credits</span><span className="text-white/70">{selected.is_unlimited ? '∞' : `${selected.current_monthly_messages}/${selected.monthly_messages}`}</span></div>
                  {selected.bonus_credits > 0 && <div className="flex justify-between"><span className="text-white/40">Bonus</span><span className="text-amber-400">+{selected.bonus_credits}</span></div>}
                </div>
              </div>

              {/* Recent messages */}
              <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/8 text-white/40 text-xs font-medium">RECENT MESSAGES</div>
                <div className="divide-y divide-white/5 max-h-40 overflow-y-auto">
                  {loadingMsgs ? <div className="px-4 py-6 text-center text-white/30 text-sm">Loading...</div>
                  : recentMsgs.length === 0 ? <div className="px-4 py-6 text-center text-white/30 text-sm">No messages yet</div>
                  : recentMsgs.map(m => (
                    <div key={m.id} className="px-4 py-2.5 flex items-start gap-3">
                      <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${m.sender === 'user' ? 'bg-white/8 text-white/40' : 'bg-blue-500/10 text-blue-400/70'}`}>{m.sender}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-white/60 text-xs truncate">{m.content?.slice(0, 100)}</div>
                        <div className="text-white/20 text-xs">{timeAgo(m.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
