import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { evidenceDate, receiptLine, type PostingEvidence } from '@/lib/postingEvidence';
import './posting-evidence.css';

export function PostingEvidencePanel({ jobId }: { jobId: string }) {
  const q = useQuery({
    queryKey: ['posting-evidence', jobId], staleTime: 60_000, retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc('job_posting_evidence', { p_job_id: jobId }).abortSignal(signal);
      if (error) throw error;
      return data as unknown as PostingEvidence | null;
    },
  });
  const p = q.data;
  return <section className="ayn-evidence" aria-label="Posting evidence">
    <header><h3>Posting evidence</h3><span>AYN observation log</span></header>
    {q.isPending ? <p role="status">Loading recorded observations…</p> : q.isError ? <div role="alert"><p>Observation history could not load. This is not evidence that the job closed.</p><button type="button" onClick={() => q.refetch()}>Retry history</button></div> : !p ? <p>No observation history available for this posting.</p> : <>
      <p className="ayn-evidence-state">{receiptLine(p)}</p>
      <dl className="ayn-evidence-facts">
        <div><dt>Source</dt><dd>{p.source ? p.source.replace(/_/g, ' ') : 'Not recorded'}</dd></div>
        <div><dt>Last feed sighting</dt><dd>{evidenceDate(p.last_seen_at) || 'Not recorded'}</dd></div>
        <div><dt>Last successful page check</dt><dd>{evidenceDate(p.closure_last_open_at || (p.closure_status === 'open' ? p.closure_checked_at : null)) || 'Not recorded'}</dd></div>
      </dl>
      <ol className="ayn-evidence-timeline" aria-label="Recorded posting timeline" tabIndex={0}>
        {evidenceDate(p.first_seen_at) && <li><time dateTime={p.first_seen_at!}>{evidenceDate(p.first_seen_at)}</time><strong>First observed by AYN</strong><span>Earliest recorded sighting, not the original publish date.</span></li>}
        {(p.appearances || []).map(a => <li key={`appearance-${a.archive_id}`}>
          <time dateTime={a.first_observed_at || undefined}>{evidenceDate(a.first_observed_at) || 'Start date not recorded'}</time>
          <strong>Earlier catalog appearance</strong>
          <span>{a.removal_reason === 'closed' ? 'Page check reported closure' : 'Left AYN catalog'} {evidenceDate(a.removed_at)}. Matched company, title and location; not proof of the same vacancy.</span>
        </li>)}
        {(p.repost_count || 0) > (p.appearances?.length || 0) && <li><strong>Earlier catalog appearances recorded</strong><span>{p.repost_count} counted at ingestion; {p.appearances?.length || 0} matching archive records available here. Missing dates are not reconstructed. Titles or locations may have changed since ingestion.</span></li>}
        {[...(p.changes || [])].sort((a, b) => Date.parse(a.changed_at) - Date.parse(b.changed_at) || a.id - b.id).map(c => <li key={c.id}>
          <time dateTime={c.changed_at}>{evidenceDate(c.changed_at) || 'Date not recorded'}</time>
          <strong>{({ salary: 'Source salary values changed', location: 'Location changed', title: 'Title changed', description: 'Description changed' })[c.field] || 'Posting changed'}</strong>
          {c.field === 'description' ? c.old_excerpt != null && c.new_excerpt != null ? <><div className="ayn-evidence-diff"><span className="sr-only">Previous excerpt: </span><del>{c.old_excerpt || 'No previous text'}</del><span aria-hidden="true"> → </span><span className="sr-only">New excerpt: </span><ins>{c.new_excerpt || 'Text removed'}</ins></div><span>Bounded excerpts around the first change, not the complete description or every edit.</span></> : <span>Posting text changed; earlier full text was not recorded for this historical update.</span> : <div className="ayn-evidence-diff"><span className="sr-only">Previously: </span><del>{c.old_value || 'Not stated'}</del><span aria-hidden="true"> → </span><span className="sr-only">Now: </span><ins>{c.new_value || 'Not stated'}</ins></div>}
          {c.field === 'salary' && <span>Historical currency and pay period were not recorded. These are source values, not a normalized salary comparison.</span>}
        </li>)}
        {evidenceDate(p.removed_at) ? <li><time dateTime={p.removed_at!}>{evidenceDate(p.removed_at)}</time><strong>{p.removal_reason === 'closed' ? 'Page check reported closure' : 'Removed from AYN catalog'}</strong><span>A removal does not establish whether anyone was hired.</span></li> : p.closure_status === 'open' && evidenceDate(p.closure_checked_at) ? <li><time dateTime={p.closure_checked_at!}>{evidenceDate(p.closure_checked_at)}</time><strong>Page check reported still listed</strong><span>This was the result at the time of the check.</span></li> : null}
      </ol>
      {!p.removed_at && p.closure_status !== 'open' && evidenceDate(p.closure_checked_at) && <p>Latest page-check attempt: {evidenceDate(p.closure_checked_at)}. The page could not be confirmed; this does not establish closure.</p>}
      {p.changes?.length === 30 && <p>Showing the 30 most recent field-change records.</p>}
    </>}
    <details><summary>What these observations mean</summary><p>Feed sightings and automated application-page checks are separate. Checks can fail or misclassify a page. Earlier appearances match company, role title and location; they do not prove the employer reposted the same vacancy. Field changes are observed source updates, not proof of who edited them. Missing events are not evidence that nothing changed. Dates use UTC. AYN cannot confirm headcount, interviewing activity or hiring intent.</p></details>
  </section>;
}
