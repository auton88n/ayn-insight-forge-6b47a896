import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SEO } from '@/components/shared/SEO';
import { SeekerSidebar } from '@/components/landing/SeekerSidebar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { Skeleton } from '@/components/ui/skeleton';
import { humanizeCategory } from '@/lib/jobPostingFormat';
import { TrendingUp, DollarSign } from 'lucide-react';
import { presentArticle } from '../../supabase/functions/_shared/articlePresentation.mjs';

// v3.X -- the client-side half of /insights. The real SEO/AEO work for
// this page already happened server side (server.js's own /insights
// route sends complete, real HTML for a crawler with no JS at all); this
// component is what a real visitor's browser actually renders once React
// mounts over that same markup, so in-app navigation here never forces a
// full reload. Same articles table, same anon-read RLS (status =
// 'published'), no separate backend surface.

type ArticleRow = {
  slug: string;
  kind: 'salary_report' | 'hiring_trend';
  category: string;
  city: string | null;
  title: string;
  dek: string;
  published_at: string;
  source_data?: Record<string, unknown> | null;
};

const Insights = () => {
  const [rows, setRows] = useState<ArticleRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    supabase
      .from('articles')
      .select('slug,kind,category,city,title,dek,published_at,source_data')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(200)
      .then(({ data, error: err }) => {
        if (err || !data) { setError(true); return; }
        setRows((data as unknown as ArticleRow[]).map(presentArticle));
      });
  }, []);

  return (
    <>
      <SEO
        title="Real hiring data, from AYN's own job catalog"
        description="Salary and hiring-trend reports based on AYN's job catalog, with counts and salary figures computed from current listings."
        canonical="/insights"
      />
      <div className="lp lp-shell-with-sidebar contact-surface">
        <SeekerSidebar />
        <main className="lp-sidebar-main">
          <section className="lp-section">
            <div className="lp-shell">
              <p className="lp-eyebrow">Insights</p>
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-balance">
                Real hiring data, not opinions
              </h1>
              <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
                Salary and hiring-trend reports based on AYN's current job catalog. Counts and salary figures are computed from listings, with sample sizes shown in each report.
              </p>

              {error && (
                <p className="mt-10 text-sm text-muted-foreground">
                  Could not load insights right now. Try again shortly.
                </p>
              )}

              {!error && !rows && (
                <div className="mt-10 space-y-3" style={{ minHeight: '110vh' }}>
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                </div>
              )}

              {rows && rows.length === 0 && (
                <p className="mt-10 text-sm text-muted-foreground">
                  The first reports are being put together now. Check back soon.
                </p>
              )}

              {rows && rows.length > 0 && (
                <div className="mt-10 grid gap-4 sm:grid-cols-2">
                  {rows.map((a) => (
                    <Link
                      key={a.slug}
                      to={`/insights/${a.slug}`}
                      className="rounded-xl border p-5 hover:border-foreground/30 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {a.kind === 'salary_report' ? <DollarSign className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                        {humanizeCategory(a.category)}{a.city ? ` · ${a.city}` : ''}
                      </div>
                      <div className="mt-2 font-semibold">{a.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{a.dek}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
          <LandingFooter />
        </main>
      </div>
    </>
  );
};

export default Insights;
