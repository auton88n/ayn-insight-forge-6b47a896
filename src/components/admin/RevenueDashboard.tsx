import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, TrendingUp, Users, RefreshCw, AlertCircle } from 'lucide-react';

interface UserRevenue {
  id: string; display_name: string; email: string; auth_provider: string;
  subscription_tier: string; subscription_status: string;
  is_unlimited: boolean; total_messages: number; messages_30d: number;
  signed_up_at: string; last_active_at: string | null;
}

const TIER_PRICE: Record<string, number> = { free: 0, starter: 29, pro: 79, business: 199, unlimited: 299, enterprise: 499 };

function timeAgo(d: string | null) {
  if (!d) return 'Never';
  const dy = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (dy === 0) return 'Today'; if (dy === 1) return 'Yesterday';
  if (dy < 30) return `${dy}d ago`; return `${Math.floor(dy/30)}mo ago`;
}

export const RevenueDashboard = () => {
  const [users, setUsers] = useState<UserRevenue[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('admin_users_view').select(
        'id,display_name,email,auth_provider,subscription_tier,subscription_status,is_unlimited,total_messages,messages_30d,signed_up_at,last_active_at'
      );
      setUsers((data || []) as UserRevenue[]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const mrr = users.reduce((s, u) => s + (TIER_PRICE[u.subscription_tier] || 0), 0);
  const paid = users.filter(u => u.subscription_tier !== 'free' && u.subscription_status === 'active');
  const churned = users.filter(u => {
    if (!u.last_active_at) return false;
    return (Date.now() - new Date(u.last_active_at).getTime()) > 14 * 86400000;
  });
  const neverUsed = users.filter(u => u.total_messages === 0);
  const arr = mrr * 12;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-lg flex items-center gap-2"><DollarSign className="w-5 h-5 text-emerald-400" />Revenue Dashboard</h2>
          <p className="text-white/30 text-sm">Based on current subscription tiers (Stripe not connected yet)</p>
        </div>
        <button onClick={fetch} disabled={loading} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stripe connection guide */}
      <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div>
            <div className="text-amber-400 font-medium text-sm">Stripe Not Connected</div>
            <div className="text-amber-400/60 text-xs">Revenue figures below are estimated from tier prices — not real payments</div>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="text-white/50 text-xs font-medium uppercase tracking-wide">How to connect Stripe:</div>
          {[
            { step: '1', text: 'Go to stripe.com → Developers → API Keys', sub: 'Copy your Secret Key (sk_live_...)' },
            { step: '2', text: 'In Supabase Dashboard → Settings → Edge Functions → Secrets', sub: 'Add: STRIPE_SECRET_KEY = sk_live_...' },
            { step: '3', text: 'In Stripe Dashboard → Developers → Webhooks', sub: 'Add endpoint: https://dfkoxuokfkttjhfjcecx.supabase.co/functions/v1/stripe-webhook' },
            { step: '4', text: 'Copy the Webhook Signing Secret', sub: 'Add to Supabase Secrets: STRIPE_WEBHOOK_SECRET = whsec_...' },
          ].map(({ step, text, sub }) => (
            <div key={step} className="flex items-start gap-3 bg-white/3 rounded-lg px-3 py-2">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">{step}</span>
              <div>
                <div className="text-white/70 text-xs">{text}</div>
                <div className="text-white/30 text-xs font-mono mt-0.5">{sub}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="text-white/25 text-xs">Once connected, real MRR, payments, and subscription events will appear automatically.</div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'MRR', value: `$${mrr.toLocaleString()}`, sub: 'monthly recurring', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
          { label: 'ARR', value: `$${arr.toLocaleString()}`, sub: 'annual run rate', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
          { label: 'Paid Users', value: paid.length, sub: `of ${users.length} total`, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
          { label: 'Churn Risk', value: churned.length, sub: 'inactive 14+ days', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
        ].map(({ label, value, sub, color, bg }) => (
          <div key={label} className={`border rounded-xl p-5 ${bg}`}>
            <div className="text-white/40 text-xs mb-2">{label}</div>
            <div className={`text-3xl font-bold ${color}`}>{value}</div>
            <div className="text-white/30 text-xs mt-1">{sub}</div>
          </div>
        ))}
      </div>

      {/* Plan breakdown */}
      <div className="bg-white/3 border border-white/8 rounded-xl p-5">
        <div className="text-white font-medium text-sm mb-4">Plan Distribution</div>
        <div className="space-y-3">
          {['unlimited','pro','starter','business','free'].map(tier => {
            const count = users.filter(u => u.subscription_tier === tier).length;
            const revenue = count * (TIER_PRICE[tier] || 0);
            const pct = users.length > 0 ? (count / users.length) * 100 : 0;
            const colors: Record<string, string> = { unlimited: 'bg-emerald-500', pro: 'bg-purple-500', starter: 'bg-blue-500', business: 'bg-amber-500', free: 'bg-white/20' };
            return (
              <div key={tier} className="flex items-center gap-3">
                <div className="w-20 text-white/50 text-xs capitalize text-right">{tier}</div>
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${colors[tier]}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="w-6 text-white/60 text-xs text-right">{count}</div>
                {revenue > 0 && <div className="w-16 text-emerald-400/70 text-xs text-right">${revenue}/mo</div>}
                {revenue === 0 && <div className="w-16 text-white/20 text-xs text-right">$0</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* User revenue table */}
      <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between">
          <span className="text-white font-medium text-sm">Revenue per User</span>
          <span className="text-white/30 text-xs">{paid.length} paying users</span>
        </div>
        <table className="w-full">
          <thead className="bg-white/2">
            <tr>
              <th className="text-left px-4 py-2 text-white/30 text-xs">User</th>
              <th className="text-left px-4 py-2 text-white/30 text-xs">Plan</th>
              <th className="text-left px-4 py-2 text-white/30 text-xs">MRR</th>
              <th className="text-left px-4 py-2 text-white/30 text-xs">Messages</th>
              <th className="text-left px-4 py-2 text-white/30 text-xs">Last Active</th>
              <th className="text-left px-4 py-2 text-white/30 text-xs">Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-white/30 text-sm">Loading...</td></tr>
            : users.sort((a,b) => (TIER_PRICE[b.subscription_tier]||0) - (TIER_PRICE[a.subscription_tier]||0)).map(u => {
              const price = TIER_PRICE[u.subscription_tier] || 0;
              const inactive = u.last_active_at ? (Date.now() - new Date(u.last_active_at).getTime()) > 14 * 86400000 : true;
              return (
                <tr key={u.id} className="hover:bg-white/2 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-white/80 text-sm font-medium">{u.display_name}</div>
                    <div className="text-white/30 text-xs">{u.email}</div>
                  </td>
                  <td className="px-4 py-3"><span className="text-white/60 text-xs capitalize">{u.subscription_tier}</span></td>
                  <td className="px-4 py-3"><span className={`text-sm font-medium ${price > 0 ? 'text-emerald-400' : 'text-white/20'}`}>{price > 0 ? `$${price}` : '$0'}</span></td>
                  <td className="px-4 py-3"><span className="text-white/60 text-sm">{u.total_messages}</span></td>
                  <td className="px-4 py-3"><span className="text-white/50 text-sm">{timeAgo(u.last_active_at)}</span></td>
                  <td className="px-4 py-3">
                    {u.total_messages === 0 ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Never used</span>
                    : inactive ? <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">At risk</span>
                    : <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Healthy</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
