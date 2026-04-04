import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { 
  Server, Database, Zap, Shield, Activity, AlertTriangle, CheckCircle, 
  Clock, Network, TrendingUp, Eye, RefreshCw
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAdminSystemMonitoring, adminKeys } from '@/admin-app/hooks/useAdminQuery';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

interface RealMetrics {
  totalUsers: number;
  activeUsers: number;
  messagesToday: number;
  messagesTotal: number;
  avgResponseMs: number;
  errorRate: number;
  fallbackRate: number;
  systemHealth: number;
  openTickets: number;
  blockedUsers: number;
  recentErrors: number;
  recentSecurityEvents: number;
  healthChecksPass: number;
  healthChecksTotal: number;
  uptime: string;
}

interface RecentEvent {
  id: string;
  type: 'health' | 'error';
  label: string;
  detail: string;
  severity: string;
  created_at: string;
}

export const SystemMonitoring = () => {
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const { data: rawData, isLoading: loading } = useAdminSystemMonitoring();

  const { metrics, events } = useMemo(() => {
    if (!rawData) return { metrics: null, events: [] as RecentEvent[] };
    const d = rawData as any;
    const totalUsers = d.total_users || 0;
    const activeUsers = d.active_users_30d || 0;
    const msgToday = d.messages_today || 0;
    const msgTotal = d.messages_total || 0;
    const recentErrors = d.errors_24h || 0;
    const openTickets = d.open_tickets || 0;
    const llmUsage = d.llm_usage_24h || 0;
    const llmFallbacks = d.llm_fallbacks_24h || 0;
    const fallbackRate = llmUsage > 0 ? Math.round((llmFallbacks / llmUsage) * 1000) / 10 : 0;
    const blockedUsers = d.blocked_users || 0;
    const healthTotal = d.health_checks_24h || 0;
    const healthPass = d.health_checks_ok || 0;

    let health = 100;
    if (fallbackRate > 5) health -= (fallbackRate - 5) * 2;
    if (blockedUsers > 0) health -= blockedUsers * 2;
    if (healthTotal > 0) health -= ((healthTotal - healthPass) / healthTotal) * 20;
    health = Math.max(0, Math.min(100, Math.round(health)));

    const m: RealMetrics = { totalUsers, activeUsers, messagesToday: msgToday, messagesTotal: msgTotal, avgResponseMs: 0, errorRate: msgToday > 0 ? Math.round(recentErrors * 100 / msgToday * 100)/100 : 0, fallbackRate, systemHealth: health, openTickets, blockedUsers, recentErrors, recentSecurityEvents: 0, healthChecksPass: healthPass, healthChecksTotal: healthTotal, uptime: '99.9%' };

    const combined: RecentEvent[] = [];
    (d.recent_health || []).forEach((h: any) => combined.push({ id: h.id, type: 'health', label: h.check_name || 'Health check', detail: h.message || (h.status === 'ok' ? 'Passed' : 'Failed'), severity: h.status, created_at: h.created_at }));
    (d.recent_errors || []).forEach((e: any) => combined.push({ id: e.id, type: 'error', label: e.error_type || 'Error', detail: e.message || 'Application error', severity: e.severity || 'medium', created_at: e.created_at }));
    combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { metrics: m, events: combined.slice(0, 12) };
  }, [rawData]);

  const getHealthStatus = (h: number) => {
    if (h >= 98) return { label: 'Excellent', color: 'bg-green-600', variant: 'default' as const };
    if (h >= 95) return { label: 'Good', color: 'bg-blue-600', variant: 'default' as const };
    if (h >= 90) return { label: 'Fair', color: 'bg-yellow-600', variant: 'secondary' as const };
    return { label: 'Poor', color: 'bg-red-600', variant: 'destructive' as const };
  };

  const healthStatus = getHealthStatus(metrics?.systemHealth || 0);

  return (
    <div className="space-y-6" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">System Monitoring</h2>
          <p className="text-muted-foreground">Live data from your database</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: adminKeys.systemMonitoring() })} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <Shield className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{metrics?.systemHealth ?? '—'}%</div>
            {metrics && <Badge variant={healthStatus.variant} className={healthStatus.color}>{healthStatus.label}</Badge>}
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{metrics?.activeUsers ?? '—'}</div>
            <p className="text-xs text-blue-600">of {metrics?.totalUsers ?? '—'} total</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages Today</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-700">{metrics?.messagesToday ?? '—'}</div>
            <p className="text-xs text-purple-600">{metrics?.messagesTotal?.toLocaleString() ?? 0} total</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{metrics?.errorRate ?? '—'}%</div>
            <p className="text-xs text-red-600">{metrics?.recentErrors ?? 0} errors (24h)</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Server className="w-5 h-5" />Platform Health</CardTitle><CardDescription>Live metrics from database</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="flex justify-between mb-1"><span className="text-sm flex items-center gap-2"><Zap className="w-4 h-4" />LLM Fallback Rate</span><span className="font-medium">{metrics?.fallbackRate ?? 0}%</span></div>
              <Progress value={metrics?.fallbackRate ?? 0} className="h-3" />
              <p className="text-xs text-muted-foreground mt-1">{(metrics?.fallbackRate ?? 0) <= 5 ? 'Normal' : (metrics?.fallbackRate ?? 0) <= 15 ? 'Elevated' : 'High'}</p>
            </div>
            <div>
              <div className="flex justify-between mb-1"><span className="text-sm flex items-center gap-2"><Database className="w-4 h-4" />Health Checks Passing (24h)</span><span className="font-medium">{metrics ? `${metrics.healthChecksPass}/${metrics.healthChecksTotal}` : '—'}</span></div>
              <Progress value={metrics && metrics.healthChecksTotal > 0 ? (metrics.healthChecksPass / metrics.healthChecksTotal) * 100 : 100} className="h-3" />
            </div>
            <div>
              <div className="flex justify-between mb-1"><span className="text-sm flex items-center gap-2"><Shield className="w-4 h-4" />Blocked Users</span><span className="font-medium">{metrics?.blockedUsers ?? 0}</span></div>
              <Progress value={Math.min(100, (metrics?.blockedUsers ?? 0) * 10)} className="h-3" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Database className="w-5 h-5" />Service Status</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-3 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-green-600" /><div><p className="font-medium">Database</p><p className="text-sm text-muted-foreground">{metrics?.messagesTotal?.toLocaleString() ?? 0} messages stored</p></div></div>
              <Badge className="bg-green-600">Online</Badge>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-green-600" /><div><p className="font-medium">Support Tickets</p><p className="text-sm text-muted-foreground">{metrics?.openTickets ?? 0} open</p></div></div>
              <Badge className={metrics?.openTickets === 0 ? 'bg-green-600' : 'bg-yellow-600'}>{metrics?.openTickets === 0 ? 'Clear' : `${metrics?.openTickets} Open`}</Badge>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-3"><Network className="w-5 h-5 text-green-600" /><div><p className="font-medium">Authentication</p><p className="text-sm text-muted-foreground">{metrics?.blockedUsers ?? 0} blocked</p></div></div>
              <Badge className={metrics?.blockedUsers === 0 ? 'bg-green-600' : 'bg-red-600'}>{metrics?.blockedUsers === 0 ? 'Healthy' : 'Issues'}</Badge>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="flex items-center gap-3"><Activity className="w-5 h-5 text-blue-600" /><div><p className="font-medium">AI Layer</p><p className="text-sm text-muted-foreground">{metrics?.fallbackRate ?? 0}% fallback rate</p></div></div>
              <Badge className="bg-blue-600">{metrics?.fallbackRate === 0 ? 'Optimal' : 'Active'}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Eye className="w-5 h-5" />Recent System Events</CardTitle><CardDescription>Live from system_health_checks & error_logs</CardDescription></CardHeader>
        <CardContent>
          <ScrollArea className="h-[280px]">
            <div className="space-y-3">
              {loading ? (
                [...Array(5)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)
              ) : events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <CheckCircle className="w-8 h-8 mb-2 text-green-500" />
                  <p className="text-sm">No recent events — all clear</p>
                </div>
              ) : events.map(event => (
                <div key={event.id} className={`flex items-center gap-3 p-2 rounded-lg ${event.type === 'error' ? 'bg-red-50' : event.severity === 'ok' ? 'bg-green-50' : 'bg-blue-50'}`}>
                  {event.type === 'error' ? <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" /> : event.severity === 'ok' ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" /> : <Activity className="w-4 h-4 text-blue-600 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{event.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{event.detail}</p>
                    <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{event.type === 'error' ? event.severity : event.type}</Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
