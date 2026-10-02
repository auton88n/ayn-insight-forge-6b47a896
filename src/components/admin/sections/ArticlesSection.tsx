// SEO/AEO content engine -- visibility into what content-engine has
// auto-published, plus the two real levers over it: how much it makes
// (archive/restore a specific article; articles-per-run and how often it
// fires, both live cron/settings changes, not a code deploy) and nothing
// more -- the content itself is never reviewed before going live, every
// figure traces back to a SQL query, never the model's own invention.
import { useState, useEffect } from 'react';
import { useAdminArticles, useArticleAction, useArticleConfigAction } from '@/admin-app/hooks/useAdminQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, TrendingUp, DollarSign, Settings2 } from 'lucide-react';
import { SectionHeader, Stat, LoadingBlock, ErrorBlock, EmptyRow, when, money } from './ui';

// The only schedules admin_article_set_config will actually accept --
// kept in sync with that function's own allowed_schedules array. A fixed
// menu, not a free-text cron expression, so there's no way to type a typo
// that silently never fires or fires every minute.
const SCHEDULE_OPTIONS: { value: string; label: string }[] = [
  { value: '0 14 * * 1', label: 'Once a week (Monday)' },
  { value: '0 14 * * 2,5', label: 'Twice a week (Tue/Fri)' },
  { value: '0 14 * * 1,3,5', label: 'Three times a week (Mon/Wed/Fri)' },
  { value: '0 14 * * *', label: 'Every day' },
];

type AdminArticle = {
  id: string;
  slug: string;
  kind: 'salary_report' | 'hiring_trend';
  category: string;
  city: string | null;
  title: string;
  status: 'published' | 'archived';
  word_count: number;
  generation_cost_cents: number;
  published_at: string;
  refreshed_at: string | null;
};

type AdminArticlesData = {
  articles?: AdminArticle[];
  published_total?: number;
  published_this_week?: number;
  total_cost_cents?: number;
  articles_per_run?: number;
  schedule?: string;
  schedule_active?: boolean;
};

export default function ArticlesSection() {
  const q = useAdminArticles();
  const act = useArticleAction();
  const cfgAct = useArticleConfigAction();
  const [perRun, setPerRun] = useState('2');
  const [schedule, setSchedule] = useState('0 14 * * 2,5');

  const d = (q.data || {}) as AdminArticlesData;
  // Seed the editable controls from the real, current server value the
  // first time it loads -- never stomp an in-progress edit on a refetch.
  useEffect(() => {
    if (d.articles_per_run != null) setPerRun(String(d.articles_per_run));
    if (d.schedule) setSchedule(d.schedule);
  }, [d.articles_per_run, d.schedule]);

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const articles = d.articles || [];
  const dirty = String(d.articles_per_run) !== perRun || d.schedule !== schedule;
  const runDays = schedule === '0 14 * * *' ? 7 : (schedule.split(' ')[4]?.split(',').length || 0);
  const weeklyEstimate = runDays * Number(perRun || 0);

  return (
    <div>
      <SectionHeader title="Articles" subtitle="Reports publish automatically on the schedule below. Numeric figures are checked against query results, but wording and interpretation still need editorial monitoring." />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Stat label="Published" value={d.published_total ?? 0} />
        <Stat label="This week" value={d.published_this_week ?? 0} accent />
        <Stat label="Total generation cost" value={money(d.total_cost_cents ?? 0)} />
      </div>

      <Card className="border border-border/60 bg-card mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" /> Cadence
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Articles per run</label>
              <Select value={perRun} onValueChange={setPerRun}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">How often</label>
              <Select value={schedule} onValueChange={setSchedule}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCHEDULE_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            About {weeklyEstimate} {weeklyEstimate === 1 ? 'report' : 'reports'} generated or refreshed each week at this setting.
            {d.schedule_active === false && <span className="text-destructive"> The scheduled job itself is currently paused.</span>}
          </p>
          <Button
            size="sm"
            disabled={!dirty || cfgAct.isPending}
            onClick={() => cfgAct.mutate({ articlesPerRun: Number(perRun), schedule })}
          >
            Save cadence
          </Button>
        </CardContent>
      </Card>

      <Card className="border border-border/60 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All articles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Archived reports stop being selected for future publishing runs. Public pages and the sitemap can take up to one minute to update.</p>
          {articles.length === 0 ? <EmptyRow>Nothing published yet.</EmptyRow> : articles.map((a) => (
            <div key={a.id} className="rounded-xl border border-border/60 p-4 flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold flex items-center gap-2">
                  {a.kind === 'salary_report' ? <DollarSign className="w-4 h-4 text-primary" /> : <TrendingUp className="w-4 h-4 text-primary" />}
                  {a.title}
                  {a.status === 'archived' && <Badge variant="outline">Archived</Badge>}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {a.category}{a.city ? ` · ${a.city}` : ''} · {a.word_count} words · {money(a.generation_cost_cents || 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Published {when(a.published_at)}{a.refreshed_at && a.refreshed_at !== a.published_at ? ` · refreshed ${when(a.refreshed_at)}` : ''}
                </p>
                <a href={`/insights/${a.slug}`} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline mt-1">
                  <FileText className="w-3 h-3" /> View live
                </a>
              </div>
              <div className="flex gap-2 shrink-0">
                {a.status === 'published' ? (
                  <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ fn: 'admin_article_archive', id: a.id })}>
                    Archive
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ fn: 'admin_article_restore', id: a.id })}>
                    Restore
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
