import { Link, useParams } from "react-router-dom";
import { jobCopy } from '@/lib/jobCopy';
import { displayCompany, displayJobTitle } from '@/lib/jobPostingFormat';
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/shared/SEO";
import { SeekerSidebar } from "@/components/landing/SeekerSidebar";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { Skeleton } from "@/components/ui/skeleton";
import { companyAvatar, formatLocation, humanizeCategory, humanizeSlug, jobAgeNotes, postedAge } from "@/lib/jobPostingFormat";

interface Profile {
  slug: string;
  name: string;
  logo_url: string | null;
  insights: {
    open_roles: number;
    pay: { postings: number; with_pay: number; pct: number } | null;
    speed: { closed_tracked: number; median_days_open: number; typical_low_days: number; typical_high_days: number } | null;
  };
  relisted_roles: number;
  edits_30d: number;
  sponsorship: { offered: number; not_offered: number };
  work_mode: Record<string, number>;
  top_categories: Array<{ category: string; open_roles: number }>;
  common_benefits: Array<{ benefit: string; roles: number }>;
  jobs: Array<{ id: string; title: string; location: string | null; posted_at: string; first_seen_at: string | null; seniority: string | null; work_mode: string | null; apply_by: string | null }>;
}

/** A company's public page: its open roles and what AYN has observed about how it hires. Every figure is
 * counted from AYN's own job records, and a stat with too little behind it is left out, never padded. */
const CompanyPage = () => {
  const { slug = "" } = useParams();
  const q = useQuery({
    queryKey: ["company-profile", slug],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("company_profile" as never, { p_company_slug: slug } as never);
      if (error) throw error;
      return (data as unknown as Profile | null) ?? null;
    },
  });
  const p = q.data ? { ...q.data, name: displayCompany(q.data.name) } : q.data;
  const av = companyAvatar(p?.name || slug);
  const modes = p ? Object.entries(p.work_mode).filter(([m]) => ['remote', 'hybrid', 'onsite'].includes(m)).sort((a, b) => b[1] - a[1]) : [];

  return (
    <>
      <SEO
        title={p ? `${p.name} jobs and hiring stats` : "Company jobs and hiring stats"}
        description={p ? `${p.name} has ${p.insights.open_roles} open roles on AYN. See pay transparency, posting updates and observed time in AYN's catalog.` : "Open roles and posting observations for a company, counted from real listings."}
        canonical={`/companies/${slug}`}
        noIndex={!p}
      />
      <div className="lp lp-shell-with-sidebar contact-surface">
        <SeekerSidebar />
        <main className="lp-sidebar-main">
          <section className="lp-section">
            <div className="lp-shell">
              {q.isPending && <div className="space-y-3"><Skeleton className="h-12 w-72" /><Skeleton className="h-28 w-full" /></div>}
              {q.isError && <p className="text-sm text-muted-foreground">This page could not load. Try again shortly.</p>}
              {!q.isPending && !q.isError && !p && (
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">No open roles found</h1>
                  <p className="mt-3 text-muted-foreground">AYN has no live postings for this company right now.</p>
                  <Link to="/jobs" className="lp-btn lp-btn-primary mt-5 inline-flex">Browse all jobs</Link>
                </div>
              )}
              {p && (
                <>
                  <p className="lp-eyebrow">Company</p>
                  <div className="flex items-center gap-4 mt-2">
                    {p.logo_url ? <img src={p.logo_url} alt="" className="w-14 h-14 rounded-xl object-contain bg-white p-1.5 border" />
                      : <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg ${av.className}`}>{av.initial}</div>}
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-balance">{p.name}: open roles and hiring stats</h1>
                  </div>

                  <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border p-5"><div className="text-3xl font-bold tabular-nums">{p.insights.open_roles}</div><div className="text-sm text-muted-foreground mt-1">open roles</div></div>
                    <div className="rounded-xl border p-5">
                      <div className="text-3xl font-bold tabular-nums">{p.insights.pay ? `${p.insights.pay.pct}%` : "Too few"}</div>
                      <div className="text-sm text-muted-foreground mt-1">{p.insights.pay ? `of postings show pay (${p.insights.pay.with_pay} of ${p.insights.pay.postings})` : "postings to measure pay openness"}</div>
                    </div>
                    <div className="rounded-xl border p-5">
                      <div className="text-3xl font-bold tabular-nums">{p.insights.speed ? `${p.insights.speed.median_days_open} days` : "Not yet"}</div>
                      <div className="text-sm text-muted-foreground mt-1" title="Includes employer closure and AYN freshness pruning; not time to hire.">{p.insights.speed ? `typical time in AYN's catalog (${p.insights.speed.closed_tracked} removals tracked)` : "enough removed postings to measure catalog duration"}</div>
                    </div>
                    <div className="rounded-xl border p-5"><div className="text-3xl font-bold tabular-nums">{p.relisted_roles}</div><div className="text-sm text-muted-foreground mt-1">live roles AYN has seen listed before</div></div>
                  </div>

                  <div className="mt-6 grid gap-6 md:grid-cols-2 text-sm">
                    <div><h2 className="font-semibold mb-1.5">Posting updates</h2>
                      <p className="text-muted-foreground">{`${p.edits_30d} field ${p.edits_30d === 1 ? 'change' : 'changes'} observed in the last 30 days. One posting may have several changes; this is not a count of hires.`}</p></div>
                    {p.top_categories.length > 0 && (
                      <div><h2 className="font-semibold mb-1.5">Roles it is hiring for</h2>
                        <p className="text-muted-foreground">{p.top_categories.map((c) => `${humanizeCategory(c.category)} (${c.open_roles})`).join(", ")}</p></div>
                    )}
                    {modes.length > 0 && (
                      <div><h2 className="font-semibold mb-1.5">How roles are worked</h2>
                        <p className="text-muted-foreground">{modes.map(([m, n]) => `${humanizeSlug(m)} ${n}`).join(", ")}</p>
                        <p className="text-muted-foreground mt-1">{jobCopy.modeCoverage(modes.reduce((sum, [, n]) => sum + n, 0), p.insights.open_roles)}</p></div>
                    )}
                    {p.common_benefits.length > 0 && (
                      <div><h2 className="font-semibold mb-1.5">Benefits its postings name</h2>
                        <p className="text-muted-foreground">{p.common_benefits.map((b) => `${b.benefit} (${b.roles})`).join(", ")}</p></div>
                    )}
                    {(p.sponsorship.offered > 0 || p.sponsorship.not_offered > 0) && (
                      <div><h2 className="font-semibold mb-1.5">Visa sponsorship</h2>
                        <p className="text-muted-foreground">{p.sponsorship.offered} postings say it is offered, {p.sponsorship.not_offered} say it is not. The rest do not say.</p></div>
                    )}
                  </div>

                  <div className="mt-12">
                    <SectionHeading>Open roles</SectionHeading>
                    <ul className="divide-y rounded-xl border">
                      {p.jobs.map((j) => {
                        const notes = jobAgeNotes({ posted_at: j.posted_at, first_seen_at: j.first_seen_at });
                        return (
                          <li key={j.id}>
                            <Link to={`/jobs/${j.id}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/40">
                              <span className="font-medium">{displayJobTitle(j.title, p.name)}</span>
                              <span className="text-xs text-muted-foreground">
                                {[j.location ? formatLocation(j.location) : null, `Posted ${postedAge(j.posted_at)}`, ...notes.map((n) => n.text)].filter(Boolean).join(" · ")}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                    {p.insights.open_roles > p.jobs.length && <p className="text-sm text-muted-foreground mt-3">{`Showing the ${p.jobs.length} most recent of ${p.insights.open_roles}. `}<Link className="underline" to={`/jobs`}>Search all jobs</Link>.</p>}
                  </div>

                  <p className="mt-10 text-xs text-muted-foreground max-w-2xl">
                    Everything here is counted from AYN's own records of this company's postings. A figure appears only when enough postings stand behind it, and AYN notes when a role it has seen before comes back; it never labels a company or a posting as fake.
                  </p>
                </>
              )}
            </div>
          </section>
          <LandingFooter />
        </main>
      </div>
    </>
  );
};

export default CompanyPage;
