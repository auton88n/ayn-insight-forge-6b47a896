// Renders the real BrowseJobs against a mocked backend to check that the
// memoized rows are wired correctly: click-to-open, save/unsave hitting the
// right table with the right job, and the search box not disturbing rows.
import { cleanup, fireEvent, render, screen, waitFor, act, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  ops: [] as Array<{ table: string; op: string; args: unknown[] }>,
  rowCalls: {} as Record<string, number>,
  jobs: [] as unknown[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    let op = 'select';
    let single = false;
    const proxy: any = new Proxy(function () {}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => {
            let data: unknown = [];
            if (table === 'job_postings' && op === 'select') data = single ? h.jobs[0] : h.jobs;
            if (table === 'jobs' && op === 'insert') data = { id: 'saved-row-1' };
            if (table === 'jobs' && op === 'select') data = single ? null : [];
            resolve({ data, error: null, count: h.jobs.length });
          };
        }
        return (...args: unknown[]) => {
          if (['insert', 'delete', 'upsert', 'update'].includes(prop)) op = prop;
          if (prop === 'maybeSingle' || prop === 'single') single = true;
          h.ops.push({ table, op: prop, args });
          return proxy;
        };
      },
    });
    return proxy;
  };
  return { supabase: { from: builder, rpc: vi.fn(async (_name: string, args: { p_company_slugs?: string[] }) => ({
      // the real RPC answers every requested company (status may be null)
      data: (args?.p_company_slugs ?? []).map((company_slug) => ({ company_slug, status: 'insufficient_data' })),
      error: null,
    })), auth: { getSession: vi.fn() } } };
});
vi.mock('@/lib/resumeHub', () => ({
  resumeHubApi: new Proxy({}, {
    get: (_t, p) => (p === 'jobBoardScore'
      ? async (rows: Array<{ id: string }>) => ({ scores: rows.map((r, i) => ({ id: r.id, match_pct: 60 + i })) })
      : async () => ({})),
  }),
}));
// The real hook returns a stable `toast`; a fresh one per render would retrigger the fetch effect forever.
const stableToast = vi.hoisted(() => ({ toast: () => {} }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => stableToast }));
vi.mock('@/lib/jobPostingFormat', async (orig) => {
  const m = await orig<typeof import('@/lib/jobPostingFormat')>();
  return { ...m, companyAvatar: (c: string) => { h.rowCalls[c] = (h.rowCalls[c] ?? 0) + 1; return m.companyAvatar(c); } };
});
import BrowseJobs from './BrowseJobs';

const mk = (n: number) => ({
  id: `job-${n}`, source: 'freehire', external_id: `e${n}`, company: `Acme ${n}`, company_slug: `acme-${n}`,
  title: `Role ${n}`, description: 'Build things', location: 'Toronto', apply_url: `https://example.com/apply/${n}`,
  posted_at: new Date(Date.now() - 2 * 3600e3).toISOString(), skills: [], scam_suspected: false,
});

beforeEach(() => {
  h.ops.length = 0; h.rowCalls = {}; h.jobs = [1, 2, 3].map(mk);
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({ matches: q.includes('1024'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  });
});
afterEach(cleanup);

const rows = () => Array.from(document.querySelectorAll<HTMLElement>('.ayn-match-row'));
const rowByTitle = (t: string) => rows().find((r) => r.textContent?.includes(t))!;
const active = () => document.querySelector('.ayn-match-row.is-active');

function mount() {
  const onAdded = vi.fn();
  const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><BrowseJobs userId="user-1" onAdded={onAdded} onOpenProfile={vi.fn()} /></QueryClientProvider>);
  return { onAdded };
}

describe('BrowseJobs list (real component, mocked backend)', () => {
  it('renders every job and scores arrive', async () => {
    mount();
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(rows().map((r) => within(r).getByText(/^Role \d$/).textContent)).toEqual(['Role 1', 'Role 2', 'Role 3']);
    await waitFor(() => expect(screen.queryAllByText('Scoring…')).toHaveLength(0));
  });

  it('clicking a row selects exactly that row and marks that job seen', async () => {
    mount();
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(within(rowByTitle('Role 2')).getByText('Role 2'));
    await waitFor(() => expect(active()).toHaveTextContent('Role 2'));
    fireEvent.click(within(rowByTitle('Role 3')).getByText('Role 3'));
    await waitFor(() => expect(active()).toHaveTextContent('Role 3'));
    expect(document.querySelectorAll('.ayn-match-row.is-active')).toHaveLength(1);
    const seen = h.ops.filter((o) => o.table === 'job_postings_seen' && o.op === 'upsert')
      .map((o) => (o.args[0] as { job_posting_id: string }).job_posting_id);
    expect(seen).toEqual(expect.arrayContaining(['job-2', 'job-3']));
  });

  it('bookmark saves the right job then unsaves it, without changing the selection', async () => {
    mount();
    await waitFor(() => expect(rows()).toHaveLength(3));
    const activeBefore = active()?.textContent;
    fireEvent.click(within(rowByTitle('Role 2')).getByLabelText('Save job'));
    await waitFor(() => expect(within(rowByTitle('Role 2')).getByLabelText('Remove from saved')).toBeInTheDocument());
    const insert = h.ops.find((o) => o.table === 'jobs' && o.op === 'insert')!;
    expect(insert.args[0]).toMatchObject({ user_id: 'user-1', source_url: 'https://example.com/apply/2', title: 'Role 2' });
    expect(screen.getAllByLabelText('Remove from saved')).toHaveLength(1);
    expect(active()?.textContent).toBe(activeBefore);
    fireEvent.click(within(rowByTitle('Role 2')).getByLabelText('Remove from saved'));
    await waitFor(() => expect(screen.queryAllByLabelText('Remove from saved')).toHaveLength(0));
    expect(h.ops.some((o) => o.table === 'jobs' && o.op === 'delete')).toBe(true);
    expect(h.ops.some((o) => o.table === 'jobs' && o.op === 'eq' && o.args[1] === 'https://example.com/apply/2')).toBe(true);
  });

  it('typing in the search box does not re-render unrelated rows', async () => {
    mount();
    await waitFor(() => expect(rows()).toHaveLength(3));
    await waitFor(() => expect(screen.queryAllByText('Scoring…')).toHaveLength(0));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const box = screen.getAllByPlaceholderText(/search/i)[0] as HTMLInputElement;
    const before = { ...h.rowCalls };
    expect(before['Acme 2']).toBeGreaterThan(0);
    for (const v of ['r', 'ro', 'rol']) fireEvent.change(box, { target: { value: v } });
    expect(box.value).toBe('rol');
    // Acme 1 is auto-selected (its detail pane also renders an avatar); compare the others.
    expect(h.rowCalls['Acme 2']).toBe(before['Acme 2']);
    expect(h.rowCalls['Acme 3']).toBe(before['Acme 3']);
  });

  it('detail pane follows the selection, and "Score and tailor" saves that job and hands off', async () => {
    const { onAdded } = mount();
    await waitFor(() => expect(rows()).toHaveLength(3));
    // the pane shows the auto-selected first job, then whichever row is opened
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Role 1' })).toBeInTheDocument());
    fireEvent.click(within(rowByTitle('Role 3')).getByText('Role 3'));
    const heading = await screen.findByRole('heading', { level: 2, name: 'Role 3' });
    const pane = heading.closest('div.p-5') as HTMLElement;
    expect(within(pane).getByText('Build things')).toBeInTheDocument();
    expect(within(pane).getByText(/Sourced directly from Acme 3/)).toBeInTheDocument();
    fireEvent.click(within(pane).getByText('Score and tailor'));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('saved-row-1'));
    const insert = h.ops.find((o) => o.table === 'jobs' && o.op === 'insert')!;
    expect(insert.args[0]).toMatchObject({ source_url: 'https://example.com/apply/3', title: 'Role 3' });
  });
});
