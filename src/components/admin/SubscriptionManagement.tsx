import { useState, useMemo } from 'react';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { toast } from 'sonner';
import { Search, RefreshCw, Edit2, Mail, Shield, Chrome, Users, Crown, Zap, Infinity as InfinityIcon, User, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { SUBSCRIPTION_TIERS, type TierKey } from '@/contexts/SubscriptionContext';
import { useAdminSubscriptions, adminKeys } from '@/admin-app/hooks/useAdminQuery';
import { useQueryClient } from '@tanstack/react-query';

// The one true user record — everything in one place
interface UnifiedUser {
  // Identity
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  auth_provider: string; // 'google' | 'email'
  email_verified: boolean;
  signed_up_at: string;
  last_sign_in_at: string | null;
  // Plan
  subscription_tier: string;
  subscription_status: string;
  is_unlimited: boolean;
  monthly_messages: number;
  current_monthly_messages: number;
  bonus_credits: number;
  // Usage
  total_messages: number;
  messages_7d: number;
  messages_30d: number;
  last_active_at: string | null;
  active_days_total: number;
  // Role
  role: string;
}

const TIERS: { id: TierKey; label: string; icon: React.ElementType; color: string; bg: string }[] = [
  { id: 'free', label: 'Free', icon: User, color: 'text-white/50', bg: 'bg-white/5' },
  { id: 'starter', label: 'Starter', icon: Zap, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { id: 'pro', label: 'Pro', icon: Crown, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { id: 'business', label: 'Business', icon: Users, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  { id: 'unlimited', label: 'Unlimited', icon: InfinityIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
];

function tierColor(tier: string) {
  if (tier === 'unlimited') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  if (tier === 'pro') return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
  if (tier === 'starter') return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
  if (tier === 'business') return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return 'bg-white/5 text-white/40 border-white/10';
}

function timeAgo(date: string | null) {
  if (!date) return 'Never';
  const d = Date.now() - new Date(date).getTime();
  const m = Math.floor(d / 60000);
  const h = Math.floor(d / 3600000);
  const dy = Math.floor(d / 86400000);
  if (m < 2) return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (dy < 30) return `${dy}d ago`;
  return `${Math.floor(dy / 30)}mo ago`;
}

export const SubscriptionManagement = () => {
  const queryClient = useQueryClient();
  const { data: rawData, isLoading: loading } = useAdminSubscriptions();
  const users = useMemo(() => (Array.isArray(rawData) ? rawData : []) as UnifiedUser[], [rawData]);
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState('all');
  const [filterProvider, setFilterProvider] = useState('all');
  const [editing, setEditing] = useState<UnifiedUser | null>(null);
  const [newTier, setNewTier] = useState<TierKey>('free');
  const [customLimit, setCustomLimit] = useState(100);
  const [useCustom, setUseCustom] = useState(false);
  const [updating, setUpdating] = useState(false);

  const fetchUsers = () => queryClient.invalidateQueries({ queryKey: adminKeys.subscriptions() });

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.email.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q);
    const matchTier = filterTier === 'all' || u.subscription_tier === filterTier;
    const matchProvider = filterProvider === 'all' || u.auth_provider === filterProvider;
    return matchSearch && matchTier && matchProvider;
  });

  // Metrics
  const metrics = {
    total: users.length,
    google: users.filter(u => u.auth_provider === 'google').length,
    email: users.filter(u => u.auth_provider === 'email').length,
    unlimited: users.filter(u => u.is_unlimited).length,
    active7d: users.filter(u => u.messages_7d > 0).length,
    paid: users.filter(u => u.subscription_tier !== 'free' && u.subscription_status === 'active').length,
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setUpdating(true);
    try {
      const tierData = SUBSCRIPTION_TIERS[newTier as keyof typeof SUBSCRIPTION_TIERS];
      const limit = useCustom ? customLimit : (tierData?.limits?.monthlyCredits ?? 50);
      const isUnlimited = newTier === 'unlimited' || newTier === 'enterprise';

      // Update user_subscriptions
      const { error: subErr } = await supabase.from('user_subscriptions').upsert({
        user_id: editing.id,
        subscription_tier: newTier,
        status: newTier === 'free' ? 'inactive' : 'active',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (subErr) throw subErr;

      // Update user_ai_limits (the real enforced system)
      const { error: limErr } = await supabase.from('user_ai_limits').upsert({
        user_id: editing.id,
        monthly_messages: isUnlimited ? 999999 : limit,
        daily_messages: isUnlimited ? 999999 : Math.floor(limit / 30),
        is_unlimited: isUnlimited,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (limErr) throw limErr;

      // Update access_grants for backward compat
      await supabase.from('access_grants').update({
        monthly_limit: isUnlimited ? -1 : limit,
        updated_at: new Date().toISOString(),
      }).eq('user_id', editing.id);

      toast.success(`${editing.display_name} updated to ${newTier}`);
      setEditing(null);
      setUseCustom(false);
      fetchUsers();
    } catch (e: any) {
      toast.error('Update failed: ' + e.message);
    } finally {
      setUpdating(false);
    }
  };

  const openEdit = (u: UnifiedUser) => {
    setEditing(u);
    setNewTier((u.subscription_tier || 'free') as TierKey);
    setCustomLimit(u.monthly_messages || 50);
    setUseCustom(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: 'Total Users', value: metrics.total, color: 'text-white' },
          { label: 'Via Google', value: metrics.google, color: 'text-blue-400' },
          { label: 'Via Email', value: metrics.email, color: 'text-white/60' },
          { label: 'Unlimited', value: metrics.unlimited, color: 'text-emerald-400' },
          { label: 'Active 7d', value: metrics.active7d, color: 'text-green-400' },
          { label: 'Paid Plans', value: metrics.paid, color: 'text-purple-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white/3 border border-white/8 rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-white/30 text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input placeholder="Search name or email..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-white placeholder-white/30" />
        </div>
        {/* Tier filter */}
        <div className="flex gap-1">
          {['all', 'free', 'starter', 'pro', 'unlimited'].map(t => (
            <button key={t} onClick={() => setFilterTier(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filterTier === t ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
              {t}
            </button>
          ))}
        </div>
        {/* Provider filter */}
        <div className="flex gap-1">
          {[{ v: 'all', l: 'All' }, { v: 'google', l: '🔵 Google' }, { v: 'email', l: '✉️ Email' }].map(({ v, l }) => (
            <button key={v} onClick={() => setFilterProvider(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterProvider === v ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
              {l}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}
          className="border-white/10 text-white/60 hover:bg-white/5">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="text-white/25 text-xs">{filtered.length} of {users.length} users</div>

      {/* Table */}
      <div className="rounded-xl border border-white/8 overflow-hidden">
        <table className="w-full">
          <thead className="bg-white/3 border-b border-white/8">
            <tr>
              <th className="text-left px-4 py-3 text-white/40 text-xs font-medium">User</th>
              <th className="text-left px-4 py-3 text-white/40 text-xs font-medium">Sign-in</th>
              <th className="text-left px-4 py-3 text-white/40 text-xs font-medium">Plan</th>
              <th className="text-left px-4 py-3 text-white/40 text-xs font-medium">Usage</th>
              <th className="text-left px-4 py-3 text-white/40 text-xs font-medium">Credits</th>
              <th className="text-left px-4 py-3 text-white/40 text-xs font-medium">Last Active</th>
              <th className="text-left px-4 py-3 text-white/40 text-xs font-medium">Joined</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-white/30 text-sm">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-white/30 text-sm">No users found</td></tr>
            ) : filtered.map(u => (
              <tr key={u.id} className="hover:bg-white/2 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} className="w-8 h-8 rounded-full" alt="" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 text-sm font-medium">
                        {(u.display_name || u.email)[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-white text-sm font-medium flex items-center gap-1">
                        {u.display_name}
                        {u.role === 'admin' && <Shield className="w-3 h-3 text-amber-400" />}
                      </div>
                      <div className="text-white/40 text-xs">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-xs text-white/60">
                    {u.auth_provider === 'google' ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        Google
                      </>
                    ) : (
                      <><Mail className="w-3 h-3" />Email</>
                    )}
                    {u.email_verified ? (
                      <CheckCircle className="w-3 h-3 text-green-500/70" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-400/70" />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${tierColor(u.subscription_tier)}`}>
                    {u.subscription_tier}
                  </span>
                  {u.subscription_status === 'active' && u.subscription_tier !== 'free' && (
                    <div className="text-green-400/60 text-xs mt-0.5">active</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="text-white text-sm">{u.total_messages}</div>
                  <div className="text-xs">
                    {u.messages_7d > 0 && <span className="text-green-400">{u.messages_7d} this wk</span>}
                    {u.messages_7d === 0 && u.messages_30d > 0 && <span className="text-yellow-400/70">{u.messages_30d} this mo</span>}
                    {u.messages_30d === 0 && u.total_messages > 0 && <span className="text-white/20">inactive</span>}
                    {u.total_messages === 0 && <span className="text-white/20">never used</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {u.is_unlimited ? (
                    <span className="text-emerald-400 text-xs">∞ unlimited</span>
                  ) : (
                    <div>
                      <div className="text-white/70 text-sm">{u.current_monthly_messages}/{u.monthly_messages}</div>
                      {u.bonus_credits > 0 && <div className="text-amber-400/70 text-xs">+{u.bonus_credits} bonus</div>}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="text-white/60 text-sm">{timeAgo(u.last_active_at)}</div>
                  {u.active_days_total > 0 && <div className="text-white/25 text-xs">{u.active_days_total} days</div>}
                </td>
                <td className="px-4 py-3">
                  <div className="text-white/50 text-xs">
                    {u.signed_up_at ? new Date(u.signed_up_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(u)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent aria-describedby={undefined} className="bg-[#0f0f0f] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">
              Edit — {editing?.display_name}
            </DialogTitle>
            <p className="text-white/40 text-sm">{editing?.email}</p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Current state */}
            <div className="bg-white/3 border border-white/8 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-white/40">Current plan</span>
                <span className="capitalize text-white">{editing?.subscription_tier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Sign-in via</span>
                <span className="text-white capitalize">{editing?.auth_provider}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Messages used</span>
                <span className="text-white">{editing?.current_monthly_messages} / {editing?.is_unlimited ? '∞' : editing?.monthly_messages}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Total messages</span>
                <span className="text-white">{editing?.total_messages}</span>
              </div>
            </div>

            {/* Plan selector */}
            <div>
              <Label className="text-white/60 text-xs mb-2 block">Set Plan</Label>
              <div className="grid grid-cols-3 gap-2">
                {TIERS.map(({ id, label, icon: Icon, color, bg }) => (
                  <button key={id} onClick={() => setNewTier(id)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-medium transition-all ${
                      newTier === id
                        ? 'border-white/30 bg-white/8 text-white'
                        : 'border-white/8 bg-white/3 text-white/50 hover:bg-white/5'}`}>
                    <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                      <Icon className={`w-3.5 h-3.5 ${color}`} />
                    </div>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom limit */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useCustom} onChange={e => setUseCustom(e.target.checked)}
                  className="rounded border-white/20 bg-white/5" />
                <span className="text-white/60 text-sm">Custom message limit</span>
              </label>
              {useCustom && (
                <input type="number" value={customLimit} onChange={e => setCustomLimit(Number(e.target.value))}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-white/30" />
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)} className="text-white/50 hover:text-white">
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updating}
              className="bg-white text-black hover:bg-white/90">
              {updating ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
