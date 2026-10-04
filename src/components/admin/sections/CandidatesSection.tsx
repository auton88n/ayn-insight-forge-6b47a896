// v3.20.0 CANDIDATES — talent pool health. Stale index is the silent killer.
import { useState } from 'react';
import { useAdminCandidates, useMarkCandidatesStale, useAdminJobSeekers } from '@/admin-app/hooks/useAdminQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SectionHeader, Stat, LoadingBlock, ErrorBlock, EmptyRow, when, ProviderBadge, WelcomeBadge, providerLabel } from './ui';
import { AccountDetailDialog } from './system/AccountDetail';

function TalentPool() {
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

// Everyone who signed up as a job seeker. Being in the talent pool is a separate choice
// the person makes, shown here as one column rather than as the definition of a candidate.
function AllJobSeekers() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [provider, setProvider] = useState('all');
  const [openUser, setOpenUser] = useState<string | null>(null);
  const query = useAdminJobSeekers(q);

  if (query.isLoading) return <LoadingBlock />;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={() => query.refetch()} />;
  const d = (query.data || {}) as any;
  const all: any[] = d.rows || [];
  const rows = provider === 'all' ? all : all.filter(r => r.provider === provider);
  const byProvider: Record<string, number> = d.by_provider || {};

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Job seekers" value={d.total ?? 0} accent />
        <Stat label="With a resume" value={d.with_resume ?? 0} hint="Uploaded or generated" />
        <Stat label="Discoverable" value={d.discoverable ?? 0} hint="Opted in to the talent pool" />
        <Stat label="Showing" value={rows.length} hint={all.length >= 500 ? 'Newest 500' : undefined} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">Signed up with</span>
        {[['all', 'Everyone', d.total ?? 0], ...Object.entries(byProvider).map(([k, n]) => [k, providerLabel(k), n])].map(([key, label, n]) => (
          <button
            key={String(key)}
            type="button"
            onClick={() => setProvider(String(key))}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${provider === key ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card text-muted-foreground border-border/60 hover:text-foreground'}`}
          >
            {label} · {n}
          </button>
        ))}
      </div>

      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setQ(search.trim()); }}>
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by email or name" className="max-w-sm" />
        <Button type="submit" variant="outline">Search</Button>
        {q && <Button type="button" variant="ghost" onClick={() => { setSearch(''); setQ(''); }}>Clear</Button>}
      </form>

      <Card className="border border-border/60 bg-card">
        <CardContent className="p-0">
          {rows.length === 0 ? <EmptyRow>No job seekers match.</EmptyRow> : (
            <div className="divide-y divide-border/60">
              {rows.map(r => (
                <div key={r.user_id} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-muted/30">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{r.display_name} <span className="text-muted-foreground font-normal">· {r.email}</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Joined {when(r.signed_up_at)} · last sign-in {when(r.last_sign_in_at)} · {r.plan_key} · {r.credits} credits
                      · {r.has_resume ? 'resume on file' : 'no resume'} · {r.saved_jobs} saved jobs
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <ProviderBadge provider={r.provider} last={r.last_sign_in_method} />
                      <WelcomeBadge status={r.welcome_status} delivery={r.welcome_delivery} />
                      {!r.email_confirmed && <Badge variant="outline" className="text-[10px]">Email not verified</Badge>}
                      {r.discoverable && <Badge className="text-[10px]">In talent pool</Badge>}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setOpenUser(r.user_id)}>Open</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AccountDetailDialog userId={openUser} open={!!openUser} onOpenChange={v => { if (!v) setOpenUser(null); }} />
    </div>
  );
}

export default function CandidatesSection() {
  const [tab, setTab] = useState<'all' | 'pool'>('all');
  return (
    <div>
      <div className="flex gap-2 mb-6">
        {([['all', 'All job seekers'], ['pool', 'Talent pool']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3.5 py-1.5 rounded-full text-sm border transition-colors ${tab === key ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card text-muted-foreground border-border/60 hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'all' ? (
        <>
          <SectionHeader title="Candidates" subtitle="Everyone who signed up as a job seeker, how they signed up, and what they have done. Being discoverable to employers is their own choice, shown as one tag." />
          <AllJobSeekers />
        </>
      ) : <TalentPool />}
    </div>
  );
}
