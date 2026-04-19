/**
 * CronControl — manually trigger and monitor backend scheduler jobs.
 * Talks to spine /admin/scheduler/{status,run,jobs} endpoints with the admin JWT.
 */
import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, RefreshCw, CheckCircle2, AlertCircle, Clock, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { getAdminToken } from '@/lib/adminApi';
import { cn } from '@/lib/utils';

const SPINE = 'https://spine.aynn.io';

interface JobInfo {
  id: string;
  next_run: string | null;
  trigger: string | null;
  last_run: string | null;
  last_success: string | null;
  last_error: string | null;
  success_count: number;
  failure_count: number;
  last_duration_ms: number | null;
}

interface SchedulerStatus {
  running: boolean;
  jobs: JobInfo[];
}

const JOB_DESCRIPTIONS: Record<string, string> = {
  'world-intel': 'Generates Intelligence Brief & AYN Mind summary',
  'pulse-engine': 'Refreshes Market Sentiment & Fear/Greed index',
  'market-prices': 'Pulls latest market prices for all assets',
  'world-signals': 'Detects new world signals & threats',
  'predictions-daily': 'Runs daily prediction graph engine',
  'prediction-resolver': 'Resolves predictions whose targets passed',
  'agent-society': 'Triggers agent society conversations',
  'supabase-sync': 'Syncs lookup data from Supabase',
  'log-cleanup': 'Purges old logs from the database',
};

async function callSpine<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const token = getAdminToken();
  const res = await fetch(`${SPINE}${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatNext(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffMs = d.getTime() - Date.now();
  if (diffMs < 0) return 'overdue';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `in ${hrs}h ${mins % 60}m`;
}

export function CronControl() {
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    try {
      const data = await callSpine<SchedulerStatus>('/admin/scheduler/status');
      setStatus(data);
    } catch (e) {
      toast.error(`Failed to load scheduler status: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const runJob = async (jobId: string) => {
    setRunning((r) => ({ ...r, [jobId]: true }));
    try {
      await callSpine(`/admin/scheduler/run/${jobId}`, 'POST');
      toast.success(`Triggered ${jobId} — runs in background (30-90s)`);
      // Refresh status after a short delay so the user sees last_run update
      setTimeout(refresh, 3000);
    } catch (e) {
      toast.error(`Failed to trigger ${jobId}: ${(e as Error).message}`);
    } finally {
      setTimeout(() => setRunning((r) => ({ ...r, [jobId]: false })), 2000);
    }
  };

  const runAll = async () => {
    if (!status) return;
    const intelJobs = ['pulse-engine', 'world-intel', 'world-signals', 'predictions-daily', 'agent-society'];
    toast.info(`Triggering ${intelJobs.length} intelligence jobs in sequence…`);
    for (const id of intelJobs) {
      await runJob(id);
      await new Promise((r) => setTimeout(r, 1500));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Loading scheduler status…
      </div>
    );
  }

  if (!status) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Unable to load scheduler status.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Cron Control
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manually trigger backend intelligence jobs and monitor schedule health.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={status.running ? 'default' : 'destructive'}>
            {status.running ? 'Scheduler Running' : 'Scheduler Stopped'}
          </Badge>
          <Button size="sm" variant="outline" onClick={refresh}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" onClick={runAll}>
            <Play className="w-3.5 h-3.5 mr-1.5" /> Run All Intel Jobs
          </Button>
        </div>
      </div>

      {/* Jobs grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {status.jobs.map((job) => {
          const isRunning = running[job.id];
          const hasError = !!job.last_error;
          const neverRan = !job.last_run;
          return (
            <Card key={job.id} className={cn('relative', hasError && 'border-destructive/40')}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base font-semibold truncate">{job.id}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {JOB_DESCRIPTIONS[job.id] ?? 'Background job'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={hasError || neverRan ? 'default' : 'outline'}
                    disabled={isRunning}
                    onClick={() => runJob(job.id)}
                  >
                    {isRunning ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 mr-1" /> Run
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Last run
                    </div>
                    <div className="font-medium">{formatTime(job.last_run)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Next run
                    </div>
                    <div className="font-medium">{formatNext(job.next_run)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Success
                    </div>
                    <div className="font-medium">{job.success_count}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-destructive" /> Failures
                    </div>
                    <div className="font-medium">{job.failure_count}</div>
                  </div>
                  {job.last_duration_ms != null && (
                    <div className="col-span-2">
                      <div className="text-muted-foreground">Last duration</div>
                      <div className="font-medium">
                        {(job.last_duration_ms / 1000).toFixed(1)}s
                      </div>
                    </div>
                  )}
                  {job.last_error && (
                    <div className="col-span-2 mt-1 p-2 rounded bg-destructive/10 border border-destructive/20">
                      <div className="text-destructive font-medium text-xs">Last error</div>
                      <div className="text-xs mt-0.5 break-words">{job.last_error}</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default CronControl;
