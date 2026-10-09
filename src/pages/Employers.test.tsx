import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/config', () => ({ SUPABASE_URL: 'https://ayn-test.invalid', SUPABASE_ANON_KEY: 'local-unit-fixture' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  getSession: async () => ({ data: { session: { user: { id: 'seeker' } } } }),
} } }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ loading: false, role: 'job_seeker' }) }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeature: () => ({ loaded: true, enabled: true }) }));
vi.mock('@/components/LandingPage', () => ({ default: ({ forcedAudience }: { forcedAudience: string }) => <h1>{forcedAudience} marketing</h1> }));
import Employers from './Employers';
afterEach(cleanup);
it('keeps employer marketing accessible to a signed-in seeker without role conversion', async () => {
  render(<MemoryRouter initialEntries={['/employers']}><Employers /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'employer marketing' })).toBeVisible();
});
