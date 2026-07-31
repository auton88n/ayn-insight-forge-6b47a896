// v3.22.0 — SYSTEM panes, written for AYN as it is now. Every pane reads a real
// admin RPC. Nothing here is a placeholder.
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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

      <Table head={['Person', 'Type', 'Plan', 'Credits', 'Discoverable', 'Joined', 'Last sign in']}>
        {rows.length === 0 && (
          <tr><td colSpan={7}><EmptyRow>No accounts match.</EmptyRow></td></tr>
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
          </Row>
        ))}
      </Table>
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
    const { error } = await supabase.rpc('admin_insert_ticket_message', {
      p_ticket_id: ticketId, p_content: text, p_sender: 'admin',
    });
    setSending(null);
    if (error) { toast.error(error.message); return; }
    setDrafts(d => ({ ...d, [ticketId]: '' }));
    toast.success('Reply sent');
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

  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock error={query.error} onRetry={() => query.refetch()} />;

  const last24 = errors.filter(e => Date.now() - new Date(e.created_at).getTime() < 86400000).length;

  return (
    <div className="space-y-5">
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
export function EmailPane() {
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

      <Card className="border border-border/60 bg-card">
        <CardContent className="p-5 space-y-4">
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

/* ────────────────────────────── SETTINGS ────────────────────────────── */
export function SettingsPane({
  systemConfig,
  onUpdateConfig,
}: {
  systemConfig: any;
  onUpdateConfig: (updates: any) => Promise<void>;
}) {
  const [local, setLocal] = useState(systemConfig);
  const [saving, setSaving] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pinSaving, setPinSaving] = useState(false);

  const dirty = JSON.stringify(local) !== JSON.stringify(systemConfig);

  const save = async () => {
    setSaving(true);
    try { await onUpdateConfig(local); } finally { setSaving(false); }
  };

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
        <CardContent className="p-5 space-y-5">
          <div>
            <h3 className="font-semibold">Maintenance</h3>
            <p className="text-sm text-muted-foreground">Turn the product off for everyone while you work on it.</p>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="maint">Maintenance mode</Label>
            <Switch id="maint" checked={!!local.maintenanceMode}
              onCheckedChange={v => setLocal({ ...local, maintenanceMode: v })} />
          </div>
          <Textarea rows={3} value={local.maintenanceMessage || ''} placeholder="What people see while it is off"
            onChange={e => setLocal({ ...local, maintenanceMessage: e.target.value })} />
          <div className="flex items-center justify-between">
            <Label htmlFor="approval">Require employer approval</Label>
            <Switch id="approval" checked={!!local.requireApproval}
              onCheckedChange={v => setLocal({ ...local, requireApproval: v })} />
          </div>
          <Button onClick={save} disabled={!dirty || saving}>{saving ? 'Saving' : 'Save settings'}</Button>
        </CardContent>
      </Card>

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
    </div>
  );
}
