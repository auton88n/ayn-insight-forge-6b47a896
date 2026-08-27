/**
 * JobsBrowser -- the real, live job search and browse experience: search,
 * filter, a real result list, a real detail pane, apply on the company's
 * own site. Extracted from PublicJobs.tsx so the exact same tested,
 * production logic (the anon-safe job_postings read, the category/location
 * filters, load-more pagination) can be embedded directly on the home page
 * as its primary content, not just linked to from a marketing hero.
 *
 * v3.213.0 -- "make home the browser page." Direct instruction: the
 * homepage's first, primary content should BE this browser, not a pitch
 * about it. This component carries no page chrome of its own (no Header,
 * Footer, or SEO -- those stay owned by whichever page renders it) so it
 * can sit inside LandingSections.tsx exactly as easily as it sits inside
 * the standalone /jobs route. Restyled onto the site's own .lp design
 * tokens (same ember/paper/ink hues already defined under .lp{} in
 * index.css, never new colors) instead of the plainer shadcn defaults the
 * standalone page used, since this is now the front door, not a
 * secondary utility page.
 */
import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { JobPosting } from '@/lib/resumeHub';
import {
  companyAvatar, resolveLogoUrl, resolveSalary, postedAge, postedDate, safeLike,
  JobDescriptionBody, EMPLOYMENT_TYPE_LABELS, SENIORITY_LABELS, humanizeCategory,
} from '@/components/resume-hub/BrowseJobs';
import { Search, ExternalLink, ShieldCheck, Loader2, Sparkles, MapPin, Briefcase, ArrowLeft, Radar } from 'lucide-react';

const EMBER = 'linear-gradient(135deg, #e85d3a 0%, #f2833f 100%)';
const PAGE_SIZE = 25;
const COLS = 'id, source, company, company_slug, company_logo_url, title, description, location, apply_url, posted_at, '
  + 'employment_type, seniority, salary_min, salary_max, salary_currency, category, work_mode, city, skills';

export const BROWSE_CATEGORIES = [
  'software_engineering', 'sales', 'marketing', 'design', 'data_analytics',
  'product', 'operations', 'finance', 'customer_success', 'devops',
];
export const BROWSE_CITIES = [
  'New York City', 'San Francisco', 'Austin', 'Toronto', 'Boston',
  'Chicago', 'Los Angeles', 'Seattle',
];

export function slugifyCity(city: string): string {
  return city.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export function unslugifyCity(slug: string): string {
  return slug.replace(/-+/g, ' ').trim().split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

type Props = {
  routeId?: string;
  categorySlug?: string;
  locationSlug?: string;
  initialQuery?: string;
  initialWhere?: string;
  /** Suppress the internal "Browse real jobs" heading -- used when the
   *  page embedding this already has its own headline right above it. */
  showHeading?: boolean;
  /** v3.218.0 -- render the heading as a real <h1>, for the one caller
   *  (the seeker home page, hero removed) where this heading IS the
   *  page's own primary heading, not a section title sitting under one. */
  asH1?: boolean;
  onJobsLoaded?: (args: { total: number; loading: boolean }) => void;
  /** v3.244.0 -- fired only when a job becomes the genuine, explicit
   *  focus (a direct routeId on mount, or a real click), never for the
   *  auto-picked "show something in the preview pane" default on a bare
   *  list. PublicJobs.tsx uses this instead of its own second, duplicate
   *  fetch-by-routeId to know when it's safe to emit JobPosting schema --
   *  it works entirely off local state, so the tab title and meta tags
   *  stay correct as you click through jobs even though the URL itself
   *  deliberately never moves (see the note on openJob below for why). */
  onSelectedChange?: (job: JobPosting | null) => void;
  /** v3.261.0 -- "Get discovered" in the detail pane's action row. Turning
   *  discoverability on is a real, signed-in action (talent_pool_set, a
   *  real resume, the consent dialog) with no meaningful signed-out
   *  version, unlike "See how well I match" which goes to a genuinely
   *  public tool -- so this button's only job is to open sign-in first,
   *  never to attempt the toggle itself. Each caller wires its own real
   *  "open sign-in" behavior (the shared AuthModal on the embedded home
   *  page, a local one on the standalone /jobs route), so this stays a
   *  plain callback rather than JobsBrowser owning a modal of its own. */
  onStartFree?: () => void;
};

export const JobsBrowser = ({
  routeId, categorySlug, locationSlug, initialQuery = '', initialWhere = '',
  showHeading = true, asH1 = false, onJobsLoaded, onSelectedChange, onStartFree,
}: Props) => {
  const navigate = useNavigate();
  const cityFilter = locationSlug ? unslugifyCity(locationSlug) : null;
  const categoryLabel = categorySlug ? humanizeCategory(categorySlug) : null;

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [whereText, setWhereText] = useState(initialWhere);
  const [debouncedWhere, setDebouncedWhere] = useState(initialWhere);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<JobPosting | null>(null);
  const [logoFailed, setLogoFailed] = useState<Set<string>>(new Set());

  // v3.245.0 -- reported directly: "the logos feel very bad quality."
  // `company_logo_url` is freehire's own stored value (Google's favicon
  // service), not something this app builds. v3.247.0 -- reported again,
  // right after that fix shipped: "you removed all logos?" The 48px floor
  // was picked from one bad data point -- checking Google's *newer*
  // favicon API for "Ilderton Conversion" returned a genuine 16x16, wrongly
  // taken as proof the real, actually-stored s2/favicons URL was capped
  // the same way. It wasn't. Re-tested the real URL directly with curl
  // (a real browser UA, no CORS) since this session's own Browser pane
  // could not be used for this check at all -- a plain `fetch()` to
  // google.com from inside it fails outright with "Failed to fetch" in
  // both cors and no-cors mode, the identical "blocked by policy" shape
  // already seen this session when navigating straight to an external
  // URL, meaning this tool's own sandbox has no route to an arbitrary
  // external host, images included -- not a signal about what a real
  // visitor's own unrestricted browser experiences. curl, run from a
  // normal, unsandboxed network path, is the representative check here:
  // across 25 real companies from this exact catalog, most came back a
  // genuinely sharp 128x128, a real and common middle tier sits at 32x32
  // (Washington state agencies, several others -- normal, not blurry),
  // and only the smallest, least web-savvy employers (a community
  // college, a small regional auto dealer) came back a true 16x16. 48px
  // was rejecting the entire legitimate 32px tier along with the real
  // 16px offenders -- explaining "all logos gone" precisely. The floor
  // now sits at 24px: below a real 32x32 icon, above a real 16x16 one,
  // so only the genuinely tiny case (confirmed via curl to exist, not
  // eliminated outright) still falls back to the colored-initial avatar.
  const MIN_LOGO_PX = 24;
  const handleLogoLoad = (key: string) => (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalWidth < MIN_LOGO_PX) {
      setLogoFailed((prev) => new Set(prev).add(key));
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedWhere(whereText), 300);
    return () => clearTimeout(t);
  }, [whereText]);

  const buildQuery = useCallback((withCount: boolean) => {
    let q = supabase
      .from('job_postings')
      .select(COLS, withCount ? { count: 'exact' } : undefined)
      .order('posted_at', { ascending: false })
      .or('scam_suspected.is.null,scam_suspected.eq.false');
    if (categorySlug) q = q.eq('category', categorySlug);
    if (cityFilter) q = q.ilike('city', cityFilter);
    const term = safeLike(debouncedQuery);
    if (term) q = q.or(`title.ilike.%${term}%,company.ilike.%${term}%,location.ilike.%${term}%`);
    const whereTerm = safeLike(debouncedWhere);
    if (whereTerm) q = q.ilike('location', `%${whereTerm}%`);
    return q;
  }, [debouncedQuery, debouncedWhere, categorySlug, cityFilter]);

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
      onJobsLoaded?.({ total: count ?? rows.length, loading: false });
      if (!routeId) {
        setSelected((prev) => (prev && rows.some((r) => r.id === prev.id) ? prev : rows[0] ?? null));
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildQuery]);

  useEffect(() => {
    if (!routeId) return;
    let cancelled = false;
    supabase.from('job_postings').select(COLS).eq('id', routeId).maybeSingle().then(({ data }) => {
      if (cancelled || !data) return;
      const job = data as unknown as JobPosting;
      setSelected(job);
      onSelectedChange?.(job);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const loadMore = async () => {
    setLoadingMore(true);
    const { data } = await buildQuery(false).range(jobs.length, jobs.length + PAGE_SIZE - 1);
    setLoadingMore(false);
    setJobs((prev) => [...prev, ...((data as unknown as JobPosting[]) ?? [])]);
  };

  // v3.244.0 -- reported directly: "job search i feel it have two pages
  // also dose not behave like indeed." Traced live: every job click, from
  // Home's embedded view AND from the standalone /jobs page itself, called
  // navigate(`/jobs/${id}`) -- a real react-router route transition, not
  // an in-place update. /jobs, /jobs/:id, /jobs/category/:x and
  // /jobs/location/:x are four separate <Route> entries in App.tsx, each
  // rendering this component fresh, so react-router remounts the whole
  // thing on every single transition between them, discarding the typed
  // search, filters, and loaded list every time. Real Indeed never does
  // this: selecting a result updates the detail pane without ever
  // treating it as leaving the results page.
  //
  // Fixed by never touching the URL on a plain selection at all: local
  // state alone drives both the detail pane and, via onSelectedChange,
  // the tab title and meta tags -- so browsing stays on one continuous,
  // correctly-titled page with the address bar simply not moving.
  // Verified with real, trusted clicks (a synthetic .value + dispatchEvent
  // simulation of typing turned out to be unreliable for this check --
  // it doesn't reliably register as a real React state change, so an
  // earlier pass through this fix chased a false lead that traced the
  // wrong cause before this was caught and re-verified properly). A
  // genuine hard navigation -- a shared link, a bookmark, browser back/
  // forward -- still lands on a fresh, correctly-rendered /jobs/:id
  // exactly as before, since that path never goes through openJob.
  const openJob = (job: JobPosting) => {
    setSelected(job);
    onSelectedChange?.(job);
  };

  const heading = categoryLabel ? `${categoryLabel} jobs` : cityFilter ? `Jobs in ${cityFilter}` : 'Browse real jobs';
  const sub = categoryLabel
    ? `Real ${categoryLabel.toLowerCase()} roles, sourced directly from company career pages. Never LinkedIn or Indeed.`
    : cityFilter
      ? `Real jobs based in ${cityFilter}, sourced directly from company career pages. Never LinkedIn or Indeed.`
      : 'Sourced directly from company career pages, never LinkedIn or Indeed. No account needed to search and read the full posting.';

  return (
    <div className="lp-browser">
      {(categoryLabel || cityFilter) && (
        <button type="button" onClick={() => navigate('/jobs')} className="lp-browser-back">
          <ArrowLeft className="w-3.5 h-3.5" /> All jobs
        </button>
      )}

      {showHeading && (
        asH1 ? (
          <>
            {/* v3.239.0 -- reported directly against a live screenshot:
                "missing highlitghts." This was the one heading on the
                whole site with no eyebrow label above it at all, not
                even the bare decorative bar Salary guide/Check my resume
                had -- fixed alongside those two same-report gaps. */}
            <p className="lp-eyebrow">Job search</p>
            <h1 className="lp-display lp-h2" style={{ marginBottom: 10 }}>{heading}</h1>
            <p className="lp-lead" style={{ marginBottom: 6 }}>{sub}</p>
          </>
        ) : (
          <>
            <p className="lp-eyebrow">Job search</p>
            <h2 className="lp-display lp-h2" style={{ marginBottom: 10 }}>{heading}</h2>
            <p className="lp-lead" style={{ marginBottom: 6 }}>{sub}</p>
          </>
        )
      )}
      <p className="lp-browser-trust">
        <ShieldCheck className="w-4 h-4 shrink-0" />
        Every listing is sourced straight from the company that posted it, and pruned within 3 days of going stale.
      </p>

      <div className="lp-browser-search">
        <div className="lp-browser-field">
          <Search className="lp-browser-field-icon" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Job title, keyword, or company" />
        </div>
        {!cityFilter && (
          <div className="lp-browser-field lp-browser-field-where">
            <MapPin className="lp-browser-field-icon" />
            <Input value={whereText} onChange={(e) => setWhereText(e.target.value)} placeholder="City or remote" />
          </div>
        )}
      </div>

      {!categoryLabel && !cityFilter && (
        <div className="lp-browser-chips-row">
          <span className="lp-browser-chips-label">Browse:</span>
          {BROWSE_CATEGORIES.map((c) => (
            <button key={c} type="button" onClick={() => navigate(`/jobs/category/${c}`)} className="lp-browser-chip-link">
              {humanizeCategory(c)}
            </button>
          ))}
          {BROWSE_CITIES.map((c) => (
            <button key={c} type="button" onClick={() => navigate(`/jobs/location/${slugifyCity(c)}`)} className="lp-browser-chip-link">
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="lp-browser-grid">
        <div className="lp-browser-list">
          {loading && jobs.length === 0 ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)
          ) : jobs.length === 0 ? (
            <p className="lp-browser-empty">No jobs match that search right now.</p>
          ) : (
            jobs.map((job) => {
              const avatar = companyAvatar(job.company);
              const logoUrl = resolveLogoUrl(job);
              const active = selected?.id === job.id;
              return (
                <button
                  key={job.id}
                  onClick={() => openJob(job)}
                  className={`lp-browser-card ${active ? 'is-active' : ''}`}
                >
                  <div className="lp-browser-card-row">
                    {logoUrl && !logoFailed.has(job.id) ? (
                      <img
                        src={logoUrl} alt="" className="lp-browser-logo"
                        onError={() => setLogoFailed((prev) => new Set(prev).add(job.id))}
                        onLoad={handleLogoLoad(job.id)}
                      />
                    ) : (
                      <div className={`lp-browser-avatar ${avatar.className}`}>{avatar.initial}</div>
                    )}
                    <div className="lp-browser-card-text">
                      <div className="lp-browser-card-title">{job.title}</div>
                      <div className="lp-browser-card-company">{job.company}</div>
                      <div className="lp-browser-card-meta">
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

        <div className="lp-browser-detail">
          {selected ? (
            <div className="lp-browser-detail-card">
              <div className="lp-browser-detail-head">
                {resolveLogoUrl(selected) && !logoFailed.has(`d-${selected.id}`) ? (
                  <img
                    src={resolveLogoUrl(selected)!} alt="" className="lp-browser-detail-logo"
                    onError={() => setLogoFailed((prev) => new Set(prev).add(`d-${selected.id}`))}
                    onLoad={handleLogoLoad(`d-${selected.id}`)}
                  />
                ) : (
                  <div className={`lp-browser-detail-avatar ${companyAvatar(selected.company).className}`}>
                    {companyAvatar(selected.company).initial}
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="lp-display" style={{ fontSize: 22, margin: 0 }}>{selected.title}</h3>
                  <p className="lp-browser-detail-company">{selected.company}</p>
                </div>
              </div>

              <div className="lp-browser-pill-row">
                {selected.location && <span className="lp-browser-pill"><MapPin className="w-3 h-3" /> {selected.location}</span>}
                {selected.employment_type && (
                  <span className="lp-browser-pill">
                    <Briefcase className="w-3 h-3" /> {EMPLOYMENT_TYPE_LABELS[selected.employment_type] || selected.employment_type}
                  </span>
                )}
                {selected.seniority && <span className="lp-browser-pill">{SENIORITY_LABELS[selected.seniority] || selected.seniority}</span>}
                {resolveSalary(selected) && (
                  <span className="lp-browser-pill lp-browser-pill-gold">{resolveSalary(selected)!.text}</span>
                )}
              </div>

              <p className="lp-browser-posted">
                Posted {postedDate(selected.posted_at)} · sourced directly, no ghost jobs
              </p>

              <div className="lp-browser-actions">
                <a href={selected.apply_url} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-primary">
                  Apply on the company's site <ExternalLink className="w-4 h-4" />
                </a>
                <button type="button" className="lp-btn lp-btn-ghost" onClick={() => navigate('/check-resume')}>
                  <Sparkles className="w-4 h-4" /> See how well I match, free
                </button>
                {onStartFree && (
                  <button type="button" className="lp-btn lp-btn-ghost" onClick={onStartFree}>
                    <Radar className="w-4 h-4" /> Get discovered
                  </button>
                )}
              </div>

              <div className="lp-browser-jd">
                <JobDescriptionBody text={selected.description} />
              </div>
            </div>
          ) : (
            <div className="lp-browser-detail-empty">Select a job from the list to read the full posting.</div>
          )}
        </div>
      </div>
    </div>
  );
};
