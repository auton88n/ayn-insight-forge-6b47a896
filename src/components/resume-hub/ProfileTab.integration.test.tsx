// Renders the real ProfileTab against a mocked backend and drives the form:
// every section (about, skills, work history, certifications, education,
// derived signals, preferences, eligibility) edits the right slice of the
// profile and autosaves it.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  ops: [] as Array<{ table: string; op: string; args: unknown[] }>,
  canon: {} as Record<string, unknown>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    let single = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- self-referential chainable query-builder stub
    const proxy: any = new Proxy(function () {}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => {
            let data: unknown = single ? null : [];
            if (table === 'user_profile_canonical' && single) data = h.canon;
            resolve({ data, error: null });
          };
        }
        return (...args: unknown[]) => {
          if (prop === 'maybeSingle' || prop === 'single') single = true;
          h.ops.push({ table, op: prop, args });
          return proxy;
        };
      },
    });
    return proxy;
  };
  return {
    supabase: {
      from: builder,
      rpc: vi.fn(async () => ({ data: null, error: null })),
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { email: 'me@example.com' } } })),
        getSession: vi.fn(async () => ({ data: { session: null } })),
      },
    },
  };
});
vi.mock('@/lib/resumeHub', () => ({ resumeHubApi: new Proxy({}, { get: () => async () => ({}) }) }));
vi.mock('@/lib/talentPoolSync', () => ({ reindexTalentPool: vi.fn(), setPoolOptInCache: vi.fn() }));
const stableToast = vi.hoisted(() => ({ toast: () => {} }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => stableToast }));
import ProfileTab from './ProfileTab';

const baseCanon = () => ({
  skills: [
    { name: 'Python', level: 'advanced', years: 5, last_used: 'current' },
    { name: 'SQL', level: null, years: null, last_used: null },
  ],
  experiences: [
    { company: 'Acme', title: 'Engineer', start: '2020-01', end: '2022-01', bullets: ['Shipped X'] },
    { company: 'Globex', title: 'Manager', start: '2022-02', current: true, bullets: [''] },
  ],
  education: [{ school: 'State U', degree: 'BSc', field: 'CS', end: '2016' }],
  certifications: [{ name: 'AWS SAA', issuer: 'Amazon', year: '2021' }],
  derived: { total_yoe: 8, seniority: 'Senior', primary_function: 'Engineering', known_for: ['Shipped payments'] },
  preferences: { desired_titles: ['Backend Engineer'], desired_locations: ['Toronto'], employment_types: ['full_time'], salary_min_usd: 100000, salary_currency: 'CAD', open_to_remote: true },
  work_auth: { countries: ['Canada'], citizenship: 'Canada', needs_sponsorship_now: false },
});

beforeEach(() => {
  h.ops.length = 0;
  h.canon = baseCanon();
  sessionStorage.clear();
});
afterEach(cleanup);

/** Form labels here aren't bound to inputs; find the input next to the label text. */
const field = (label: string, n = 0) =>
  screen.getAllByText(label)[n].parentElement!.querySelector('input') as HTMLInputElement;

async function mount(view = 'facts') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/?profileView=${view}`]}><ProfileTab userId="user-1" /></MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText(/Work history \(\d+\)/);
}

const saves = () => h.ops.filter((o) => o.table === 'user_profile_canonical' && o.op === 'upsert');
const lastSave = () => saves().at(-1)!.args[0] as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const waitForSave = (n: number) => waitFor(() => expect(saves().length).toBeGreaterThanOrEqual(n), { timeout: 3000 });

describe('ProfileTab form (real component, mocked backend)', () => {
  it('shows every section with the loaded data', async () => {
    await mount();
    expect(screen.getByText('Skills (2)')).toBeInTheDocument();
    expect(screen.getByText('Work history (2)')).toBeInTheDocument();
    expect(screen.getByText('Certifications & licenses (1)')).toBeInTheDocument();
    expect(screen.getByText('Education (1)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Acme')).toBeInTheDocument();
    expect(screen.getByDisplayValue('AWS SAA')).toBeInTheDocument();
    expect(screen.getByDisplayValue('State U')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Senior')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Shipped payments')).toBeInTheDocument();
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('100000')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 have a level')).toBeInTheDocument();
  });

  it('skills: open, edit, add, remove, bulk add', async () => {
    await mount();
    fireEvent.click(screen.getByText('Python'));
    const skillInput = screen.getByDisplayValue('Python') as HTMLInputElement;
    fireEvent.change(skillInput, { target: { value: 'Python 3' } });
    expect(screen.getByText('Python 3', { selector: 'span' })).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '7' } });
    fireEvent.click(screen.getByText('Done'));
    expect(screen.queryByText('Years (optional)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Add skill'));
    expect(screen.getByText('Skills (3)')).toBeInTheDocument();
    expect(screen.getByText('Years (optional)')).toBeInTheDocument(); // new empty skill opened for editing
    fireEvent.click(within(screen.getByText('Done').parentElement!).getByText('Remove'));
    expect(screen.getByText('Skills (2)')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Paste several skills separated by commas'), { target: { value: 'Go, Rust' } });
    fireEvent.click(within(screen.getByPlaceholderText('Paste several skills separated by commas').parentElement!).getByText('Add'));
    expect(screen.getByText('Skills (4)')).toBeInTheDocument();
    await waitForSave(1);
    expect(lastSave().skills.map((s: { name: string }) => s.name)).toEqual(['Python 3', 'SQL', 'Go', 'Rust']);
    expect(lastSave().skills[0].years).toBe(7);
  });

  it('work history: add, edit, remove roles', async () => {
    await mount();
    fireEvent.click(screen.getByText('Add role'));
    expect(screen.getByText('Work history (3)')).toBeInTheDocument();
    fireEvent.change(field('Title', 2), { target: { value: 'Intern' } });
    fireEvent.change(field('Company', 2), { target: { value: 'Initech' } });
    fireEvent.change(field('Title', 0), { target: { value: 'Senior Engineer' } });
    expect(field('Title', 2).value).toBe('Intern');
    fireEvent.click(screen.getAllByText('Remove role')[1]);
    expect(screen.getByText('Work history (2)')).toBeInTheDocument();
    await waitForSave(1);
    const exps = lastSave().experiences as Array<{ title: string; company: string }>;
    expect(exps.map((e) => `${e.title}@${e.company}`)).toEqual(['Senior Engineer@Acme', 'Intern@Initech']);
  });

  it('certifications and education: add, edit, remove', async () => {
    await mount();
    fireEvent.click(screen.getByText('Add certification or license'));
    expect(screen.getByText('Certifications & licenses (2)')).toBeInTheDocument();
    fireEvent.change(field('Certification or license', 1), { target: { value: 'PMP' } });
    fireEvent.click(screen.getByText('Add school'));
    expect(screen.getByText('Education (2)')).toBeInTheDocument();
    fireEvent.change(field('School', 1), { target: { value: 'City College' } });
    fireEvent.change(field('School', 0), { target: { value: 'State University' } });
    fireEvent.click(screen.getAllByText('Remove', { selector: 'button' })[0]); // first certification
    expect(screen.getByText('Certifications & licenses (1)')).toBeInTheDocument();
    await waitForSave(1);
    expect(lastSave().certifications).toEqual([{ name: 'PMP' }]);
    expect((lastSave().education as Array<{ school: string }>).map((e) => e.school)).toEqual(['State University', 'City College']);
  });

  it('derived signals and known-for', async () => {
    await mount();
    fireEvent.change(field('Total years of experience'), { target: { value: '9' } });
    fireEvent.change(screen.getByDisplayValue('Senior'), { target: { value: 'Staff' } });
    fireEvent.change(screen.getByDisplayValue('Shipped payments'), { target: { value: 'Shipped payments at scale' } });
    fireEvent.blur(screen.getByDisplayValue('Shipped payments at scale'));
    await waitForSave(1);
    expect(lastSave().derived).toMatchObject({ total_yoe: 9, seniority: 'Staff', known_for: ['Shipped payments at scale'] });
  });

  it('preferences: chips, salary, toggles', async () => {
    await mount('preferences');
    const titles = screen.getByText('Desired titles').closest('div.space-y-1') as HTMLElement;
    fireEvent.change(within(titles).getByPlaceholderText('Add a title'), { target: { value: 'Staff Engineer' } });
    fireEvent.click(within(titles).getByText('Add'));
    expect(within(titles).getByText('Staff Engineer')).toBeInTheDocument();
    fireEvent.click(within(within(titles).getByText('Backend Engineer')).getByRole('button')); // remove chip
    expect(within(titles).queryByText('Backend Engineer')).not.toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('100000'), { target: { value: '120000' } });
    const remote = screen.getByText('Open to remote').closest('label') as HTMLElement;
    fireEvent.click(within(remote).getByRole('switch'));
    await waitForSave(1);
    expect(lastSave().preferences).toMatchObject({ desired_titles: ['Staff Engineer'], salary_min_usd: 120000, open_to_remote: false });
  });

  it('eligibility: countries, citizenship, sponsorship, conditional permit fields', async () => {
    await mount('preferences');
    expect(screen.queryByText('Visa type (optional)')).not.toBeInTheDocument(); // only Canada + Canadian citizen
    fireEvent.click(screen.getByRole('button', { name: 'United States' }));
    expect(screen.getByText('Visa type (optional)')).toBeInTheDocument(); // a non-citizenship country appears
    fireEvent.change(field('Visa type (optional)'), { target: { value: 'TN' } });
    const sponsor = screen.getByText('I need sponsorship now').closest('label') as HTMLElement;
    fireEvent.click(within(sponsor).getByRole('switch'));
    await waitForSave(1);
    expect(lastSave().work_auth).toMatchObject({
      countries: ['Canada', 'United States'], work_authorized_us: true, visa_type: 'TN', needs_sponsorship_now: true,
    });
  });

  it('about you: editing a personal field saves it to the profile data table', async () => {
    await mount();
    fireEvent.change(field('First name'), { target: { value: 'Sam' } });
    fireEvent.change(field('LinkedIn'), { target: { value: 'https://linkedin.com/in/sam' } });
    fireEvent.blur(field('LinkedIn')); // personal fields save on blur
    await waitFor(() => expect(h.ops.some((o) => o.table === 'user_profile_data' && o.op === 'upsert')).toBe(true), { timeout: 3000 });
    const saved = h.ops.filter((o) => o.table === 'user_profile_data' && o.op === 'upsert').at(-1)!.args[0] as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(saved.legal_first_name).toBe('Sam');
    expect(saved.links.linkedin).toBe('https://linkedin.com/in/sam');
  });

  it('editing one section leaves the others intact in the saved profile', async () => {
    await mount();
    fireEvent.change(field('Company', 0), { target: { value: 'Acme Corp' } });
    fireEvent.click(screen.getByText('Python'));
    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '6' } });
    await waitForSave(1);
    const s = lastSave();
    expect(s.experiences[0].company).toBe('Acme Corp');
    expect(s.experiences[1].company).toBe('Globex');
    expect(s.skills[0].years).toBe(6);
    expect(s.education[0].school).toBe('State U');
    expect(s.certifications[0].name).toBe('AWS SAA');
    expect(s.derived.seniority).toBe('Senior');
    expect(s.preferences.desired_titles).toEqual(['Backend Engineer']);
    expect(s.work_auth.countries).toEqual(['Canada']);
  });
});
