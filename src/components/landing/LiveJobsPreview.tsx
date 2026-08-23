/**
 * LiveJobsPreview — the seeker hero's product visual, fed by real data.
 *
 * Replaces BrowseJobsMockup (AppMockups.tsx), a hand-authored SVG showing
 * invented companies ("Acme," "Halcyon," "Northline") and invented match
 * percentages. AYN's entire pitch is "nothing invented" -- the one visual
 * a first-time visitor sees first was the one place on the site that
 * broke that promise, in the wrong font besides (the SVG mockups render
 * in Inter; the real product runs on Figtree throughout). Read directly
 * against 2026 landing-page research: real product UI in the hero, not
 * illustration, is the one pattern that shows up across nearly every
 * site named as best-in-class (Linear, Vercel, Stripe, Anthropic).
 *
 * Deliberately does not show a match score: there is no resume to score
 * against for an anonymous visitor, and inventing a percentage here
 * would trade one fabrication for another. "New" is a real, honest
 * signal instead -- true or false from posted_at alone, same threshold
 * Browse Jobs itself already uses.
 *
 * Same anon-readable, scam-excluded job_postings query TrustBento.tsx
 * already proved out live: no new backend surface, no new risk.
 */
import { memo, useEffect, useState } from 'react';
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
  const [jobs, setJobs] = useState<PreviewJob[] | null>(null);

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
      // A visitor still sees a correctly-shaped, honest empty frame if
      // this fails -- never a fabricated fallback row.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ background: '#fff' }}>
      <div style={{
        height: 34, background: 'hsl(var(--lp-surface))', display: 'flex', alignItems: 'center',
        gap: 6, padding: '0 14px', borderBottom: '1px solid hsl(var(--lp-border))',
      }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'rgba(0,0,0,0.12)' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'rgba(0,0,0,0.12)' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'rgba(0,0,0,0.12)' }} />
        <span style={{
          flex: 1, textAlign: 'center', fontFamily: "'Figtree', system-ui, sans-serif",
          fontSize: 11, color: 'hsl(var(--lp-dim))',
        }}>
          Browse jobs
        </span>
      </div>

      <div style={{ padding: '18px 22px 20px' }}>
        <div style={{
          fontFamily: "'Outfit', system-ui, sans-serif", fontWeight: 700, fontSize: 16,
          color: 'hsl(var(--lp-fg))',
        }}>
          Real postings, refreshed automatically
        </div>
        <div style={{ fontSize: 12, color: 'hsl(var(--lp-dim))', marginTop: 2 }}>
          Company career pages only. Never LinkedIn or Indeed.
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(jobs ?? Array.from({ length: PREVIEW_SIZE })).map((job, i) => {
            const isNew = job && Date.now() - new Date(job.posted_at).getTime() < HOT_WINDOW_MS;
            const avatar = job ? companyAvatar(job.company) : null;
            return (
              <div
                key={job?.id ?? i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  borderRadius: 12, border: '1px solid hsl(var(--lp-border-soft))',
                  background: i === 0 ? 'hsl(var(--lp-surface))' : '#fff',
                  minHeight: 44,
                }}
              >
                {job && avatar ? (
                  <span className={avatar.className} style={{
                    width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontFamily: "'Outfit', system-ui, sans-serif",
                    fontWeight: 700, fontSize: 12, flexShrink: 0,
                  }}>
                    {avatar.initial}
                  </span>
                ) : (
                  <span style={{ width: 30, height: 30, borderRadius: 9, background: 'hsl(var(--lp-surface))', flexShrink: 0 }} />
                )}
                <span style={{ minWidth: 0, flex: 1 }}>
                  {job ? (
                    <>
                      <span style={{
                        display: 'block', fontFamily: "'Figtree', system-ui, sans-serif", fontWeight: 700,
                        fontSize: 13, color: 'hsl(var(--lp-fg))', whiteSpace: 'nowrap', overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {job.title}
                      </span>
                      <span style={{
                        display: 'block', fontSize: 11, color: 'hsl(var(--lp-dim))', whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {job.company}{job.location ? ` · ${job.location}` : ''}
                      </span>
                    </>
                  ) : (
                    <span style={{ display: 'block', height: 26 }} />
                  )}
                </span>
                {isNew && (
                  <span style={{
                    flexShrink: 0, fontFamily: "'Figtree', system-ui, sans-serif", fontSize: 10, fontWeight: 700,
                    color: '#2f6f5e', background: 'rgba(63,157,106,0.14)', border: '1px solid rgba(63,157,106,0.3)',
                    borderRadius: 999, padding: '3px 8px',
                  }}>
                    NEW
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

LiveJobsPreview.displayName = 'LiveJobsPreview';
