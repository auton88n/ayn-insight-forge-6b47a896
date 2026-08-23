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
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Search, ExternalLink, ShieldCheck, Loader2, Sparkles, MapPin, Briefcase, ArrowLeft } from 'lucide-react';

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
  onJobsLoaded?: (args: { total: number; loading: boolean }) => void;
};

export const JobsBrowser = ({
  routeId, categorySlug, locationSlug, initialQuery = '', initialWhere = '',
  showHeading = true, onJobsLoaded,
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
        <>
          <h2 className="lp-display lp-h2" style={{ marginBottom: 10 }}>{heading}</h2>
          <p className="lp-lead" style={{ marginBottom: 6 }}>{sub}</p>
        </>
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
