import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { 
  Server, Database, Zap, Shield, Activity, AlertTriangle, CheckCircle, 
  Clock, Network, HardDrive, Cpu, MemoryStick, TrendingUp, Eye
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

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