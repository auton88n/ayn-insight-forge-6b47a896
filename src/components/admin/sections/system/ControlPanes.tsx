// v3.23.0 — admin controls that were missing: moderation of what employers send,
// feature kill switches, and credit adjustments with a read only user snapshot.
// Every pane calls a real admin-only RPC. Nothing here is decorative.
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  useAdminModeration, useModerateItem,
  useAdminFeatureFlags, useSetFeatureFlag, useSetFeatureMessage,
  useAdjustCredits, useUserSnapshot, useAdminAccounts,
  useAdminAdmins, useSetAdminRole,
} from '@/admin-app/hooks/useAdminQuery';

import { Stat, LoadingBlock, ErrorBlock, EmptyRow, when } from '../ui';

/* ───────────────────────────── MODERATION ───────────────────────────── */
export function ModerationPane() {
  const q = useAdminModeration();
  const moderate = useModerateItem();
  const [tab, setTab] = useState<'proposals' | 'assessments'>('proposals');

  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;

  const d = (q.data || {}) as any;
  const proposals: any[] = d.proposals || [];
  const assessments: any[] = d.assessments || [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Proposals shown" value={proposals.length} hint="Most recent first" />
        <Stat label="Pending" value={proposals.filter(p => p.status === 'pending').length} accent />
        <Stat label="Assessments shown" value={assessments.length} />
        <Stat label="Live assessments" value={assessments.filter(a => a.status === 'sent' || a.status === 'started').length} />
      </div>

      <div className="flex gap-2">
        {(['proposals', 'assessments'] as const).map(t => (
          <Button key={t} size="sm" variant={tab === t ? 'default' : 'outline'} onClick={() => setTab(t)} className="capitalize">
            {t}
          </Button>
        ))}
      </div>

      {tab === 'proposals' && (
        <div className="space-y-3">
          {proposals.length === 0 && <EmptyRow>No proposals yet.</EmptyRow>}
          {proposals.map(p => (
            <Card key={p.id} className="border border-border/60 bg-card">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{p.job_title || 'Untitled role'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.company || 'Unknown company'} · {p.job_location || 'no location'} · {when(p.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={p.status === 'pending' ? 'default' : 'secondary'} className="text-[10px] capitalize">{p.status}</Badge>
                    {p.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={moderate.isPending}
                        onClick={() => moderate.mutate({ kind: 'proposal', id: p.id, note: 'cancelled by admin' })}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
                {p.message && (
                  <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed border-l-2 border-border/60 pl-3">
                    {p.message}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === 'assessments' && (
        <div className="space-y-3">
          {assessments.length === 0 && <EmptyRow>No assessments yet.</EmptyRow>}
          {assessments.map(a => (
            <Card key={a.id} className="border border-border/60 bg-card">
              <CardContent className="p-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{a.job_title || 'Untitled role'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {a.company || 'Unknown company'} · {a.question_count} questions · {when(a.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className="text-[10px] capitalize">{a.status}</Badge>
                  {(a.status === 'sent' || a.status === 'started') && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={moderate.isPending}
                      onClick={() => moderate.mutate({ kind: 'assessment', id: a.id, note: 'expired by admin' })}
                    >
                      Expire
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── FEATURE SWITCHES ───────────────────────── */
const FLAGS: { key: string; label: string; hint: string }[] = [
  { key: 'platform', label: 'Whole platform', hint: 'Turning this off puts every signed in surface into maintenance' },
  { key: 'candidate_search', label: 'Candidate search', hint: 'Employers can run a search against the pool' },
  { key: 'proposals', label: 'Job proposals', hint: 'Employers can send proposals to candidates' },
  { key: 'assessments', label: 'Assessments', hint: 'Employers can generate and send assessments' },
  { key: 'tailoring', label: 'Tailored documents', hint: 'Seekers can spend credits on resumes and cover letters' },
  { key: 'signups', label: 'New signups', hint: 'New accounts can be created' },
];

export function FlagsPane() {
  const q = useAdminFeatureFlags();
  const set = useSetFeatureFlag();
  const setMsg = useSetFeatureMessage();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;

  const d = (q.data || {}) as any;
  const flags = d.flags || {};
  const messages = d.messages || {};
  const defaults = d.defaults || {};
  const value = (k: string) => (k in flags ? !!flags[k] : defaults[k] !== false);
  const msg = (k: string) => (k in drafts ? drafts[k] : (messages[k] || ''));

  return (
    <div className="space-y-4">
      <Card className="border border-border/60 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Kill switches</CardTitle>
          <p className="text-xs text-muted-foreground">
            Turning one off stops that part of the product for everyone, in the app and on the server, and shows people a maintenance notice.
            Every change is written to the security audit log.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border/60">
            {FLAGS.map(f => {
              const on = value(f.key);
              return (
                <div key={f.key} className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <Label className="text-sm font-medium">{f.label}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{f.hint}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-xs font-medium ${on ? 'text-primary' : 'text-muted-foreground'}`}>
                        {on ? 'On' : 'Under maintenance'}
                      </span>
                      <Switch
                        checked={on}
                        disabled={set.isPending}
                        onCheckedChange={c => {
                          // v3.46.0 — turning OFF takes real effect for every
                          // signed in user immediately, with no undo button
                          // beyond flipping it back on. Only gate the
                          // dangerous direction; turning something back on
                          // restores service and needs no confirmation.
                          if (!c && !window.confirm(
                            `Turn off "${f.label}"?\n\n${f.hint}.\n\nThis takes effect right now for every user, not just new ones.`
                          )) return;
                          set.mutate({ key: f.key, enabled: c });
                        }}
                      />
                    </div>
                  </div>

                  {!on && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        value={msg(f.key)}
                        maxLength={300}
                        placeholder="What people see while this is off. Leave empty for the standard notice."
                        onChange={e => setDrafts(s => ({ ...s, [f.key]: e.target.value }))}
                      />
                      <Button
                        variant="outline"
                        disabled={setMsg.isPending}
                        onClick={() => setMsg.mutate({ key: f.key, message: msg(f.key) })}
                      >
                        Save note
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


/* ──────────────────────────── CREDITS / USER ────────────────────────── */
export function CreditsPane() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const accounts = useAdminAccounts(q);
  const snapshot = useUserSnapshot(selected);
  const adjust = useAdjustCredits();

  const rows: any[] = (accounts.data as any)?.rows || [];
  const snap = (snapshot.data || {}) as any;

  const submit = (sign: 1 | -1) => {
    const n = Math.abs(parseInt(amount, 10));
    if (!selected || !n) return;
    adjust.mutate(
      { userId: selected, amount: sign * n, reason: reason.trim() || 'admin adjustment' },
      { onSuccess: () => { setAmount(''); setReason(''); snapshot.refetch(); } },
    );
  };

  return (
    <div className="space-y-5">
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setQ(search.trim()); }}>
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a person by email, name or company" className="max-w-sm" />
        <Button type="submit" variant="outline">Search</Button>
      </form>

      {accounts.isLoading ? <LoadingBlock /> : (
        <Card className="border border-border/60 bg-card">
          <CardContent className="p-0 max-h-64 overflow-y-auto">
            {rows.length === 0 ? <EmptyRow>No accounts match.</EmptyRow> : (
              <div className="divide-y divide-border/60">
                {rows.slice(0, 40).map(r => (
                  <button
                    key={r.user_id}
                    onClick={() => setSelected(r.user_id)}
                    className={`w-full text-left px-5 py-3 flex items-center justify-between gap-3 hover:bg-muted/40 ${selected === r.user_id ? 'bg-muted/60' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.display_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{r.credits} credits</Badge>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border border-border/60 bg-card">
            <CardHeader className="pb-3"><CardTitle className="text-base">Adjust credits</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="How many credits" inputMode="numeric" />
              <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason, for example refund for a failed tailoring run" rows={2} />
              <div className="flex gap-2">
                <Button disabled={adjust.isPending || !amount} onClick={() => submit(1)}>Grant</Button>
                <Button variant="outline" disabled={adjust.isPending || !amount} onClick={() => submit(-1)}>Deduct</Button>
              </div>
              <p className="text-xs text-muted-foreground">Both directions are written to the credit ledger and the security audit log.</p>
            </CardContent>
          </Card>

          <Card className="border border-border/60 bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Snapshot</CardTitle>
              <p className="text-xs text-muted-foreground">Read only. AYN never signs in as a user.</p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {snapshot.isLoading ? <p className="text-muted-foreground text-xs">Loading</p> : (
                <>
                  <Line k="Email" v={snap.email || '—'} />
                  <Line k="Credits" v={String(snap.credits ?? 0)} />
                  <Line k="Plan" v={snap.subscription?.plan_key ? `${snap.subscription.plan_key} / ${snap.subscription.status}` : 'none'} />
                  <Line k="Proposals" v={String(snap.proposals ?? 0)} />
                  <Line k="Assessments" v={String(snap.assessments ?? 0)} />
                  <Line k="Discoverable" v={snap.discoverable ? 'Yes' : 'No'} />
                  <Line k="Joined" v={when(snap.created_at)} />
                  <Line k="Last sign in" v={when(snap.last_sign_in_at)} />
                  <div className="pt-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Recent credit history</p>
                    {(snap.recent_credits || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nothing yet.</p>
                    ) : (
                      <div className="divide-y divide-border/40">
                        {(snap.recent_credits as any[]).slice(0, 8).map(c => (
                          <div key={c.id} className="py-1.5 flex items-center justify-between gap-3 text-xs">
                            <span className="text-muted-foreground truncate">{c.reason || 'credit'}</span>
                            <span className={`font-mono ${c.delta > 0 ? 'text-primary' : ''}`}>{c.delta > 0 ? `+${c.delta}` : c.delta}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-sm font-medium truncate">{v}</span>
    </div>
  );
}

/* ────────────────────────────── ADMINS ───────────────────────────────── */
// v3.46.0 — there was no screen to see who has admin access, or to give it
// to someone new, without editing the database directly. This is that
// screen: a list of current admins plus a small search-and-grant form.
export function AdminsPane() {
  const admins = useAdminAdmins();
  const setRole = useSetAdminRole();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<{ id: string; email: string } | null>(null);
  const [reason, setReason] = useState('');

  const accounts = useAdminAccounts(q);

  if (admins.isLoading) return <LoadingBlock />;
  if (admins.error) return <ErrorBlock error={admins.error} onRetry={() => admins.refetch()} />;

  const list: any[] = (admins.data as any) || [];
  const rows: any[] = (accounts.data as any)?.rows || [];
  const alreadyAdminIds = new Set(list.map(a => a.user_id));

  const grant = () => {
    if (!selected) return;
    if (!reason.trim()) { alert('A reason is required.'); return; }
    if (!window.confirm(`Give admin access to ${selected.email}?\n\nThey will be able to see and change everything in this panel, including other people's accounts, payments, and these same settings.`)) return;
    setRole.mutate(
      { userId: selected.id, grant: true, reason: reason.trim() },
      { onSuccess: () => { setSelected(null); setReason(''); setSearch(''); setQ(''); } },
    );
  };

  const revoke = (a: any) => {
    const why = window.prompt(`Why are you removing admin access from ${a.email}?`);
    if (!why || !why.trim()) return;
    setRole.mutate({ userId: a.user_id, grant: false, reason: why.trim() });
  };

  return (
    <div className="space-y-5">
      <Card className="border border-border/60 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Who has admin access</CardTitle>
          <p className="text-xs text-muted-foreground">
            Anyone on this list can see and change everything in this panel. Keep it short.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {list.length === 0 ? <EmptyRow>Nobody has admin access. That shouldn't be possible.</EmptyRow> : (
            <div className="divide-y divide-border/60">
              {list.map(a => (
                <div key={a.user_id} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-2">
                      {a.email}
                      {a.is_you && <Badge variant="secondary" className="text-[10px]">You</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Given admin {when(a.granted_at)} · last signed in {when(a.last_sign_in_at)}
                    </p>
                  </div>
                  {!a.is_you && (
                    <Button size="sm" variant="outline" disabled={setRole.isPending} onClick={() => revoke(a)}>
                      Remove access
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border border-border/60 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Give someone admin access</CardTitle>
          <p className="text-xs text-muted-foreground">Search for their account first, then confirm.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setQ(search.trim()); }}>
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a person by email or name" />
            <Button type="submit" variant="outline">Search</Button>
          </form>

          {q && (
            <div className="rounded-lg border border-border/60 max-h-56 overflow-y-auto divide-y divide-border/60">
              {rows.length === 0 ? <EmptyRow>No accounts match.</EmptyRow> : rows.slice(0, 20).map(r => {
                const isAdmin = alreadyAdminIds.has(r.user_id);
                return (
                  <button
                    key={r.user_id}
                    disabled={isAdmin}
                    onClick={() => setSelected({ id: r.user_id, email: r.email })}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed ${selected?.id === r.user_id ? 'bg-muted/60' : ''}`}
                  >
                    <span className="text-sm truncate">{r.email}</span>
                    {isAdmin && <span className="text-xs text-muted-foreground shrink-0">Already admin</span>}
                  </button>
                );
              })}
            </div>
          )}

          {selected && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
              <p className="text-sm">Give admin access to <span className="font-medium">{selected.email}</span>?</p>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this person getting admin access?" rows={2} />
              <div className="flex gap-2">
                <Button size="sm" disabled={setRole.isPending || !reason.trim()} onClick={grant}>
                  {setRole.isPending ? 'Saving' : 'Grant admin access'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setSelected(null); setReason(''); }}>Cancel</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
