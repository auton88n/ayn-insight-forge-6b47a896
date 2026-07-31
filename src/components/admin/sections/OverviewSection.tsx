// v3.20.0 OVERVIEW — the one screen that answers "is the product alive".
import { useAdminOverview } from '@/admin-app/hooks/useAdminQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader, Stat, LoadingBlock, ErrorBlock, EmptyRow } from './ui';

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
    </div>
  );
}
