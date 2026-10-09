import { describe, expect, it } from 'vitest';
import { canonicalLocation, locationWorkMode, normalizeLocationCounts } from './jobLocation.mjs';
import { tidyPosting } from './jobPostingFormat';
describe('source-preserving canonical location presentation', () => {
  it.each([
    ['UDP Cave Rd Transfer Station, Nashville, TN 37210', 'Nashville, Tennessee, United States'],
    ['Corporate Headquarters, Santa Clara, CA 95054', 'Santa Clara, California, United States'],
    ['Salt Lake City, Main Distribution Center, SLC, UT 84119', 'Salt Lake City, Utah, United States'],
    ['GATELE-Georgia, Remote Contract', 'Georgia'],
    ['Miami, FL 33126 · Hybrid', 'Miami, Florida, United States'],
    ['Boston, MA / Remote', 'Boston, Massachusetts, United States'],
    ['Los Angeles, CA or Remote', 'Los Angeles, CA · Remote option'],
    ['On Site, Palo Alto, California', 'Palo Alto, California, United States'],
    ['EULESS, TX 76040', 'Euless, Texas, United States'],
    ['ST GEORGE, UT 84770; DURANGO, CO 81301', 'St George, Utah, United States · Durango, Colorado, United States'],
    ['United States of America', 'United States'], ['USA', 'United States'], ['UK', 'United Kingdom'],
    ['Perth, WA, Australia', 'Perth, WA, Australia'], ['Perth, WA', 'Perth, WA'],
    ['CA', 'CA'], ['Georgia', 'Georgia'], ['McLean', 'McLean'],
  ])('%s → %s', (raw, expected) => expect(canonicalLocation(raw)).toBe(expected));
  it('does not classify alternatives or conflicting modes as a remote job', () => {
    expect(locationWorkMode('Los Angeles or Remote')).toBeNull();
    expect(locationWorkMode('Remote / Hybrid')).toBeNull();
    expect(locationWorkMode('Miami · Hybrid')).toBe('hybrid');
  });
  it('removes only an exact matching title suffix and never mutates source data', () => {
    const source = { title: 'Diesel Technician - Truck, Trailer & Reefer - Harrisonville, MO', company: 'Fixture', location: 'Harrisonville, MO' };
    expect(tidyPosting(source).title).toBe('Diesel Technician - Truck, Trailer & Reefer');
    expect(source.title).toContain('Harrisonville');
    expect(source.location).toBe('Harrisonville, MO');
  });
  it('combines alias counts without treating multi-location postings as multiple jobs', () => {
    expect(normalizeLocationCounts([{ location: 'USA', roles: 2 }, { location: 'United States of America', roles: 3 }])).toEqual([{ location: 'United States', roles: 5 }]);
    expect(normalizeLocationCounts([{ location: 'Austin, TX; Boston, MA', roles: 2 }])).toHaveLength(1);
  });
  it('never overrides a stored text classification with a location-word inference', () => {
    const source = { title: 'Engineer', company: 'Fixture', location: 'Remote', work_mode: null, work_mode_text: 'hybrid' };
    expect(tidyPosting(source).work_mode).toBeNull();
  });
});
