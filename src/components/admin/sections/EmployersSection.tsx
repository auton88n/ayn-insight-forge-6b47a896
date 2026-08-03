// v3.20.0 EMPLOYERS — the approval queue is the only gate into the pool.
import { useState } from 'react';
import { useAdminEmployers, useEmployerAction } from '@/admin-app/hooks/useAdminQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Building2, ExternalLink } from 'lucide-react';
import { SectionHeader, LoadingBlock, ErrorBlock, EmptyRow, when } from './ui';

export default function EmployersSection() {
  const q = useAdminEmployers();
  const act = useEmployerAction();
  const [declining, setDeclining] = useState<any | null>(null);
  const [note, setNote] = useState('');
  const [overriding, setOverriding] = useState<any | null>(null);
  const [planKey, setPlanKey] = useState('');
  const [extendDays, setExtendDays] = useState('');

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = (q.data || {}) as any;
  const pending: any[] = d.pending || [];
  const active: any[] = d.active || [];
  const plans: any[] = d.plans || [];

  return (
    <div>
      <SectionHeader title="Employers" subtitle="Approving an employer starts their free month and unlocks candidate search." />

      <Card className="border border-border/60 bg-card mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Waiting for approval
            {pending.length > 0 && <Badge className="bg-primary text-primary-foreground">{pending.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 ? <EmptyRow>Nothing in the queue.</EmptyRow> : pending.map(e => (
            <div key={e.user_id} className="rounded-xl border border-border/60 p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    {e.company_name || 'Unnamed company'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{e.requester_email} · asked {when(e.requested_at)}</p>
                  <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                    {e.industry && <p>Industry: {e.industry}</p>}
                    {e.headquarters && <p>Headquarters: {e.headquarters}</p>}
                    {e.company_size && <p>Size: {e.company_size}</p>}
                    {e.hiring_need && <p>Hiring need: {e.hiring_need}</p>}
                    {e.website && (
                      <a href={e.website} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                        {e.website} <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  {e.about && <p className="text-xs text-muted-foreground mt-2 max-w-2xl leading-relaxed">{e.about}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" disabled={act.isPending}
                    onClick={() => act.mutate({ fn: 'admin_employer_approve', params: { p_user_id: e.user_id } })}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setDeclining(e); setNote(''); }}>Decline</Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border border-border/60 bg-card">
        <CardHeader className="pb-3"><CardTitle className="text-base">Approved, declined and suspended</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {active.length === 0 ? <EmptyRow>No employers yet.</EmptyRow> : active.map(e => (
            <div key={e.user_id} className="rounded-xl border border-border/60 p-4 flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="font-semibold flex items-center gap-2">
                  {e.company_name || 'Unnamed company'}
                  <Badge variant="secondary" className="text-[10px] uppercase">{e.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{e.requester_email} · approved {when(e.approved_at)}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {e.plan_name || e.plan_key} · proposals {e.proposals_used ?? 0}/{e.proposals_limit ?? '∞'} · assessments {e.assessments_used ?? 0}/{e.assessments_limit ?? '∞'} · searches {e.searches_used ?? 0}/{e.searches_limit ?? '∞'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.trial_ends_at ? `Free month ends ${when(e.trial_ends_at)}` : `Period ends ${when(e.current_period_end)}`}
                </p>
                {e.internal_note && <p className="text-xs text-muted-foreground mt-2 italic">Note: {e.internal_note}</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => { setOverriding(e); setPlanKey(e.plan_key || ''); setExtendDays(''); }}>
                  Change plan
                </Button>
                {e.status === 'approved' ? (
                  <Button size="sm" variant="outline" onClick={() => { setDeclining(e); setNote(''); }}>Suspend</Button>
                ) : (
                  <Button size="sm" disabled={act.isPending}
                    onClick={() => act.mutate({ fn: 'admin_employer_approve', params: { p_user_id: e.user_id } })}>
                    Reinstate
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!declining} onOpenChange={o => !o && setDeclining(null)}>
        <DialogContent className="bg-background">
          <DialogHeader><DialogTitle>Decline {declining?.company_name || 'this employer'}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">The reason is internal. The employer is not emailed from here.</p>
          <Textarea value={note} onChange={e => setNote(e.target.value)} rows={4} placeholder="Why are you declining?" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclining(null)}>Cancel</Button>
            <Button disabled={!note.trim() || act.isPending}
              onClick={() => { act.mutate({ fn: 'admin_employer_decline', params: { p_user_id: declining.user_id, p_note: note.trim() } }); setDeclining(null); }}>
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!overriding} onOpenChange={o => !o && setOverriding(null)}>
        <DialogContent className="bg-background">
          <DialogHeader><DialogTitle>Plan for {overriding?.company_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={planKey} onValueChange={setPlanKey}>
              <SelectTrigger><SelectValue placeholder="Choose a plan" /></SelectTrigger>
              <SelectContent className="bg-popover">
                {plans.map(p => (
                  <SelectItem key={p.key} value={p.key}>{p.name} · ${(p.price_cents / 100).toFixed(0)}/mo</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              value={extendDays} onChange={e => setExtendDays(e.target.value.replace(/\D/g, ''))}
              placeholder="Extend by days (optional)"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverriding(null)}>Cancel</Button>
            <Button disabled={act.isPending}
              onClick={() => {
                act.mutate({ fn: 'admin_employer_override', params: {
                  p_user_id: overriding.user_id,
                  p_plan_key: planKey || null,
                  p_extend_days: extendDays ? Number(extendDays) : null,
                } });
                setOverriding(null);
              }}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
