// v3.20.0 MARKETPLACE — proposals and assessments, the two things that matter.
import { useAdminMarketplace } from '@/admin-app/hooks/useAdminQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader, Stat, LoadingBlock, ErrorBlock, EmptyRow, when } from './ui';

export default function MarketplaceSection() {
  const q = useAdminMarketplace();
  if (q.isLoading) return <LoadingBlock />;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = (q.data || {}) as any;
  const p = d.proposals || {};
  const a = d.assessments || {};

  return (
    <div>
      <SectionHeader title="Marketplace" subtitle="Every proposal and assessment that has ever moved through AYN." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat label="Proposals" value={p.total ?? 0} />
        <Stat label="Pending" value={p.pending ?? 0} hint="Waiting on the candidate" />
        <Stat label="Accepted" value={p.accepted ?? 0} accent hint={`${p.total ? Math.round((100 * (p.accepted || 0)) / p.total) : 0}% of all` } />
        <Stat label="Declined" value={p.declined ?? 0} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Assessments sent" value={a.sent ?? 0} hint={`${a.total ?? 0} generated`} />
        <Stat label="Started" value={a.started ?? 0} />
        <Stat label="Completed" value={a.completed ?? 0} accent />
        <Stat label="Average score" value={a.avg_score ?? '—'} hint={(a.verdicts || []).map((v: any) => `${v.verdict}: ${v.n}`).join(' · ') || 'No results yet'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border border-border/60 bg-card">
          <CardHeader className="pb-3"><CardTitle className="text-base">By employer</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(d.by_employer || []).length === 0 ? <EmptyRow>No proposals yet.</EmptyRow> : (
              <div className="divide-y divide-border/60">
                {(d.by_employer as any[]).map(e => (
                  <div key={String(e.org_id)} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{e.company}</p>
                      <p className="text-xs text-muted-foreground">{e.sent} sent · {e.accepted} accepted · {e.declined} declined · {e.pending} pending</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-xs">{e.acceptance_rate}%</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border/60 bg-card">
          <CardHeader className="pb-3"><CardTitle className="text-base">Recent proposals</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(d.recent_proposals || []).length === 0 ? <EmptyRow>Nothing sent yet.</EmptyRow> : (
              <div className="divide-y divide-border/60 max-h-[420px] overflow-y-auto">
                {(d.recent_proposals as any[]).map(r => (
                  <div key={r.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.job_title || 'Untitled role'}</p>
                      <p className="text-xs text-muted-foreground">{r.company} · {when(r.created_at)}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px] uppercase">{r.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
