import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { AynLoader } from '@/components/shared/AynLoader';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { JobPosting } from '@/lib/resumeHub';
import { CompanyHiringSpeedNote } from '@/components/shared/CompanyHiringSpeedNote';
import { companyAvatar, resolveLogoUrl, resolveSalary, postedAge, postedDate, safeLike, JobDescriptionBody, employmentTypeLabel, seniorityLabel, humanizeCategory, formatLocation, locationSearchPatterns, jobAgeNotes, jobFactChips } from '@/lib/jobPostingFormat';
import { Search, ExternalLink, Loader2, MapPin, ArrowLeft, ArrowRight, RefreshCw, Link2 } from 'lucide-react';
import { cleanApplyUrl } from '@/lib/applyUrl';

const PAGE_SIZE = 25;
export const PUBLIC_JOB_SUMMARY_COLUMNS = 'id,source,company,company_slug,company_logo_url,title,location,apply_url,posted_at,employment_type,seniority,salary_min,salary_max,salary_currency,category,work_mode,city,last_seen_at,first_seen_at,repost_count,years_required,sponsorship,salary_text_min,salary_text_max,salary_text_currency,salary_text_period,work_mode_text,benefits';
type JobSummary = Omit<JobPosting, 'description'>;
// The server puts the first page of jobs, and the first job's full posting, in the
// HTML itself (see getJobsBootstrap in server.js), so the page can show jobs without
// waiting for two sequential requests. Used only for the plain, unfiltered list, and
// treated as stale (and refetched) once it is older than the query's staleTime.
type JobsBootstrap = { rows: JobSummary[]; total: number; detail: JobPosting | null; at: number };
const jobsBootstrap: JobsBootstrap | null = (() => {
  try {
    const el = document.getElementById('ayn-jobs-bootstrap');
    const data = el ? JSON.parse(el.textContent || 'null') : null;
    return data && Array.isArray(data.rows) && data.rows.length && typeof data.at === 'number' ? data as JobsBootstrap : null;
  } catch { return null; }
})();
export const BROWSE_CATEGORIES = ['software_engineering', 'sales', 'marketing', 'design', 'data_analytics', 'product', 'operations', 'finance', 'customer_success', 'devops', 'healthcare', 'education', 'hr', 'legal', 'retail', 'hospitality', 'administrative', 'construction'];
export const BROWSE_CITIES = ['New York City', 'San Francisco', 'Austin', 'Toronto', 'Boston', 'Chicago', 'Los Angeles', 'Seattle'];
export function slugifyCity(city: string): string { return city.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
export function unslugifyCity(slug: string): string { return slug.replace(/-+/g, ' ').trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }
type Props = {
  routeId?: string; categorySlug?: string; locationSlug?: string; initialQuery?: string; initialWhere?: string;
  showHeading?: boolean; asH1?: boolean; onJobsLoaded?: (args: { total: number; loading: boolean }) => void;
  onSelectedChange?: (job: JobPosting | null) => void; onStartFree?: () => void;
};

export function JobsBrowser({ routeId, categorySlug, locationSlug, initialQuery = '', initialWhere = '', showHeading = true, asH1 = false, onJobsLoaded, onSelectedChange, onStartFree }: Props) {
  const navigate = useNavigate();
  // A signed-in visitor must never be shown the sign-up dialog: "Open my
  // workspace" takes them to their Saved jobs instead.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data }) => { if (live) setSignedIn(!!data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => { if (live) setSignedIn(!!session); });
    return () => { live = false; sub.subscription.unsubscribe(); };
  }, []);
  const location = useLocation();
  const [params] = useSearchParams();
  // Sept 2026 -- same fix as ProfileTab.tsx, same day, same root cause:
  // "when i click to buttons or pages it takes me to a diffrent page."
  // setParams() (react-router's setSearchParams) does not carry the
  // current #hash forward on its own, and when this component is
  // embedded on Home (no routeId), that hash is literally what decides
  // which tab is showing at all. This masked itself here specifically
  // because Home's own default tab happens to be "search" -- the exact
  // tab this component renders under -- so losing the hash and falling
  // back to the app's own hash-less default landed back on the same
  // content by coincidence, not because it was actually preserved. Still
  // fixed properly rather than left relying on that coincidence, since a
  // returning visitor's own stored/handed-off entry tab is not always
  // "search," and the leftover hash-less URL was never correct regardless
  // of whether the wrong tab happened to show.
  const setEmbeddedParams = (next: URLSearchParams, opts?: { preventScrollReset?: boolean }) => {
    navigate({ pathname: location.pathname, search: next.toString(), hash: location.hash }, opts);
  };
  const query = params.get('q') ?? initialQuery;
  const where = params.get('where') ?? initialWhere;
  const [draftQuery, setDraftQuery] = useState(query);
  const [draftWhere, setDraftWhere] = useState(where);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 1023px)').matches);
  const [logoFailed, setLogoFailed] = useState<Set<string>>(new Set());
  const pane = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const city = locationSlug ? unslugifyCity(locationSlug) : null;
  const category = categorySlug ? humanizeCategory(categorySlug) : null;
  const explicitId = routeId || params.get('job');
  useEffect(() => { setDraftQuery(query); setDraftWhere(where); }, [query, where]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const update = () => setNarrow(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const useBootstrap = !query && !where && !categorySlug && !city;
  const listings = useInfiniteQuery({
    queryKey: ['public-job-summaries', query, where, categorySlug, city],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      let request = supabase.from('job_postings').select(PUBLIC_JOB_SUMMARY_COLUMNS, { count: 'exact' })
        .or('scam_suspected.is.null,scam_suspected.eq.false').order('posted_at', { ascending: false }).order('id', { ascending: true });
      if (categorySlug) request = request.eq('category', categorySlug);
      if (city) request = request.ilike('city', city);
      const term = safeLike(query), place = safeLike(where);
      if (term) request = request.or('title.ilike.%' + term + '%,company.ilike.%' + term + '%,location.ilike.%' + term + '%');
      if (place) {
        const patterns = locationSearchPatterns(place);
        request = patterns.length > 1 ? request.or(patterns.map((pattern) => 'location.ilike.%' + pattern + '%').join(',')) : request.ilike('location', '%' + place + '%');
      }
      const { data, error, count } = await request.range(pageParam, pageParam + PAGE_SIZE - 1).abortSignal(signal);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as JobSummary[], total: count ?? 0, offset: pageParam };
    },
    getNextPageParam: page => page.rows.length && page.offset + page.rows.length < page.total ? page.offset + page.rows.length : undefined,
    staleTime: 60_000,
    ...(useBootstrap && jobsBootstrap ? {
      initialData: { pages: [{ rows: jobsBootstrap.rows, total: jobsBootstrap.total, offset: 0 }], pageParams: [0] },
      initialDataUpdatedAt: jobsBootstrap.at,
    } : {}),
  });
  const jobs = listings.data?.pages.flatMap(page => page.rows) ?? [];
  const selectedId = explicitId || (!narrow ? jobs[0]?.id : undefined);
  const detail = useQuery({
    queryKey: ['public-job-detail', selectedId],
    enabled: !!selectedId,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('job_postings').select(PUBLIC_JOB_SUMMARY_COLUMNS + ',description,skills')
        .eq('id', selectedId!).or('scam_suspected.is.null,scam_suspected.eq.false').abortSignal(signal).maybeSingle();
      if (error) throw error;
      return data as unknown as JobPosting | null;
    },
    staleTime: 60_000,
    ...(useBootstrap && jobsBootstrap?.detail && jobsBootstrap.detail.id === selectedId ? {
      initialData: jobsBootstrap.detail,
      initialDataUpdatedAt: jobsBootstrap.at,
    } : {}),
  });
  const selected = detail.data;
  const total = listings.data?.pages[0]?.total ?? 0;
  useEffect(() => { onJobsLoaded?.({ total, loading: listings.isPending }); }, [total, listings.isPending, onJobsLoaded]);
  useEffect(() => { onSelectedChange?.(explicitId && selected?.id === explicitId ? selected : null); }, [explicitId, selected, onSelectedChange]);
  useEffect(() => { pane.current?.scrollTo(0, 0); if (narrow && explicitId && selected) headingRef.current?.focus({ preventScroll: true }); }, [selected?.id, narrow, explicitId]);
  const updateSearch = () => {
    const next = new URLSearchParams(params);
    if (draftQuery.trim()) next.set('q', draftQuery.trim()); else next.delete('q');
    if (draftWhere.trim()) next.set('where', draftWhere.trim()); else next.delete('where');
    next.delete('job');
    if (routeId) navigate('/jobs?' + next.toString());
    else setEmbeddedParams(next);
  };
  const openJob = (job: JobSummary) => {
    const next = new URLSearchParams(params); next.set('job', job.id);
    if (routeId) navigate('/jobs?' + next.toString());
    else setEmbeddedParams(next, { preventScrollReset: true });
  };
  const backToResults = () => {
    const id = selectedId;
    const next = new URLSearchParams(params); next.delete('job');
    if (routeId) navigate('/jobs?' + next.toString());
    else setEmbeddedParams(next, { preventScrollReset: true });
    requestAnimationFrame(() => document.getElementById('job-result-' + id)?.focus());
  };
  const failedLogo = (id: string) => setLogoFailed(previous => new Set(previous).add(id));
  const onLogoLoad = (id: string) => (event: SyntheticEvent<HTMLImageElement>) => { if (event.currentTarget.naturalWidth < 24) failedLogo(id); };
  const logo = (job: JobSummary, large = false) => {
    const full = { ...job, description: '' };
    const url = resolveLogoUrl(full);
    return url && !logoFailed.has(job.id)
      ? <img src={url} alt="" loading="lazy" decoding="async" width={large ? 44 : 32} height={large ? 44 : 32} className={large ? 'lp-browser-detail-logo' : 'lp-browser-logo'} onError={() => failedLogo(job.id)} onLoad={onLogoLoad(job.id)} />
      : <span className={large ? 'lp-browser-detail-avatar' : 'lp-browser-avatar'}>{companyAvatar(job.company).initial}</span>;
  };
  const Heading = asH1 ? 'h1' : 'h2';
  return <div className={'lp-browser ayn-job-browser ' + (narrow && explicitId ? 'is-reading-job' : '')}>
    <header className="ayn-search-header">
      {(category || city) && <button className="lp-browser-back" onClick={() => navigate('/jobs')}><ArrowLeft size={15} /> All jobs</button>}
      {showHeading && <><Heading className="lp-display lp-h2">{category ? category + ' jobs' : city ? 'Jobs in ' + city : 'Browse real jobs'}</Heading><p className="lp-lead">Find a role worth your next application.</p></>}
      <p className="ayn-source-note">From company career pages. Open a posting to read the requirements before you apply.</p>
    </header>
    <form className="ayn-search-toolbar" onSubmit={event => { event.preventDefault(); updateSearch(); }}>
      <label className="ayn-search-input"><span>Role or company</span><div><Search size={18} /><input value={draftQuery} onChange={event => setDraftQuery(event.target.value)} placeholder="Job title, skill or company" /></div></label>
      {!city && <label className="ayn-search-input"><span>Location</span><div><MapPin size={18} /><input value={draftWhere} onChange={event => setDraftWhere(event.target.value)} placeholder="City, country or remote" /></div></label>}
      <button type="submit" className="lp-btn lp-btn-primary">Search jobs <ArrowRight size={16} /></button>
    </form>
    <div className="ayn-results-toolbar">
      <p role="status">{listings.isPending ? 'Finding jobs…' : listings.isError ? 'Search unavailable' : total > 999 ? '1,000+ roles to explore' : total + (total === 1 ? ' role found' : ' roles found')}</p>
      <div><select aria-label="Job category" value={categorySlug || ''} onChange={event => {
        // A category change used to drop whatever search/location was
        // already typed -- selecting a category after searching "Dubai"
        // silently lost the location and returned a global result set.
        // The target path still has to change (category is a route
        // segment, not a query param), but q/where ride along as the
        // same query string updateSearch() already knows how to build.
        const next = new URLSearchParams(params);
        next.delete('job');
        const base = event.target.value ? '/jobs/category/' + event.target.value : '/jobs';
        const qs = next.toString();
        navigate(qs ? base + '?' + qs : base);
      }}><option value="">All categories</option>{BROWSE_CATEGORIES.map(value => <option key={value} value={value}>{humanizeCategory(value)}</option>)}</select><LinkLike onClick={() => navigate('/salary-guide')}>Salary guide</LinkLike></div>
    </div>
    <div className="lp-browser-grid">
      <div className="lp-browser-list" aria-label="Job results" aria-busy={listings.isFetching}>
        {listings.isPending ? Array.from({ length: 5 }, (_, index) => <div key={index} className="ayn-job-skeleton" aria-hidden="true" />) : listings.isError ? <div className="ayn-inline-state" role="alert"><h3>Jobs could not load</h3><p>Your search is still here. Please try again.</p><button className="lp-btn lp-btn-ghost" onClick={() => listings.refetch()}><RefreshCw size={16} /> Retry search</button></div> : jobs.length === 0 ? <div className="ayn-inline-state"><h3>No matching roles right now</h3><p>Try a broader title or another location.</p></div> : jobs.map(job => {
          // Sept 2026 -- "i dont see the salaries and more info," compared
          // directly against Job matches' own card, which already shows
          // salary and a work-mode pill. The data was already fetched
          // (PUBLIC_JOB_SUMMARY_COLUMNS includes salary_min/max/currency
          // and work_mode) and resolveSalary was already imported here,
          // just never called on this card -- only in the detail pane.
          const salary = resolveSalary({ ...job, description: '' });
          return (
        <button id={'job-result-' + job.id} key={job.id} type="button" onClick={() => openJob(job)} aria-pressed={selectedId === job.id} className={'lp-browser-card ' + (selectedId === job.id ? 'is-active' : '')}>
          <div className="lp-browser-card-row">{logo(job)}<div className="lp-browser-card-text"><div className="lp-browser-card-company">{job.company}</div><div className="lp-browser-card-title">{job.title}</div><div className="lp-browser-card-meta">{formatLocation(job.location) || 'Location not listed'}{job.work_mode && ' · ' + job.work_mode.charAt(0).toUpperCase() + job.work_mode.slice(1)}</div><div className="ayn-job-meta-bottom">{/* "View posting" used to fill this slot when the source never
                  stated an employment type, reading as a second, unrelated
                  action sitting where "Full-time"/"Contract" belongs. An
                  unknown type is now just omitted, not papered over with a
                  confusing fallback label that isn't about employment type. */}
                  {employmentTypeLabel(job.employment_type) && <span>{employmentTypeLabel(job.employment_type)}</span>}{salary && <span className="ayn-job-salary" title={salary.fromListingText ? "Read directly from this posting's own text." : undefined}>{salary.text}</span>}<span className="ayn-job-posted" title="The last time AYN confirmed this posting was still live, not its original publish date.">Last seen listed {postedAge(job.last_seen_at || job.posted_at)}</span></div></div></div>
        </button>
          );
        })}
        {listings.hasNextPage && <button className="lp-btn lp-btn-ghost ayn-load-more" onClick={() => listings.fetchNextPage()} disabled={listings.isFetchingNextPage}>{listings.isFetchingNextPage ? <Loader2 size={16} className="animate-spin" /> : null} Load more jobs</button>}
        {listings.isFetchNextPageError && <p role="alert">More jobs could not load. Use “Load more jobs” to retry.</p>}
      </div>
      <div className="lp-browser-detail" ref={pane} aria-label="Selected job">
        {narrow && explicitId && <button type="button" className="ayn-back-results" onClick={backToResults}><ArrowLeft size={18} /> Back to results</button>}
        {selectedId && detail.isPending ? <div className="ayn-inline-state" role="status"><AynLoader size="sm" label="Loading the full posting" /></div> : detail.isError ? <div className="ayn-inline-state" role="alert"><h3>This posting could not load</h3><button className="lp-btn lp-btn-ghost" onClick={() => detail.refetch()}>Try again</button></div> : selected ? <article className="lp-browser-detail-card">
          <div className="lp-browser-detail-head">{logo(selected, true)}<div><p className="lp-browser-detail-company">{selected.company}</p><p className="ayn-source-note" title="The last time AYN's feed saw this posting still listed, not its original publish date.">Last seen listed {postedDate(selected.last_seen_at || selected.posted_at)}</p></div></div>
          <h2 ref={headingRef} tabIndex={-1} className="ayn-job-title">{selected.title}</h2>
          <div className="lp-browser-pill-row">{selected.location && <span><MapPin size={15} />{formatLocation(selected.location)}</span>}{selected.employment_type && <span>{employmentTypeLabel(selected.employment_type)}</span>}{selected.seniority && <span>{seniorityLabel(selected.seniority)}</span>}{resolveSalary(selected) && <span>{resolveSalary(selected)!.text}</span>}{jobFactChips(selected).map((c) => <span key={c.key} title={c.title}>{c.text}</span>)}{jobAgeNotes(selected).map((n) => <span key={n.text} title={n.title}>{n.text}</span>)}</div>
          <CompanyHiringSpeedNote slug={selected.company_slug} company={selected.company} className="ayn-source-note" />
          {selected.benefits && selected.benefits.length > 0 && <p className="ayn-source-note" title="Standard benefits this posting names in its own text.">Benefits named: {selected.benefits.join(' · ')}</p>}
          <div className="lp-browser-actions"><a href={/^https?:\/\//i.test(selected.apply_url) ? cleanApplyUrl(selected.apply_url) : undefined} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-primary">Open application <ExternalLink size={16} /></a><button className="lp-btn lp-btn-ghost" onClick={() => { try { sessionStorage.setItem('ayn_check_jd', selected.description); } catch { /* checker remains usable */ } navigate('/check-resume'); }}>Check my fit</button><button className="lp-btn lp-btn-ghost" onClick={() => { try { void navigator.clipboard.writeText(`${window.location.origin}/jobs/${selected.id}`); } catch { /* clipboard unavailable */ } }}><Link2 size={16} /> Copy link</button></div>
          <p className="ayn-source-note">You apply on the employer’s own site.</p>
          <div className="lp-browser-jd"><h3>About this role</h3><JobDescriptionBody text={selected.description} /></div>
          {onStartFree && <div className="ayn-job-next"><h3>Make this application yours.</h3><p>Use your AYN profile to prepare a resume and cover letter for this role.</p><button className="lp-btn lp-btn-ghost" onClick={() => (signedIn ? navigate('/resume-hub') : onStartFree())}>Open my workspace <ArrowRight size={16} /></button></div>}
        </article> : <div className="lp-browser-detail-empty">{selectedId ? 'This posting is no longer available. Choose another role from the results.' : 'Choose a role to read its requirements and prepare your application.'}</div>}
      </div>
    </div>
  </div>;
}
function LinkLike({ children, onClick }: { children: React.ReactNode; onClick: () => void }) { return <button type="button" className="ayn-text-link" onClick={onClick}>{children}</button>; }
