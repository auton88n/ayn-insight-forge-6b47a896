// v3.20.0 OVERVIEW — the one screen that answers "is the product alive".
import { useAdminOverview, useAdminActivationFunnel } from '@/admin-app/hooks/useAdminQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader, Stat, LoadingBlock, ErrorBlock, EmptyRow } from './ui';

// Real activation funnel, added directly in response to the founder asking
// whether this was worth building at all -- checked first, not assumed: it
// is, since without it there was no way to see where seekers actually drop
// off, only aggregate totals. Deliberately did NOT add the equivalent
// employer permissions/roles feature in the same pass -- that one has no
// real usage to justify it yet (every employer account today is solo),
// so it's flagged rather than built speculatively.
const FUNNEL_STAGES: { key: 'signed_up' | 'built_resume' | 'took_paid_action' | 'came_back'; label: string }[] = [
  { key: 'signed_up', label: 'Signed up' },
  { key: 'built_resume', label: 'Built a resume' },
  { key: 'took_paid_action', label: 'Scored or tailored a job' },
  { key: 'came_back', label: 'Came back later' },
];

function ActivationFunnelCard() {
  const q = useAdminActivationFunnel();
  if (q.isLoading) return <Card className="border border-border/60 bg-card"><CardContent className="pt-6"><LoadingBlock /></CardContent></Card>;
  if (q.isError) return <Card className="border border-border/60 bg-card"><CardContent className="pt-6"><ErrorBlock error={q.error} onRetry={() => q.refetch()} /></CardContent></Card>;
  const f = (q.data || {}) as any;
  const total = Number(f.signed_up || 0);
  const start = f.cohort_start ? new Date(f.cohort_start).toLocaleDateString() : '';
  const end = f.cohort_end ? new Date(f.cohort_end).toLocaleDateString() : '';

  return (
    <Card className="border border-border/60 bg-card mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Activation funnel</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Seekers who signed up {start} to {end}, a full week or more old, so everyone counted has had a fair chance to reach every stage.
        </p>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyRow>No seekers signed up in that window yet.</EmptyRow>
        ) : (
          <div className="space-y-3">
            {FUNNEL_STAGES.map(stage => {
              const count = Number(f[stage.key] || 0);
              const pct = Math.round((100 * count) / total);
              return (
                <div key={stage.key}>
                  <div className="flex items-baseline justify-between text-sm mb-1">
                    <span className="font-medium">{stage.label}</span>
                    <span className="text-muted-foreground">{count} of {total} · {pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function OverviewSection({ onGoto }: { onGoto: (id: string) => void }) {
  const q = useAdminOverview();
  if (q.isLoading) return <LoadingBlock />;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = (q.data || {}) as any;

  const acceptance = d.proposals_sent_month
    ? Math.round((100 * (d.proposals_accepted_month || 0)) / d.proposals_sent_month)
    : 0;

  return (
    <div>
      <SectionHeader title="Overview" subtitle="This month, on both sides of the marketplace." />

      {Number(d.employers_pending) > 0 && (
        <button
          onClick={() => onGoto('employers')}
          className="w-full text-left mb-6 rounded-xl border border-primary/30 bg-primary/5 px-5 py-4 hover:bg-primary/10 transition-colors"
        >
          <span className="text-sm font-semibold text-primary">
            {d.employers_pending} employer{d.employers_pending === 1 ? '' : 's'} waiting for approval
          </span>
          <span className="block text-xs text-muted-foreground mt-0.5">Nobody can search the pool until you approve them. Review now.</span>
        </button>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat label="Job seekers" value={d.seekers_total ?? 0} hint={`${d.seekers_new_month ?? 0} new this month`} />
        <Stat label="Discoverable" value={d.seekers_discoverable ?? 0} hint="Opted into the talent pool" accent />
        <Stat label="Active employers" value={d.employers_active ?? 0} hint={`${d.employers_pending ?? 0} pending`} />
        <Stat label="AI spend" value={`$${Number(d.ai_spend_month || 0).toFixed(2)}`} hint="Month to date" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Proposals sent" value={d.proposals_sent_month ?? 0} hint="This month" />
        <Stat label="Accepted" value={d.proposals_accepted_month ?? 0} hint={`${acceptance}% acceptance`} accent />
        <Stat label="Assessments sent" value={d.assessments_sent_month ?? 0} hint={`${d.assessments_completed_month ?? 0} completed`} />
        <Stat label="Credits used" value={d.credits_consumed_month ?? 0} hint="Seeker tailoring" />
      </div>

      {/* This number should be zero. Only live accounts are counted: erased
          accounts cannot use the product and must not distort the alert. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat
          label="No consent record"
          value={d.accounts_without_consent ?? 0}
          hint={`of ${d.accounts_total ?? 0} live accounts. Should be zero`}
          accent={Number(d.accounts_without_consent || 0) > 0}
        />
      </div>


      <Card className="border border-border/60 bg-card">
        <CardHeader className="pb-3"><CardTitle className="text-base">Active employers by plan</CardTitle></CardHeader>
        <CardContent>
          {(d.employers_by_plan || []).length === 0 ? (
            <EmptyRow>No approved employers yet.</EmptyRow>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(d.employers_by_plan as any[]).map(p => (
                <Badge key={p.plan_key} variant="secondary" className="text-xs px-3 py-1.5">
                  {p.plan_key} · {p.n}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ActivationFunnelCard />
    </div>
  );
}
