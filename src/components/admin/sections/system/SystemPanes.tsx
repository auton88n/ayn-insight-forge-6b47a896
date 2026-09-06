// v3.22.0 — SYSTEM panes, written for AYN as it is now. Every pane reads a real
// admin RPC. Nothing here is a placeholder.
import { AccountDetailDialog } from './AccountDetail';
import { Fragment, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import {
  useAdminAccounts,
  useAdminSupportTickets,
  useAdminErrorMonitoring,
  useAdminRateLimits,
  useAdminAIUsage,
  useAdminEmailAudience,
  useAdminTermsConsent,
  useAdminCookieConsent,
  useAdminActivityLog,
  useAdminEmailLog,
  useAdminInbox,
  useMarkInboxRead,
  useAdminExtDiagnostics,
} from '@/admin-app/hooks/useAdminQuery';
import { Stat, LoadingBlock, ErrorBlock, EmptyRow, when } from '../ui';

const Table = ({ head, children }: { head: string[]; children: React.ReactNode }) => (
  <Card className="border border-border/60 bg-card overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/40">
            {head.map(h => (
              <th key={h} className="text-left font-medium text-xs uppercase tracking-wide text-muted-foreground px-4 py-2.5 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  </Card>
);

const Row = ({ children }: { children: React.ReactNode }) => (
  <tr className="border-b border-border/40 last:border-0 hover:bg-muted/30">{children}</tr>
);

const Cell = ({ children, mono }: { children: React.ReactNode; mono?: boolean }) => (
  <td className={`px-4 py-2.5 align-middle ${mono ? 'font-mono text-xs' : ''}`}>{children}</td>
);

/* ────────────────────────────── ACCOUNTS ────────────────────────────── */
export function AccountsPane() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  // v3.28.0 — a row opens into the detail and moderation view.
  const [openUser, setOpenUser] = useState<string | null>(null);
  const query = useAdminAccounts(q);
  const d = query.data as any;

  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock error={query.error} onRetry={() => query.refetch()} />;

  const rows: any[] = d?.rows || [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Accounts" value={d?.total ?? 0} />
        <Stat label="Job seekers" value={d?.seekers ?? 0} />
        <Stat label="Employers" value={d?.employers ?? 0} accent />
        <Stat label="Admins" value={d?.admins ?? 0} />
      </div>

      <form
        className="flex gap-2"
        onSubmit={e => { e.preventDefault(); setQ(search.trim()); }}
      >
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by email, name or company" className="max-w-sm" />
        <Button type="submit" variant="outline">Search</Button>
        {q && <Button type="button" variant="ghost" onClick={() => { setSearch(''); setQ(''); }}>Clear</Button>}
      </form>

      <Table head={['Person', 'Type', 'Plan', 'Credits', 'Discoverable', 'Joined', 'Last sign in', '']}>
        {rows.length === 0 && (
          <tr><td colSpan={8}><EmptyRow>No accounts match.</EmptyRow></td></tr>
        )}
        {rows.map(r => (
          <Row key={r.user_id}>
            <Cell>
              <div className="font-medium">{r.display_name}</div>
              <div className="text-xs text-muted-foreground">{r.email}</div>
            </Cell>
            <Cell>
              <div className="flex flex-wrap gap-1">
                <Badge variant="secondary" className="text-[10px]">{r.company_name ? 'Employer' : 'Job seeker'}</Badge>
                {r.system_role === 'admin' && <Badge className="bg-primary text-primary-foreground text-[10px]">Admin</Badge>}
                {r.employer_status && <Badge variant="outline" className="text-[10px]">{r.employer_status}</Badge>}
              </div>
              {r.company_name && <div className="text-xs text-muted-foreground mt-1">{r.company_name}</div>}
            </Cell>
            <Cell mono>{r.plan_key}{r.sub_status ? ` / ${r.sub_status}` : ''}</Cell>
            <Cell mono>{r.credits}</Cell>
            <Cell>{r.discoverable ? <span className="text-primary font-medium">Yes</span> : <span className="text-muted-foreground">No</span>}</Cell>
            <Cell>{when(r.signed_up_at)}</Cell>
            <Cell>{when(r.last_sign_in_at)}</Cell>
            <Cell>
              <Button variant="outline" size="sm" onClick={() => setOpenUser(r.user_id)}>Open</Button>
            </Cell>
          </Row>
        ))}
      </Table>

      <AccountDetailDialog
        userId={openUser}
        open={!!openUser}
        onOpenChange={v => { if (!v) setOpenUser(null); }}
      />
    </div>
  );
}

/* ────────────────────────────── SUPPORT ────────────────────────────── */
export function SupportPane() {
  const query = useAdminSupportTickets();
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock error={query.error} onRetry={() => query.refetch()} />;

  const tickets: any[] = (query.data as any)?.tickets || [];
  const open = tickets.filter(t => t.status !== 'closed' && t.status !== 'resolved');

  const send = async (ticketId: string) => {
    const text = (drafts[ticketId] || '').trim();
    if (!text) return;
    setSending(ticketId);
    // v3.118.0 — admin_insert_ticket_message only ever wrote a row nobody
    // reads back; this edge function saves the reply AND emails the person
    // who opened the ticket from support@ayn.careers, the only way they can
    // actually see it (there is no in-app "my tickets" view, guest or signed in).
    const { data, error } = await supabase.functions.invoke('send-ticket-reply', {
      body: { ticket_id: ticketId, message: text },
    });
    setSending(null);
    if (error || data?.error) { toast.error(data?.error || error?.message || 'Reply failed'); return; }
    setDrafts(d => ({ ...d, [ticketId]: '' }));
    toast.success(data?.emailed === false ? 'Reply saved, but the email failed to send' : 'Reply sent');
    query.refetch();
  };

  const setStatus = async (ticketId: string, status: string) => {
    const { error } = await supabase.rpc('admin_update_ticket', { p_id: ticketId, p_data: { status } as any });
    if (error) { toast.error(error.message); return; }
    toast.success(`Marked ${status}`);
    query.refetch();
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat label="Tickets" value={(query.data as any)?.total ?? tickets.length} />
        <Stat label="Open" value={open.length} accent />
        <Stat label="Unread reply" value={tickets.filter(t => t.has_unread_reply).length} />
      </div>

      <Table head={['Subject', 'From', 'Status', 'Priority', 'Updated', '']}>
        {tickets.length === 0 && <tr><td colSpan={6}><EmptyRow>No support tickets yet.</EmptyRow></td></tr>}
        {tickets.map(t => (
          <Row key={t.id}>
            <Cell>
              <button className="text-left font-medium hover:text-primary" onClick={() => setOpenId(openId === t.id ? null : t.id)}>
                {t.subject}
              </button>
              {openId === t.id && (
                <div className="mt-3 space-y-2 max-w-xl">
                  {(t.replies || []).map((r: any) => (
                    <div key={r.id} className="rounded-lg bg-muted/50 p-2.5 text-xs">
                      <span className="font-medium">{r.sender_type || 'user'}</span> · {when(r.created_at)}
                      <p className="mt-1 whitespace-pre-wrap">{r.message || r.content}</p>
                    </div>
                  ))}
                  <Textarea value={drafts[t.id] || ''} onChange={e => setDrafts(d => ({ ...d, [t.id]: e.target.value }))} rows={3} placeholder="Write a reply" />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={sending === t.id || !(drafts[t.id] || '').trim()} onClick={() => send(t.id)}>Send reply</Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus(t.id, 'resolved')}>Resolve</Button>
                    <Button size="sm" variant="ghost" onClick={() => setStatus(t.id, 'closed')}>Close</Button>
                  </div>
                </div>
              )}
            </Cell>
            <Cell>
              <div>{t.display_name}</div>
              <div className="text-xs text-muted-foreground">{t.email}</div>
            </Cell>
            <Cell><Badge variant="secondary" className="text-[10px]">{t.status}</Badge></Cell>
            <Cell mono>{t.priority}</Cell>
            <Cell>{when(t.updated_at)}</Cell>
            <Cell mono>{t.reply_count}</Cell>
          </Row>
        ))}
      </Table>
    </div>
  );
}

/* ────────────────────────────── ERRORS ────────────────────────────── */
// v3.162.0 — the GDPR breach notification procedure (written as its own
// document during the compliance pass) had nowhere real to live once it
// was written — it sat in a doc on the founder's laptop, not somewhere
// he'd actually see it mid-incident. This is the exact same "explain
// itself in plain English, collapsed by default" card SystemEmailsReference
// already uses, placed on the Errors pane specifically because step 1
// (Detection) is what this pane already shows live.
const BREACH_STEPS: { title: string; body: string; when?: string }[] = [
  {
    title: '1. Detection',
    body: 'A qualifying event is caught by the error-alert-check cron (fires on any critical error-log row or a burst of 3+ errors), by reviewing the errors below directly, or by direct discovery. Whichever happens first is the actual start of the 72-hour clock.',
  },
  {
    title: '2. Triage — is this actually a personal data breach',
    body: 'Unauthorized access, disclosure, alteration, or loss of personal data. Confirm which table(s) and how many real accounts are affected by querying the database directly — never assume scope from a log line alone.',
    when: 'within hours of detection',
  },
  {
    title: '3. Severity classification',
    body: 'Does it pose a risk to the rights and freedoms of the affected people? If yes, the 72-hour regulator notification applies. If the risk is high, affected individuals must also be told directly, without undue delay.',
  },
  {
    title: '4. Notify the supervisory authority',
    body: 'AYN has no EU establishment today, so there is no single default authority — notification goes to the supervisory authority of the affected people’s own country, or to whichever authority a future EU representative is designated with.',
    when: 'within 72 hours of awareness',
  },
  {
    title: '5. Notify affected individuals, if high risk',
    body: 'Plain language, no legal jargon: what happened, what data, what AYN is doing about it, what they can do. Sent through the same email infrastructure already in production.',
    when: 'without undue delay',
  },
  {
    title: '6. Document it, regardless of whether notification was required',
    body: 'Every breach gets a short internal record even if it never crosses the notification threshold: what happened, when, scope, and the decision on notification and why.',
  },
];

function BreachProcedureReference() {
  const [open, setOpen] = useState(false);
  return (
    <Card className="border border-border/60 bg-card">
      <CardContent className="p-5 space-y-3">
        <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-left">
          <div>
            <p className="text-base font-medium">If this is a real data breach</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              The actual 72-hour procedure, not a link to a document. AYN is solo-founder run today — every step below is
              something you personally do, not a handoff to a team.
            </p>
          </div>
          <span className="text-sm text-muted-foreground shrink-0 ml-3">{open ? 'Hide' : 'Show'}</span>
        </button>
        {open && (
          <div className="divide-y divide-border/60 pt-2">
            {BREACH_STEPS.map(s => (
              <div key={s.title} className="py-3 space-y-1">
                <p className="text-sm font-medium">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.body}</p>
                {s.when && <p className="text-xs text-primary">{s.when}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ErrorsPane() {
  const query = useAdminErrorMonitoring();
  const errors: any[] = (query.data as any)?.errors || [];

  // Hooks must run on every render, so the grouping sits above the guards.
  const groups = useMemo(() => {
    const m = new Map<string, { message: string; count: number; last: string; url?: string }>();
    for (const e of errors) {
      const key = (e.error_message || 'Unknown').slice(0, 160);
      const cur = m.get(key);
      if (cur) { cur.count++; if (e.created_at > cur.last) cur.last = e.created_at; }
      else m.set(key, { message: key, count: 1, last: e.created_at, url: e.url });
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [errors]);

  // Rendered ahead of the loading/error guards below on purpose — this is
  // static reference content, not query-dependent, and the one moment it
  // matters most is exactly when someone lands here mid-incident, possibly
  // while the error query itself is slow or failing.
  if (query.isLoading) return (<div className="space-y-5"><BreachProcedureReference /><LoadingBlock /></div>);
  if (query.error) return (<div className="space-y-5"><BreachProcedureReference /><ErrorBlock error={query.error} onRetry={() => query.refetch()} /></div>);

  const last24 = errors.filter(e => Date.now() - new Date(e.created_at).getTime() < 86400000).length;

  return (
    <div className="space-y-5">
      <BreachProcedureReference />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat label="Errors captured" value={errors.length} />
        <Stat label="Last 24 hours" value={last24} accent />
        <Stat label="Distinct" value={groups.length} />
      </div>
      <Table head={['Error', 'Count', 'Last seen', 'Where', '']}>
        {groups.length === 0 && <tr><td colSpan={5}><EmptyRow>No errors logged. Good.</EmptyRow></td></tr>}
        {groups.slice(0, 100).map(g => (
          <Row key={g.message}>
            <Cell><span className="font-mono text-xs">{g.message}</span></Cell>
            <Cell mono>{g.count}</Cell>
            <Cell>{when(g.last)}</Cell>
            <Cell>
              {g.url
                ? <a href={g.url} target="_blank" rel="noreferrer" className="text-xs text-primary break-all hover:underline">{g.url}</a>
                : <span className="text-xs text-muted-foreground">—</span>}
            </Cell>
            <Cell>
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(g.message); toast.success('Copied'); }}>
                Copy
              </Button>
            </Cell>
          </Row>
        ))}
      </Table>
    </div>
  );
}

/* ──────────────────────────── ACTIVITY LOG ───────────────────────────── */
// v3.47.0 — every admin action has been recorded in security_audit_logs
// since early in this project; this is the first screen that reads it back.
const ACTIVITY_LABELS: Record<string, string> = {
  admin_suspend_account: 'Suspended an account',
  admin_restore_account: 'Restored an account',
  admin_set_restriction: 'Changed a restriction',
  admin_adjust_credits: 'Adjusted credits',
  admin_erase_account: 'Erased an account',
  admin_purge_account: 'Purged an account',
  admin_set_feature_flag: 'Changed a kill switch',
  admin_set_feature_message: 'Changed a maintenance note',
  admin_moderate_proposal: 'Cancelled a proposal',
  admin_moderate_assessment: 'Expired an assessment',
  admin_set_admin_role: 'Changed admin access',
  admin_update_plan: 'Edited a plan',
  admin_set_limit_override: 'Set an account override',
  admin_clear_limit_override: 'Cleared an account override',
  admin_employer_approve: 'Approved an employer',
  admin_employer_decline: 'Declined an employer',
  admin_employer_override: 'Changed an employer plan',
  admin_mark_candidates_stale: 'Queued candidates for reindex',
  admin_set_pin: 'Changed the admin PIN',
  admin_unblock_user: 'Unblocked a rate-limited user',
  admin_user_snapshot: 'Looked up an account snapshot',
};

function summarizeActivityDetails(d: any): string {
  if (!d || typeof d !== 'object') return '';
  const bits: string[] = [];
  if (d.target_email) bits.push(String(d.target_email));
  else if (d.email) bits.push(String(d.email));
  if (d.plan_key) bits.push(`plan ${d.plan_key}`);
  if (d.key && typeof d.enabled === 'boolean') bits.push(`${d.key} → ${d.enabled ? 'on' : 'off'}`);
  if (d.capability) bits.push(String(d.capability));
  if (typeof d.grant === 'boolean') bits.push(d.grant ? 'granted' : 'removed');
  if (d.reason) bits.push(`"${d.reason}"`);
  if (bits.length) return bits.join(' · ');
  try { return JSON.stringify(d).slice(0, 160); } catch { return ''; }
}

export function ActivityPane() {
  const query = useAdminActivityLog();
  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock error={query.error} onRetry={() => query.refetch()} />;

  const rows: any[] = (query.data as any) || [];
  const last24 = rows.filter(r => Date.now() - new Date(r.created_at).getTime() < 86400000).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat label="Actions logged" value={rows.length} hint="Most recent 150" />
        <Stat label="Last 24 hours" value={last24} accent />
        <Stat label="High severity" value={rows.filter(r => r.severity === 'high').length} />
      </div>
      <Table head={['Who', 'What', 'Details', 'When']}>
        {rows.length === 0 && <tr><td colSpan={4}><EmptyRow>Nothing recorded yet.</EmptyRow></td></tr>}
        {rows.map(r => (
          <Row key={r.id}>
            <Cell>{r.actor_email || <span className="text-muted-foreground">System</span>}</Cell>
            <Cell>
              <span>{ACTIVITY_LABELS[r.action] || r.action}</span>
              {r.severity === 'high' && <Badge variant="destructive" className="text-[10px] ml-2">high</Badge>}
            </Cell>
            <Cell><span className="text-xs text-muted-foreground">{summarizeActivityDetails(r.details)}</span></Cell>
            <Cell>{when(r.created_at)}</Cell>
          </Row>
        ))}
      </Table>
    </div>
  );
}

/* ────────────────────── EXTENSION DIAGNOSTICS ────────────────────── */
// v3.354.0 — the extension's own "Send diagnostics to AYN" button
// (ext_diag_report, resume-hub) has written to ext_diagnostics since
// v3.296.0; nothing has ever read it back until now. Reported directly:
// a real person clicked it, saw "Sent ✓", then asked where it actually
// goes. The payload here is deliberately narrow by design (see that
// action's own comment) — field labels/kinds, structural widget
// signatures, and per-field fill success/failure, never an actual value
// typed into a field, never page HTML.
export function ExtDiagnosticsPane() {
  const query = useAdminExtDiagnostics();
  const [openId, setOpenId] = useState<string | null>(null);
  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock error={query.error} onRetry={() => query.refetch()} />;

  const rows: any[] = (query.data as any) || [];
  const last24 = rows.filter(r => Date.now() - new Date(r.created_at).getTime() < 86400000).length;
  const distinctPages = new Set(rows.map(r => r.page_hostname).filter(Boolean)).size;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat label="Reports" value={rows.length} hint="Most recent 150" />
        <Stat label="Last 24 hours" value={last24} accent />
        <Stat label="Distinct sites" value={distinctPages} />
      </div>
      <Table head={['Reporter', 'Page', 'Filled', 'Not on file', 'Failed', 'When', '']}>
        {rows.length === 0 && <tr><td colSpan={7}><EmptyRow>No diagnostic reports yet.</EmptyRow></td></tr>}
        {rows.map(r => {
          const rep = r.report || {};
          const notOnFile: string[] = Array.isArray(rep.notOnFile) ? rep.notOnFile : [];
          const failed: string[] = Array.isArray(rep.failed) ? rep.failed : [];
          const skipped: string[] = Array.isArray(rep.skipped) ? rep.skipped : [];
          const isOpen = openId === r.id;
          return (
            <Fragment key={r.id}>
              <Row>
                <Cell>{r.reporter_email || <span className="text-muted-foreground">Unknown</span>}</Cell>
                <Cell>
                  <span className="font-mono text-xs">{r.page_hostname || '—'}</span>
                  {r.page_pathname && <span className="block text-[10px] text-muted-foreground font-mono truncate max-w-[220px]">{r.page_pathname}</span>}
                </Cell>
                <Cell mono>{rep.filledCount ?? '—'} / {rep.fieldCount ?? '—'}</Cell>
                <Cell mono>{notOnFile.length}</Cell>
                <Cell mono>
                  {failed.length > 0
                    ? <Badge variant="destructive" className="text-[10px]">{failed.length}</Badge>
                    : 0}
                </Cell>
                <Cell>{when(r.created_at)}</Cell>
                <Cell>
                  <Button size="sm" variant="ghost" onClick={() => setOpenId(isOpen ? null : r.id)}>
                    {isOpen ? 'Hide' : 'Details'}
                  </Button>
                </Cell>
              </Row>
              {isOpen && (
                <tr key={`${r.id}-detail`} className="border-b border-border/40 bg-muted/20">
                  <td colSpan={7} className="px-4 py-3">
                    <div className="grid sm:grid-cols-2 gap-4 text-xs">
                      {r.note && (
                        <div className="sm:col-span-2">
                          <div className="font-medium text-foreground mb-1">Note from reporter</div>
                          <div className="text-muted-foreground">{r.note}</div>
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-foreground mb-1">Not on file ({notOnFile.length})</div>
                        {notOnFile.length
                          ? <ul className="text-muted-foreground list-disc pl-4 space-y-0.5">{notOnFile.map((l, i) => <li key={i}>{l}</li>)}</ul>
                          : <span className="text-muted-foreground">None</span>}
                      </div>
                      <div>
                        <div className="font-medium text-foreground mb-1">Failed to fill ({failed.length})</div>
                        {failed.length
                          ? <ul className="text-muted-foreground list-disc pl-4 space-y-0.5">{failed.map((l, i) => <li key={i}>{l}</li>)}</ul>
                          : <span className="text-muted-foreground">None</span>}
                      </div>
                      {skipped.length > 0 && (
                        <div>
                          <div className="font-medium text-foreground mb-1">Skipped (slider/range) ({skipped.length})</div>
                          <ul className="text-muted-foreground list-disc pl-4 space-y-0.5">{skipped.map((l, i) => <li key={i}>{l}</li>)}</ul>
                        </div>
                      )}
                      {rep.platform && (
                        <div>
                          <div className="font-medium text-foreground mb-1">Platform</div>
                          <span className="text-muted-foreground font-mono">{rep.platform}</span>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </Table>
    </div>
  );
}

/* ──────────────────────────── RATE LIMITS ──────────────────────────── */
export function LimitsPane() {
  const query = useAdminRateLimits();
  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock error={query.error} onRetry={() => query.refetch()} />;

  const rows: any[] = (query.data as any) || [];
  const blocked = rows.filter(r => r.is_blocked);

  const unblock = async (userId: string, endpoint: string) => {
    const { error } = await supabase.rpc('admin_unblock_user', { p_user_id: userId, p_endpoint: endpoint });
    if (error) { toast.error(error.message); return; }
    toast.success('Unblocked');
    query.refetch();
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat label="Tracked windows" value={rows.length} />
        <Stat label="Currently blocked" value={blocked.length} accent />
        <Stat label="Violations" value={rows.reduce((s, r) => s + Number(r.violation_count || 0), 0)} />
      </div>
      <Table head={['Person', 'Endpoint', 'Requests', 'Violations', 'State', '']}>
        {rows.length === 0 && <tr><td colSpan={6}><EmptyRow>Nobody is close to a limit.</EmptyRow></td></tr>}
        {rows.map(r => (
          <Row key={r.id}>
            <Cell>{r.user_email || <span className="text-muted-foreground">Anonymous</span>}</Cell>
            <Cell mono>{r.endpoint}</Cell>
            <Cell mono>{r.request_count} / {r.max_requests}</Cell>
            <Cell mono>{r.violation_count}</Cell>
            <Cell>
              {r.is_blocked
                ? <Badge variant="destructive" className="text-[10px]">Blocked</Badge>
                : <Badge variant="secondary" className="text-[10px]">Fine</Badge>}
            </Cell>
            <Cell>
              {r.is_blocked && r.user_id && (
                <Button size="sm" variant="outline" onClick={() => unblock(r.user_id, r.endpoint)}>Unblock</Button>
              )}
            </Cell>
          </Row>
        ))}
      </Table>
    </div>
  );
}

/* ────────────────────────────── AI COST ────────────────────────────── */
export function AiPane() {
  const query = useAdminAIUsage();
  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock error={query.error} onRetry={() => query.refetch()} />;

  const d = (query.data as any) || {};
  const byDay: any[] = d.by_day || [];
  const peak = Math.max(1, ...byDay.map(x => Number(x.calls || 0)));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Calls today" value={d.calls_today ?? 0} />
        <Stat label="Calls this month" value={d.calls_month ?? 0} />
        <Stat label="Spend this month" value={`${Number(d.spend_month || 0).toFixed(2)}`} accent hint="Sum of logged model cost" />
        <Stat label="Failures this month" value={d.failures_month ?? 0} />
      </div>

      <Card className="border border-border/60 bg-card">
        <CardContent className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-4">Calls, last 30 days</p>
          <div className="flex items-end gap-1 h-28">
            {byDay.length === 0 && <p className="text-sm text-muted-foreground">No model calls logged yet.</p>}
            {byDay.map(x => (
              <div key={x.day} className="flex-1 bg-primary/70 rounded-t hover:bg-primary transition-colors"
                   style={{ height: `${(Number(x.calls) / peak) * 100}%` }} title={`${x.day}: ${x.calls} calls`} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Table head={['Model', 'Calls', 'Spend']}>
        {(d.by_model || []).length === 0 && <tr><td colSpan={3}><EmptyRow>No model usage this month.</EmptyRow></td></tr>}
        {(d.by_model || []).map((m: any) => (
          <Row key={m.model}>
            <Cell mono>{m.model || 'unknown'}</Cell>
            <Cell mono>{m.calls}</Cell>
            <Cell mono>{Number(m.spend || 0).toFixed(2)}</Cell>
          </Row>
        ))}
      </Table>

      <Table head={['Recent failure', 'When']}>
        {(d.recent_failures || []).length === 0 && <tr><td colSpan={2}><EmptyRow>No failures.</EmptyRow></td></tr>}
        {(d.recent_failures || []).map((f: any) => (
          <Row key={f.id}>
            <Cell><span className="font-mono text-xs">{f.error_message || f.reason || f.model || 'failure'}</span></Cell>
            <Cell>{when(f.created_at)}</Cell>
          </Row>
        ))}
      </Table>
    </div>
  );
}

/* ────────────────────────────── EMAIL ────────────────────────────── */
// v3.45.0 — plain-English reference of every email AYN sends on its own,
// with no admin action needed. The broadcast tool below this is the only
// email an admin writes by hand; everything in this list fires
// automatically from real product events (signup, payment, a proposal
// being sent, etc). Static content: these are fixed templates, not data
// from the database, so there is nothing to fetch here.
const SYSTEM_EMAILS: { subject: string; who: string; when: string; says: string }[] = [
  {
    subject: 'Confirm your AYN account',
    who: 'A new job seeker or employer',
    when: 'The moment they sign up',
    says: 'Asks them to click a link to verify their email before they can use AYN. Expires in 24 hours.',
  },
  {
    subject: 'Reset your password',
    who: 'Anyone who clicked "Forgot password"',
    when: 'Right after they ask for a reset',
    says: 'A link to set a new password. Expires in 1 hour, and only works once.',
  },
  {
    subject: 'Confirm your new email',
    who: 'Someone changing the email on their account',
    when: 'The moment they request the change',
    says: 'Confirms the new address before the switch takes effect. Protects against someone else changing your email by mistake.',
  },
  {
    subject: 'Your AYN payment receipt',
    who: 'A job seeker on a paid plan',
    when: 'The instant a payment or renewal goes through',
    says: 'Which plan, how much was charged, and how many credits were just added.',
  },
  {
    subject: 'New job proposal from [Company]',
    who: 'A job seeker',
    when: 'The moment an employer sends them a proposal',
    says: 'Who is interested and for what role, with a link back to AYN to read the full message.',
  },
  {
    subject: 'New assessment from [Company]',
    who: 'A job seeker',
    when: 'The moment an employer sends them a short skills assessment',
    says: 'Which company, what role, and roughly how many minutes it takes.',
  },
  {
    subject: 'A candidate accepted your proposal',
    who: 'The employer (everyone on their team)',
    when: 'The moment a job seeker accepts a proposal',
    says: 'Lets them know they can now see the candidate’s contact details in AYN. No name or contact info in the email itself, by design.',
  },
  {
    subject: 'A candidate declined your proposal',
    who: 'The employer (everyone on their team)',
    when: 'The moment a job seeker turns down a proposal',
    says: 'Just the outcome, so they are not left wondering. No reason is shared because none is collected.',
  },
  {
    subject: 'An assessment was completed',
    who: 'The employer (everyone on their team)',
    when: 'The moment a job seeker finishes an assessment',
    says: 'Lets them know results are ready to review in AYN. No score or answers in the email itself, by design.',
  },
];

function SystemEmailsReference() {
  const [open, setOpen] = useState(false);
  return (
    <Card className="border border-border/60 bg-card">
      <CardContent className="p-5 space-y-3">
        <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-left">
          <div>
            <p className="text-base font-medium">Emails AYN sends on its own</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Nothing below this needs an admin to do anything. These fire automatically when something happens in the product.
              The tool further down this page is different: that one is for writing a message yourself.
            </p>
          </div>
          <span className="text-sm text-muted-foreground shrink-0 ml-3">{open ? 'Hide' : 'Show'}</span>
        </button>
        {open && (
          <div className="divide-y divide-border/60 pt-2">
            {SYSTEM_EMAILS.map(e => (
              <div key={e.subject} className="py-3 space-y-1">
                <p className="text-sm font-medium">{e.subject}</p>
                <p className="text-xs text-muted-foreground"><span className="text-foreground">Goes to:</span> {e.who}</p>
                <p className="text-xs text-muted-foreground"><span className="text-foreground">Sent:</span> {e.when}</p>
                <p className="text-xs text-muted-foreground"><span className="text-foreground">Says:</span> {e.says}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// v3.47.0 — every automatic system email (and admin broadcast) now writes
// to email_logs; this is the first screen that reads it back, so a silent
// send failure is finally visible instead of invisible.
const EMAIL_TYPE_LABELS: Record<string, string> = {
  signup: 'Account confirmation',
  recovery: 'Password reset',
  email_change: 'Email change confirmation',
  magiclink: 'Login link',
  payment_receipt: 'Payment receipt',
  proposal_received: 'New proposal (to job seeker)',
  assessment_received: 'New assessment (to job seeker)',
  proposal_accepted: 'Proposal accepted (to employer)',
  proposal_declined: 'Proposal declined (to employer)',
  assessment_completed: 'Assessment completed (to employer)',
  admin_broadcast_all: 'Broadcast: everyone',
  admin_broadcast_seekers: 'Broadcast: job seekers',
  admin_broadcast_employers: 'Broadcast: employers',
  admin_broadcast_discoverable: 'Broadcast: discoverable',
  admin_broadcast_test: 'Broadcast: test',
};

function EmailLogSection() {
  const query = useAdminEmailLog();
  const [open, setOpen] = useState(false);
  if (query.isLoading || query.error) return null;
  const rows: any[] = (query.data as any) || [];
  const failed = rows.filter(r => r.status === 'failed').length;

  return (
    <Card className="border border-border/60 bg-card">
      <CardContent className="p-5 space-y-3">
        <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-left">
          <div>
            <p className="text-base font-medium">Did these emails actually go out?</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              The last {rows.length} attempts, both automatic and the messages written above.
              {failed > 0 && <span className="text-destructive"> {failed} failed.</span>}
            </p>
          </div>
          <span className="text-sm text-muted-foreground shrink-0 ml-3">{open ? 'Hide' : 'Show'}</span>
        </button>
        {open && (
          rows.length === 0 ? <EmptyRow>Nothing sent yet.</EmptyRow> : (
            <div className="divide-y divide-border/60 max-h-[420px] overflow-y-auto">
              {rows.map(r => (
                <div key={r.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{EMAIL_TYPE_LABELS[r.email_type] || r.email_type}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.recipient_email || 'unknown recipient'} · {when(r.sent_at)}
                      {r.status === 'failed' && r.error_message && <span className="text-destructive"> · {r.error_message}</span>}
                    </p>
                  </div>
                  <Badge variant={r.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px] uppercase shrink-0">
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}

// v3.113.0 — renamed from the old exported EmailPane. This is now just the
// "Sent" half of the unified Email pane below (SystemEmailsReference, the
// broadcast composer, and the sent-email log) — the "Received" half lives in
// EmailReceivedPane (previously InboxPane) right after it.
function EmailSentPane() {
  const query = useAdminEmailAudience();
  const [audience, setAudience] = useState<'all' | 'seekers' | 'employers' | 'discoverable'>('all');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [testTo, setTestTo] = useState('');
  const [sending, setSending] = useState<'send' | 'test' | null>(null);
  const [result, setResult] = useState<{ sent: number; failed: number; errors: string[] } | null>(null);

  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock error={query.error} onRetry={() => query.refetch()} />;

  const all: any[] = (query.data as any) || [];
  const list = all.filter(u =>
    audience === 'all' ? true
    : audience === 'employers' ? u.is_employer
    : audience === 'discoverable' ? u.discoverable
    : !u.is_employer);

  const broadcast = async (mode: 'send' | 'test') => {
    if (!subject.trim() || !body.trim()) { toast.error('Subject and message are required'); return; }
    if (mode === 'test' && !testTo.trim()) { toast.error('Enter a test address'); return; }
    if (mode === 'send' && !window.confirm(`Send to ${list.length} ${list.length === 1 ? 'person' : 'people'}?`)) return;

    setSending(mode);
    setResult(null);
    const { data, error } = await supabase.functions.invoke('admin-broadcast', {
      body: {
        audience: mode === 'test' ? 'test' : audience,
        subject: subject.trim(),
        message: body.trim(),
        test_to: testTo.trim(),
      },
    });
    setSending(null);

    if (error) { toast.error(error.message || 'Broadcast failed'); return; }
    const r = data as any;
    if (r?.error) { toast.error(r.error); return; }
    setResult({ sent: r?.sent ?? 0, failed: r?.failed ?? 0, errors: r?.errors ?? [] });
    toast[r?.failed ? 'warning' : 'success'](`Sent ${r?.sent ?? 0}, failed ${r?.failed ?? 0}`);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="All accounts" value={all.length} />
        <Stat label="Job seekers" value={all.filter(u => !u.is_employer).length} />
        <Stat label="Employers" value={all.filter(u => u.is_employer).length} />
        <Stat label="Discoverable" value={all.filter(u => u.discoverable).length} accent />
      </div>

      <SystemEmailsReference />

      <Card className="border border-border/60 bg-card">
        <CardContent className="p-5 space-y-4">
          <p className="text-sm font-medium -mb-1">Write your own message</p>
          <div className="flex flex-wrap gap-2">
            {(['all', 'seekers', 'employers', 'discoverable'] as const).map(a => (
              <button key={a} onClick={() => setAudience(a)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  audience === a ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card text-muted-foreground border-border/60 hover:text-foreground'}`}>
                {a}
              </button>
            ))}
          </div>
          <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" maxLength={200} />
          <Textarea value={body} onChange={e => setBody(e.target.value)} rows={7} placeholder="Message. Blank lines become paragraphs." />

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="Send a test to this address" className="sm:max-w-xs" />
            <Button variant="outline" onClick={() => broadcast('test')} disabled={sending !== null}>
              {sending === 'test' ? 'Sending' : 'Send test'}
            </Button>
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-sm text-muted-foreground">
              Goes to {list.length} {list.length === 1 ? 'person' : 'people'}.
            </p>
            <Button onClick={() => broadcast('send')} disabled={sending !== null || list.length === 0}>
              {sending === 'send' ? 'Sending' : 'Send broadcast'}
            </Button>
          </div>

          {result && (
            <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-sm">
              <p>Sent {result.sent}, failed {result.failed}.</p>
              {result.errors.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {result.errors.map((e, i) => <li key={i} className="font-mono break-all">{e}</li>)}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <EmailLogSection />
    </div>
  );
}

/* ────────────────────────────── CONSENT ────────────────────────────── */
export function ConsentPane() {
  const query = useAdminTermsConsent();
  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock error={query.error} onRetry={() => query.refetch()} />;

  const rows: any[] = (query.data as any) || [];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat label="Consent records" value={rows.length} />
        <Stat label="Latest version" value={rows[0]?.terms_version || '—'} accent />
        <Stat label="Last accepted" value={when(rows[0]?.accepted_at)} />
      </div>
      <Table head={['Person', 'Version', 'Terms', 'Privacy', 'AI notice', 'Accepted']}>
        {rows.length === 0 && <tr><td colSpan={6}><EmptyRow>No consent records yet.</EmptyRow></td></tr>}
        {rows.slice(0, 200).map(r => (
          <Row key={r.id}>
            <Cell>
              <div className="font-medium">{r.display_name}</div>
              <div className="text-xs text-muted-foreground">{r.email}</div>
            </Cell>
            <Cell mono>{r.terms_version}</Cell>
            <Cell>{r.terms_accepted ? 'Yes' : 'No'}</Cell>
            <Cell>{r.privacy_accepted ? 'Yes' : 'No'}</Cell>
            <Cell>{r.ai_disclaimer_accepted ? 'Yes' : 'No'}</Cell>
            <Cell>{when(r.accepted_at)}</Cell>
          </Row>
        ))}
      </Table>
    </div>
  );
}

/* ─────────────────────────── COOKIE CONSENT ──────────────────────────── */
// v3.93.0 — the cookie banner's Accept/Reject choice used to live only in the
// visitor's own browser (localStorage), nothing was ever sent to AYN. Now
// every decision also calls record_cookie_consent(), and this pane reads the
// aggregate back via get_admin_cookie_consent(), the same shape as the Terms
// consent pane above but for anonymous visitors as well as accounts.
export function CookieConsentPane() {
  const query = useAdminCookieConsent();
  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock error={query.error} onRetry={() => query.refetch()} />;

  const d: any = query.data || {};
  const accepted = d.total_accepted ?? 0;
  const rejected = d.total_rejected ?? 0;
  const total = accepted + rejected;
  const rate = total > 0 ? Math.round((accepted / total) * 100) : 0;
  const daily: { date: string; accepted: number; rejected: number }[] = d.daily || [];
  const recent: any[] = d.recent || [];
  const dayMax = Math.max(1, ...daily.map(x => x.accepted + x.rejected));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Accepted" value={accepted} accent />
        <Stat label="Rejected" value={rejected} />
        <Stat label="Accept rate" value={total > 0 ? `${rate}%` : '—'} hint={`${total} decisions recorded`} />
        <Stat label="Auto-rejected (GPC)" value={d.total_gpc ?? 0} hint="Global Privacy Control" />
      </div>

      <Card className="border border-border/60 bg-card">
        <CardContent className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-3">Last 30 days</p>
          {daily.length === 0 ? (
            <EmptyRow>No decisions recorded yet.</EmptyRow>
          ) : (
            <div className="flex items-end gap-1 h-24">
              {daily.map(day => {
                const dayTotal = day.accepted + day.rejected;
                const h = dayTotal > 0 ? Math.max(6, Math.round((dayTotal / dayMax) * 96)) : 0;
                const acceptedH = dayTotal > 0 ? Math.round((day.accepted / dayTotal) * h) : 0;
                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col justify-end rounded-sm overflow-hidden bg-muted/40 min-h-[2px]"
                    style={{ height: '96px' }}
                    title={`${day.date}: ${day.accepted} accepted, ${day.rejected} rejected`}
                  >
                    <div className="w-full bg-muted-foreground/30" style={{ height: `${h - acceptedH}px` }} />
                    <div className="w-full bg-primary" style={{ height: `${acceptedH}px` }} />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Table head={['Person', 'Choice', 'GPC', 'When']}>
        {recent.length === 0 && <tr><td colSpan={4}><EmptyRow>No decisions recorded yet.</EmptyRow></td></tr>}
        {recent.slice(0, 200).map(r => (
          <Row key={r.id}>
            <Cell>{r.email || <span className="text-muted-foreground">Anonymous</span>}</Cell>
            <Cell>
              {r.choice === 'accepted'
                ? <Badge variant="secondary">Accepted</Badge>
                : <Badge variant="outline">Rejected</Badge>}
            </Cell>
            <Cell>{r.gpc ? 'Yes' : 'No'}</Cell>
            <Cell>{when(r.created_at)}</Cell>
          </Row>
        ))}
      </Table>
    </div>
  );
}

/* ────────────────────────────── INBOX ────────────────────────────── */
// v3.109.0 — every real email AYN has received (support@, info@, whatever
// address Resend routes inbound mail to), already captured live by
// resend-inbound-webhook into inbound_email_replies, but never surfaced
// anywhere until now.
// v3.111.0 — replying now happens from here too, through admin-inbox-reply.
// Three sending identities, each with its own signature appended
// automatically server side — the draft box only ever holds the message
// itself, never the sign-off, so switching identities can't leave a
// mismatched signature behind.
const REPLY_IDENTITIES: { key: 'support' | 'hello' | 'ghazi' | 'admin'; label: string }[] = [
  { key: 'support', label: 'Support · support@ayn.careers' },
  { key: 'hello', label: 'Hello · hello@ayn.careers' },
  { key: 'ghazi', label: 'Ghazi · ghazi@ayn.careers' },
  { key: 'admin', label: 'Admin · admin@ayn.careers' },
];

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

// v3.113.0 — renamed from the old exported InboxPane. Now the "Received"
// half of the unified Email pane, rendered by the new EmailPane below.
function EmailReceivedPane() {
  const query = useAdminInbox();
  const markRead = useMarkInboxRead();
  const [openId, setOpenId] = useState<string | null>(null);
  const [addressFilter, setAddressFilter] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyIdentity, setReplyIdentity] = useState<'support' | 'hello' | 'ghazi' | 'admin'>('support');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock error={query.error} onRetry={() => query.refetch()} />;

  const d: any = query.data || {};
  const emails: any[] = d.emails || [];
  const addresses: { to_email: string; count: number }[] = d.addresses || [];
  const shown = addressFilter ? emails.filter(e => e.to_email === addressFilter) : emails;

  const sendReply = async (e: any) => {
    if (!replyText.trim()) { toast.error('Write a message first'); return; }
    const identityLabel = REPLY_IDENTITIES.find(i => i.key === replyIdentity)?.label || replyIdentity;
    if (!window.confirm(`Send this reply to ${e.from_email} as ${identityLabel}?`)) return;

    setSending(true);
    const { data, error } = await supabase.functions.invoke('admin-inbox-reply', {
      body: { email_id: e.id, identity_key: replyIdentity, message: replyText.trim() },
    });
    setSending(false);

    if (error) { toast.error(error.message || 'Reply failed'); return; }
    const r = data as any;
    if (r?.error) { toast.error(r.error); return; }
    toast.success('Reply sent');
    setReplyingId(null);
    setReplyText('');
    query.refetch();
  };

  return (
    <div className="space-y-5">
      {addresses.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setAddressFilter(null)}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${!addressFilter ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card text-muted-foreground border-border/60 hover:text-foreground'}`}
          >
            All addresses
          </button>
          {addresses.map(a => (
            <button
              key={a.to_email}
              onClick={() => setAddressFilter(a.to_email)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${addressFilter === a.to_email ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card text-muted-foreground border-border/60 hover:text-foreground'}`}
            >
              {a.to_email} <span className="opacity-60">({a.count})</span>
            </button>
          ))}
        </div>
      )}

      <Table head={['From', 'To', 'Subject', 'Received']}>
        {shown.length === 0 && <tr><td colSpan={4}><EmptyRow>No emails received yet.</EmptyRow></td></tr>}
        {shown.map(e => {
          const isOpen = openId === e.id;
          const openRow = () => {
            setOpenId(isOpen ? null : e.id);
            if (!isOpen && !e.is_read) markRead.mutate({ id: e.id, read: true });
          };
          return (
            <Row key={e.id}>
              <Cell>
                <button className="text-left" onClick={openRow}>
                  <span className={e.is_read ? 'text-muted-foreground' : 'font-semibold'}>
                    {e.from_name || e.from_email}
                  </span>
                  {e.lead_company && <span className="text-xs text-muted-foreground"> · {e.lead_company}</span>}
                  {!e.is_read && <Badge className="ml-2 bg-primary text-primary-foreground text-[10px] px-1.5">New</Badge>}
                </button>
              </Cell>
              <Cell mono>{e.to_email}</Cell>
              <Cell>
                <button className="text-left hover:text-primary" onClick={openRow}>
                  {e.subject || <span className="text-muted-foreground">(no subject)</span>}
                </button>
                {e.replied_at && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Replied {timeAgo(e.replied_at)} as {REPLY_IDENTITIES.find(i => i.key === e.reply_identity)?.label.split(' ·')[0] || e.reply_identity}
                  </div>
                )}
                {isOpen && (
                  <div className="mt-3 max-w-xl space-y-3">
                    <div className="rounded-lg bg-muted/50 p-3 text-xs whitespace-pre-wrap">
                      {e.body_text || (e.body_html ? 'This email has no plain-text version. Only HTML, not shown here.' : 'No body was captured for this email.')}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markRead.mutate({ id: e.id, read: !e.is_read })}
                      >
                        Mark {e.is_read ? 'unread' : 'read'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (replyingId === e.id) { setReplyingId(null); return; }
                          setReplyingId(e.id);
                          setReplyText('');
                          setReplyIdentity('support');
                        }}
                      >
                        {replyingId === e.id ? 'Cancel reply' : 'Reply'}
                      </Button>
                    </div>

                    {replyingId === e.id && (
                      <div className="rounded-lg border border-border/60 bg-card p-3 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {REPLY_IDENTITIES.map(idn => (
                            <button
                              key={idn.key}
                              onClick={() => setReplyIdentity(idn.key)}
                              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                                replyIdentity === idn.key ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card text-muted-foreground border-border/60 hover:text-foreground'}`}
                            >
                              {idn.label}
                            </button>
                          ))}
                        </div>
                        <Textarea
                          value={replyText}
                          onChange={ev => setReplyText(ev.target.value)}
                          rows={5}
                          placeholder={`Write your reply to ${e.from_email}. A signature is added automatically.`}
                        />
                        <p className="text-xs text-muted-foreground">
                          Sends to {e.from_email} as {REPLY_IDENTITIES.find(i => i.key === replyIdentity)?.label}.
                        </p>
                        <Button size="sm" disabled={sending || !replyText.trim()} onClick={() => sendReply(e)}>
                          {sending ? 'Sending' : 'Send reply'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Cell>
              <Cell>{timeAgo(e.created_at)}</Cell>
            </Row>
          );
        })}
      </Table>
    </div>
  );
}

/* ────────────────────────────── EMAIL (unified) ────────────────────────────── */
// v3.113.0 — one place for everything AYN's email touches: what came in
// (EmailReceivedPane, née InboxPane) and what went out (EmailSentPane, née
// EmailPane), instead of two separately-named panes an admin had to know to
// check both of. Both halves are unchanged internally; this just switches
// between them and shows counts from both at a glance.
export function EmailPane() {
  const [tab, setTab] = useState<'received' | 'sent'>('received');
  const inboxQuery = useAdminInbox();
  const emailLogQuery = useAdminEmailLog();

  const inbox: any = inboxQuery.data || {};
  const sentRows: any[] = (emailLogQuery.data as any) || [];
  const sentFailed = sentRows.filter(r => r.status === 'failed').length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Received" value={inbox.total ?? '—'} hint={`${inbox.unread ?? 0} unread`} />
        <Stat label="Sent" value={emailLogQuery.isLoading ? '—' : sentRows.length} accent hint="Automatic + broadcasts + replies" />
        {sentFailed > 0 && <Stat label="Failed to send" value={sentFailed} />}
        <Stat label="Addresses in use" value={(inbox.addresses || []).length} hint={(inbox.addresses || []).map((a: any) => a.to_email).join(', ') || '—'} />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab('received')}
          className={`px-3.5 py-1.5 rounded-full text-sm border transition-colors ${
            tab === 'received' ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card text-muted-foreground border-border/60 hover:text-foreground'}`}
        >
          Received
        </button>
        <button
          onClick={() => setTab('sent')}
          className={`px-3.5 py-1.5 rounded-full text-sm border transition-colors ${
            tab === 'sent' ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card text-muted-foreground border-border/60 hover:text-foreground'}`}
        >
          Sent
        </button>
      </div>

      {tab === 'received' ? <EmailReceivedPane /> : <EmailSentPane />}
    </div>
  );
}

/* ────────────────────────────── SETTINGS ────────────────────────────── */
// v3.27.0 — the config controls that used to live here wrote keys nothing read.
// Maintenance is the Kill switches pane and nothing else. Employer approval is
// unconditional. Credits come from the plans table. Login attempts and session
// length belong to Supabase auth and cannot be set from here. All of it is gone,
// so what is left is the one setting this pane can genuinely change.
export function SettingsPane({ onGoToFlags }: { onGoToFlags?: () => void }) {
  const [currentPin, setCurrentPin] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pinSaving, setPinSaving] = useState(false);

  const changePin = async () => {
    if (!/^\d{4,6}$/.test(currentPin)) { toast.error('Enter the current PIN'); return; }
    if (!/^\d{4,6}$/.test(pin)) { toast.error('PIN must be 4 to 6 digits'); return; }
    if (pin !== confirm) { toast.error('PINs do not match'); return; }
    setPinSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-auth-pin', {
        body: { action: 'set', pin: currentPin, new_pin: pin },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Could not update the PIN');
      toast.success('Admin PIN updated');
      setCurrentPin(''); setPin(''); setConfirm('');
    } catch (e) {
      toast.error((e as Error).message || 'Could not update the PIN');
    } finally {
      setPinSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <Card className="border border-border/60 bg-card">
        <CardContent className="p-5 space-y-4">
          <div>
            <h3 className="font-semibold">Admin PIN</h3>
            <p className="text-sm text-muted-foreground">The second gate after sign in. Four to six digits. The current PIN is required to change it.</p>
          </div>
          <Input value={currentPin} onChange={e => setCurrentPin(e.target.value.replace(/\D/g, ''))} maxLength={6} type="password" placeholder="Current PIN" />
          <div className="grid grid-cols-2 gap-3">
            <Input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} maxLength={6} type="password" placeholder="New PIN" />
            <Input value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, ''))} maxLength={6} type="password" placeholder="Confirm PIN" />
          </div>
          <Button variant="outline" onClick={changePin} disabled={pinSaving || !currentPin || !pin || !confirm}>
            {pinSaving ? 'Updating' : 'Update PIN'}
          </Button>
        </CardContent>
      </Card>

      <Card className="border border-border/60 bg-card">
        <CardContent className="p-5 space-y-3">
          <div>
            <h3 className="font-semibold">Maintenance lives in Kill switches</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              There is one maintenance mechanism and it is the Kill switches pane. Turning off Whole platform stops every signed in surface,
              on the server as well as in the app, and shows people the note you write there.
            </p>
          </div>
          {onGoToFlags && <Button variant="outline" onClick={onGoToFlags}>Open Kill switches</Button>}
          <p className="text-xs text-muted-foreground leading-relaxed">
            Employer approval is always required, credit allowances come from the plans table, and sign in attempts and session length are
            owned by Supabase auth. None of those are settings here any more, because setting them here changed nothing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

