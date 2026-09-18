import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke } },
}));

import {
  COOKIE_CONSENT_KEY,
  COOKIE_CONSENT_VERSION,
  getVisitorId,
  trackPageView,
} from './analytics';

describe('first-party visitor tracking', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.mocked(localStorage.getItem).mockImplementation(key => storage.get(key) ?? null);
    vi.mocked(localStorage.setItem).mockImplementation((key, value) => { storage.set(key, value); });
    vi.mocked(localStorage.removeItem).mockImplementation(key => { storage.delete(key); });
    vi.mocked(crypto.randomUUID).mockReturnValue('3e7fa343-3717-4ff0-a453-55f6dd703397');
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { recorded: true }, error: null });
  });

  it('does not send an event before analytics consent', async () => {
    await trackPageView('/jobs');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('sends only the consented route and a random browser identifier', async () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
      choice: 'accepted', version: COOKIE_CONSENT_VERSION, decidedAt: new Date().toISOString(),
    }));

    await trackPageView('/jobs');

    expect(invoke).toHaveBeenCalledWith('visitor-track', {
      body: expect.objectContaining({ pagePath: '/jobs', visitorId: expect.any(String) }),
    });
    expect(getVisitorId()).toMatch(/^[a-z0-9-]{20,80}$/i);
  });

  it('refuses a route carrying a query string', async () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
      choice: 'accepted', version: COOKIE_CONSENT_VERSION, decidedAt: new Date().toISOString(),
    }));

    await trackPageView('/jobs?email=not-collected@example.test');

    expect(invoke).not.toHaveBeenCalled();
  });

  it('does not surface a tracking transport failure to the visitor', async () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
      choice: 'accepted', version: COOKIE_CONSENT_VERSION, decidedAt: new Date().toISOString(),
    }));
    invoke.mockRejectedValueOnce(new Error('network unavailable'));

    await expect(trackPageView('/jobs')).resolves.toBeUndefined();
  });
});
