export interface PostingReceipt {
  source?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  repost_count?: number | null;
  closure_status?: string | null;
  closure_checked_at?: string | null;
  closure_last_open_at?: string | null;
  removed_at?: string | null;
  removal_reason?: string | null;
}
export interface PostingChange {
  id: number; field: string; old_value: string | null; new_value: string | null; changed_at: string;
}
export interface PostingEvidence extends PostingReceipt { changes: PostingChange[] }
export function evidenceDate(value?: string | null): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
export function evidenceAge(value?: string | null, now = Date.now()): string | null {
  const date = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(date) || date > now) return null;
  const hours = Math.floor((now - date) / 3600000);
  return hours < 1 ? 'less than 1h ago' : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
/** No fallback to posted_at: the sync/checker can refresh that field. */
export function receiptLine(p: PostingReceipt, now = Date.now()): string {
  const attempt = evidenceAge(p.closure_checked_at, now);
  const seen = evidenceAge(p.last_seen_at, now);
  const first = evidenceDate(p.first_seen_at);
  let state = 'No successful page check recorded';
  if (evidenceDate(p.removed_at)) state = `${p.removal_reason === 'closed' ? 'Closure observed' : 'Removed from AYN catalog'} ${evidenceDate(p.removed_at)}`;
  else if (p.closure_status === 'open' && attempt) state = `Still listed when checked ${attempt}`;
  else if (['error', 'blocked', 'inconclusive'].includes(p.closure_status || '')) state = `Could not confirm${attempt ? ` · attempted ${attempt}` : ''}`;
  else if (seen) state = `Seen in source feed ${seen} · page check not recorded`;
  const parts = [state];
  if (first) parts.push(`first observed ${first}`);
  if (p.repost_count != null && Number.isInteger(p.repost_count) && p.repost_count > 0) parts.push(`${p.repost_count} earlier catalog ${p.repost_count === 1 ? 'appearance' : 'appearances'}`);
  return parts.join(' · ');
}
