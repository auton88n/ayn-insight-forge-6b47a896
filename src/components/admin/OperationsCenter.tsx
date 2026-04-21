import { useMemo } from 'react';
import { adminApi } from '@/lib/spineApi';
import { useAdminOperations } from '@/admin-app/hooks/useAdminQuery';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function OperationsCenter() {
  const q = useAdminOperations();
  const data = q.data || {};

  const alerts = data.alerts || [];
  const workers = data.workers || [];
  const emailQueue = data.queues?.email || {};
  const redis = data.infra?.redis || {};

  const status = useMemo(() => {
    if (data.degraded) return 'degraded';
    if (redis.connected) return 'healthy';
    return 'unknown';
  }, [data.degraded, redis.connected]);

  const loadDlq = async () => {
    const dlq = await adminApi.getQueueDlq('email', 50);
    alert(`Email DLQ items: ${dlq?.count ?? 0}`);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4 bg-card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Operations Center</h2>
            <p className="text-sm text-muted-foreground">Queue, worker, infra, and degraded-mode visibility.</p>
          </div>
          <Badge variant={status === 'healthy' ? 'default' : 'destructive'}>{status.toUpperCase()}</Badge>
        </div>
      </div>

      {data.degraded && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
          <strong>Degraded mode active:</strong> {(data.degraded_reasons || []).join(', ')}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Stat label="Redis" value={redis.connected ? 'Connected' : 'Disconnected'} />
        <Stat label="Queue Pending" value={String(emailQueue.pending ?? 0)} />
        <Stat label="Queue Processing" value={String(emailQueue.processing ?? 0)} />
        <Stat label="DLQ" value={String(emailQueue.dead_letter ?? 0)} />
      </div>

      <div className="rounded-lg border p-4 bg-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Critical Alerts</h3>
        </div>
        <div className="space-y-2 text-sm">
          {alerts.length === 0 && <div className="text-muted-foreground">No active alerts.</div>}
          {alerts.map((a: any, idx: number) => (
            <div key={`${a.code}-${idx}`} className="flex items-center justify-between rounded border p-2">
              <span>{a.code}</span>
              <Badge variant={a.level === 'critical' ? 'destructive' : 'secondary'}>{a.level}</Badge>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border p-4 bg-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Worker Status</h3>
          <Button size="sm" variant="outline" onClick={loadDlq}>Inspect Email DLQ</Button>
        </div>
        <div className="space-y-2 text-sm">
          {workers.length === 0 && <div className="text-muted-foreground">No workers detected.</div>}
          {workers.map((w: any) => (
            <div key={w.worker_id} className="rounded border p-2 grid grid-cols-2 md:grid-cols-6 gap-2">
              <span className="font-mono text-xs">{w.worker_id}</span>
              <span>{w.role}</span>
              <span>processed: {w.jobs_processed}</span>
              <span>failed: {w.jobs_failed}</span>
              <span>queue: {w.queue}</span>
              <Badge variant={w.stalled ? 'destructive' : 'default'}>{w.stalled ? 'stalled' : 'active'}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3 bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
