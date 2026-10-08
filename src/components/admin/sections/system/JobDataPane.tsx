// What AYN is collecting about jobs: how complete each fact is, and how much history has built up.
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminJobData } from '@/admin-app/hooks/useAdminQuery';
import { Stat, LoadingBlock, ErrorBlock, when } from '../ui';

const COVERAGE_LABELS: Array<[string, string, string]> = [
  ['salary_either', 'Pay range', 'From the feed, or read from the posting text'],
  ['work_mode_either', 'Work mode', 'Remote, hybrid or on-site, from the feed or the text'],
  ['years_required', 'Years of experience asked', 'Read from the text; blank when the posting does not say'],
  ['sponsorship', 'Visa sponsorship stated', 'Only when the posting says it plainly'],
  ['benefits', 'Benefits named', 'Standard benefits the posting lists'],
  ['seniority', 'Seniority', 'From the feed'],
  ['category', 'Category', 'From the feed'],
  ['vectors', 'Meaning vector', 'Used for Match me and Explore roles'],
];

const pct = (n: number, total: number) => (total ? Math.round((100 * n) / total) : 0);

export default function JobDataPane() {
  const q = useAdminJobData();
  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data || {};
  const total = Number(d.total || 0);
  const cov = d.coverage || {};
  const h = d.history || {};
  const reasons = Object.entries((h.by_reason || {}) as Record<string, number>);
  const edits = Object.entries((h.edits_by_field || {}) as Record<string, number>);
  const sources = Object.entries((d.by_source || {}) as Record<string, number>);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Live jobs" value={total.toLocaleString()} hint={`${d.companies?.distinct_live ?? 0} companies`} />
        <Stat label="History kept" value={Number(h.archive_total || 0).toLocaleString()} hint={`${h.archive_7d ?? 0} added in 7 days`} accent />
        <Stat label="Edits seen" value={Number(h.edits_total || 0).toLocaleString()} hint={`${h.edits_7d ?? 0} in 7 days`} />
        <Stat label="Re-listed roles" value={h.relisted_now ?? 0} hint="Live now, earlier life archived" />
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">How complete each fact is</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {COVERAGE_LABELS.map(([key, label, hint]) => {
            const n = Number(cov[key] || 0);
            const p = pct(n, total);
            return (
              <div key={key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{label}</span>
                  <span className="text-muted-foreground tabular-nums">{n.toLocaleString()} jobs · {p}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted mt-1 overflow-hidden" role="img" aria-label={`${label} ${p} percent`}>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${p}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{hint}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">History</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1.5">
            <p>Tracking since <span className="font-medium">{when(h.first_seen_oldest)}</span>.</p>
            <p><span className="font-medium">{h.older_than_shown_date ?? 0}</span> live jobs were first seen at least a week before the date they show.</p>
            <p>Companies with 5 or more closed postings tracked (enough to say how long their roles stay open): <span className="font-medium">{d.companies?.with_5_closed_tracked ?? 0}</span>.</p>
            {reasons.length > 0 && <p className="text-muted-foreground">Removed so far: {reasons.map(([k, v]) => `${k} ${v}`).join(', ')}.</p>}
            {Number(h.archive_total || 0) === 0 && <p className="text-muted-foreground">Nothing has been removed since history was switched on, so there is nothing to show yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Edits by companies</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1.5">
            {edits.length === 0
              ? <p className="text-muted-foreground">No edits recorded yet. They appear when a company changes a posting AYN already has.</p>
              : edits.map(([k, v]) => <p key={k}><span className="capitalize font-medium">{k}</span>: {v}</p>)}
            <p className="text-muted-foreground pt-1">Feeds: {sources.map(([k, v]) => `${k} ${v.toLocaleString()}`).join(', ') || 'none'}.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
