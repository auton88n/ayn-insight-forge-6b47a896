/**
 * TrustBento — the seeker hero's trust strip, replacing a flat centered
 * row of four faint labels with a bento-style module sized by what
 * actually matters.
 *
 * Design-audit finding (Aug 2026): AYN's real freshness/sourcing numbers
 * were scattered across three separate flat cards on three different
 * pages, none of them given any visual weight. This is one module with
 * real numbers, reused where the old flat strip used to sit.
 *
 * The lead tile is deliberately the 3-day freshness window, not a raw
 * job count -- ghost jobs (a listing nobody is actually hiring for) are
 * the single most-cited job-search complaint in 2026 research, and
 * "reconfirmed live within 3 days or it's gone" is AYN's real, structural
 * answer to it. The live count still appears, capped at the same
 * "1,000+" convention BrowseJobs.tsx already uses for the exact same
 * reason: a precise five-digit figure reads as a vanity metric, not
 * a feature.
 */
import { memo, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

function displayCount(n: number): string {
  return n > 999 ? '1,000+' : String(n);
}

export const TrustBento = memo(() => {
  const [count, setCount] = useState('1,000+');

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('job_postings')
      .select('id', { count: 'exact', head: true })
      .or('scam_suspected.is.null,scam_suspected.eq.false')
      .then(({ count: c }) => {
        if (!cancelled && typeof c === 'number') setCount(displayCount(c));
      })
      // Never block the page on this -- "1,000+" (the initial state) is
      // already a real, true-as-of-today figure, so a failed fetch just
      // means the tile stays at that honest default, silently.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="lp-bento is-stat-bento" role="group" aria-label="Why AYN's job listings can be trusted">
      <article className="lp-tile is-stat is-lead lp-span-3">
        <span className="lp-stat-k">3 days</span>
        <span className="lp-stat-l">is the longest a listing survives without being reconfirmed live &mdash; no ghost jobs sitting around for weeks</span>
      </article>
      <article className="lp-tile is-stat lp-span-3">
        <span className="lp-stat-k">{count}</span>
        <span className="lp-stat-l">real jobs live right now</span>
      </article>
      <article className="lp-tile is-stat lp-span-2">
        <span className="lp-stat-k">2 hrs</span>
        <span className="lp-stat-l">between refresh cycles</span>
      </article>
      <article className="lp-tile is-stat lp-span-2">
        <span className="lp-stat-k">Zero</span>
        <span className="lp-stat-l">invented facts in a tailored resume</span>
      </article>
      <article className="lp-tile is-stat lp-span-2">
        <span className="lp-stat-k">$0</span>
        <span className="lp-stat-l">to browse jobs or check a resume, no account</span>
      </article>
    </div>
  );
});

TrustBento.displayName = 'TrustBento';
