// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanApplyUrl } from './applyUrl';
import { cleanApplyUrl as cleanApplyUrlEdge } from '../../supabase/functions/_shared/applyUrl';

describe.each([['front end', cleanApplyUrl], ['edge functions', cleanApplyUrlEdge]])('cleanApplyUrl (%s)', (_name, clean) => {
  it('removes the pms_ parameters that carry another candidate\'s email', () => {
    const url = 'https://www.comeet.com/jobs/acme/1A.123/product-manager/45.678?pms_email=bhavya.vats.work%40gmail.com&pms_source=77&coref=abc';
    const out = clean(url);
    expect(out).not.toMatch(/pms_|bhavya|gmail/i);
    expect(out).toContain('coref=abc');
    expect(out.startsWith('https://www.comeet.com/jobs/acme/1A.123/product-manager/45.678?')).toBe(true);
  });
  it('removes an email-looking value under any parameter name, and email-named parameters', () => {
    expect(clean('https://jobs.example.com/apply?ref=a.b%40c.com&x=1')).toBe('https://jobs.example.com/apply?x=1');
    expect(clean('https://jobs.example.com/apply?Email=a@b.co&id=7')).toBe('https://jobs.example.com/apply?id=7');
  });
  it('leaves clean URLs byte-for-byte unchanged', () => {
    for (const u of ['https://boards.greenhouse.io/acme/jobs/123', 'https://jobs.lever.co/acme/abc?lever-source=Site', 'https://x.com/a?b=c%20d&e=f']) expect(clean(u)).toBe(u);
  });
  it('passes through non-http values and empties', () => {
    expect(clean('')).toBe('');
    expect(clean(null)).toBe(null);
    expect(clean(undefined)).toBe(undefined);
    expect(clean('mailto:a@b.co')).toBe('mailto:a@b.co');
    expect(clean('not a url')).toBe('not a url');
  });
});

it('the front-end and edge copies are identical', () => {
  expect(readFileSync(new URL('./applyUrl.ts', import.meta.url), 'utf8')).toBe(readFileSync(new URL('../../supabase/functions/_shared/applyUrl.ts', import.meta.url), 'utf8'));
});
