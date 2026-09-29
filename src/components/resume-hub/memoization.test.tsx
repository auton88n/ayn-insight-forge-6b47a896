import { useCallback, useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Render counters: companyAvatar() runs once per JobListRow render; PlainField
// runs once per field render inside an ExperienceCard.
const counts = vi.hoisted(() => ({ rows: {} as Record<string, number>, fields: {} as Record<string, number> }));
vi.mock('@/lib/jobPostingFormat', async (orig) => {
  const m = await orig<typeof import('@/lib/jobPostingFormat')>();
  return { ...m, companyAvatar: (c: string) => { counts.rows[c] = (counts.rows[c] ?? 0) + 1; return m.companyAvatar(c); } };
});
vi.mock('./ProfileFormPrimitives', async (orig) => {
  const m = await orig<typeof import('./ProfileFormPrimitives')>();
  const React = await import('react');
  return {
    ...m,
    PlainField: (p: React.ComponentProps<typeof m.PlainField>) => {
      const k = `${p.label}:${p.value}`; counts.fields[k] = (counts.fields[k] ?? 0) + 1;
      return React.createElement(m.PlainField, p);
    },
  };
});
import type { JobPosting } from '@/lib/resumeHub';
import { JobListRow } from './JobListRow';
import { ExperienceCard } from './ExperienceCard';
import { EMPTY, type Career, type Exp } from './profileTypes';
import { updateAt, removeAt } from './ProfileFormPrimitives';

afterEach(() => { cleanup(); counts.rows = {}; counts.fields = {}; });

/** PlainField labels aren't bound to inputs; find the input next to the label text. */
const fields = (label: string) =>
  screen.getAllByText(label).map((l) => l.parentElement!.querySelector('input') as HTMLInputElement);

const mkJob = (n: number): JobPosting => ({
  id: `job-${n}`, apply_url: `https://example.com/${n}`, company: `Company ${n}`, title: `Title ${n}`,
  location: 'Toronto', description: 'desc', posted_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  employment_type: null, seniority: null, work_mode: null,
} as unknown as JobPosting);

/** Mirrors how BrowseJobs wires rows: stable callbacks, per-row primitives. */
function ListHarness({ onOpenSpy, onToggleSpy, commits }: {
  onOpenSpy: (j: JobPosting) => void; onToggleSpy: (j: JobPosting, saved: boolean) => void; commits: Record<string, number>;
}) {
  const jobs = useRef([1, 2, 3, 4, 5].map(mkJob)).current;
  const [unrelated, setUnrelated] = useState('');
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [scored, setScored] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const onOpen = useCallback((j: JobPosting) => { onOpenSpy(j); setSelectedId(j.id); }, [onOpenSpy]);
  const onToggle = useCallback((j: JobPosting, isSaved: boolean) => {
    onToggleSpy(j, isSaved);
    setSaved((p) => { const n = new Set(p); if (isSaved) n.delete(j.apply_url); else n.add(j.apply_url); return n; });
  }, [onToggleSpy]);
  const onLogoError = useCallback(() => {}, []);
  return (
    <div>
      <input aria-label="search" value={unrelated} onChange={(e) => setUnrelated(e.target.value)} />
      <button onClick={() => setSaving('job-2')}>start-saving-2</button>
      <button onClick={() => setScored(new Set(['job-4']))}>score-4</button>
      {jobs.map((j) => (
        <div key={j.id}>
          <JobListRow
            job={j} active={selectedId === j.id} isSaved={saved.has(j.apply_url)} isSeen={false}
            isSaving={saving === j.id} logoFailed={false} score={j.id === 'job-1' ? 82 : null}
            hasScored={scored.has(j.id)} onOpen={onOpen} onToggleBookmark={onToggle} onLogoError={onLogoError}
          />
        </div>
      ))}
    </div>
  );
}

describe('JobListRow memoization', () => {
  const snap = () => ({ ...counts.rows });

  it('typing in an unrelated field does not re-render any row', () => {
    render(<ListHarness onOpenSpy={vi.fn()} onToggleSpy={vi.fn()} commits={{}} />);
    const initial = snap();
    expect(Object.keys(initial)).toHaveLength(5);
    for (const ch of 'engineer') fireEvent.change(screen.getByLabelText('search'), { target: { value: ch } });
    expect(snap()).toEqual(initial);
  });

  it('a per-row change re-renders only that row', () => {
    render(<ListHarness onOpenSpy={vi.fn()} onToggleSpy={vi.fn()} commits={{}} />);
    const before = snap();
    fireEvent.click(screen.getByText('start-saving-2'));
    const after = snap();
    expect(after['Company 2']).toBe(before['Company 2'] + 1);
    for (const n of [1, 3, 4, 5]) expect(after[`Company ${n}`]).toBe(before[`Company ${n}`]);
  });

  it('score pill updates when scoring returns (only for that row)', () => {
    render(<ListHarness onOpenSpy={vi.fn()} onToggleSpy={vi.fn()} commits={{}} />);
    expect(screen.getAllByText('Scoring…')).toHaveLength(4);
    const before = snap();
    fireEvent.click(screen.getByText('score-4'));
    expect(screen.getAllByText('Scoring…')).toHaveLength(3);
    expect(screen.getAllByText('No resume yet')).toHaveLength(1);
    const after = snap();
    expect(after['Company 4']).toBe(before['Company 4'] + 1);
    expect(after['Company 3']).toBe(before['Company 3']);
  });

  it('opening a row calls onOpen with that job and marks only it active', () => {
    const open = vi.fn();
    const { container } = render(<ListHarness onOpenSpy={open} onToggleSpy={vi.fn()} commits={{}} />);
    fireEvent.click(screen.getByText('Title 3'));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0].id).toBe('job-3');
    expect(container.querySelectorAll('.ayn-match-row.is-active')).toHaveLength(1);
  });

  it('bookmark toggles save then unsave with the right flag, without opening the row', () => {
    const open = vi.fn(); const toggle = vi.fn();
    render(<ListHarness onOpenSpy={open} onToggleSpy={toggle} commits={{}} />);
    const save = screen.getAllByLabelText('Save job')[1];
    fireEvent.click(save);
    expect(toggle).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'job-2' }), false);
    expect(screen.getAllByLabelText('Remove from saved')).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('Remove from saved'));
    expect(toggle).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'job-2' }), true);
    expect(screen.queryAllByLabelText('Remove from saved')).toHaveLength(0);
    expect(open).not.toHaveBeenCalled();
  });
});

/** Mirrors ProfileTab's wiring of ExperienceCard. */
function ProfileHarness({ commits, saves }: { commits: Record<string, number>; saves: { n: number } }) {
  const [career, setCareer] = useState<Career>({
    ...EMPTY,
    experiences: [
      { company: 'Acme', title: 'Engineer', start: '2020-01', end: '2022-01', bullets: ['Shipped X'] },
      { company: 'Globex', title: 'Manager', start: '2022-02', current: true, bullets: [''] },
      { company: 'Initech', title: 'Analyst', start: '2018-01', end: '2019-12', bullets: ['A', 'B'] },
    ] as Exp[],
  });
  const [other, setOther] = useState('');
  const queueSave = useCallback(() => { saves.n += 1; }, [saves]);
  const updateExp = useCallback((i: number, next: Exp) => { updateAt(setCareer, 'experiences', i, next); queueSave(); }, [queueSave]);
  const removeExp = useCallback((i: number) => { removeAt(setCareer, 'experiences', i); queueSave(); }, [queueSave]);
  return (
    <div>
      <input aria-label="other" value={other} onChange={(e) => setOther(e.target.value)} />
      {career.experiences.map((e, i) => (
        <div key={i}>
          <ExperienceCard exp={e} index={i} onChange={updateExp} onRemove={removeExp} onBlurSave={queueSave} />
        </div>
      ))}
    </div>
  );
}

describe('ExperienceCard memoization', () => {
  it('editing one role re-renders only that role; unrelated typing re-renders none', () => {
    render(<ProfileHarness commits={{}} saves={{ n: 0 }} />);
    let before = { ...counts.fields };
    fireEvent.change(screen.getByLabelText('other'), { target: { value: 'x' } });
    expect(counts.fields).toEqual(before);
    before = { ...counts.fields };
    fireEvent.change(fields('Title')[0], { target: { value: 'Senior Engineer' } });
    const after = counts.fields;
    expect(after['Company:Acme']).toBe(before['Company:Acme'] + 1);
    expect(after['Company:Globex']).toBe(before['Company:Globex']);
    expect(after['Company:Initech']).toBe(before['Company:Initech']);
  });

  it('consecutive keystrokes accumulate (no stale state) and other fields survive', () => {
    render(<ProfileHarness commits={{}} saves={{ n: 0 }} />);
    const title = () => fields('Title')[0] as HTMLInputElement;
    fireEvent.change(title(), { target: { value: 'S' } });
    fireEvent.change(title(), { target: { value: 'Se' } });
    fireEvent.change(title(), { target: { value: 'Sen' } });
    expect(title().value).toBe('Sen');
    fireEvent.change(fields('Company')[0], { target: { value: 'Acme Inc' } });
    expect(title().value).toBe('Sen');
    expect((fields('Company')[0] as HTMLInputElement).value).toBe('Acme Inc');
    expect((fields('Title')[1] as HTMLInputElement).value).toBe('Manager');
  });

  it('bullets: edit, add, remove; current-role switch; blur queues a save', () => {
    const saves = { n: 0 };
    render(<ProfileHarness commits={{}} saves={saves} />);
    const bullet = screen.getByDisplayValue('Shipped X');
    fireEvent.change(bullet, { target: { value: 'Shipped X faster' } });
    expect(screen.getByDisplayValue('Shipped X faster')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Add achievement')[0]);
    // roles start with 1 + 1 + 2 bullet boxes; adding one to role 0 makes 5
    expect(screen.getAllByPlaceholderText(/checkout latency/)).toHaveLength(5);
    const before = saves.n;
    fireEvent.blur(screen.getByDisplayValue('Shipped X faster'));
    expect(saves.n).toBe(before + 1);
  });

  it('removing a role keeps the others intact with the right content', () => {
    const saves = { n: 0 };
    render(<ProfileHarness commits={{}} saves={saves} />);
    fireEvent.click(screen.getAllByText('Remove role')[0]);
    const titles = fields('Title').map((t) => t.value);
    expect(titles).toEqual(['Manager', 'Analyst']);
    expect(saves.n).toBeGreaterThan(0);
    fireEvent.change(fields('Title')[1], { target: { value: 'Lead Analyst' } });
    expect(fields('Title').map((t) => t.value)).toEqual(['Manager', 'Lead Analyst']);
  });

  it('current-role switch clears End and disables it', () => {
    render(<ProfileHarness commits={{}} saves={{ n: 0 }} />);
    expect(fields('End')[0]).toHaveValue('2022-01');
    fireEvent.click(screen.getAllByRole('switch')[0]);
    expect(fields('End')[0]).toBeDisabled();
    expect(fields('End')[0]).toHaveValue('Present');
  });
});
