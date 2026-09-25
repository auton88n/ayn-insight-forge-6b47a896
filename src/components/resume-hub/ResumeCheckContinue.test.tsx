import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), getUser: vi.fn(), authChange: vi.fn(), rpc: vi.fn(), from: vi.fn(),
  upsert: vi.fn(), parseFile: vi.fn(), navigate: vi.fn(),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/components/landing/HomeTabs', () => ({ HOME_TAB_HANDOFF_KEY: 'ayn_home_tab' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: mocks.getSession, getUser: mocks.getUser, onAuthStateChange: mocks.authChange },
  rpc: mocks.rpc, from: mocks.from,
} }));
vi.mock('@/lib/resumeHub', () => ({ resumeHubApi: { parseFile: mocks.parseFile } }));
import { ResumeCheckContinue } from './ResumeCheckContinue';

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'account-a' } } } });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'account-a' } } });
  mocks.authChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mocks.parseFile.mockResolvedValue({ resume: { basics: { name: 'Applicant' } }, plainText: 'Applicant' });
  mocks.from.mockReturnValue({ upsert: mocks.upsert });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ error: null });
});
afterEach(cleanup);

function mount() {
  const onSignIn = vi.fn();
  render(<ResumeCheckContinue resumeText="Applicant résumé" jdText="Engineer role" onSignIn={onSignIn} />);
  return onSignIn;
}

describe('public checker continuation', () => {
  it('requires sign-in before saving any data', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    const onSignIn = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Create an account or sign in' }));
    expect(onSignIn).toHaveBeenCalledOnce();
    expect(mocks.parseFile).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('requires consent and saves the draft without invoking paid actions', async () => {
    mount();
    const button = await screen.findByRole('button', { name: 'Save draft and continue' });
    expect(button).toBeDisabled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(button);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/'));
    expect(mocks.parseFile).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith('save_primary_resume', expect.objectContaining({ p_title: 'Resume from your free check' }));
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'account-a', jd_text: 'Engineer role' }), { onConflict: 'id' });
    expect(sessionStorage.getItem('ayn_home_tab')).toBe('profile');
    expect(sessionStorage.getItem('ayn_focus_job')).toBe(mocks.rpc.mock.calls[0][1].p_id);
  });
  it('reuses extraction and save identifiers after persistence fails', async () => {
    mocks.rpc.mockResolvedValueOnce({ error: new Error('offline') }).mockResolvedValue({ error: null });
    mount();
    await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft and continue' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft and continue' }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    expect(mocks.parseFile).toHaveBeenCalledOnce();
    expect(mocks.rpc.mock.calls[0][1].p_id).toBe(mocks.rpc.mock.calls[1][1].p_id);
  });
  it('refuses account writes if the authenticated user changed', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'account-b' } } });
    mount();
    await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft and continue' }));
    await screen.findByRole('alert');
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not replace the active resume when saving the job fails', async () => {
    mocks.upsert.mockResolvedValue({ error: new Error('offline') });
    mount();
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft and continue' }));
    await screen.findByRole('alert');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it('sends optimization users to profile review without a job-focus handoff', async () => {
    mount();
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('radio', { name: /Optimize my base resume/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft and continue' }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/'));
    expect(sessionStorage.getItem('ayn_home_tab')).toBe('profile');
    expect(sessionStorage.getItem('ayn_focus_job')).toBeNull();
  });
});
