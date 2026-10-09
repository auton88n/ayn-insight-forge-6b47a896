import { describe, expect, it } from 'vitest';
import { evidenceAge, evidenceDate, receiptLine, postingSourceLabel } from './postingEvidence';

const now = Date.parse('2026-10-10T12:00:00Z');
describe('posting receipts', () => {
  it('uses readable source names without changing source attribution', () => {
    expect(postingSourceLabel('freehire')).toBe('Freehire');
    expect(postingSourceLabel('greenhouse')).toBe('Greenhouse');
    expect(postingSourceLabel('partner_catalog')).toBe('Partner Catalog');
    expect(postingSourceLabel('')).toBe('Not recorded');
    expect(postingSourceLabel(null)).toBe('Not recorded');
  });
  it('distinguishes successful page checks from feed sightings', () => {
    expect(receiptLine({ closure_status: 'open', closure_checked_at: '2026-10-10T09:00:00Z' }, now)).toBe('Still listed when checked 3h ago');
    expect(receiptLine({ last_seen_at: '2026-10-10T09:00:00Z' }, now)).toBe('Seen in source feed 3h ago · page check not recorded');
  });
  it('never turns a failed check or old successful check into current availability', () => {
    expect(receiptLine({ closure_status: 'error', closure_checked_at: '2026-10-10T11:00:00Z', closure_last_open_at: '2026-10-09' }, now)).toBe('Could not confirm · attempted 1h ago');
  });
  it('does not equate pruning with an employer closure', () => {
    expect(receiptLine({ removed_at: '2026-10-09', removal_reason: 'pruned' }, now)).toBe('Removed from AYN catalog Oct 9, 2026');
    expect(receiptLine({ removed_at: '2026-10-09', removal_reason: 'closed' }, now)).toBe('Closure observed Oct 9, 2026');
  });
  it('labels sightings and repeat appearances without claiming publish dates or reposts', () => {
    expect(receiptLine({ first_seen_at: '2026-09-12', repost_count: 2 }, now)).toBe('No successful page check recorded · first observed Sep 12, 2026 · 2 earlier catalog appearances');
    expect(receiptLine({ repost_count: -1 }, now)).not.toContain('appearance');
  });
  it('handles missing, invalid and future check dates', () => {
    expect(evidenceDate('invalid')).toBeNull();
    expect(evidenceAge('2026-10-11', now)).toBeNull();
    expect(receiptLine({ closure_status: 'open', closure_checked_at: 'invalid' }, now)).toBe('No successful page check recorded');
    expect(evidenceDate('2026-10-10T23:00:00-04:00')).toBe('Oct 11, 2026');
  });
});
