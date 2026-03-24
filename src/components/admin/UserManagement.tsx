import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, RefreshCw, Mail, Activity, TrendingUp, Clock, Shield, User } from 'lucide-react';
import { toast } from 'sonner';

interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  auth_provider: string;
  signed_up_at: string;
  last_sign_in_at: string | null;
  last_active_at: string | null;
  email_verified: boolean;
  contact_person: string | null;
  company_name: string | null;
  role: string;
  subscription_tier: string;
  subscription_status: string;
  is_active: boolean;
  current_month_usage: number | null;
  monthly_limit: number | null;
  total_messages: number;
  messages_7d: number;
  messages_30d: number;
  active_days_total: number;
  days_since_last_use: number | null;
}

function timeAgo(date: string | null): string {
  if (!date) return 'Never';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function activityLevel(user: AdminUser): { label: string; color: string } {
  if (user.messages_7d > 20) return { label: 'Very Active', color: 'bg-green-500/20 text-green-400 border-green-500/30' };
  if (user.messages_7d > 5) return { label: 'Active', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
  if (user.messages_30d > 0) return { label: 'Occasional', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
  if (user.total_messages > 0) return { label: 'Inactive', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' };
  return { label: 'Never Used', color: 'bg-red-500/20 text-red-400 border-red-500/30' };
}

export const UserManagement = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'never'>('all');
  const [sortBy, setSortBy] = useState<'signed_up' | 'last_active' | 'messages' | 'name'>('signed_up');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_users_view')
        .select('*');
      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      toast.error('Failed to load users: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const filtered = users
    .filter(u => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        u.email.toLowerCase().includes(q) ||
        u.display_name.toLowerCase().includes(q) ||
        (u.company_name || '').toLowerCase().includes(q);

      const matchFilter =
        filter === 'all' ? true :
        filter === 'active' ? u.messages_7d > 0 :
        filter === 'inactive' ? (u.total_messages > 0 && u.messages_30d === 0) :
        filter === 'never' ? u.total_messages === 0 : true;

      return matchSearch && matchFilter;
    })
    .sort((a, b) => {
      if (sortBy === 'last_active') return (b.last_active_at || '0').localeCompare(a.last_active_at || '0');
      if (sortBy === 'messages') return b.total_messages - a.total_messages;
      if (sortBy === 'name') return a.display_name.localeCompare(b.display_name);
      return (b.signed_up_at || '').localeCompare(a.signed_up_at || '');
    });

  const stats = {
    total: users.length,
    active7d: users.filter(u => u.messages_7d > 0).length,
    neverUsed: users.filter(u => u.total_messages === 0).length,
    google: users.filter(u => u.auth_provider === 'google').length,
    email: users.filter(u => u.auth_provider === 'email').length,
  };

  const tierColor = (tier: string) => {
    if (tier === 'unlimited') return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    if (tier === 'pro') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (tier === 'starter') return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    return 'bg-white/5 text-white/40 border-white/10';
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Total Users', value: stats.total, icon: User },
          { label: 'Active 7d', value: stats.active7d, icon: Activity },
          { label: 'Never Used', value: stats.neverUsed, icon: TrendingUp },
          { label: 'Via Google', value: stats.google, icon: Shield },
          { label: 'Via Email', value: stats.email, icon: Mail },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white/3 border border-white/8 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className="w-3.5 h-3.5 text-white/40" />
              <span className="text-white/40 text-xs">{label}</span>
            </div>
            <div className="text-2xl font-bold text-white">{value}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input
            placeholder="Search by name, email, or company..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-white placeholder-white/30"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'active', 'inactive', 'never'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                filter === f ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}>
              {f === 'never' ? 'Never Used' : f}
            </button>
          ))}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          className="bg-white/5 border border-white/10 text-white/60 text-xs rounded-lg px-3 py-2">
          <option value="signed_up">Sort: Newest</option>
          <option value="last_active">Sort: Last Active</option>
          <option value="messages">Sort: Most Messages</option>
          <option value="name">Sort: Name</option>
        </select>
        <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}
          className="border-white/10 text-white/60 hover:bg-white/5">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* User count */}
      <div className="text-white/30 text-xs">
        Showing {filtered.length} of {users.length} users
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/8 overflow-hidden">
        <table className="w-full">
          <thead className="bg-white/3 border-b border-white/8">
            <tr>
              <th className="text-left px-4 py-3 text-white/40 text-xs font-medium">User</th>
              <th className="text-left px-4 py-3 text-white/40 text-xs font-medium">Provider</th>
              <th className="text-left px-4 py-3 text-white/40 text-xs font-medium">Plan</th>
              <th className="text-left px-4 py-3 text-white/40 text-xs font-medium">Activity</th>
              <th className="text-left px-4 py-3 text-white/40 text-xs font-medium">Messages</th>
              <th className="text-left px-4 py-3 text-white/40 text-xs font-medium">Last Active</th>
              <th className="text-left px-4 py-3 text-white/40 text-xs font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-white/30 text-sm">Loading users...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-white/30 text-sm">No users found</td></tr>
            ) : filtered.map(user => {
              const activity = activityLevel(user);
              const isExpanded = expandedUser === user.id;
              return (
                <>
                  <tr key={user.id}
                    onClick={() => setExpandedUser(isExpanded ? null : user.id)}
                    className="hover:bg-white/3 cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 text-sm font-medium">
                            {(user.display_name || user.email)[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="text-white text-sm font-medium flex items-center gap-1.5">
                            {user.display_name}
                            {user.role === 'admin' && <Shield className="w-3 h-3 text-amber-400" />}
                          </div>
                          <div className="text-white/40 text-xs">{user.email}</div>
                          {user.company_name && (
                            <div className="text-white/25 text-xs">{user.company_name}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {user.auth_provider === 'google' ? (
                          <span className="flex items-center gap-1 text-xs text-white/60">
                            <svg width="12" height="12" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                            Google
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-white/60">
                            <Mail className="w-3 h-3" /> Email
                          </span>
                        )}
                        {!user.email_verified && (
                          <span className="text-xs text-red-400/70">⚠ unverified</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${tierColor(user.subscription_tier)}`}>
                        {user.subscription_tier}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${activity.color}`}>
                        {activity.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white text-sm font-medium">{user.total_messages.toLocaleString()}</div>
                      <div className="text-white/30 text-xs">
                        {user.messages_7d > 0 && <span className="text-green-400">{user.messages_7d} this week</span>}
                        {user.messages_7d === 0 && user.messages_30d > 0 && <span className="text-yellow-400/70">{user.messages_30d} this month</span>}
                        {user.messages_30d === 0 && user.total_messages > 0 && <span>none recently</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white/70 text-sm">{timeAgo(user.last_active_at)}</div>
                      {user.active_days_total > 0 && (
                        <div className="text-white/30 text-xs">{user.active_days_total} active days</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white/60 text-sm">{formatDate(user.signed_up_at)}</div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${user.id}-expanded`} className="bg-white/2">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-white/30 text-xs mb-1">ACCOUNT</div>
                            <div className="space-y-1">
                              <div className="text-white/60">ID: <span className="text-white/40 font-mono text-xs">{user.id.slice(0,8)}...</span></div>
                              <div className="text-white/60">Role: <span className="text-white capitalize">{user.role}</span></div>
                              <div className="text-white/60">Status: <span className={user.is_active ? 'text-green-400' : 'text-red-400'}>{user.is_active ? 'Active' : 'Inactive'}</span></div>
                              <div className="text-white/60">Verified: <span className={user.email_verified ? 'text-green-400' : 'text-red-400'}>{user.email_verified ? 'Yes' : 'No'}</span></div>
                            </div>
                          </div>
                          <div>
                            <div className="text-white/30 text-xs mb-1">USAGE</div>
                            <div className="space-y-1">
                              <div className="text-white/60">Total messages: <span className="text-white">{user.total_messages}</span></div>
                              <div className="text-white/60">Last 7 days: <span className="text-white">{user.messages_7d}</span></div>
                              <div className="text-white/60">Last 30 days: <span className="text-white">{user.messages_30d}</span></div>
                              <div className="text-white/60">Active days: <span className="text-white">{user.active_days_total}</span></div>
                            </div>
                          </div>
                          <div>
                            <div className="text-white/30 text-xs mb-1">SUBSCRIPTION</div>
                            <div className="space-y-1">
                              <div className="text-white/60">Plan: <span className="text-white capitalize">{user.subscription_tier}</span></div>
                              <div className="text-white/60">Status: <span className="text-white capitalize">{user.subscription_status}</span></div>
                              {user.monthly_limit && <div className="text-white/60">Monthly limit: <span className="text-white">{user.monthly_limit}</span></div>}
                              {user.current_month_usage != null && <div className="text-white/60">Used this month: <span className="text-white">{user.current_month_usage}</span></div>}
                            </div>
                          </div>
                          <div>
                            <div className="text-white/30 text-xs mb-1">TIMELINE</div>
                            <div className="space-y-1">
                              <div className="text-white/60">Joined: <span className="text-white">{formatDate(user.signed_up_at)}</span></div>
                              <div className="text-white/60">Last sign in: <span className="text-white">{timeAgo(user.last_sign_in_at)}</span></div>
                              <div className="text-white/60">Last message: <span className="text-white">{timeAgo(user.last_active_at)}</span></div>
                              {user.days_since_last_use != null && (
                                <div className="text-white/60">Days inactive: <span className="text-white">{Math.floor(user.days_since_last_use)}</span></div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
