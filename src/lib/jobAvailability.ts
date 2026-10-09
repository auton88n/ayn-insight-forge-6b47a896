/** Manual and failed/unrecognized status checks are not proof of a live listing. */
export function jobAvailability(source: string | null | undefined, status: string | undefined): 'live' | 'gone' | 'unknown' {
  if (source !== 'job_board') return 'unknown';
  if (status === 'live') return 'live';
  if (status === 'taken_down' || status === 'not_listed') return 'gone';
  return 'unknown';
}
