// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatLocation, humanizeCategory, locationSearchPatterns } from './jobPostingFormat';

describe('formatLocation (display only)', () => {
  it.each([
    ['Dubai, ARE', 'Dubai, UAE'],
    ['Dubai - Dubai', 'Dubai'],
    ['Dubai, Dubai, ae', 'Dubai, UAE'],
    ['Riyadh, SAU', 'Riyadh, Saudi Arabia'],
    ['Toronto, ON, Canada', 'Toronto, ON, Canada'],
    ['Austin, TX', 'Austin, TX'],
    ['Adelaide, SA', 'Adelaide, SA'],
    ['Remote', 'Remote'],
    ['', ''],
  ])('%s -> %s', (raw, shown) => expect(formatLocation(raw)).toBe(shown));
  it('handles null and undefined', () => {
    expect(formatLocation(null)).toBe('');
    expect(formatLocation(undefined)).toBe('');
  });
});

describe('humanizeCategory', () => {
  it.each([
    ['devops', 'DevOps'], ['Devops', 'DevOps'], ['DEVOPS', 'DevOps'],
    ['software_engineering', 'Software Engineering'],
    ['ai_infrastructure', 'AI Infrastructure'],
    ['data&analytics', 'Data And Analytics'],
    ['qa', 'QA'],
  ])('%s -> %s', (raw, shown) => expect(humanizeCategory(raw)).toBe(shown));
});

describe('locationSearchPatterns', () => {
  it('expands a country-level UAE search to every spelling and city', () => {
    for (const q of ['UAE', 'uae', 'U.A.E', 'United Arab Emirates', ' emirates ']) {
      const p = locationSearchPatterns(q);
      expect(p).toContain('dubai');
      expect(p).toContain('united arab emirates');
      expect(p).toContain('uae');
    }
  });
  it('leaves other searches alone', () => {
    expect(locationSearchPatterns('Dubai')).toEqual(['Dubai']);
    expect(locationSearchPatterns('Toronto')).toEqual(['Toronto']);
  });
  it('produces no pattern that could break a PostgREST or() filter', () => {
    for (const p of locationSearchPatterns('uae')) expect(p).not.toMatch(/[,()]/);
  });
});
