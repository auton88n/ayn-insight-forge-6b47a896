import { extractApplyBy, extractRemoteRegion, extractWorkMode } from '../../../supabase/functions/_shared/jobFacts';

type Posting = { remote_region?: string | null; apply_by?: string | null; description?: string | null; work_mode?: string | null };

/** Single-posting evidence, not a market estimate. Absence is not worldwide eligibility. */
export function JobApplicationFacts({ job }: { job: Posting }) {
  const text = job.description || '';
  const remote = job.remote_region || extractRemoteRegion(text, job.work_mode === 'remote' || extractWorkMode(text) === 'remote');
  const date = job.apply_by || extractApplyBy(text);
  const parsed = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T23:59:59Z') : null;
  const deadline = parsed && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? parsed : null;
  if (!remote && !deadline) return null;
  return <section aria-label="Application conditions" className="rounded-lg border p-3 space-y-1 text-sm">
    {remote && <p><strong>Remote eligibility:</strong> {remote}. The posting limits where applicants may work.</p>}
    {deadline && <p><strong>{deadline.getTime() < Date.now() ? 'Stated deadline has passed:' : 'Apply by:'}</strong>{' '}
      <time dateTime={date!}>{deadline.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</time>.
      {deadline.getTime() < Date.now() && ' Confirm with the employer whether applications are still open.'}
    </p>}
    <p className="text-xs text-muted-foreground">Read from this posting, not inferred from other jobs. Missing restrictions do not confirm worldwide eligibility.</p>
  </section>;
}
