// Search visibility: what Google and AI crawlers can reach, how the site is
// performing in search, and the controls over the article engine. Numbers in
// the Search Console and speed cards are readings stored by
// scripts/seo-snapshot.py (read only here, with the date they were taken).
// Everything else is live from the database.
import { useAdminSeo, useSeoAction } from '@/admin-app/hooks/useAdminQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Gauge, FileText, Play, Pause, Ban, Undo2, ListOrdered, Globe } from 'lucide-react';
import { humanizeCategory } from '@/lib/jobPostingFormat';
import { SectionHeader, Stat, LoadingBlock, ErrorBlock, EmptyRow, when } from './ui';

type Topic = { kind: 'salary_report' | 'hiring_trend'; category: string; city: string | null; sample_size?: number };
type Block = Topic & { id: string; reason: string | null };
type Row = { key: string; clicks: number; impressions: number; position: number };

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// The schedule is one of four fixed presets ("0 14 * * <days>"), hour in UTC.
function describeSchedule(cron?: string) {
  if (!cron) return '';
  const days = cron.split(' ')[4];
  if (days === '*') return 'every day at 14:00 UTC';
  return `${days.split(',').map((d) => DAY_NAMES[Number(d)]).join(' and ')} at 14:00 UTC`;
}

function nextRun(cron?: string) {
  if (!cron) return null;
  const days = cron.split(' ')[4];
  const allowed = days === '*' ? [0, 1, 2, 3, 4, 5, 6] : days.split(',').map(Number);
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i, 14, 0, 0));
    if (allowed.includes(d.getUTCDay()) && d > now) return d;
  }
  return null;
}

const topicLabel = (t: Topic) => `${humanizeCategory(t.category)}${t.city ? ` in ${t.city}` : ''}`;
const kindLabel = (k: Topic['kind']) => (k === 'salary_report' ? 'Salary report' : 'Hiring trend');
const fmt = (n: number) => Number(n || 0).toLocaleString();

function TopTable({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet. Google reports data after a page has been shown in search.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{r.key.replace('https://ayn.careers', '') || '/'}</span>
              <span className="text-muted-foreground shrink-0 tabular-nums">{r.clicks} clicks · {r.impressions} views · #{r.position}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SeoSection() {
  const q = useSeoAction();
  const seo = useAdminSeo();
  if (seo.isLoading) return <LoadingBlock />;
  if (seo.isError) return <ErrorBlock error={seo.error} onRetry={() => seo.refetch()} />;

  const d = seo.data || {};
  const engine = d.engine || {};
  const art = d.articles || {};
  const cov = d.coverage || {};
  const pages = d.pages || {};
  const nextUp: Topic[] = d.next_up || [];
  const blocks: Block[] = d.blocks || [];
  const runs: { started_at: string; status: string }[] = d.recent_runs || [];
  const gsc = d.search_console?.data;
  const psi = d.pagespeed?.data;
  const next = nextRun(engine.schedule);
  const sampled: { url: string; verdict: string; coverage: string }[] = gsc?.indexing || [];
  const indexed = sampled.filter((x) => x.verdict === 'PASS').length;
  const busy = q.isPending;

  const run = (fn: string, args?: Record<string, unknown>, success?: string) => q.mutate({ fn, args, success });

  return (
    <div>
      <SectionHeader
        title="SEO"
        subtitle="How the site shows up in search, what the article engine is doing, and the controls over it."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Pages in sitemaps" value={fmt((gsc?.sitemaps || []).reduce((n: number, s: { submitted: number }) => n + s.submitted, 0))} hint="As Google last read them" />
        <Stat label="Indexed (sample)" value={sampled.length ? `${indexed} of ${sampled.length}` : '—'} hint="Key pages Google has indexed" accent />
        <Stat label="Search clicks, 28 days" value={gsc ? fmt(gsc.clicks) : '—'} hint={gsc ? `${fmt(gsc.impressions)} impressions` : 'No reading yet'} />
        <Stat label="Mobile speed, homepage" value={psi?.pages?.[0] ? `${psi.pages[0].score}/100` : '—'} hint={psi?.pages?.[0] ? `Main content in ${psi.pages[0].lcp}` : 'No reading yet'} />
      </div>

      <Card className="border border-border/60 bg-card mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Article engine</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant={engine.active ? 'default' : 'outline'}>{engine.active ? 'Running' : 'Paused'}</Badge>
            <p className="text-sm text-muted-foreground">
              {engine.articles_per_run} per run, {describeSchedule(engine.schedule)}.
              {engine.active && next ? ` Next run ${next.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}.` : ''}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run('admin_article_set_active', { p_active: !engine.active }, engine.active ? 'Engine paused' : 'Engine resumed')}>
              {engine.active ? <><Pause className="w-3.5 h-3.5 mr-1.5" /> Pause</> : <><Play className="w-3.5 h-3.5 mr-1.5" /> Resume</>}
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Write ${engine.articles_per_run} new article${engine.articles_per_run === 1 ? '' : 's'} now? They publish straight away.`)) {
                  run('admin_article_run_now', undefined, 'Run started. New articles appear within a few minutes.');
                }
              }}
            >
              <Play className="w-3.5 h-3.5 mr-1.5" /> Run now
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Change how many per run, and how often, in the Articles tab. Archive or restore a single article there too.</p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            <div><p className="text-xs text-muted-foreground">Published</p><p className="font-semibold">{art.published ?? 0}{art.archived ? ` (${art.archived} archived)` : ''}</p></div>
            <div><p className="text-xs text-muted-foreground">Words published</p><p className="font-semibold">{fmt(art.words)}</p></div>
            <div><p className="text-xs text-muted-foreground">Hiring trends covered</p><p className="font-semibold">{art.hiring_trends ?? 0} of {cov.hiring_topics_eligible ?? 0}</p></div>
            <div><p className="text-xs text-muted-foreground">Salary reports covered</p><p className="font-semibold">{art.salary_reports ?? 0} of {cov.salary_topics_eligible ?? 0}</p></div>
            <div><p className="text-xs text-muted-foreground">Last published</p><p className="font-semibold">{when(art.last_published_at)}</p></div>
            <div><p className="text-xs text-muted-foreground">Writing cost so far</p><p className="font-semibold">{(Number(art.cost_cents || 0)).toFixed(2)} cents</p></div>
            <div><p className="text-xs text-muted-foreground">Job pages crawlable</p><p className="font-semibold">{fmt(pages.job_pages)}</p></div>
            <div><p className="text-xs text-muted-foreground">Insight pages</p><p className="font-semibold">{fmt(pages.insight_pages)}</p></div>
          </div>

          {runs.length > 0 && (
            <div className="pt-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">Recent scheduled runs</p>
              <div className="flex gap-2 flex-wrap">
                {runs.map((r) => (
                  <Badge key={r.started_at} variant={r.status === 'succeeded' ? 'secondary' : 'destructive'}>
                    {when(r.started_at)} · {r.status}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card className="border border-border/60 bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><ListOrdered className="w-4 h-4 text-primary" /> Next topics to write</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">Chosen automatically from topics with at least 20 real listings. Block one and the engine will never write it.</p>
            {nextUp.length === 0 ? <EmptyRow>No eligible topics left.</EmptyRow> : nextUp.map((t) => (
              <div key={`${t.kind}-${t.category}-${t.city}`} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{topicLabel(t)}</p>
                  <p className="text-xs text-muted-foreground">{kindLabel(t.kind)} · {t.sample_size} listings</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Never write about ${topicLabel(t)}?`)) {
                      run('admin_seo_block_topic', { p_kind: t.kind, p_category: t.category, p_city: t.city, p_reason: null }, 'Topic blocked');
                    }
                  }}
                >
                  <Ban className="w-3.5 h-3.5 mr-1.5" /> Block
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border border-border/60 bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Ban className="w-4 h-4 text-primary" /> Blocked topics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {blocks.length === 0 ? <EmptyRow>Nothing blocked.</EmptyRow> : blocks.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{topicLabel(b)}</p>
                  <p className="text-xs text-muted-foreground">{kindLabel(b.kind)}</p>
                </div>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run('admin_seo_unblock_topic', { p_id: b.id }, 'Topic unblocked')}>
                  <Undo2 className="w-3.5 h-3.5 mr-1.5" /> Unblock
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border border-border/60 bg-card mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Search className="w-4 h-4 text-primary" /> Google Search Console</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {!gsc ? <EmptyRow>No reading stored yet. Run scripts/seo-snapshot.py to store one.</EmptyRow> : (
            <>
              <p className="text-xs text-muted-foreground">
                Reading taken {when(d.search_console.taken_at)}, covering {gsc.start} to {gsc.end}. Average position {gsc.position || '—'}, click rate {gsc.ctr}%.
              </p>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">Sitemaps</p>
                <div className="space-y-1.5">
                  {(gsc.sitemaps || []).map((s: { path: string; submitted: number; errors: number; warnings: number; last_downloaded: string }) => (
                    <div key={s.path} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{s.path.replace('https://ayn.careers', '')}</span>
                      <span className="text-muted-foreground shrink-0">
                        {fmt(s.submitted)} URLs · {s.errors} errors · read {when(s.last_downloaded)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">Is Google indexing these pages?</p>
                <div className="space-y-1.5">
                  {sampled.map((x) => (
                    <div key={x.url} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{x.url.replace('https://ayn.careers', '') || '/'}</span>
                      <Badge variant={x.verdict === 'PASS' ? 'default' : 'outline'} className="shrink-0">{x.coverage}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <TopTable title="Top searches" rows={gsc.queries || []} />
                <TopTable title="Top pages" rows={gsc.pages || []} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border border-border/60 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Gauge className="w-4 h-4 text-primary" /> Page speed, mobile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!psi ? <EmptyRow>No reading stored yet.</EmptyRow> : (
            <>
              <p className="text-xs text-muted-foreground">Reading taken {when(d.pagespeed.taken_at)}. Google wants the main content shown in under 2.5 seconds.</p>
              {psi.pages.map((p: { url: string; score: number; fcp: string; lcp: string; tbt: string; cls: string }) => (
                <div key={p.url} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0"><Globe className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{p.url.replace('https://ayn.careers', '') || '/'}</span></span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    <strong className="text-foreground">{p.score}</strong>/100 · first paint {p.fcp} · main content {p.lcp} · layout shift {p.cls}
                  </span>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
