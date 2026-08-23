/**
 * LiveJobsPreview — real, current job postings sitting directly on the
 * landing page, not a screenshot of what browsing looks like.
 *
 * The prior version of this file (BrowseJobsMockup, AppMockups.tsx) was
 * a hand-authored SVG "screenshot" of the app -- invented companies,
 * invented match percentages, framed inside a fake browser chrome bar.
 * Reported directly: the landing page shouldn't show a picture of a
 * product at all, it should work like a real job search the way Indeed's
 * own homepage does -- so this isn't styled as an app preview anymore.
 * No dots, no fake browser bar, no card frame pretending to be a
 * screenshot. Just real postings, each one a real link straight into
 * /jobs/:id, sitting on the page like actual content because that's
 * what it is.
 *
 * Deliberately no match score: there is no resume to score against for
 * an anonymous visitor, and inventing a percentage would trade one
 * fabrication for another. "New" is a real, honest signal instead --
 * true or false from posted_at alone, the same threshold Browse Jobs
 * itself already uses.
 *
 * Same anon-readable, scam-excluded job_postings query TrustBento.tsx
 * already proved out live: no new backend surface, no new risk.
 */
import { memo, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { companyAvatar } from '@/components/resume-hub/BrowseJobs';

const HOT_WINDOW_MS = 24 * 60 * 60 * 1000;
const PREVIEW_SIZE = 4;

type PreviewJob = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  posted_at: string;
};

export const LiveJobsPreview = memo(() => {
  const [jobs, setJobs] = useState<PreviewJob[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('job_postings')
      .select('id, title, company, location, posted_at')
      .order('posted_at', { ascending: false })
      .or('scam_suspected.is.null,scam_suspected.eq.false')
      .limit(PREVIEW_SIZE)
      .then(({ data }) => {
        if (!cancelled && data) setJobs(data as PreviewJob[]);
      })
      // An empty list is honest if this fails -- never a fabricated row.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (jobs.length === 0) return null;

  return (
    <div className="lp-hero-results">
      <div className="lp-hero-results-label">Posted in the last few hours</div>
      {jobs.map((job) => {
        const isNew = Date.now() - new Date(job.posted_at).getTime() < HOT_WINDOW_MS;
        const avatar = companyAvatar(job.company);
        return (
          <Link key={job.id} to={`/jobs/${job.id}`} className="lp-hero-result">
            <span className={avatar.className + ' lp-hero-result-avatar'}>{avatar.initial}</span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="lp-hero-result-title" style={{ display: 'block' }}>{job.title}</span>
              <span className="lp-hero-result-meta" style={{ display: 'block' }}>
                {job.company}{job.location ? ` · ${job.location}` : ''}
              </span>
            </span>
            {isNew && <span className="lp-hero-result-new">NEW</span>}
          </Link>
        );
      })}
    </div>
  );
});

LiveJobsPreview.displayName = 'LiveJobsPreview';
