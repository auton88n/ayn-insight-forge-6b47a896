// v3.20.0 — small shared pieces for the new admin sections.
import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';

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

export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: string; accent?: boolean }) {
  return (
    <Card className="border border-border/60 bg-card">
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
        <p className={`text-2xl font-bold tracking-tight mt-1.5 ${accent ? 'text-primary' : ''}`}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
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
export const when = (v?: string | null) => (v ? new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
