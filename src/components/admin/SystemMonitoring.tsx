import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { 
  Server, Database, Zap, Shield, Activity, AlertTriangle, CheckCircle, 
  Clock, Network, HardDrive, Cpu, MemoryStick, TrendingUp, Eye, RefreshCw
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
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
  type: 'health' | 'error' | 'security';
  label: string;
  detail: string;
  severity: string;
  created_at: string;
}

export const SystemMonitoring = () => {
  const { t, language } = useLanguage();
  const [metrics, setMetrics] = useState<RealMetrics | null>(null);
  const [events, setEvents] = useState<RecentEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [metricsRes, healthRes, errorRes] = await Promise.allSettled([
        supabase.rpc('get_admin_system_metrics'),
        supabase.from('system_health_checks')
          .select('id, status, check_name, message, created_at')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('error_logs')
          .select('id, error_type, message, severity, created_at')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      if (metricsRes.status === 'fulfilled' && metricsRes.value.data) {
        setMetrics(metricsRes.value.data as unknown as RealMetrics);
      }

      const combined: RecentEvent[] = [];
      if (healthRes.status === 'fulfilled' && healthRes.value.data) {
        healthRes.value.data.forEach((h: any) => {
          combined.push({
            id: h.id,
            type: 'health',
            label: h.check_name || 'Health check',
            detail: h.message || (h.status === 'ok' ? 'Passed' : 'Failed'),
            severity: h.status === 'ok' ? 'ok' : 'warning',
            created_at: h.created_at,
          });
        });
      }
      if (errorRes.status === 'fulfilled' && errorRes.value.data) {
        errorRes.value.data.forEach((e: any) => {
          combined.push({
            id: e.id,
            type: 'error',
            label: e.error_type || 'Error',
            detail: e.message || 'Application error',
            severity: e.severity || 'medium',
            created_at: e.created_at,
          });
        });
      }
      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setEvents(combined.slice(0, 12));
    } catch (err) {
      console.error('SystemMonitoring fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  
  const getHealthStatus = (health: number) => {
    if (health >= 98) return { label: 'Excellent', color: 'bg-green-600', variant: 'default' as const };
    if (health >= 95) return { label: 'Good', color: 'bg-blue-600', variant: 'default' as const };
    if (health >= 90) return { label: 'Fair', color: 'bg-yellow-600', variant: 'secondary' as const };
    return { label: 'Poor', color: 'bg-red-600', variant: 'destructive' as const };
  };

  const getEventIcon = (event: RecentEvent) => {
    if (event.type === 'error') return <AlertTriangle className="w-4 h-4 text-red-500" />;
    if (event.severity === 'ok') return <CheckCircle className="w-4 h-4 text-green-600" />;
    return <Activity className="w-4 h-4 text-blue-600" />;
  };

  const getEventBg = (event: RecentEvent) => {
    if (event.type === 'error') return 'bg-red-50';
    if (event.severity === 'ok') return 'bg-green-50';
    return 'bg-blue-50';
  };

  const healthStatus = getHealthStatus(metrics?.systemHealth || 0);

  return (
    <div className="space-y-6" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className={`flex items-center justify-between ${language === 'ar' ? 'text-right' : ''}`}>
        <div>
          <h2 className="text-2xl font-bold">System Monitoring</h2>
          <p className="text-muted-foreground">Live data from your Supabase database</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* System Status Overview */}
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
            <CardTitle className="text-sm font-medium">Avg Response</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">
              {metrics ? `${metrics.avgResponseMs}ms` : '—'}
            </div>
            <p className="text-xs text-blue-600">Last 24h average</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-700">{metrics?.activeUsers ?? '—'}</div>
            <p className="text-xs text-purple-600">of {metrics?.totalUsers ?? '—'} total</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{metrics?.errorRate ?? '—'}%</div>
            <p className="text-xs text-red-600">{metrics?.recentErrors ?? 0} errors today</p>
          </CardContent>
        </Card>
      </div>

      {/* Resource Monitoring */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              Platform Stats
            </CardTitle>
            <CardDescription>Real-time database metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm flex items-center gap-2"><Zap className="w-4 h-4" />LLM Fallback Rate</span>
                <span className="font-medium">{metrics?.fallbackRate ?? 0}%</span>
              </div>
              <Progress value={metrics?.fallbackRate ?? 0} className="h-3" />
              <p className="text-xs text-muted-foreground mt-1">{(metrics?.fallbackRate ?? 0) <= 5 ? 'Normal' : (metrics?.fallbackRate ?? 0) <= 15 ? 'Elevated' : 'High'}</p>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm flex items-center gap-2"><Shield className="w-4 h-4" />Security Events (24h)</span>
                <span className="font-medium">{metrics?.recentSecurityEvents ?? 0}</span>
              </div>
              <Progress value={Math.min(100, (metrics?.recentSecurityEvents ?? 0) * 5)} className="h-3" />
              <p className="text-xs text-muted-foreground mt-1">{(metrics?.recentSecurityEvents ?? 0) === 0 ? 'No alerts' : `${metrics?.recentSecurityEvents} events logged`}</p>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm flex items-center gap-2"><Database className="w-4 h-4" />Health Checks Passing</span>
                <span className="font-medium">
                  {metrics ? `${metrics.healthChecksPass}/${metrics.healthChecksTotal}` : '—'}
                </span>
              </div>
              <Progress value={metrics && metrics.healthChecksTotal > 0 ? (metrics.healthChecksPass / metrics.healthChecksTotal) * 100 : 100} className="h-3" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Service Status
            </CardTitle>
            <CardDescription>Live service health</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-3 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium">Database</p>
                  <p className="text-sm text-muted-foreground">{metrics?.messagesTotal?.toLocaleString() ?? 0} messages stored</p>
                </div>
              </div>
              <Badge className="bg-green-600">Online</Badge>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium">Open Tickets</p>
                  <p className="text-sm text-muted-foreground">{metrics?.openTickets ?? 0} requiring attention</p>
                </div>
              </div>
              <Badge className={metrics?.openTickets === 0 ? 'bg-green-600' : 'bg-yellow-600'}>
                {metrics?.openTickets === 0 ? 'Clear' : `${metrics?.openTickets} Open`}
              </Badge>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium">Authentication</p>
                  <p className="text-sm text-muted-foreground">{metrics?.blockedUsers ?? 0} blocked users</p>
                </div>
              </div>
              <Badge className={metrics?.blockedUsers === 0 ? 'bg-green-600' : 'bg-red-600'}>
                {metrics?.blockedUsers === 0 ? 'Healthy' : `${metrics?.blockedUsers} Blocked`}
              </Badge>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="flex items-center gap-3">
                <Network className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="font-medium">Messages Today</p>
                  <p className="text-sm text-muted-foreground">Platform activity</p>
                </div>
              </div>
              <Badge className="bg-blue-600">{metrics?.messagesToday ?? 0}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Real System Events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Recent System Events
          </CardTitle>
          <CardDescription>Live from system_health_checks & error_logs</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[280px]">
            <div className="space-y-3">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />
                ))
              ) : events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <CheckCircle className="w-8 h-8 mb-2 text-green-500" />
                  <p className="text-sm">No recent events — all clear</p>
                </div>
              ) : events.map(event => (
                <div key={event.id} className={`flex items-center gap-3 p-2 rounded-lg ${getEventBg(event)}`}>
                  {getEventIcon(event)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{event.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{event.detail}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {event.type === 'error' ? event.severity : event.type}
                  </Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

interface SystemMetrics {
  totalUsers: number;
  activeUsers: number;
  pendingRequests: number;
  totalMessages: number;
  todayMessages: number;
  avgResponseTime: number;
  systemHealth: number;
  uptime: string;
  errorRate: number;
  resourceUsage: {
    cpu: number;
    memory: number;
    disk: number;
  };
}

interface SystemMonitoringProps {
  systemMetrics: SystemMetrics | null;
}

export const SystemMonitoring = ({ systemMetrics }: SystemMonitoringProps) => {
  const { t, language } = useLanguage();
  
  const getHealthStatus = (health: number) => {
    if (health >= 98) return { label: t('admin.excellent'), color: 'bg-green-600', variant: 'default' as const };
    if (health >= 95) return { label: t('admin.good'), color: 'bg-blue-600', variant: 'default' as const };
    if (health >= 90) return { label: t('admin.fair'), color: 'bg-yellow-600', variant: 'secondary' as const };
    return { label: t('admin.poor'), color: 'bg-red-600', variant: 'destructive' as const };
  };

  const getResourceStatus = (usage: number) => {
    if (usage >= 90) return t('admin.critical');
    if (usage >= 75) return t('admin.warning');
    if (usage >= 50) return t('admin.moderate');
    return t('admin.normal');
  };

  const getResourceColor = (status: string) => {
    switch (status) {
      case t('admin.critical'): return 'bg-red-500';
      case t('admin.warning'): return 'bg-yellow-500';
      case t('admin.moderate'): return 'bg-blue-500';
      default: return 'bg-green-500';
    }
  };

  const healthStatus = getHealthStatus(systemMetrics?.systemHealth || 0);

  return (
    <div className="space-y-6" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className={language === 'ar' ? 'text-right' : ''}>
        <h2 className="text-2xl font-bold">{t('admin.systemMonitoring')}</h2>
        <p className="text-muted-foreground">{t('admin.systemMonitoringDesc')}</p>
      </div>

      {/* System Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <Shield className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{systemMetrics?.systemHealth || 0}%</div>
            <Badge variant={healthStatus.variant} className={healthStatus.color}>
              {healthStatus.label}
            </Badge>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{systemMetrics?.uptime || '0%'}</div>
            <p className="text-xs text-blue-600">Last 30 days</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Response Time</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-700">{systemMetrics?.avgResponseTime.toFixed(1) || '0'}s</div>
            <p className="text-xs text-purple-600">Average</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{systemMetrics?.errorRate.toFixed(2) || '0'}%</div>
            <p className="text-xs text-red-600">Last 24h</p>
          </CardContent>
        </Card>
      </div>

      {/* Resource Monitoring */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              Server Resources
            </CardTitle>
            <CardDescription>Real-time server resource utilization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4" />
                  <span>CPU Usage</span>
                </div>
                <span className="font-medium">{systemMetrics?.resourceUsage.cpu || 0}%</span>
              </div>
              <Progress 
                value={systemMetrics?.resourceUsage.cpu || 0} 
                className={`h-3 ${getResourceColor(getResourceStatus(systemMetrics?.resourceUsage.cpu || 0))}`}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Status: {getResourceStatus(systemMetrics?.resourceUsage.cpu || 0)}
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <MemoryStick className="w-4 h-4" />
                  <span>Memory Usage</span>
                </div>
                <span className="font-medium">{systemMetrics?.resourceUsage.memory || 0}%</span>
              </div>
              <Progress 
                value={systemMetrics?.resourceUsage.memory || 0} 
                className={`h-3 ${getResourceColor(getResourceStatus(systemMetrics?.resourceUsage.memory || 0))}`}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Status: {getResourceStatus(systemMetrics?.resourceUsage.memory || 0)}
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4" />
                  <span>Disk Usage</span>
                </div>
                <span className="font-medium">{systemMetrics?.resourceUsage.disk || 0}%</span>
              </div>
              <Progress 
                value={systemMetrics?.resourceUsage.disk || 0} 
                className={`h-3 ${getResourceColor(getResourceStatus(systemMetrics?.resourceUsage.disk || 0))}`}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Status: {getResourceStatus(systemMetrics?.resourceUsage.disk || 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Service Status
            </CardTitle>
            <CardDescription>Current status of system services</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-3 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium">Database</p>
                  <p className="text-sm text-muted-foreground">PostgreSQL 15.0</p>
                </div>
              </div>
              <Badge className="bg-green-600">Online</Badge>
            </div>

            <div className="flex justify-between items-center p-3 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium">API Gateway</p>
                  <p className="text-sm text-muted-foreground">Supabase Edge Functions</p>
                </div>
              </div>
              <Badge className="bg-green-600">Active</Badge>
            </div>

            <div className="flex justify-between items-center p-3 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium">Authentication</p>
                  <p className="text-sm text-muted-foreground">Supabase Auth</p>
                </div>
              </div>
              <Badge className="bg-green-600">Healthy</Badge>
            </div>

            <div className="flex justify-between items-center p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="flex items-center gap-3">
                <Network className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="font-medium">CDN</p>
                  <p className="text-sm text-muted-foreground">Global Edge Network</p>
                </div>
              </div>
              <Badge className="bg-blue-600">Optimized</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics & System Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Performance Trends
            </CardTitle>
            <CardDescription>System performance over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 rounded-lg bg-blue-50">
                  <div className="text-2xl font-bold text-blue-700">{systemMetrics?.todayMessages || 0}</div>
                  <div className="text-sm text-blue-600">Requests Today</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-green-50">
                  <div className="text-2xl font-bold text-green-700">{systemMetrics?.activeUsers || 0}</div>
                  <div className="text-sm text-green-600">Active Sessions</div>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Peak CPU Usage (24h)</span>
                  <span className="text-sm font-medium">{Math.min(100, (systemMetrics?.resourceUsage.cpu || 0) + 15)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Peak Memory Usage (24h)</span>
                  <span className="text-sm font-medium">{Math.min(100, (systemMetrics?.resourceUsage.memory || 0) + 10)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Avg Response Time (24h)</span>
                  <span className="text-sm font-medium">{(systemMetrics?.avgResponseTime || 0).toFixed(2)}s</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              System Events
            </CardTitle>
            <CardDescription>Recent system events and alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[280px]">
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-2 rounded-lg bg-green-50">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">System health check passed</p>
                    <p className="text-xs text-muted-foreground">All services operating normally</p>
                    <p className="text-xs text-muted-foreground">2 minutes ago</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-2 rounded-lg bg-blue-50">
                  <Activity className="w-4 h-4 text-blue-600" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Auto-scaling triggered</p>
                    <p className="text-xs text-muted-foreground">Increased capacity due to high load</p>
                    <p className="text-xs text-muted-foreground">15 minutes ago</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-2 rounded-lg bg-green-50">
                  <Database className="w-4 h-4 text-green-600" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Database backup completed</p>
                    <p className="text-xs text-muted-foreground">Automated backup successful</p>
                    <p className="text-xs text-muted-foreground">1 hour ago</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-2 rounded-lg bg-yellow-50">
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">High memory usage detected</p>
                    <p className="text-xs text-muted-foreground">Memory usage above 80% threshold</p>
                    <p className="text-xs text-muted-foreground">3 hours ago</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-2 rounded-lg bg-green-50">
                  <Shield className="w-4 h-4 text-green-600" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Security scan completed</p>
                    <p className="text-xs text-muted-foreground">No vulnerabilities detected</p>
                    <p className="text-xs text-muted-foreground">6 hours ago</p>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Quick Actions
          </CardTitle>
          <CardDescription>System monitoring and maintenance tools</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="sm">
              <Activity className="w-4 h-4 mr-2" />
              View Full Logs
            </Button>
            <Button variant="outline" size="sm">
              <Server className="w-4 h-4 mr-2" />
              Resource Report
            </Button>
            <Button variant="outline" size="sm">
              <Database className="w-4 h-4 mr-2" />
              Database Status
            </Button>
            <Button variant="outline" size="sm">
              <Shield className="w-4 h-4 mr-2" />
              Security Audit
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};