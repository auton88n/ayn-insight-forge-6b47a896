import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Monitor, { collectionState } from './SeoCollectorMonitor';

const mock = vi.hoisted(() => ({ refetch: vi.fn(), isError: false }));
vi.mock('@/admin-app/hooks/useAdminQuery', () => ({ useAdminSeoCollectionHistory: () => ({
  data: [{ id: 'a', source: 'search_console', attempted_at: new Date().toISOString(), status: 'ok' }],
  isError: mock.isError, isFetching: false, isLoading: false, refetch: mock.refetch,
}) }));
afterEach(() => { cleanup(); mock.isError = false; vi.clearAllMocks(); });

describe('SEO collector monitoring', () => {
  const now = Date.now();
  const fresh = { taken_at: new Date(now).toISOString(), data: { collection_status: 'ok' } };
  it('does not invent running or healthy states', () => {
    expect(collectionState(undefined, now)).toBe('No reading');
    expect(collectionState(fresh, now)).toBe('Fresh');
    expect(collectionState({ ...fresh, data: {} }, now)).toBe('Unknown');
    expect(collectionState({ ...fresh, taken_at: 'bad' }, now)).toBe('Unknown');
  });
  it('uses last success rather than latest attempt for stale data', () => {
    expect(collectionState({ ...fresh, data: { collection_status: 'ok', collected_at: new Date(now - 49 * 3600000).toISOString() } }, now)).toBe('Stale');
    expect(collectionState({ ...fresh, data: { collection_status: 'error' } }, now)).toBe('Failed');
  });
  it('refreshes both reports and history without starting a job', () => {
    const refresh = vi.fn();
    render(<Monitor google={fresh} refresh={refresh} refreshing={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(mock.refetch).toHaveBeenCalledOnce();
    expect(screen.getByText('Succeeded')).toBeInTheDocument();
    expect(screen.getByText('No reading')).toBeInTheDocument();
  });
  it('shows history failure explicitly', () => {
    mock.isError = true;
    render(<Monitor refresh={() => {}} refreshing={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load collection history');
  });
});
