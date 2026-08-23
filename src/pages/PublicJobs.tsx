import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SEO } from '@/components/shared/SEO';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthModal } from '@/components/auth/AuthModal';
import type { JobPosting } from '@/lib/resumeHub';
import {
  companyAvatar, resolveLogoUrl, resolveSalary, postedAge, postedDate, safeLike,
  JobDescriptionBody, EMPLOYMENT_TYPE_LABELS, SENIORITY_LABELS, humanizeCategory,
} from '@/components/resume-hub/BrowseJobs';
import { Search, ExternalLink, ShieldCheck, Loader2, Sparkles, MapPin, Briefcase, ArrowLeft } from 'lucide-react';

// v3.205.0 -- the positioning brief's Tier 2: category and location pages,
// the actual page types job boards rank for, that this table's real
// category/city data was already sitting on top of unused. A location
// slug is derived from the real city text (lowercase, spaces to hyphens);
// there's no slug column to round-trip, so the reverse direction just
// un-hyphenates for an ILIKE match rather than a stored lookup table --
// safe here because the real city values are already plain names with no
// punctuation (confirmed live: "New York City", "San Francisco", ...).
// category is used as-is: job_postings.category IS already a slug
// (freehire's own enrichment field / ats-direct-sync's toSlug()), so no
// conversion is needed in either direction.
function slugifyCity(city: string): string {
  return city.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function unslugifyCity(slug: string): string {
  // Real, live city values are already properly cased ("Austin", "New
  // York City") -- title-casing here matches that in the common case, so
  // the header copy reads right even before the real row data (whose own
  // `city` field is the actual source of truth) has loaded.
  return slug.replace(/-+/g, ' ').trim().split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// v3.205.0 -- the exact number the programmatic-SEO research names: don't
// let Google index a page with fewer than 5 real, live listings behind it
// -- a thin page drains the whole site's quality signal. The page still
// renders normally for a human who lands on it directly; noIndex only
// tells a crawler not to treat it as a real destination yet.
const MIN_INDEXABLE_LISTINGS = 5;

// v3.205.0 -- hub-and-spoke internal linking, the other half of the
// programmatic-SEO playbook: a crawler (and a real visitor) needs a path
// INTO these new pages, not just a URL that resolves if you already know
// it. Real category slugs and city names, confirmed live against the
// actual table rather than guessed (each one comfortably clears
// MIN_INDEXABLE_LISTINGS by a wide margin -- the smallest here still had
// 150+ real rows). A curated, hand-picked set rather than a live query
// against distinct values: this list changes slowly in practice, and a
// public-page discovery strip isn't worth a second Supabase round trip.
const BROWSE_CATEGORIES = [
  'software_engineering', 'sales', 'marketing', 'design', 'data_analytics',
  'product', 'operations', 'finance', 'customer_success', 'devops',
];
const BROWSE_CITIES = [
  'New York City', 'San Francisco', 'Austin', 'Toronto', 'Boston',
  'Chicago', 'Los Angeles', 'Seattle',
];

const EMBER = 'linear-gradient(135deg, #e85d3a 0%, #f2833f 100%)';
const PAGE_SIZE = 25;
// Same shape BrowseJobs.tsx already reads -- only the columns a public
// reader has any use for; closure_status/scam_reason/mass_posting_count
// etc. stay internal-only, never selected here.
const COLS = 'id, source, company, company_slug, company_logo_url, title, description, location, apply_url, posted_at, '
  + 'employment_type, seniority, salary_min, salary_max, salary_currency, category, work_mode, city, skills';

// v3.201.0 -- "browse jobs should be visible without signing in," direct
// request, right after asking why the checker page couldn't be found either.
// Reads job_postings directly (RLS now grants anon SELECT, scam-excluded at
// the policy level -- see migration 20260823000000_job_postings_anon_read)
// the same way the authenticated BrowseJobs.tsx already reads it: no new
// backend action needed, this is public content by nature (a company's own
// career-page posting), not user data.
//
// Deliberately scoped narrower than the authenticated board: no quick-match
// score (that needs a resume, which an anonymous visitor doesn't have -- the
// upsell IS "sign up and score every job against your real resume"), no
// swipe mode, no trending, no company-hiring badge/ranking. Just search,
// browse, read the full posting, and apply -- the same honest floor every
// real public job board offers before asking for an account.
const PublicJobs = () => {
  const { id: routeId, category: categorySlug, location: locationSlug } = useParams<{
    id?: string; category?: string; location?: string;
  }>();
  const navigate = useNavigate();
  const cityFilter = locationSlug ? unslugifyCity(locationSlug) : null;
  const categoryLabel = categorySlug ? humanizeCategory(categorySlug) : null;

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<JobPosting | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState<Set<string>>(new Set());

  useEffect(() => {
    document.body.classList.add('contact-surface');
    return () => document.body.classList.remove('contact-surface');
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const buildQuery = useCallback((withCount: boolean) => {
    let q = supabase
      .from('job_postings')
      .select(COLS, withCount ? { count: 'exact' } : undefined)
      .order('posted_at', { ascending: false })
      // Same belt-and-suspenders the authenticated board uses -- RLS
      // already enforces this, this just keeps the query itself honest
      // about what it's asking for.
      .or('scam_suspected.is.null,scam_suspected.eq.false');
    if (categorySlug) q = q.eq('category', categorySlug);
    if (cityFilter) q = q.ilike('city', cityFilter);
    const term = safeLike(debouncedQuery);
    if (term) q = q.or(`title.ilike.%${term}%,company.ilike.%${term}%,location.ilike.%${term}%`);
    return q;
  }, [debouncedQuery, categorySlug, cityFilter]);

  // First page, and every search change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    buildQuery(true).range(0, PAGE_SIZE - 1).then(({ data, error, count }) => {
      if (cancelled) return;
      setLoading(false);
      if (error) return;
      const rows = (data as unknown as JobPosting[]) ?? [];
      setJobs(rows);
      setTotal(count ?? rows.length);
      if (!routeId) {
        setSelected((prev) => (prev && rows.some((r) => r.id === prev.id) ? prev : rows[0] ?? null));
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildQuery]);

  // A direct /jobs/:id link -- fetch that one job even if it isn't on the
  // current page, so a shared link or a bookmark always resolves.
  useEffect(() => {
    if (!routeId) return;
    let cancelled = false;
    supabase.from('job_postings').select(COLS).eq('id', routeId).maybeSingle().then(({ data }) => {
      if (cancelled || !data) return;
      setSelected(data as unknown as JobPosting);
    });
    return () => { cancelled = true; };
  }, [routeId]);

  const loadMore = async () => {
    setLoadingMore(true);
    const { data } = await buildQuery(false).range(jobs.length, jobs.length + PAGE_SIZE - 1);
    setLoadingMore(false);
    setJobs((prev) => [...prev, ...((data as unknown as JobPosting[]) ?? [])]);
  };

  const openJob = (job: JobPosting) => {
    setSelected(job);
    navigate(`/jobs/${job.id}`, { replace: true });
  };

  const jsonLd = useMemo(() => {
    // v3.205.0 -- a real, if subtle, pre-existing bug found while adding
    // category/location pages: this used to key off `selected`, which
    // auto-populates to the list's own first row even on the plain /jobs
    // hub (and would have done the same on every new category/location
    // hub page) -- meaning JobPosting schema was being injected on a
    // LISTING page, which Google's own docs are explicit is wrong:
    // "Google requires JobPosting schema on individual job pages only.
    // Never on search results, category, or list pages." Gated on
    // routeId instead -- true only when the URL itself is a real
    // /jobs/:id, matching what the canonical tag below also asserts.
    if (!selected || !routeId) return undefined;
    // v3.203.0 -- Google's own JobPosting docs, read directly rather than
    // guessed at: validThrough is recommended, and its absence isn't a
    // gap most job boards think about, but AYN has a real, honest answer
    // most sites don't -- job-board-sync's FRESHNESS_DAYS (3) is exactly
    // when this listing gets pruned from job_postings if it isn't
    // reconfirmed live, so posted_at + 3 days is a real expiry, not a
    // guess. jobLocationType/applicantLocationRequirements is Google's
    // documented fix for the single most common remote-job schema error
    // (putting "Remote" in a Place address instead of the TELECOMMUTE
    // flag); scoped to US/CA since that's job-board-sync's own real
    // sourcing scope, not a guess about any specific posting.
    const isRemote = selected.work_mode === 'remote';
    const postedMs = Date.parse(selected.posted_at);
    const validThrough = Number.isNaN(postedMs)
      ? undefined
      : new Date(postedMs + 3 * 24 * 60 * 60 * 1000).toISOString();
    return {
      '@context': 'https://schema.org/',
      '@type': 'JobPosting',
      title: selected.title,
      description: selected.description,
      datePosted: selected.posted_at,
      ...(validThrough ? { validThrough } : {}),
      hiringOrganization: { '@type': 'Organization', name: selected.company },
      identifier: { '@type': 'PropertyValue', name: 'AYN', value: selected.id },
      // AYN always sends the applicant to the employer's own site to
      // apply -- never a fill-and-submit flow of AYN's own -- so this is
      // an honest false, not an omission.
      directApply: false,
      ...(isRemote ? {
        jobLocationType: 'TELECOMMUTE',
        applicantLocationRequirements: [
          { '@type': 'Country', name: 'US' },
          { '@type': 'Country', name: 'CA' },
        ],
      } : {}),
      ...(selected.location ? {
        jobLocation: {
          '@type': 'Place',
          address: { '@type': 'PostalAddress', addressLocality: selected.location },
        },
      } : {}),
      ...(selected.employment_type ? { employmentType: selected.employment_type.toUpperCase() } : {}),
      ...(selected.salary_min && selected.salary_max ? {
        baseSalary: {
          '@type': 'MonetaryAmount',
          currency: selected.salary_currency || 'USD',
          value: {
            '@type': 'QuantitativeValue',
            minValue: selected.salary_min,
            maxValue: selected.salary_max,
            unitText: 'YEAR',
          },
        },
      } : {}),
    };
  }, [selected, routeId]);

  // v3.205.0 -- SEO identity now branches in priority order: a real
  // individual job (routeId set) first, then a category or location hub,
  // then the plain /jobs hub. Deliberately not keyed off `selected` --
  // see the jsonLd comment above for why that was wrong.
  const pageTitle = routeId && selected
    ? `${selected.title} at ${selected.company}`
    : categoryLabel
      ? `${categoryLabel} Jobs`
      : cityFilter
        ? `Jobs in ${cityFilter}`
        : 'Browse Real Jobs';
  const pageDescription = routeId && selected
    ? `${selected.title} at ${selected.company}${selected.location ? `, ${selected.location}` : ''}. Sourced directly from the company's own career page.`
    : categoryLabel
      ? `Real ${categoryLabel.toLowerCase()} jobs, sourced directly from company career pages. Never LinkedIn or Indeed. Free to search, no account needed.`
      : cityFilter
        ? `Real jobs in ${cityFilter}, sourced directly from company career pages. Never LinkedIn or Indeed. Free to search, no account needed.`
        : "Real postings sourced directly from company career pages, never LinkedIn or Indeed. Search and read the full posting free, no account needed.";
  const canonicalPath = routeId && selected
    ? `/jobs/${selected.id}`
    : categorySlug
      ? `/jobs/category/${categorySlug}`
      : locationSlug
        ? `/jobs/location/${locationSlug}`
        : '/jobs';
  // Programmatic-SEO research, Aug 2026: never let a crawler index a
  // category/location page with fewer than MIN_INDEXABLE_LISTINGS real
  // listings behind it -- a thin page drags down the whole site's
  // quality signal. Only applies to the hub pages this pass adds; the
  // plain /jobs page and a real individual job are never gated.
  const isThinHub = (categorySlug || locationSlug) && !loading && total < MIN_INDEXABLE_LISTINGS;

  return (
    <>
      <SEO
        title={pageTitle}
        description={pageDescription}
        canonical={canonicalPath}
        jsonLd={jsonLd}
        noIndex={!!isThinHub}
      />
      <div className="contact-surface min-h-screen bg-background">
        <Header />

        <main className="container mx-auto max-w-6xl px-4 sm:px-6 pt-28 sm:pt-32 pb-24">
          {(categoryLabel || cityFilter) && (
            <button
              type="button"
              onClick={() => navigate('/jobs')}
              className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> All jobs
            </button>
          )}
          <span className="inline-block h-1 w-14 rounded-full mb-6" style={{ background: EMBER }} aria-hidden="true" />
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            {categoryLabel ? `${categoryLabel} jobs` : cityFilter ? `Jobs in ${cityFilter}` : 'Browse real jobs'}
          </h1>
          <p className="mt-3 text-lg text-muted-foreground max-w-2xl">
            {categoryLabel
              ? `Real ${categoryLabel.toLowerCase()} roles, sourced directly from company career pages. Never LinkedIn or Indeed.`
              : cityFilter
                ? `Real jobs based in ${cityFilter}, sourced directly from company career pages. Never LinkedIn or Indeed.`
                : 'Sourced directly from company career pages, never LinkedIn or Indeed. No account needed to search and read the full posting.'}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: '#2f6f5e' }} />
            Every listing is sourced straight from the company that posted it, and pruned within 3 days of going stale.
          </p>

          <div className="mt-8 relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, company, or location..."
              className="pl-9"
            />
          </div>

          {/* v3.205.0 -- hub-and-spoke internal linking into the new
              category/location pages, shown only on the plain hub so a
              leaf page's own "All jobs" link is the way back, not a
              second copy of this same strip. */}
          {!categoryLabel && !cityFilter && (
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span className="text-muted-foreground shrink-0">Browse:</span>
              {BROWSE_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => navigate(`/jobs/category/${c}`)}
                  className="text-muted-foreground hover:text-[#e85d3a] underline underline-offset-2 decoration-transparent hover:decoration-current"
                >
                  {humanizeCategory(c)}
                </button>
              ))}
              {BROWSE_CITIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => navigate(`/jobs/location/${slugifyCity(c)}`)}
                  className="text-muted-foreground hover:text-[#e85d3a] underline underline-offset-2 decoration-transparent hover:decoration-current"
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <div className="mt-8 grid lg:grid-cols-[380px_1fr] gap-8">
            {/* List */}
            <div className="space-y-3">
              {loading && jobs.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-xl" />
                ))
              ) : jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8">No jobs match that search right now.</p>
              ) : (
                jobs.map((job) => {
                  const avatar = companyAvatar(job.company);
                  const logoUrl = resolveLogoUrl(job);
                  const active = selected?.id === job.id;
                  return (
                    <button
                      key={job.id}
                      onClick={() => openJob(job)}
                      className="w-full text-left rounded-xl border p-4 transition-colors hover:border-[#e85d3a]/50"
                      style={active ? { borderColor: '#e85d3a', background: 'var(--accent, #fdf3ee)' } : undefined}
                    >
                      <div className="flex items-start gap-3">
                        {logoUrl && !logoFailed.has(job.id) ? (
                          <img
                            src={logoUrl}
                            alt=""
                            className="w-9 h-9 rounded-md object-contain bg-white border shrink-0"
                            onError={() => setLogoFailed((prev) => new Set(prev).add(job.id))}
                          />
                        ) : (
                          <div className={`w-9 h-9 rounded-md flex items-center justify-center text-sm font-semibold shrink-0 ${avatar.className}`}>
                            {avatar.initial}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{job.title}</div>
                          <div className="text-sm text-muted-foreground truncate">{job.company}</div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            {job.location && <span className="truncate">{job.location}</span>}
                            <span className="shrink-0">· {postedAge(job.posted_at)}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}

              {jobs.length > 0 && jobs.length < total && (
                <Button variant="outline" className="w-full" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Load more jobs
                </Button>
              )}
            </div>

            {/* Detail */}
            <div>
              {selected ? (
                <div className="rounded-xl border p-6">
                  <div className="flex items-start gap-4">
                    {resolveLogoUrl(selected) && !logoFailed.has(`d-${selected.id}`) ? (
                      <img
                        src={resolveLogoUrl(selected)!}
                        alt=""
                        className="w-14 h-14 rounded-lg object-contain bg-white border shrink-0"
                        onError={() => setLogoFailed((prev) => new Set(prev).add(`d-${selected.id}`))}
                      />
                    ) : (
                      <div className={`w-14 h-14 rounded-lg flex items-center justify-center text-xl font-semibold shrink-0 ${companyAvatar(selected.company).className}`}>
                        {companyAvatar(selected.company).initial}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="text-xl font-bold">{selected.title}</h2>
                      <p className="text-muted-foreground">{selected.company}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    {selected.location && (
                      <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1">
                        <MapPin className="w-3 h-3" /> {selected.location}
                      </span>
                    )}
                    {selected.employment_type && (
                      <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1">
                        <Briefcase className="w-3 h-3" /> {EMPLOYMENT_TYPE_LABELS[selected.employment_type] || selected.employment_type}
                      </span>
                    )}
                    {selected.seniority && (
                      <span className="rounded-full border px-2.5 py-1">
                        {SENIORITY_LABELS[selected.seniority] || selected.seniority}
                      </span>
                    )}
                    {resolveSalary(selected) && (
                      <span className="rounded-full border px-2.5 py-1" style={{ color: '#b8862f', borderColor: '#b8862f55' }}>
                        {resolveSalary(selected)!.text}
                      </span>
                    )}
                  </div>

                  <p className="mt-3 text-xs text-muted-foreground">
                    Posted {postedDate(selected.posted_at)} · sourced directly, no ghost jobs
                  </p>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button asChild style={{ background: EMBER, color: '#fff' }}>
                      <a href={selected.apply_url} target="_blank" rel="noopener noreferrer">
                        Apply on the company's site <ExternalLink className="w-4 h-4 ml-2" />
                      </a>
                    </Button>
                    <Button variant="outline" onClick={() => setAuthOpen(true)}>
                      <Sparkles className="w-4 h-4 mr-2" />
                      See how well I match, free
                    </Button>
                  </div>

                  <div className="mt-8 pt-6 border-t">
                    <JobDescriptionBody text={selected.description} />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border p-10 text-center text-sm text-muted-foreground">
                  Select a job from the list to read the full posting.
                </div>
              )}
            </div>
          </div>

          <div className="mt-16 rounded-xl border p-6" style={{ background: 'var(--accent, #fdf3ee)' }}>
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#e85d3a' }}>
              <Sparkles className="w-4 h-4" />
              Already have a job in mind?
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Paste your resume and any job description to see exactly which requirements you match, free, no account needed.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => navigate('/check-resume')}>
              Check my resume against a job
            </Button>
          </div>
        </main>

        <Footer />
      </div>
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
};

export default PublicJobs;
