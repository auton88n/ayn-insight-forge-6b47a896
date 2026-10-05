// v3.20.0 OVERVIEW — the one screen that answers "is the product alive".
import { useAdminOverview, useAdminActivationFunnel, useAdminSignupHealth } from '@/admin-app/hooks/useAdminQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader, Stat, LoadingBlock, ErrorBlock, EmptyRow, when, ProviderBadge, WelcomeBadge, providerLabel, MethodSplit } from './ui';

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

// How people are signing up, and whether welcome emails are keeping up. Turns red when something needs a look.
function SignupHealthCard() {
  const q = useAdminSignupHealth();
  if (q.isLoading) return <Card className="border border-border/60 bg-card mt-6"><CardContent className="pt-6"><LoadingBlock /></CardContent></Card>;
  if (q.isError) return <Card className="border border-border/60 bg-card mt-6"><CardContent className="pt-6"><ErrorBlock error={q.error} onRetry={() => q.refetch()} /></CardContent></Card>;
  const h = (q.data || {}) as any;
  const w = h.welcome || {};
  const stuck = Number(w.oldest_pending_minutes || 0) >= 10;
  const problems: string[] = [];
  if (Number(w.failed) > 0) problems.push(`${w.failed} welcome email${w.failed === 1 ? '' : 's'} failed to send`);
  if (stuck) problems.push(`a welcome email has been waiting ${w.oldest_pending_minutes} minutes`);
  if (Number(w.bounced_7d) > 0) problems.push(`${w.bounced_7d} bounced or marked as spam this week`);
  const methods = Object.entries(h.by_provider_7d || {});

  return (
    <Card className="border border-border/60 bg-card mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          Signups and welcome emails
          {problems.length > 0 ? <Badge variant="destructive" className="text-[10px]">Needs a look</Badge> : <Badge variant="secondary" className="text-[10px]">All fine</Badge>}
        </CardTitle>
        {problems.length > 0 && <p className="text-xs text-destructive mt-1">{problems.join('. ')}. Open the account to resend, or see Email in System.</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Signups, 7 days" value={h.signups_7d ?? 0} hint={methods.map(([k, n]) => `${providerLabel(k)} ${n}`).join(' · ') || undefined} />
          <Stat label="Not verified yet" value={h.unverified_7d ?? 0} hint="Signed up but have not confirmed" />
          <Stat label="Welcome emails sent" value={w.sent_7d ?? 0} hint="Last 7 days" accent />
          <Stat label="Waiting to send" value={w.pending ?? 0} hint={Number(w.pending) > 0 ? 'Sends within a minute' : 'Queue is empty'} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">Newest accounts</p>
          {(h.recent || []).length === 0 ? <EmptyRow>No accounts yet.</EmptyRow> : (
            <div className="divide-y divide-border/60">
              {(h.recent as any[]).map(r => (
                <div key={r.user_id} className="py-2 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{r.email} <span className="text-muted-foreground">· {r.is_employer ? 'Employer' : 'Job seeker'}</span></p>
                    <p className="text-xs text-muted-foreground">{when(r.created_at)}{r.email_confirmed ? '' : ' · email not verified'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ProviderBadge provider={r.provider} />
                    <WelcomeBadge status={r.welcome_status} delivery={r.welcome_delivery} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

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
        <Stat label="Job seekers" value={d.seekers_total ?? 0} hint={`${d.seekers_new_month ?? 0} new this month`} extra={<MethodSplit by={d.seekers_by_provider} />} />
        <Stat label="Discoverable" value={d.seekers_discoverable ?? 0} hint="Opted into the talent pool" accent />
        <Stat label="Active employers" value={d.employers_active ?? 0} hint={`${d.employers_pending ?? 0} pending approval`} extra={<MethodSplit by={d.employers_by_provider} />} />
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

      <SignupHealthCard />
      <ActivationFunnelCard />
    </div>
  );
}
