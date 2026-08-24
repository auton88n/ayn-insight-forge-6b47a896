import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SEO } from '@/components/shared/SEO';
import { SeekerSidebar } from '@/components/landing/SeekerSidebar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { Button } from '@/components/ui/button';
import { JobsBrowser, unslugifyCity } from '@/components/landing/JobsBrowser';
import { humanizeCategory } from '@/components/resume-hub/BrowseJobs';
import { Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { JobPosting } from '@/lib/resumeHub';

// v3.213.0 -- the actual browse/search UI moved into JobsBrowser.tsx so the
// exact same tested logic can also be embedded directly on the home page.
// This page is now a thin wrapper: it owns the page chrome (Header, Footer,
// SEO/canonical/JobPosting-schema, the thin-hub noIndex gate) that only
// makes sense for a real, standalone, bookmarkable/crawlable route --
// none of which the embedded home-page browser needs, since the home
// page's own SEO identity is a different, seeker-oriented one.
const MIN_INDEXABLE_LISTINGS = 5;

const PublicJobs = () => {
  const { id: routeId, category: categorySlug, location: locationSlug } = useParams<{
    id?: string; category?: string; location?: string;
  }>();
  const navigate = useNavigate();
  const cityFilter = locationSlug ? unslugifyCity(locationSlug) : null;
  const categoryLabel = categorySlug ? humanizeCategory(categorySlug) : null;

  // Only needed here, for the SEO tags and the thin-hub gate -- the browser
  // component tracks its own copy of this internally for rendering.
  const [selected, setSelected] = useState<JobPosting | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.body.classList.add('contact-surface');
    return () => document.body.classList.remove('contact-surface');
  }, []);

  useEffect(() => {
    if (!routeId) { setSelected(null); return; }
    let cancelled = false;
    supabase.from('job_postings').select('id, title, company, location, description, posted_at, work_mode, employment_type, salary_min, salary_max, salary_currency')
      .eq('id', routeId).maybeSingle().then(({ data }) => {
        if (!cancelled && data) setSelected(data as unknown as JobPosting);
      });
    return () => { cancelled = true; };
  }, [routeId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    let q = supabase.from('job_postings').select('id', { count: 'exact', head: true })
      .or('scam_suspected.is.null,scam_suspected.eq.false');
    if (categorySlug) q = q.eq('category', categorySlug);
    if (cityFilter) q = q.ilike('city', cityFilter);
    q.then(({ count }) => {
      if (cancelled) return;
      setTotal(count ?? 0);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [categorySlug, cityFilter]);

  const jsonLd = useMemo(() => {
    // v3.205.0 -- gated on routeId, not `selected` alone: Google's own docs
    // are explicit that JobPosting schema belongs on an individual job page
    // only, never a search/category/list page.
    if (!selected || !routeId) return undefined;
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
      directApply: false,
      ...(isRemote ? {
        jobLocationType: 'TELECOMMUTE',
        applicantLocationRequirements: [
          { '@type': 'Country', name: 'US' },
          { '@type': 'Country', name: 'CA' },
        ],
      } : {}),
      ...(selected.location ? {
        jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: selected.location } },
      } : {}),
      ...(selected.employment_type ? { employmentType: selected.employment_type.toUpperCase() } : {}),
      ...(selected.salary_min && selected.salary_max ? {
        baseSalary: {
          '@type': 'MonetaryAmount',
          currency: selected.salary_currency || 'USD',
          value: { '@type': 'QuantitativeValue', minValue: selected.salary_min, maxValue: selected.salary_max, unitText: 'YEAR' },
        },
      } : {}),
    };
  }, [selected, routeId]);

  const pageTitle = routeId && selected
    ? `${selected.title} at ${selected.company}`
    : categoryLabel ? `${categoryLabel} Jobs` : cityFilter ? `Jobs in ${cityFilter}` : 'Browse Real Jobs';
  const pageDescription = routeId && selected
    ? `${selected.title} at ${selected.company}${selected.location ? `, ${selected.location}` : ''}. Sourced directly from the company's own career page.`
    : categoryLabel
      ? `Real ${categoryLabel.toLowerCase()} jobs, sourced directly from company career pages. Never LinkedIn or Indeed. Free to search, no account needed.`
      : cityFilter
        ? `Real jobs in ${cityFilter}, sourced directly from company career pages. Never LinkedIn or Indeed. Free to search, no account needed.`
        : "Real postings sourced directly from company career pages, never LinkedIn or Indeed. Search and read the full posting free, no account needed.";
  const canonicalPath = routeId && selected
    ? `/jobs/${selected.id}`
    : categorySlug ? `/jobs/category/${categorySlug}` : locationSlug ? `/jobs/location/${locationSlug}` : '/jobs';
  const isThinHub = (categorySlug || locationSlug) && !loading && total !== null && total < MIN_INDEXABLE_LISTINGS;

  return (
    <>
      <SEO title={pageTitle} description={pageDescription} canonical={canonicalPath} jsonLd={jsonLd} noIndex={!!isThinHub} />
      <div className="lp lp-shell-with-sidebar contact-surface">
        <SeekerSidebar />
        <main className="lp-sidebar-main">
          <div className="container mx-auto max-w-6xl px-4 sm:px-6 pt-10 sm:pt-12 pb-24">
            <JobsBrowser routeId={routeId} categorySlug={categorySlug} locationSlug={locationSlug} asH1 />

            <div className="mt-16 rounded-xl border p-6" style={{ background: 'var(--accent, #fdf3ee)' }}>
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#e85d3a' }}>
                <Sparkles className="w-4 h-4" />
                Already have a job in mind?
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Paste your resume and any job description to see exactly which requirements you match, free, no account needed.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => navigate('/check-resume')}>
                  Check my resume against a job
                </Button>
                <Button variant="outline" onClick={() => navigate('/salary-guide')}>
                  See real salary data by role
                </Button>
              </div>
            </div>
          </div>
          <LandingFooter />
        </main>
      </div>
    </>
  );
};

export default PublicJobs;
