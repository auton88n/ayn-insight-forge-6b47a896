import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { JobPosting } from '@/lib/resumeHub';
import { companyAvatar, resolveLogoUrl, resolveSalary, postedAge, postedDate, safeLike, JobDescriptionBody, EMPLOYMENT_TYPE_LABELS, SENIORITY_LABELS, humanizeCategory } from '@/components/resume-hub/BrowseJobs';
import { Search, ExternalLink, Loader2, MapPin, ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';

const PAGE_SIZE = 25;
export const PUBLIC_JOB_SUMMARY_COLUMNS = 'id,source,company,company_slug,company_logo_url,title,location,apply_url,posted_at,employment_type,seniority,salary_min,salary_max,salary_currency,category,work_mode,city';
type JobSummary = Omit<JobPosting, 'description'>;
export const BROWSE_CATEGORIES = ['software_engineering', 'sales', 'marketing', 'design', 'data_analytics', 'product', 'operations', 'finance', 'customer_success', 'devops'];
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
  const [params, setParams] = useSearchParams();
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
      if (place) request = request.ilike('location', '%' + place + '%');
      const { data, error, count } = await request.range(pageParam, pageParam + PAGE_SIZE - 1).abortSignal(signal);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as JobSummary[], total: count ?? 0, offset: pageParam };
    },
    getNextPageParam: page => page.rows.length && page.offset + page.rows.length < page.total ? page.offset + page.rows.length : undefined,
    staleTime: 60_000,
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
    else setParams(next);
  };
  const openJob = (job: JobSummary) => {
    const next = new URLSearchParams(params); next.set('job', job.id);
    if (routeId) navigate('/jobs?' + next.toString());
    else setParams(next, { preventScrollReset: true });
  };
  const backToResults = () => {
    const id = selectedId;
    const next = new URLSearchParams(params); next.delete('job');
    if (routeId) navigate('/jobs?' + next.toString());
    else setParams(next, { preventScrollReset: true });
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
      <div><select aria-label="Job category" value={categorySlug || ''} onChange={event => navigate(event.target.value ? '/jobs/category/' + event.target.value : '/jobs')}><option value="">All categories</option>{BROWSE_CATEGORIES.map(value => <option key={value} value={value}>{humanizeCategory(value)}</option>)}</select><LinkLike onClick={() => navigate('/salary-guide')}>Salary guide</LinkLike></div>
    </div>
    <div className="lp-browser-grid">
      <div className="lp-browser-list" aria-label="Job results" aria-busy={listings.isFetching}>
        {listings.isPending ? Array.from({ length: 5 }, (_, index) => <div key={index} className="ayn-job-skeleton" aria-hidden="true" />) : listings.isError ? <div className="ayn-inline-state" role="alert"><h3>Jobs could not load</h3><p>Your search is still here. Please try again.</p><button className="lp-btn lp-btn-ghost" onClick={() => listings.refetch()}><RefreshCw size={16} /> Retry search</button></div> : jobs.length === 0 ? <div className="ayn-inline-state"><h3>No matching roles right now</h3><p>Try a broader title or another location.</p></div> : jobs.map(job => <button id={'job-result-' + job.id} key={job.id} type="button" onClick={() => openJob(job)} aria-pressed={selectedId === job.id} className={'lp-browser-card ' + (selectedId === job.id ? 'is-active' : '')}>
          <div className="lp-browser-card-row">{logo(job)}<div className="lp-browser-card-text"><div className="lp-browser-card-company">{job.company}</div><div className="lp-browser-card-title">{job.title}</div><div className="lp-browser-card-meta">{job.location || 'Location not listed'}</div><div className="ayn-job-meta-bottom"><span>{job.employment_type ? EMPLOYMENT_TYPE_LABELS[job.employment_type] || job.employment_type : 'View posting'}</span><span>{postedAge(job.posted_at)}</span></div></div></div>
        </button>)}
        {listings.hasNextPage && <button className="lp-btn lp-btn-ghost ayn-load-more" onClick={() => listings.fetchNextPage()} disabled={listings.isFetchingNextPage}>{listings.isFetchingNextPage ? <Loader2 size={16} className="animate-spin" /> : null} Load more jobs</button>}
        {listings.isFetchNextPageError && <p role="alert">More jobs could not load. Use “Load more jobs” to retry.</p>}
      </div>
      <div className="lp-browser-detail" ref={pane} aria-label="Selected job">
        {narrow && explicitId && <button type="button" className="ayn-back-results" onClick={backToResults}><ArrowLeft size={18} /> Back to results</button>}
        {selectedId && detail.isPending ? <div className="ayn-inline-state" role="status"><Loader2 size={20} className="animate-spin" /><p>Loading the full posting…</p></div> : detail.isError ? <div className="ayn-inline-state" role="alert"><h3>This posting could not load</h3><button className="lp-btn lp-btn-ghost" onClick={() => detail.refetch()}>Try again</button></div> : selected ? <article className="lp-browser-detail-card">
          <div className="lp-browser-detail-head">{logo(selected, true)}<div><p className="lp-browser-detail-company">{selected.company}</p><p className="ayn-source-note">Posted {postedDate(selected.posted_at)}</p></div></div>
          <h2 ref={headingRef} tabIndex={-1} className="ayn-job-title">{selected.title}</h2>
          <div className="lp-browser-pill-row">{selected.location && <span><MapPin size={15} />{selected.location}</span>}{selected.employment_type && <span>{EMPLOYMENT_TYPE_LABELS[selected.employment_type] || selected.employment_type}</span>}{selected.seniority && <span>{SENIORITY_LABELS[selected.seniority] || selected.seniority}</span>}{resolveSalary(selected) && <span>{resolveSalary(selected)!.text}</span>}</div>
          <div className="lp-browser-actions"><a href={/^https?:\/\//i.test(selected.apply_url) ? selected.apply_url : undefined} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-primary">Open application <ExternalLink size={16} /></a><button className="lp-btn lp-btn-ghost" onClick={() => { try { sessionStorage.setItem('ayn_check_jd', selected.description); } catch { /* checker remains usable */ } navigate('/check-resume'); }}>Check my fit</button></div>
          <p className="ayn-source-note">The application opens on the employer’s site. AYN does not submit it for you.</p>
          <div className="lp-browser-jd"><h3>About this role</h3><JobDescriptionBody text={selected.description} /></div>
          {onStartFree && <div className="ayn-job-next"><h3>Make this application yours.</h3><p>Use your AYN profile to prepare a resume and cover letter for this role.</p><button className="lp-btn lp-btn-ghost" onClick={onStartFree}>Open my workspace <ArrowRight size={16} /></button></div>}
        </article> : <div className="lp-browser-detail-empty">{selectedId ? 'This posting is no longer available. Choose another role from the results.' : 'Choose a role to read its requirements and prepare your application.'}</div>}
      </div>
    </div>
  </div>;
}
function LinkLike({ children, onClick }: { children: React.ReactNode; onClick: () => void }) { return <button type="button" className="ayn-text-link" onClick={onClick}>{children}</button>; }
