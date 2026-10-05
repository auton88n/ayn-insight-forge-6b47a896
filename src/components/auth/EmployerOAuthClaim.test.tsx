import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ rpc: vi.fn(), unsubscribe: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: mock.rpc,
  auth: {
    getSession: async () => ({ data: { session: { user: { email: 'test@company.invalid' } } } }),
    onAuthStateChange: () => ({ data: { sub: null, subscription: { unsubscribe: mock.unsubscribe } } }),
  },
} }));
import { EmployerOAuthClaim, SIGNUP_INTENT_KEY } from './EmployerOAuthClaim';
// The shared test setup stubs localStorage with no-op functions; these tests
// need a real store because they assert on what the component saves and clears.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
  mock.rpc.mockReset();
  localStorage.setItem(SIGNUP_INTENT_KEY, 'employer');
});
it('keeps employer intent after a failed eligibility request and supports retry', async () => {
  mock.rpc.mockResolvedValueOnce({ error: { message: 'temporary outage' }, data: null })
    .mockResolvedValueOnce({ error: null, data: true });
  render(<EmployerOAuthClaim />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry account check' }));
  await screen.findByLabelText('Company name *');
  expect(localStorage.getItem(SIGNUP_INTENT_KEY)).toBe('employer');
  expect(mock.rpc).toHaveBeenCalledTimes(2);
});
it('clears intent only after a successful ineligible response', async () => {
  mock.rpc.mockResolvedValue({ error: null, data: false });
  render(<EmployerOAuthClaim />);
  await waitFor(() => expect(localStorage.getItem(SIGNUP_INTENT_KEY)).toBeNull());
});
