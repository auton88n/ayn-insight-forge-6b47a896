import { lazy, Suspense, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { AynLoader } from '@/components/shared/AynLoader';
import { PostingReceiptLine } from '@/components/shared/PostingReceiptLine';
import { PostingEvidencePanel } from '@/components/shared/PostingEvidence';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { JobPosting } from '@/lib/resumeHub';
import { CompanyInsightsNote } from '@/components/shared/CompanyInsightsNote';
import { JobApplicationFacts } from '@/components/shared/JobApplicationFacts';
import { additionalWorkMode } from '@/lib/jobPostingFormat';
import { displayJobTitle, tidyPosting } from '@/lib/jobPostingFormat';
import { SalaryFilter } from '@/components/shared/SalaryFilter';
import { JobPayComparison } from '@/components/shared/JobPayComparison';
import { companyAvatar, resolveLogoUrl, resolveSalary, safeLike, JobDescriptionBody, employmentTypeLabel, seniorityLabel, humanizeCategory, formatLocation, locationSearchPatterns, jobFactChips } from '@/lib/jobPostingFormat';
import { Search, ExternalLink, Loader2, MapPin, ArrowLeft, ArrowRight, RefreshCw, Link2 } from 'lucide-react';
import { cleanApplyUrl } from '@/lib/applyUrl';
import { useJobsAccount } from './useJobsAccount';

const PAGE_SIZE = 25;
const JobsDiscoveryTools = lazy(() => import('./JobsDiscoveryTools'));
export const PUBLIC_JOB_SUMMARY_COLUMNS = 'id,source,company,company_slug,company_logo_url,title,location,apply_url,posted_at,employment_type,seniority,salary_min,salary_max,salary_currency,category,work_mode,city,last_seen_at,first_seen_at,closure_status,closure_checked_at,closure_last_open_at,repost_count,years_required,sponsorship,salary_text_min,salary_text_max,salary_text_currency,salary_text_period,work_mode_text,benefits,remote_region,apply_by';
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
const detailBootstrap: { job: JobPosting; at: number } | null = (() => {
  try {
    const el = document.getElementById('ayn-job-detail-bootstrap');
    const value = el ? JSON.parse(el.textContent || 'null') : null;
    return value?.job?.id && typeof value.at === 'number' ? value : null;
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
  const [userId, setUserId] = useState<string | null>(null);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data }) => { if (live) setUserId(data.session?.user.id || null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => { if (live) setUserId(session?.user.id || null); });
    return () => { live = false; sub.subscription.unsubscribe(); };
  }, []);
  const location = useLocation();
  const [params] = useSearchParams();
  const matches = params.get('view') === 'matches';
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
  const workMode = ['remote', 'hybrid', 'onsite'].includes(params.get('mode') || '') ? params.get('mode')! : '';
  const days = ['1', '7', '30'].includes(params.get('days') || '') ? params.get('days')! : '';
  const employment = ['full_time', 'part_time', 'contract', 'internship', 'temporary', 'seasonal', 'freelance'].includes(params.get('type') || '') ? params.get('type')! : '';
  const level = ['junior', 'middle', 'senior', 'staff', 'lead', 'principal', 'intern', 'c_level'].includes(params.get('level') || '') ? params.get('level')! : '';
  const minimumPay = Math.max(0, Math.min(10000000, Number(params.get('minPay')) || 0));
  const payCurrency = ['USD','CAD','GBP','EUR','AUD','AED','SAR','SGD','CHF','INR'].includes(params.get('currency') || '') ? params.get('currency')! : 'USD';
  const [draftPay, setDraftPay] = useState(minimumPay);
  const [draftCurrency, setDraftCurrency] = useState(payCurrency);
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
  useEffect(() => { setDraftPay(minimumPay); setDraftCurrency(payCurrency); }, [minimumPay, payCurrency]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const update = () => setNarrow(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const useBootstrap = !matches && !query && !where && !categorySlug && !city && !minimumPay && !workMode && !days && !employment && !level;
  const listings = useInfiniteQuery({
    queryKey: ['public-job-summaries', query, where, categorySlug, city, minimumPay, payCurrency, workMode, days, employment, level, matches && !!userId],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      let request = (minimumPay || employment ? supabase.rpc('browse_job_postings', { p_min_annual: minimumPay, p_currency: payCurrency, ...(employment ? { p_employment_type: employment } : {}) }, { count: 'exact' }) : supabase.from('job_postings')).select(PUBLIC_JOB_SUMMARY_COLUMNS + (matches && userId ? ',description,skills' : ''), { count: 'exact' })
        .or('scam_suspected.is.null,scam_suspected.eq.false').order('posted_at', { ascending: false }).order('id', { ascending: true });
      if (categorySlug) request = request.eq('category', categorySlug);
      if (city) request = request.ilike('city', city);
      if (workMode) request = request.or(`work_mode.eq.${workMode},and(work_mode.is.null,work_mode_text.eq.${workMode})`);
      if (level) request = request.eq('seniority', level);
      // Feed refreshes may update posted_at. Do not sell this as the employer's publication date.
      if (days) request = request.gte('first_seen_at', new Date(Date.now() - Number(days) * 86_400_000).toISOString());
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
  const account = useJobsAccount(userId, matches, listings.data?.pages);
  const jobs = useMemo(() => {
    const rows = (listings.data?.pages.flatMap(page => page.rows) ?? []).map(tidyPosting);
    return matches ? rows.sort((a, b) => (account.scoreMap.get(b.id) ?? -1) - (account.scoreMap.get(a.id) ?? -1)) : rows;
  }, [listings.data, matches, account.scoreMap]);
  const selectedId = explicitId || (!narrow ? jobs[0]?.id : undefined);
  const detail = useQuery({
    queryKey: ['public-job-detail', selectedId],
    enabled: !!selectedId,
    queryFn: async ({ signal }) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      const timer = setTimeout(abort, 15_000);
      try {
        const { data, error } = await supabase.from('job_postings').select(PUBLIC_JOB_SUMMARY_COLUMNS + ',description,skills')
          .eq('id', selectedId!).or('scam_suspected.is.null,scam_suspected.eq.false').abortSignal(controller.signal).maybeSingle();
        if (error) throw error;
        return data as unknown as JobPosting | null;
      } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
    },
    staleTime: 60_000,
    retry: 1,
    ...(detailBootstrap && detailBootstrap.job.id === selectedId ? { initialData: detailBootstrap.job, initialDataUpdatedAt: detailBootstrap.at } : useBootstrap && jobsBootstrap?.detail && jobsBootstrap.detail.id === selectedId ? {
      initialData: jobsBootstrap.detail,
      initialDataUpdatedAt: jobsBootstrap.at,
    } : {}),
  });
  // The parent stores this value for page metadata. A fresh object on every
  // render makes that effect update the parent indefinitely on /jobs/:id.
  const selected = useMemo(() => detail.data ? tidyPosting(detail.data) : detail.data, [detail.data]);
  const prepareJob = (id: string) => {
    try {
      sessionStorage.setItem('ayn_focus_job', id);
      sessionStorage.setItem('ayn_focus_job_from', 'browse');
      sessionStorage.setItem('ayn_jobs_return_url', location.pathname + location.search + location.hash);
    } catch { /* saved row remains available even if session storage is unavailable */ }
    navigate('/#saved-jobs');
  };
  const total = listings.data?.pages[0]?.total ?? 0;
  useEffect(() => { onJobsLoaded?.({ total, loading: listings.isPending }); }, [total, listings.isPending, onJobsLoaded]);
  useEffect(() => { onSelectedChange?.(explicitId && selected?.id === explicitId ? selected : null); }, [explicitId, selected, onSelectedChange]);
  useEffect(() => { pane.current?.scrollTo(0, 0); if (narrow && explicitId && selected) headingRef.current?.focus({ preventScroll: true }); }, [selected?.id, narrow, explicitId]);
  const updateSearch = () => {
    const next = new URLSearchParams(params);
    if (draftQuery.trim()) next.set('q', draftQuery.trim()); else next.delete('q');
    if (draftWhere.trim()) next.set('where', draftWhere.trim()); else next.delete('where');
    if (draftPay) { next.set('minPay', String(draftPay)); next.set('currency', draftCurrency); } else { next.delete('minPay'); next.delete('currency'); }
    next.delete('job');
    if (routeId) navigate('/jobs?' + next.toString());
    else setEmbeddedParams(next);
  };
  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('job');
    if (routeId) navigate('/jobs?' + next.toString()); else setEmbeddedParams(next);
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
      {showHeading && <><Heading className="lp-display lp-h2">{category ? category + ' jobs' : city ? 'Jobs in ' + city : 'Jobs'}</Heading><p className="lp-lead">Find a role worth your next application.</p></>}
      <p className="ayn-source-note">From company career pages. Open a posting to read the requirements before you apply.</p>
    </header>
    <div className="ayn-jobs-views" role="group" aria-label="Jobs view">
      <button type="button" className={'lp-btn ' + (!matches ? 'lp-btn-primary' : 'lp-btn-ghost')} aria-pressed={!matches} onClick={() => updateFilter('view', '')}>All jobs</button>
      <button type="button" className={'lp-btn ' + (matches ? 'lp-btn-primary' : 'lp-btn-ghost')} aria-pressed={matches} onClick={() => updateFilter('view', 'matches')}>My matches</button>
    </div>
    {userId && (discoveryOpen ? <Suspense fallback={<p role="status">Opening discovery tools…</p>}><JobsDiscoveryTools key={userId} userId={userId} onPickRole={title => updateFilter('q', title)} onOpenProfile={() => navigate('/#profile')} /></Suspense> : <button className="ayn-text-link" onClick={() => setDiscoveryOpen(true)}>Explore roles and hiring trends</button>)}
    {matches && (!userId ? <div className="ayn-inline-state"><h3>Your resume makes this personal.</h3><p>Sign in to see how these jobs match your saved resume.</p><button className="lp-btn lp-btn-primary" onClick={onStartFree}>Sign in or create an account</button></div> : account.noResume ? <p className="ayn-source-note">Add a resume to see your matches. <button className="ayn-text-link" onClick={() => navigate('/#profile')}>Open Resume &amp; profile</button></p> : account.scoreError ? <p role="alert">Matches could not load. <button className="ayn-text-link" onClick={account.retryScores}>Retry matches</button></p> : <p className="ayn-source-note" role="status">{account.scoring ? 'Checking resume matches…' : 'Loaded results are ranked by resume match. Load more to compare additional jobs.'} Match percentages are not your chance of being hired.</p>)}
    <form className="ayn-search-toolbar" onSubmit={event => { event.preventDefault(); updateSearch(); }}>
      <label className="ayn-search-input"><span>Role or company</span><div><Search size={18} /><input value={draftQuery} onChange={event => setDraftQuery(event.target.value)} placeholder="Job title, skill or company" /></div></label>
      {!city && <label className="ayn-search-input"><span>Location</span><div><MapPin size={18} /><input value={draftWhere} onChange={event => setDraftWhere(event.target.value)} placeholder="City, country or remote" /></div></label>}
      <button type="submit" className="lp-btn lp-btn-primary">Search jobs <ArrowRight size={16} /></button>
    </form>
    <p className="ayn-source-note">Search a title, skill or company—not a full sentence. Put the city or country in Location and use Work mode below.</p>
    <div className="ayn-discovery-filters grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
      <label className="flex min-w-0 flex-col gap-1 text-sm">Work mode <select aria-label="Work mode" value={workMode} onChange={e => updateFilter('mode', e.target.value)} className="w-full min-w-0 border rounded-md p-2"><option value="">Any work mode</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select></label>
      <label className="flex min-w-0 flex-col gap-1 text-sm">First observed <select aria-label="First observed" value={days} onChange={e => updateFilter('days', e.target.value)} className="w-full min-w-0 border rounded-md p-2"><option value="">Any time</option><option value="1">Past 24 hours</option><option value="7">Past week</option><option value="30">Past month</option></select></label>
      <label className="flex min-w-0 flex-col gap-1 text-sm">Employment <select aria-label="Employment type" value={employment} onChange={e => updateFilter('type', e.target.value)} className="w-full min-w-0 border rounded-md p-2"><option value="">Any employment type</option>{['full_time','part_time','contract','internship','temporary','seasonal','freelance'].map(v => <option key={v} value={v}>{employmentTypeLabel(v)}</option>)}</select></label>
      <label className="flex min-w-0 flex-col gap-1 text-sm">Experience <select aria-label="Experience level" value={level} onChange={e => updateFilter('level', e.target.value)} className="w-full min-w-0 border rounded-md p-2"><option value="">Any experience level</option>{['junior','middle','senior','staff','lead','principal','intern','c_level'].map(v => <option key={v} value={v}>{seniorityLabel(v)}</option>)}</select></label>
    </div>
    <p className="ayn-source-note">First observed is when AYN first recorded the posting, not its original publication date. Filtered results exclude unknown classifications.</p>
    <details open className="ayn-pay-controls rounded-lg border p-3 mb-3"><summary className="cursor-pointer text-sm">Salary filter{minimumPay ? ` · ${minimumPay.toLocaleString()} ${payCurrency} minimum` : ''}</summary>
      <div className="max-w-md mt-3"><SalaryFilter minimum={draftPay} currency={draftCurrency} onMinimum={setDraftPay} onCurrency={setDraftCurrency} />
        <button type="button" className="lp-btn lp-btn-ghost mt-2" onClick={updateSearch}>Apply filters</button></div>
    </details>
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
          <div className="lp-browser-card-row">{logo(job)}<div className="lp-browser-card-text"><div className="lp-browser-card-company">{job.company}</div><div className="lp-browser-card-title">{job.title}</div><div className="lp-browser-card-meta">{[formatLocation(job.location) || 'Location not listed', additionalWorkMode(job.location, job.work_mode)].filter(Boolean).join(' · ')}</div><div className="ayn-job-meta-bottom">{/* "View posting" used to fill this slot when the source never
                  stated an employment type, reading as a second, unrelated
                  action sitting where "Full-time"/"Contract" belongs. An
                  unknown type is now just omitted, not papered over with a
                  confusing fallback label that isn't about employment type. */}
                  {employmentTypeLabel(job.employment_type) && <span>{employmentTypeLabel(job.employment_type)}</span>}{salary && <span className="ayn-job-salary" title={salary.fromListingText ? "Read directly from this posting's own text." : undefined}>{salary.text}</span>}{matches && userId && account.scoreMap.has(job.id) && <span>{account.scoreMap.get(job.id) == null ? 'Match unavailable' : `${account.scoreMap.get(job.id)}% resume match`}</span>}</div><PostingReceiptLine posting={job} /></div></div>
        </button>
          );
        })}
        {listings.hasNextPage && <button className="lp-btn lp-btn-ghost ayn-load-more" onClick={() => listings.fetchNextPage()} disabled={listings.isFetchingNextPage}>{listings.isFetchingNextPage ? <Loader2 size={16} className="animate-spin" /> : null} Load more jobs</button>}
        {listings.isFetchNextPageError && <p role="alert">More jobs could not load. Use “Load more jobs” to retry.</p>}
      </div>
      <div className="lp-browser-detail" ref={pane} aria-label="Selected job">
        {narrow && explicitId && <button type="button" className="ayn-back-results" onClick={backToResults}><ArrowLeft size={18} /> Back to results</button>}
        {selectedId && detail.isPending ? <div className="ayn-inline-state" role="status"><AynLoader size="sm" label="Loading the full posting" /></div> : detail.isError ? <div className="ayn-inline-state" role="alert"><h3>This posting could not load</h3><button className="lp-btn lp-btn-ghost" onClick={() => detail.refetch()}>Try again</button></div> : selected ? <article className="lp-browser-detail-card">
          <div className="lp-browser-detail-head">{logo(selected, true)}<div><p className="lp-browser-detail-company">{selected.company}</p></div></div>
          <h2 ref={headingRef} tabIndex={-1} className="ayn-job-title">{displayJobTitle(selected.title, selected.company, selected.description)}</h2>
          <div className="lp-browser-pill-row">{selected.location && <span><MapPin size={15} />{formatLocation(selected.location)}</span>}{selected.employment_type && <span>{employmentTypeLabel(selected.employment_type)}</span>}{selected.seniority && <span>{seniorityLabel(selected.seniority)}</span>}{resolveSalary(selected) && <span>{resolveSalary(selected)!.text}</span>}{jobFactChips(selected).filter(c => c.key !== 'region' && c.key !== 'deadline').map((c) => <span key={c.key} title={c.title}>{c.text}</span>)}</div>
          <PostingEvidencePanel jobId={selected.id} />
          <JobApplicationFacts job={selected} />
          <CompanyInsightsNote slug={selected.company_slug} company={selected.company} className="ayn-source-note" />
          <JobPayComparison jobId={selected.id} />
          {selected.benefits && selected.benefits.length > 0 && <p className="ayn-source-note" title="Standard benefits this posting names in its own text.">Benefits named: {selected.benefits.join(' · ')}</p>}
          <div className="lp-browser-actions"><a href={/^https?:\/\//i.test(selected.apply_url) ? cleanApplyUrl(selected.apply_url) : undefined} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-primary">Open application <ExternalLink size={16} /></a><button className="lp-btn lp-btn-ghost" onClick={() => { try { sessionStorage.setItem('ayn_check_jd', selected.description); } catch { /* checker remains usable */ } navigate('/check-resume'); }}>Check my fit</button><button className="lp-btn lp-btn-ghost" onClick={() => { try { void navigator.clipboard.writeText(`${window.location.origin}/jobs/${selected.id}`); } catch { /* clipboard unavailable */ } }}><Link2 size={16} /> Copy link</button></div>
          <p className="ayn-source-note">You apply on the employer’s own site.</p>
          {userId && <div className="ayn-job-next"><h3>Prepare this application</h3><p>Keep this role, or open its saved workspace to tailor your resume and write a cover letter. Existing credit costs apply to paid tools.</p><div className="lp-browser-actions"><button className="lp-btn lp-btn-ghost" disabled={account.saving} onClick={() => account.saveJob(selected)}>{account.saving ? 'Saving…' : account.savedUrls.has(cleanApplyUrl(selected.apply_url)) ? 'Saved' : 'Save job'}</button><button className="lp-btn lp-btn-primary" disabled={account.saving} onClick={() => account.saveJob(selected, prepareJob)}>Tailor resume &amp; cover letter <ArrowRight size={16} /></button></div></div>}
          <div className="lp-browser-jd"><h3>About this role</h3><JobDescriptionBody text={selected.description} /></div>
          {!userId && onStartFree && <div className="ayn-job-next"><h3>Make this application yours.</h3><p>Use your AYN profile to prepare a resume and cover letter for this role.</p><button className="lp-btn lp-btn-ghost" onClick={onStartFree}>Open my workspace <ArrowRight size={16} /></button></div>}
        </article> : <div className="lp-browser-detail-empty">{selectedId ? <><p>This posting is no longer in AYN’s live catalog. Choose another role from the results.</p><PostingEvidencePanel jobId={selectedId} /></> : 'Choose a role to read its requirements and prepare your application.'}</div>}
      </div>
    </div>
  </div>;
}
function LinkLike({ children, onClick }: { children: React.ReactNode; onClick: () => void }) { return <button type="button" className="ayn-text-link" onClick={onClick}>{children}</button>; }
