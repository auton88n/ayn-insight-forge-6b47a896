// v3.20.0 CANDIDATES — talent pool health. Stale index is the silent killer.
import { useState } from 'react';
import { useAdminCandidates, useMarkCandidatesStale } from '@/admin-app/hooks/useAdminQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SectionHeader, Stat, LoadingBlock, ErrorBlock, EmptyRow, when } from './ui';

export default function CandidatesSection() {
  const q = useAdminCandidates();
  const mark = useMarkCandidatesStale();
  const [selected, setSelected] = useState<string[]>([]);

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = (q.data || {}) as any;
  const rows: any[] = d.rows || [];

  const toggle = (id: string) =>
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : s.length >= 25 ? s : [...s, id]));

  return (
    <div>
      <SectionHeader
        title="Candidates"
        subtitle="Only opted-in profiles are here. A stale index means employers are matching against an old version of the person."
        right={
          <Button size="sm" disabled={selected.length === 0 || mark.isPending}
            onClick={() => mark.mutate(selected, { onSuccess: () => setSelected([]) })}>
            Reindex {selected.length ? `(${selected.length})` : ''}
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="In the pool" value={d.total_opted_in ?? 0} accent />
        <Stat label="Stale index" value={d.stale_count ?? 0} hint="Profile changed after indexing" />
        <Stat label="Thin profiles" value={d.thin_count ?? 0} hint="Under 5 skills or very short" />
        <Stat label="Embedding models" value={(d.models || []).length} hint={(d.models || []).map((m: any) => `${m.model} (${m.n})`).join(', ') || '—'} />
      </div>

      <Card className="border border-border/60 bg-card">
        <CardHeader className="pb-3"><CardTitle className="text-base">Pool ({rows.length} shown)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? <EmptyRow>Nobody has opted in yet.</EmptyRow> : (
            <div className="divide-y divide-border/60">
              {rows.map(r => (
                <label key={r.user_id} className="flex items-start gap-3 px-5 py-3 hover:bg-muted/30 cursor-pointer">
                  <input type="checkbox" className="mt-1 accent-[hsl(var(--primary))]"
                    checked={selected.includes(r.user_id)}
                    onChange={() => toggle(r.user_id)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {r.headline || 'No headline'} <span className="text-muted-foreground font-normal">· {r.email}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.seniority || 'seniority unknown'} · {r.years_experience ?? 0} yrs · {r.skills_count} skills · {r.profile_len} chars
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Indexed {when(r.indexed_at)} {r.embedding_model ? `(${r.embedding_model})` : ''} · profile edited {when(r.profile_updated_at)}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {r.is_stale && <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border border-primary/20">stale</Badge>}
                    {r.is_thin && <Badge variant="secondary" className="text-[10px]">thin</Badge>}
                  </div>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground mt-3">Reindex is bounded to 25 people per run. They are re-embedded on the next match run.</p>
    </div>
  );
}
