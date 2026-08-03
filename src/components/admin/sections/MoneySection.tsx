// v3.20.0 MONEY — real Stripe-backed subscriptions, credits and AI cost.
import { useAdminMoney } from '@/admin-app/hooks/useAdminQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader, Stat, LoadingBlock, ErrorBlock, EmptyRow, money, when } from './ui';
import { PlanEditor } from './system/ControlPanes';

export default function MoneySection() {
  const q = useAdminMoney();
  if (q.isLoading) return <LoadingBlock />;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = (q.data || {}) as any;

  return (
    <div>
      <SectionHeader title="Money" subtitle="Subscriptions come from Stripe through the billing webhook. Credits and AI cost are ours." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="MRR" value={money(d.mrr_cents)} hint="Active and trialing, normalized to monthly" accent />
        <Stat label="Paying" value={d.paying_count ?? 0} hint="Active paid subscriptions" />
        <Stat label="Credits spent" value={d.credits_spent_month ?? 0} hint={`${d.credits_granted_month ?? 0} granted this month`} />
        <Stat label="AI spend" value={`$${Number(d.ai_spend_month || 0).toFixed(2)}`} hint="Month to date" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card className="border border-border/60 bg-card">
          <CardHeader className="pb-3"><CardTitle className="text-base">Plans</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/60">
              {(d.by_plan as any[] || []).map(p => (
                <div key={p.key} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.audience} · {money(p.price_cents)}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">{p.subscribers} on plan</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/60 bg-card">
          <CardHeader className="pb-3"><CardTitle className="text-base">Needs attention</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(d.failed_payments || []).length === 0 ? <EmptyRow>No failed payments.</EmptyRow> : (
              <div className="divide-y divide-border/60">
                {(d.failed_payments as any[]).map(f => (
                  <div key={f.user_id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{f.email}</p>
                      <p className="text-xs text-muted-foreground">{f.plan_key} · period ends {when(f.current_period_end)}</p>
                    </div>
                    <Badge variant="destructive" className="text-[10px] uppercase shrink-0">{f.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border border-border/60 bg-card">
          <CardHeader className="pb-3"><CardTitle className="text-base">Top credit consumers</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(d.top_consumers || []).length === 0 ? <EmptyRow>No credits spent yet.</EmptyRow> : (
              <div className="divide-y divide-border/60">
                {(d.top_consumers as any[]).map(c => (
                  <div key={c.user_id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <p className="text-sm truncate">{c.email}</p>
                    <span className="text-sm font-semibold shrink-0">{c.spent}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border/60 bg-card">
          <CardHeader className="pb-3"><CardTitle className="text-base">Credit ledger</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(d.ledger || []).length === 0 ? <EmptyRow>Empty ledger.</EmptyRow> : (
              <div className="divide-y divide-border/60 max-h-[420px] overflow-y-auto">
                {(d.ledger as any[]).map(l => (
                  <div key={l.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{l.email}</p>
                      <p className="text-xs text-muted-foreground">{l.reason} · {when(l.created_at)}</p>
                    </div>
                    <span className={`text-sm font-semibold shrink-0 ${Number(l.delta) < 0 ? 'text-muted-foreground' : 'text-primary'}`}>
                      {Number(l.delta) > 0 ? '+' : ''}{l.delta}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <PlanEditor />
      </div>
    </div>
  );
}
