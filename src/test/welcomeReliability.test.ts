import { afterEach, describe, expect, it, vi } from 'vitest';
import { permanentEmailError, retryAt, sendWindowExpired } from '../../supabase/functions/welcome-email-worker/reliability';
import { sendBrandedEmail } from '../../supabase/functions/_shared/emailTemplate';
declare global { var Deno: { env: { get(name: string): string | undefined } }; }

afterEach(() => vi.unstubAllGlobals());
describe('welcome delivery reliability', () => {
  it.each([408, 409, 425, 429, 500, 503])('retries temporary HTTP %s', code => {
    expect(permanentEmailError(`${code}: failure`)).toBe(false);
  });
  it.each([400, 401, 403, 422])('stops permanent HTTP %s', code => {
    expect(permanentEmailError(`${code}: failure`)).toBe(true);
  });
  it('uses bounded backoff and stops before the provider key expires', () => {
    expect(retryAt(1, 0)).toBe(new Date(300_000).toISOString());
    expect(retryAt(2, 0)).toBe(new Date(900_000).toISOString());
    expect(retryAt(99, 0)).toBe(new Date(3600_000).toISOString());
    expect(sendWindowExpired(null, 0)).toBe(false);
    expect(sendWindowExpired(new Date(0).toISOString(), 23 * 3600_000)).toBe(true);
  });
  it('sends the same idempotency key and body across retries', async () => {
    vi.stubGlobal('Deno', { env: { get: () => 'synthetic-test-key' } });
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ id: 'message-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await sendBrandedEmail('test@example.invalid', 'Welcome', '<p>Hello</p>', 'welcome/test');
    await sendBrandedEmail('test@example.invalid', 'Welcome', '<p>Hello</p>', 'welcome/test');
    expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe('welcome/test');
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
  });
});
