// v3.20.0 — small shared pieces for the new admin sections.
import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Mail } from 'lucide-react';

export function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Stat({ label, value, hint, accent, extra }: { label: string; value: ReactNode; hint?: string; accent?: boolean; extra?: ReactNode }) {
  return (
    <Card className="border border-border/60 bg-card">
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
        <p className={`text-2xl font-bold tracking-tight mt-1.5 ${accent ? 'text-primary' : ''}`}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        {extra && <div className="mt-2">{extra}</div>}
      </CardContent>
    </Card>
  );
}

export function LoadingBlock() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-4 rounded-2xl bg-destructive/10 mb-4"><AlertTriangle className="w-7 h-7 text-destructive" /></div>
      <p className="text-sm font-medium">Could not load this section</p>
      <p className="text-xs text-muted-foreground mt-1">{(error as Error)?.message || 'Unknown error'}</p>
      <button onClick={onRetry} className="mt-4 text-sm text-primary hover:underline">Try again</button>
    </div>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{children}</div>;
}

export const money = (cents: number) => `$${(Number(cents || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
export const whenTime = (v?: string | null) => (v ? new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
export const when = (v?: string | null) => (v ? new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

/* How someone signed up, and what became of their welcome email. */
const PROVIDER_LABEL: Record<string, string> = { email: 'Email', google: 'Google' };
export const providerLabel = (p?: string | null) => (p ? (PROVIDER_LABEL[p] || p) : 'Unknown');

/* Two looks, so the way someone signed up reads at a glance: blue "Google", plain "Email". */
const GOOGLE_STYLE = 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200';
export function MethodChip({ provider, count }: { provider?: string | null; count?: number }) {
  const google = provider === 'google';
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 font-medium whitespace-nowrap ${google ? GOOGLE_STYLE : 'bg-muted/60 text-foreground'}`}>
      {google ? <span className="font-bold">G</span> : provider === 'email' ? <Mail className="h-3 w-3" /> : null}
      {providerLabel(provider)}{count !== undefined ? ` ${count}` : ''}
    </Badge>
  );
}

/* "Google 1  Email 3" under a card number. Shows both even at zero so a missing group is visible. */
export function MethodSplit({ by }: { by?: Record<string, number> | null }) {
  const b = by || {};
  return (
    <div className="flex flex-wrap gap-1.5">
      <MethodChip provider="google" count={b.google ?? 0} />
      <MethodChip provider="email" count={b.email ?? 0} />
    </div>
  );
}

export function ProviderBadge({ provider, last }: { provider?: string | null; last?: string | null }) {
  return (
    <div className="space-y-0.5">
      <MethodChip provider={provider} />
      {last && last !== provider && <div className="text-[10px] text-muted-foreground">last sign-in: {providerLabel(last)}</div>}
    </div>
  );
}

export function WelcomeBadge({ status, delivery }: { status?: string | null; delivery?: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">None</span>;
  const label = status === 'skipped' ? 'Before welcome emails' : status === 'sent' ? (delivery ? `Sent, ${delivery}` : 'Sent') : status === 'sending' ? 'Sending' : status[0].toUpperCase() + status.slice(1);
  const bad = status === 'failed' || delivery === 'bounced' || delivery === 'complained';
  return <Badge variant={bad ? 'destructive' : status === 'sent' ? 'secondary' : 'outline'} className="text-[10px]">{label}</Badge>;
}

