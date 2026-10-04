import { useAdminSeoCollectionHistory } from '@/admin-app/hooks/useAdminQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { when } from './ui';

export type CollectorSnapshot = {
  taken_at: string;
  data: { collection_status?: string; collected_at?: string; collection_error?: string };
};

export function collectionState(snapshot?: CollectorSnapshot, now = Date.now()) {
  if (!snapshot) return 'No reading';
  if (snapshot.data.collection_status === 'error') return 'Failed';
  const time = Date.parse(snapshot.data.collected_at || snapshot.taken_at);
  if (!Number.isFinite(time)) return 'Unknown';
  if (now - time > 48 * 60 * 60 * 1000) return 'Stale';
  return snapshot.data.collection_status === 'ok' ? 'Fresh' : 'Unknown';
}

export default function SeoCollectorMonitor({ google, speed, refresh, refreshing }: {
  google?: CollectorSnapshot; speed?: CollectorSnapshot; refresh: () => void; refreshing: boolean;
}) {
  const history = useAdminSeoCollectionHistory();
  return <Card className="border border-border/60 bg-card mb-6">
    <CardHeader className="flex flex-row items-start justify-between gap-3">
      <div>
        <CardTitle className="text-base">SEO collection monitor</CardTitle>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">The VPS collects Google search and mobile-speed reports. The configured daily window is 09:00–09:10 Dubai time. Readings below confirm completed attempts, not whether the server is running right now.</p>
      </div>
      <Button variant="outline" size="sm" disabled={refreshing || history.isFetching} onClick={() => { refresh(); void history.refetch(); }}>Refresh status</Button>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="divide-y divide-border">
        {([['Google Search Console', google], ['PageSpeed', speed]] as const).map(([name, snapshot]) => {
          const state = collectionState(snapshot);
          const lastGood = snapshot?.data.collected_at || (snapshot?.data.collection_status === 'ok' ? snapshot.taken_at : null);
          return <div key={name} className="py-3 flex flex-wrap justify-between items-start gap-3">
            <div><p className="font-medium text-sm">{name}</p>
              <p className="text-xs text-muted-foreground mt-1">Last attempt: {snapshot ? when(snapshot.taken_at) : 'Not recorded'}</p>
              <p className="text-xs text-muted-foreground mt-1">Last successful reading: {lastGood ? when(lastGood) : 'Not recorded'}</p>
              {state === 'Failed' && <p role="status" className="text-sm text-destructive mt-2">Collection failed. Previous successful data is retained. Check the collector logs{snapshot?.data.collection_error ? ` (${snapshot.data.collection_error})` : ''}.</p>}
              {state === 'Stale' && <p role="status" className="text-sm text-destructive mt-2">No fresh reading in 48 hours. Check the VPS timer and connection.</p>}
            </div>
            <Badge variant={state === 'Failed' || state === 'Stale' ? 'destructive' : 'outline'}>{state}</Badge>
          </div>;
        })}
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">Recent collection attempts</summary>
        {history.isError ? <p role="alert" className="text-sm text-destructive mt-3">Could not load collection history. Use Refresh status to retry.</p>
          : history.isLoading ? <p className="text-sm text-muted-foreground mt-3">Loading history…</p>
          : !history.data?.length ? <p className="text-sm text-muted-foreground mt-3">No attempts recorded yet.</p>
          : <ul className="divide-y divide-border mt-3">{history.data.map(row => <li key={row.id} className="py-2 text-sm flex flex-wrap justify-between gap-2">
            <span>{row.source === 'search_console' ? 'Search Console' : 'PageSpeed'} · {when(row.attempted_at)}</span>
            <span className={row.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}>{row.status === 'ok' ? 'Succeeded' : row.status === 'error' ? `Failed${row.error ? `: ${row.error}` : ''}` : 'Legacy reading; outcome unknown'}</span>
          </li>)}</ul>}
      </details>
      <p className="text-xs text-muted-foreground">Status refreshes every minute while this tab is visible. Refresh status reads saved results; it does not start a Google scan. SEO Monster is the analyst tool, not the article publisher. Publishing controls are separate below.</p>
    </CardContent>
  </Card>;
}
