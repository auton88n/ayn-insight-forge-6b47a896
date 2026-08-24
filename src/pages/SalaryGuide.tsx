import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SEO } from '@/components/shared/SEO';
import { SeekerSidebar } from '@/components/landing/SeekerSidebar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { SectionHeading } from '@/components/shared/SectionHeading';
import { Skeleton } from '@/components/ui/skeleton';
import { humanizeCategory } from '@/components/resume-hub/BrowseJobs';
import { TrendingUp, MapPin, Briefcase, ShieldCheck } from 'lucide-react';

const EMBER = 'linear-gradient(135deg, #e85d3a 0%, #f2833f 100%)';

// v3.209.0 -- AYN's first real content marketing asset. Everything else
// built this session lives ON the site; nothing has ever pulled a new
// visitor IN from outside it. A salary guide is the highest-ROI content
// type a job board can publish: it earns real backlinks from career blogs,
// university career centers, and local news, and it is genuinely citable
// only when the numbers behind it are real. AYN has a live source most
// competitors don't (a company-sourced, 3-day-fresh catalog), so this page
// computes every figure straight from job_market_snapshot(), a plain SQL
// function reading job_postings directly -- nothing here is estimated or
// invented, the same discipline as every other AI-facing computation in
// this app. No AI call, no cost, safe to let a crawler or a thousand
// visitors a day hit it for free.

type Category = { category: string; open_roles: number; median_salary: number; salary_sample_size: number };
type City = { city: string; open_roles: number };
type Snapshot = {
  generated_at: string;
  total_open: number;
  posted_last_24h: number;
  categories: Category[];
  work_mode: Record<string, number>;
  top_cities: City[];
};

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const SalaryGuide = () => {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    supabase.rpc('job_market_snapshot').then(({ data, error: err }) => {
      if (err || !data) { setError(true); return; }
      setSnap(data as unknown as Snapshot);
    });
  }, []);

  // Percent of roles that STATE a work mode, not percent of everything --
  // most listings don't say remote/hybrid/onsite at all, and diluting the
  // three real buckets by every unlabeled posting would make "8% remote"
  // read as a market fact when the real figure (among roles that actually
  // say) is several times higher. Only the three labeled modes count.
  const taggedWorkMode = snap
    ? (snap.work_mode.remote || 0) + (snap.work_mode.hybrid || 0) + (snap.work_mode.onsite || 0)
    : 0;
  const pct = (n: number) => (taggedWorkMode ? Math.round((n / taggedWorkMode) * 100) : 0);

  const jsonLd = snap ? {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'AYN Real-Time US and Canada Hiring Report',
    description: 'Median salary and open-role counts by category, computed live from company-sourced job postings.',
    dateModified: snap.generated_at,
    creator: { '@type': 'Organization', name: 'AYN AI', url: 'https://ayn.careers' },
  } : undefined;

  return (
    <>
      <SEO
        title="US and Canada Hiring Report, Real Salary Data by Role"
        description="Median salary and open-role counts by category, computed live from real, company-sourced job postings. Updated continuously, nothing estimated."
        canonical="/salary-guide"
        jsonLd={jsonLd}
      />
      <div className="lp lp-shell-with-sidebar contact-surface">
        <SeekerSidebar />
        <main className="lp-sidebar-main">
        <div className="container mx-auto max-w-4xl px-6 pt-10 pb-24">
          <span className="inline-block h-1 w-14 rounded-full mb-6" style={{ background: EMBER }} aria-hidden="true" />
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-balance">
            What roles actually pay, right now
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
            Every number below comes straight from AYN's own live catalog of company-sourced job postings across the US and Canada. Nothing here is estimated or modeled. It is the median of what real employers are stating on their own listings today.
          </p>

          {error && (
            <p className="mt-10 text-sm text-muted-foreground">
              The live report is temporarily unavailable. Try again shortly.
            </p>
          )}

          {!error && !snap && (
            <div className="mt-10 space-y-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          )}

          {snap && (
            <>
              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border p-5">
                  <div className="text-3xl font-bold tabular-nums">{snap.total_open.toLocaleString('en-US')}</div>
                  <div className="text-sm text-muted-foreground mt-1">open roles tracked right now</div>
                </div>
                <div className="rounded-xl border p-5">
                  <div className="text-3xl font-bold tabular-nums">{snap.posted_last_24h.toLocaleString('en-US')}</div>
                  <div className="text-sm text-muted-foreground mt-1">posted in the last 24 hours</div>
                </div>
                <div className="rounded-xl border p-5">
                  <div className="text-3xl font-bold tabular-nums">{pct(snap.work_mode.remote || 0)}%</div>
                  <div className="text-sm text-muted-foreground mt-1">of tagged roles are fully remote</div>
                </div>
              </div>

              <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                Last computed {fmtDate(snap.generated_at)}. AYN's catalog refreshes every two hours and prunes any posting not reconfirmed live within three days, so this reflects the market as it stands today, not a stale archive.
              </p>

              <div className="mt-14">
                <SectionHeading>Median salary by role, ranked by how many are open</SectionHeading>
                <p className="text-sm text-muted-foreground mb-5 max-w-2xl">
                  A category only shows a salary figure when enough real postings state one. A role with a small sample still shows how many openings exist, honestly, with no invented number attached.
                </p>
                <div className="rounded-xl border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left">
                        <th className="py-3 px-4 font-semibold">Role category</th>
                        <th className="py-3 px-4 font-semibold text-right">Open roles</th>
                        <th className="py-3 px-4 font-semibold text-right">Median salary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snap.categories.map((c) => (
                        <tr key={c.category} className="border-b last:border-0">
                          <td className="py-3 px-4">
                            <Link
                              to={`/jobs/category/${encodeURIComponent(c.category)}`}
                              className="font-medium hover:underline"
                            >
                              {humanizeCategory(c.category)}
                            </Link>
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">
                            {c.open_roles.toLocaleString('en-US')}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums font-semibold">
                            {c.salary_sample_size >= 15 ? fmtMoney(c.median_salary) : (
                              <span className="text-muted-foreground font-normal text-xs">not enough listed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-14 grid gap-10 sm:grid-cols-2">
                <div>
                  <SectionHeading>
                    <span className="inline-flex items-center gap-2"><Briefcase className="w-5 h-5" /> How companies are hiring</span>
                  </SectionHeading>
                  <div className="space-y-2 mt-5">
                    {(['remote', 'hybrid', 'onsite'] as const).map((mode) => (
                      <div key={mode} className="flex items-center gap-3">
                        <div className="w-20 text-sm capitalize text-muted-foreground">{mode}</div>
                        <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct(snap.work_mode[mode] || 0)}%`, background: EMBER }}
                          />
                        </div>
                        <div className="w-10 text-sm text-right tabular-nums font-medium">{pct(snap.work_mode[mode] || 0)}%</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Among postings that state a work mode. Not every listing does.
                  </p>
                </div>

                <div>
                  <SectionHeading>
                    <span className="inline-flex items-center gap-2"><MapPin className="w-5 h-5" /> Where the roles are</span>
                  </SectionHeading>
                  <ul className="mt-5 space-y-2">
                    {snap.top_cities.slice(0, 8).map((c) => (
                      <li key={c.city}>
                        <Link
                          to={`/jobs/location/${encodeURIComponent(c.city.toLowerCase().replace(/\s+/g, '-'))}`}
                          className="flex items-center justify-between text-sm hover:underline"
                        >
                          <span>{c.city}</span>
                          <span className="tabular-nums text-muted-foreground">{c.open_roles.toLocaleString('en-US')} open</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-16 rounded-xl border p-6" style={{ background: 'var(--accent, #fdf3ee)' }}>
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#e85d3a' }}>
                  <TrendingUp className="w-4 h-4" />
                  See exactly how you compare
                </div>
                <p className="text-sm text-muted-foreground mt-2 max-w-xl">
                  These are catalog-wide medians. Your own fit against a specific role, and whether your resume actually shows what it asks for, is a different question. Check that for free.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    to="/jobs"
                    className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold text-white"
                    style={{ background: EMBER }}
                  >
                    Browse open roles
                  </Link>
                  <Link
                    to="/check-resume"
                    className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold border"
                  >
                    Check my resume against a job
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
        <LandingFooter />
        </main>
      </div>
    </>
  );
};

export default SalaryGuide;
