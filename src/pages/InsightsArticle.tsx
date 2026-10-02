import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '@/integrations/supabase/client';
import { SEO } from '@/components/shared/SEO';
import { SeekerSidebar } from '@/components/landing/SeekerSidebar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { Skeleton } from '@/components/ui/skeleton';
import { humanizeCategory } from '@/lib/jobPostingFormat';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

// v3.X -- client-side render of a single /insights article, the same
// server.js route already sends as complete, real HTML for a crawler.
// This is the in-app version a real visitor's browser takes over with --
// same data, same markdown, just rendered by React instead of marked() so
// the rest of the site's nav/CTAs work without a full reload.

type ArticleRow = {
  slug: string;
  kind: 'salary_report' | 'hiring_trend';
  category: string;
  city: string | null;
  title: string;
  dek: string;
  meta_description: string;
  body_md: string;
  faq: { question: string; answer: string }[] | null;
  source_data: { open_roles?: number; salary_sample_size?: number } | null;
  published_at: string;
  refreshed_at: string | null;
};

const InsightsArticle = () => {
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<ArticleRow | null | undefined>(undefined);

  useEffect(() => {
    if (!slug) return;
    setArticle(undefined);
    supabase
      .from('articles')
      .select('slug,kind,category,city,title,dek,meta_description,body_md,faq,source_data,published_at,refreshed_at')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle()
      .then(({ data, error: err }) => {
        setArticle(err ? null : (data as unknown as ArticleRow | null));
      });
  }, [slug]);

  if (article === null) {
    return (
      <div className="lp lp-shell-with-sidebar contact-surface">
        <SEO title="Not found" description="This report could not be found." noIndex />
        <SeekerSidebar />
        <main className="lp-sidebar-main">
          <section className="lp-section">
            <div className="lp-shell">
              <h1 className="text-2xl font-semibold">This report is not available</h1>
              <p className="mt-3 text-muted-foreground">It may have been archived. <Link to="/insights" className="underline">See all insights</Link>.</p>
            </div>
          </section>
          <LandingFooter />
        </main>
      </div>
    );
  }

  return (
    <>
      {/* No jsonLd prop here on purpose -- server.js's own /insights/:slug
          route already injects the real Article JSON-LD directly into the
          HTML a crawler sees (the only audience JSON-LD is actually for;
          a human visitor's browser gets no visible benefit from it).
          Helmet adding a second, client-side copy on top of that once React
          mounts would just be duplicate markup on the same page. */}
      <SEO
        title={article ? `${article.title} | AYN` : 'Loading'}
        description={article?.meta_description || 'Real hiring data from AYN.'}
        canonical={slug ? `/insights/${slug}` : undefined}
        type="article"
      />
      <div className="lp lp-shell-with-sidebar contact-surface">
        <SeekerSidebar />
        <main className="lp-sidebar-main">
          <section className="lp-section">
            <div className="lp-shell">
              <div className="legal-measure">
                <Link to="/insights" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="w-3.5 h-3.5" /> All insights
                </Link>

                {!article && (
                  <div className="mt-8 space-y-3">
                    <Skeleton className="h-8 w-3/4 rounded" />
                    <Skeleton className="h-5 w-1/2 rounded" />
                    <Skeleton className="h-40 w-full rounded-xl mt-6" />
                  </div>
                )}

                {article && (
                  <>
                    <h1 className="mt-6 text-3xl sm:text-4xl font-semibold tracking-tight">{article.title}</h1>
                    <p className="mt-3 text-lg text-muted-foreground">{article.dek}</p>

                    <div className="mt-6 flex flex-wrap gap-2">
                      <Link
                        to={`/jobs/category/${encodeURIComponent(article.category)}`}
                        className="lp-btn lp-btn-ghost text-sm"
                      >
                        Browse {humanizeCategory(article.category)} jobs
                      </Link>
                      <Link to="/salary-guide" className="lp-btn lp-btn-ghost text-sm">
                        Full salary guide
                      </Link>
                    </div>

                    <article className="prose prose-neutral dark:prose-invert max-w-none mt-10">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.body_md}</ReactMarkdown>
                    </article>

                    {article.faq && article.faq.length > 0 && (
                      <section className="mt-12">
                        <h2 className="text-xl font-semibold">Questions</h2>
                        <div className="mt-4 space-y-5">
                          {article.faq.map((f) => (
                            <div key={f.question}>
                              <h3 className="font-medium">{f.question}</h3>
                              <p className="mt-1 text-muted-foreground">{f.answer}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    <section className="mt-10 rounded-xl border border-border/60 p-5">
                      <h2 className="font-semibold">About this data</h2>
                      {Number.isFinite(Number(article.source_data?.open_roles)) && article.source_data?.open_roles != null && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Snapshot: {article.source_data.open_roles} current listings
                          {Number(article.source_data.salary_sample_size) > 0 && `; ${article.source_data.salary_sample_size} listings with comparable USD salary data`}.
                          {' '}These are AYN catalog samples, not the entire job market.
                        </p>
                      )}
                      <p className="mt-2 text-sm text-muted-foreground">Figures come from AYN's current job listings and can change as listings expire or new ones appear.</p>
                    </section>

                    <p className="mt-10 text-xs text-muted-foreground flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      Built from AYN's own live job catalog, last updated {new Date(article.refreshed_at || article.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
                    </p>
                  </>
                )}
              </div>
            </div>
          </section>
          <LandingFooter />
        </main>
      </div>
    </>
  );
};

export default InsightsArticle;
