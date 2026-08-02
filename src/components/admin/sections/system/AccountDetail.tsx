// v3.28.0 — one account, opened from the Accounts pane.
// Read only picture of the person on the left, moderation on the right.
// Nothing here signs in as anyone, and nothing reads assessment results.
// v3.29.0 adds per account limit overrides and the erase and purge levers.
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ShieldAlert, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react';
import {
  useAdminAccountDetail, useAccountModeration,
  useAccountGovernance, useAccountGovernanceActions,
} from '@/admin-app/hooks/useAdminQuery';
import { LoadingBlock, ErrorBlock, when } from '../ui';

const CAPABILITIES: Array<{ key: string; label: string; blurb: string }> = [
  { key: 'discovery', label: 'Talent pool discovery', blurb: 'Cannot appear in employer searches.' },
  { key: 'proposals', label: 'Sending proposals', blurb: 'An employer account cannot send proposals.' },
  { key: 'assessments', label: 'Assessments', blurb: 'An employer account cannot generate or send assessments.' },
  { key: 'ai', label: 'AI features', blurb: 'Cannot spend credits on tailoring, cover letters, scoring or Ask AYN.' },
];

const LIMIT_FIELDS: Array<{ key: 'proposals_limit' | 'assessments_limit' | 'searches_limit' | 'monthly_credits'; label: string }> = [
  { key: 'proposals_limit', label: 'Proposals per period' },
  { key: 'assessments_limit', label: 'Assessments per period' },
  { key: 'searches_limit', label: 'Candidate searches per period' },
  { key: 'monthly_credits', label: 'Credits granted per period' },
];

/** Empty box means fall back to the plan. A typed 0 is a real zero. */
const toNumberOrNull = (raw: string): number | null => {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};
const fromValue = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
const showLimit = (v: number | null | undefined) => (v === null || v === undefined ? 'No limit' : String(v));


const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-border/40 last:border-0">
    <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-right">{value ?? '—'}</span>
  </div>
);

const yesNo = (v: unknown) => (v ? 'Yes' : 'No');

export function AccountDetailDialog({
  userId, open, onOpenChange,
}: { userId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const query = useAdminAccountDetail(open ? userId : null);
  const { suspend, restore, setRestriction } = useAccountModeration(userId);
  const gov = useAccountGovernance(open ? userId : null);
  const { setOverride, clearOverride, erase, purge } = useAccountGovernanceActions(userId);

  const [reason, setReason] = useState('');
  const [until, setUntil] = useState('');
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [pendingCap, setPendingCap] = useState<{ key: string; label: string } | null>(null);
  const [capReason, setCapReason] = useState('');
  const [confirmLift, setConfirmLift] = useState<{ key: string; label: string } | null>(null);

  // limit override form
  const [ov, setOv] = useState<Record<string, string>>({});
  const [ovReason, setOvReason] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  // erase and purge
  const [danger, setDanger] = useState<'erase' | 'purge' | null>(null);
  const [dangerStep, setDangerStep] = useState(1);
  const [dangerReason, setDangerReason] = useState('');
  const [dangerEmail, setDangerEmail] = useState('');

  const d = query.data as any;
  const g = gov.data as any;
  const override = g?.override || null;
  const erasure = g?.erasure || null;
  const restrictions: any[] = d?.restrictions || [];
  const has = (k: string) => restrictions.some(r => r.capability === k);
  const restrictionOf = (k: string) => restrictions.find(r => r.capability === k);
  const suspension = d?.suspension || null;
  const isAdmin = d?.system_role === 'admin';

  useEffect(() => {
    setOv({
      proposals_limit: fromValue(override?.proposals_limit),
      assessments_limit: fromValue(override?.assessments_limit),
      searches_limit: fromValue(override?.searches_limit),
      monthly_credits: fromValue(override?.monthly_credits),
    });
    setOvReason(override?.reason || '');
  }, [override?.proposals_limit, override?.assessments_limit, override?.searches_limit, override?.monthly_credits, override?.reason]);

  const closeDanger = () => { setDanger(null); setDangerStep(1); setDangerReason(''); setDangerEmail(''); };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85dvh] overflow-y-auto overscroll-contain bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {d?.display_name || 'Account'}
              {isAdmin && <Badge className="bg-primary text-primary-foreground text-[10px]">Admin</Badge>}
              {suspension && <Badge variant="destructive" className="text-[10px]">Suspended</Badge>}
              {override && <Badge variant="outline" className="text-[10px]">Limit override</Badge>}
              {erasure && <Badge variant="destructive" className="text-[10px]">{erasure.purged_at ? 'Purged' : 'Erased'}</Badge>}
            </DialogTitle>

            <DialogDescription>{d?.email || 'Loading the account'}</DialogDescription>
          </DialogHeader>

          {query.isLoading && <LoadingBlock />}
          {query.error && <ErrorBlock error={query.error} onRetry={() => query.refetch()} />}

          {d && (
            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-5">
                <Card className="border border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2">How they signed up</p>
                    <Field label="Provider" value={d.provider} />
                    <Field label="All providers" value={(d.providers || []).join(', ') || d.provider} />
                    <Field label="Email confirmed" value={d.email_confirmed_at ? when(d.email_confirmed_at) : 'Not confirmed'} />
                    <Field label="Signed up" value={when(d.signed_up_at)} />
                    <Field label="Last sign in" value={when(d.last_sign_in_at)} />
                    <Field label="Active sessions" value={d.sign_in_count} />
                  </CardContent>
                </Card>

                <Card className="border border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2">What they have done</p>
                    <Field label="Resume uploaded" value={yesNo(d.has_resume)} />
                    <Field label="Profile completeness" value={`${d.profile_completeness ?? 0}%`} />
                    <Field label="Discoverable" value={yesNo(d.discoverable)} />
                    <Field label="Saved jobs" value={d.saved_jobs} />
                    <Field label="Proposals received" value={d.proposals_received} />
                    <Field label="Proposals sent" value={d.proposals_sent} />
                    <Field label="Assessments received" value={d.assessments_received} />
                    <Field label="Assessments taken" value={d.assessments_taken} />
                    <Field label="Credits balance" value={d.credits_balance} />
                    <Field label="Credits spent" value={d.credits_spent} />
                  </CardContent>
                </Card>

                <Card className="border border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2">Account state</p>
                    <Field label="System role" value={d.system_role} />
                    <Field label="Account type" value={d.account_role} />
                    <Field label="Employer status" value={d.employer_status || 'Not an employer'} />
                    <Field label="Company" value={d.company_name || '—'} />
                    <Field label="Plan" value={`${d.plan_key}${d.sub_status ? ` / ${d.sub_status}` : ''}`} />
                  </CardContent>
                </Card>

                {/* v3.33.0 — what this person accepted, and when. A record
                    that captured no acceptance says so in words. */}
                <Card className="border border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2">Legal consent</p>
                    {d.legal_consent && d.legal_consent.terms_accepted && d.legal_consent.terms_version ? (
                      <>
                        <Field label="Status" value="Recorded" />
                        <Field label="Terms version" value={d.legal_consent.terms_version} />
                        <Field label="Privacy version" value={d.legal_consent.privacy_version || 'Not recorded'} />
                        <Field label="Accepted" value={when(d.legal_consent.accepted_at)} />
                        <Field label="IP address" value={d.legal_consent.ip_address || 'Not recorded'} />
                        <Field label="Recorded at" value={d.legal_consent.source || 'signup'} />
                        {(d.legal_consent_history || []).length > 1 && (
                          <div className="mt-3 pt-3 border-t border-border/60 space-y-1">
                            <p className="text-xs text-muted-foreground">Earlier acceptances</p>
                            {(d.legal_consent_history || []).slice(1).map((h: any, i: number) => (
                              <p key={i} className="text-xs text-muted-foreground">
                                Terms {h.terms_version || 'not recorded'}, privacy {h.privacy_version || 'not recorded'}, {when(h.accepted_at)}
                              </p>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <Field label="Status" value="Never captured" />
                        <p className="text-sm text-muted-foreground mt-2">
                          No acceptance was ever recorded for this account. The row on file
                          {d.legal_consent?.source ? ` (${d.legal_consent.source})` : ''} states that
                          plainly rather than claiming a version. This account should be asked to
                          accept the current Terms and Privacy Policy.
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>

              </div>


              <div className="space-y-5">
                <Card className="border border-border/60">
                  <CardContent className="p-4 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-2">
                      {suspension ? <ShieldAlert className="w-4 h-4 text-destructive" /> : <ShieldCheck className="w-4 h-4 text-primary" />}
                      Suspension
                    </p>

                    {suspension ? (
                      <div className="space-y-2">
                        <p className="text-sm">
                          Suspended {when(suspension.suspended_at)} by {suspension.suspended_by_email || 'an admin'}.
                        </p>
                        <p className="text-sm text-muted-foreground">Reason: {suspension.reason}</p>
                        <p className="text-sm text-muted-foreground">
                          {suspension.until ? `Until ${when(suspension.until)}` : 'Indefinite'}
                        </p>
                        <Button variant="outline" onClick={() => setConfirmRestore(true)} disabled={restore.isPending}>
                          {restore.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Restore account
                        </Button>
                      </div>
                    ) : isAdmin ? (
                      <p className="text-sm text-muted-foreground">An admin account cannot be suspended from here.</p>
                    ) : (
                      <div className="space-y-2">
                        <Textarea
                          value={reason}
                          onChange={e => setReason(e.target.value)}
                          placeholder="Why is this account being suspended? Required."
                          rows={3}
                        />
                        <div className="flex items-center gap-2">
                          <Input type="date" value={until} onChange={e => setUntil(e.target.value)} className="max-w-[180px]" />
                          <span className="text-xs text-muted-foreground">Leave empty for indefinite</span>
                        </div>
                        <Button
                          variant="destructive"
                          disabled={!reason.trim() || suspend.isPending}
                          onClick={() => setConfirmSuspend(true)}
                        >
                          {suspend.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Suspend account
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border border-border/60">
                  <CardContent className="p-4 space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide">Restrictions</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Switch off one capability without suspending the account. Enforced on the server.
                      </p>
                    </div>
                    {CAPABILITIES.map(c => {
                      const on = has(c.key);
                      const r = restrictionOf(c.key);
                      return (
                        <div key={c.key} className="flex items-start justify-between gap-3 border-b border-border/40 pb-3 last:border-0 last:pb-0">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{c.label}</p>
                            <p className="text-xs text-muted-foreground">{c.blurb}</p>
                            {on && r && (
                              <p className="text-xs text-destructive mt-1">
                                Restricted {when(r.created_at)} by {r.set_by_email || 'an admin'}. Reason: {r.reason}
                              </p>
                            )}
                          </div>
                          <Switch
                            checked={on}
                            disabled={isAdmin || setRestriction.isPending}
                            onCheckedChange={next => {
                              if (next) { setCapReason(''); setPendingCap({ key: c.key, label: c.label }); }
                              else setConfirmLift({ key: c.key, label: c.label });
                            }}
                          />
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card className={`border ${override ? 'border-primary/60' : 'border-border/60'}`}>
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4" />
                        Limits for this account
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Leave a box empty to use the plan. A typed 0 is a real zero and blocks the action.
                        An override stays in place through a plan change until you clear it.
                      </p>
                    </div>

                    {gov.isLoading && <p className="text-xs text-muted-foreground">Loading the limits</p>}

                    {g && (
                      <>
                        {override && (
                          <p className="text-xs text-primary">
                            Override set {when(override.set_at)} by {override.set_by_email || 'an admin'}. Reason: {override.reason}
                          </p>
                        )}
                        <div className="space-y-2">
                          {LIMIT_FIELDS.map(f => (
                            <div key={f.key} className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{f.label}</p>
                                <p className="text-xs text-muted-foreground">
                                  Plan {showLimit(g.plan?.[f.key])} · in force {showLimit(g.effective?.[f.key])}
                                </p>
                              </div>
                              <Input
                                value={ov[f.key] ?? ''}
                                onChange={e => setOv(s => ({ ...s, [f.key]: e.target.value.replace(/[^0-9]/g, '') }))}
                                placeholder="Plan"
                                inputMode="numeric"
                                className="w-24 text-right"
                              />
                            </div>
                          ))}
                        </div>
                        <Textarea
                          value={ovReason}
                          onChange={e => setOvReason(e.target.value)}
                          rows={2}
                          placeholder="Why does this account get different numbers? Required."
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            disabled={
                              !ovReason.trim() || setOverride.isPending ||
                              LIMIT_FIELDS.every(f => toNumberOrNull(ov[f.key] ?? '') === null)
                            }
                            onClick={() => setOverride.mutate({
                              proposals_limit: toNumberOrNull(ov.proposals_limit ?? ''),
                              assessments_limit: toNumberOrNull(ov.assessments_limit ?? ''),
                              searches_limit: toNumberOrNull(ov.searches_limit ?? ''),
                              monthly_credits: toNumberOrNull(ov.monthly_credits ?? ''),
                              reason: ovReason.trim(),
                            })}
                          >
                            {setOverride.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Save override
                          </Button>
                          {override && (
                            <Button variant="outline" disabled={clearOverride.isPending} onClick={() => setConfirmClear(true)}>
                              Clear override
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="border border-destructive/50">
                  <CardContent className="p-4 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-2 text-destructive">
                      <Trash2 className="w-4 h-4" />
                      Erasure
                    </p>
                    {isAdmin ? (
                      <p className="text-sm text-muted-foreground">An admin account cannot be erased from here.</p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Erase removes the person from the product: resume, profile, saved jobs, tailored documents,
                          talent pool entry, extension tokens and learned answers are deleted, and the login is disabled.
                          What is kept, and why: the credit ledger and the subscription record for accounting, and the
                          proposals and assessments an employer sent them so the employer's own history stays intact,
                          with the candidate reduced to an opaque reference carrying no name, email or phone.
                        </p>
                        {erasure ? (
                          <div className="space-y-2">
                            <p className="text-sm">
                              Erased {when(erasure.erased_at)}. Reason: {erasure.reason}
                            </p>
                            {erasure.purged_at ? (
                              <p className="text-sm text-muted-foreground">
                                Purged {when(erasure.purged_at)}. Nothing is left to act on.
                              </p>
                            ) : (
                              <Button
                                variant="destructive"
                                onClick={() => { setDangerReason(''); setDangerEmail(''); setDangerStep(1); setDanger('purge'); }}
                              >
                                Purge the login record
                              </Button>
                            )}
                          </div>
                        ) : (
                          <Button
                            variant="destructive"
                            onClick={() => { setDangerReason(''); setDangerEmail(''); setDangerStep(1); setDanger('erase'); }}
                          >
                            Erase this account
                          </Button>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>


                {(d.suspension_history || []).length > 0 && (
                  <Card className="border border-border/60">
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide mb-2">History</p>
                      {(d.suspension_history || []).map((h: any, i: number) => (
                        <div key={i} className="text-xs text-muted-foreground py-1.5 border-b border-border/40 last:border-0">
                          {when(h.suspended_at)} to {h.restored_at ? when(h.restored_at) : 'now'} : {h.reason}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* confirmations */}
      <AlertDialog open={confirmSuspend} onOpenChange={setConfirmSuspend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend this account?</AlertDialogTitle>
            <AlertDialogDescription>
              They will be blocked from signing in and every AYN request will be refused
              {until ? ` until ${until}` : ' until an admin restores the account'}. The reason is recorded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => suspend.mutate(
                { reason: reason.trim(), until: until ? new Date(until).toISOString() : null },
                { onSuccess: () => { setReason(''); setUntil(''); } },
              )}
            >
              Suspend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this account?</AlertDialogTitle>
            <AlertDialogDescription>They can sign in and use AYN again. This is recorded.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => restore.mutate()}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingCap} onOpenChange={v => !v && setPendingCap(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restrict {pendingCap?.label.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              A reason is required and is recorded with your name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={capReason} onChange={e => setCapReason(e.target.value)} rows={3} placeholder="Reason" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!capReason.trim()}
              onClick={() => {
                if (!pendingCap) return;
                setRestriction.mutate({ capability: pendingCap.key, on: true, reason: capReason.trim() });
                setPendingCap(null);
              }}
            >
              Restrict
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmLift} onOpenChange={v => !v && setConfirmLift(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lift this restriction?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmLift?.label} becomes available to this account again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmLift) return;
                setRestriction.mutate({ capability: confirmLift.key, on: false });
                setConfirmLift(null);
              }}
            >
              Lift
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the override?</AlertDialogTitle>
            <AlertDialogDescription>
              This account goes back to the numbers its plan gives everyone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { clearOverride.mutate(); setConfirmClear(false); }}>
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* erase, two confirmations, and purge, one */}
      <AlertDialog open={!!danger} onOpenChange={v => !v && closeDanger()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {danger === 'purge'
                ? 'Purge this account for good?'
                : dangerStep === 1 ? 'Erase this account?' : 'Type the email to confirm'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {danger === 'purge'
                ? 'The login record itself is removed. This cannot be undone and there is nothing to restore afterwards.'
                : dangerStep === 1
                  ? 'Deleted: resume, profile, saved jobs, tailored documents, talent pool entry, extension tokens and learned answers. Kept: the credit ledger and subscription for accounting, and the proposals and assessments the person received so the employer history stays whole, with the candidate reduced to an opaque reference. The login is disabled.'
                  : 'Type the account email exactly as it appears on the account. Nothing is filled in for you.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {(danger === 'purge' || dangerStep === 2) && (
            <div className="space-y-2">
              <Textarea
                value={dangerReason}
                onChange={e => setDangerReason(e.target.value)}
                rows={2}
                placeholder="Reason. Required and recorded."
              />
              <Input
                value={dangerEmail}
                onChange={e => setDangerEmail(e.target.value)}
                placeholder="Account email"
                autoComplete="off"
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeDanger}>Cancel</AlertDialogCancel>
            {danger === 'erase' && dangerStep === 1 ? (
              <Button variant="destructive" onClick={() => setDangerStep(2)}>Continue</Button>
            ) : (
              <Button
                variant="destructive"
                disabled={!dangerReason.trim() || !dangerEmail.trim() || erase.isPending || purge.isPending}
                onClick={() => {
                  const v = { reason: dangerReason.trim(), confirmEmail: dangerEmail.trim() };
                  if (danger === 'purge') purge.mutate(v, { onSuccess: closeDanger });
                  else erase.mutate(v, { onSuccess: closeDanger });
                }}
              >
                {(erase.isPending || purge.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {danger === 'purge' ? 'Purge' : 'Erase'}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>

  );
}
