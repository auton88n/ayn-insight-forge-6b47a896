import { describe, it, expect } from 'vitest';
import { decodeEntities, tidyTitle, tidyCompany, formatLocation, resolveSalary } from './jobPostingFormat';

describe('job text tidy', () => {
  it('decodes escaped entities, including double-escaped', () => {
    expect(decodeEntities("you'll be a part of&#13;")).toBe("you'll be a part of");
    expect(decodeEntities('R&amp;amp;D &#34;x&#34;')).toBe('R&D "x"');
  });
  it('restores acronyms and trims titles', () => {
    expect(tidyTitle('  Intern Cdp ')).toBe('Intern CDP');
    expect(tidyTitle('Senior Hr Manager')).toBe('Senior HR Manager');
  });
  it('makes company names readable', () => {
    expect(tidyCompany('omni')).toBe('Omni');
    expect(tidyCompany('abdulrauf1-1741255834.teamtailor.com', 'abdulrauf1-1741255834')).toBe('Abdulrauf1');
    expect(tidyCompany('Warp Inc')).toBe('Warp Inc');
  });
  it('fixes odd casing in locations', () => {
    expect(formatLocation('DUbai, UAE')).toBe('Dubai, UAE');
  });
  it('shows an equal salary range once', () => {
    const job = { salary_min: 27, salary_max: 27, salary_currency: 'USD', description: '' } as never;
    expect(resolveSalary(job)?.text).toBe('USD 27');
  });
});
