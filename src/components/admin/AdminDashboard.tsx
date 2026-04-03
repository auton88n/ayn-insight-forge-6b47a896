import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Users, 
  UserCheck, 
  Clock, 
  MessageSquare,
  TrendingUp,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { UserGrowthChart } from './UserGrowthChart';
import { ChurnAlerts } from './ChurnAlerts';
import { useMemo } from 'react';
import { useAdminDashboard } from '@/admin-app/hooks/useAdminQuery';

export const AdminDashboard = () => {
  const dashboardQuery = useAdminDashboard();

  const { systemMetrics, recentUsers } = useMemo(() => {
    const dashStats = (dashboardQuery.data || {}) as any;
    return {
      systemMetrics: {
        totalUsers: dashStats.total_users || 0,
        activeUsers: dashStats.active_users || 0,
        pendingUsers: 0,
        todayMessages: dashStats.today_messages || 0,
      },
      recentUsers: ((dashStats.recent_users || []) as any[]).slice(0, 10).map((u: any) => ({
        id: u.id,
        user_id: u.id,
        is_active: u.is_active ?? false,
        created_at: u.signed_up_at || new Date().toISOString(),
        user_email: u.email,
        display_name: u.display_name || u.email?.split('@')[0] || null,
      })),
    };
  }, [dashboardQuery.data]);

  const metrics = [
    { label: 'Total Users', value: systemMetrics.totalUsers, icon: Users, iconColor: 'text-blue-500', iconBg: 'bg-blue-500/10 ring-1 ring-blue-500/20' },
    { label: 'Active Users', value: systemMetrics.activeUsers, icon: UserCheck, iconColor: 'text-emerald-500', iconBg: 'bg-emerald-500/10 ring-1 ring-emerald-500/20' },
    { label: 'Pending', value: systemMetrics.pendingUsers, icon: Clock, iconColor: 'text-amber-500', iconBg: 'bg-amber-500/10 ring-1 ring-amber-500/20' },
    { label: 'Messages Today', value: systemMetrics.todayMessages, icon: MessageSquare, iconColor: 'text-violet-500', iconBg: 'bg-violet-500/10 ring-1 ring-violet-500/20' },
  ];

  // Loading state
  if (dashboardQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="border border-border/50 bg-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                  <Skeleton className="h-12 w-12 rounded-2xl" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="border border-border/50 bg-card">
          <CardHeader><Skeleton className="h-6 w-36" /></CardHeader>
          <CardContent><Skeleton className="h-[320px] w-full" /></CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (dashboardQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="p-4 rounded-2xl bg-destructive/10 mb-4">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">Failed to load dashboard</p>
        <p className="text-xs text-muted-foreground">{(dashboardQuery.error as Error)?.message || 'Unknown error'}</p>
        <button onClick={() => dashboardQuery.refetch()} className="mt-4 text-sm text-primary hover:underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label} className="border border-border/50 bg-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground font-medium">{metric.label}</p>
                    <p className="text-3xl font-bold tracking-tight">{metric.value}</p>
                  </div>
                  <div className={`p-3.5 rounded-2xl ${metric.iconBg}`}>
                    <Icon className={`w-6 h-6 ${metric.iconColor}`} />
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border/30">
                  <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Updated just now</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Activity */}
      <Card className="border border-border/50 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <TrendingUp className="w-4 h-4 text-primary" />
            </div>
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[320px] pr-4">
            <div className="space-y-2">
              {recentUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="p-4 rounded-2xl bg-muted/50 mb-4">
                    <Users className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No recent activity</p>
                </div>
              ) : (
                recentUsers.map((user: any) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 border border-transparent hover:border-border/50 transition-colors cursor-default"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="w-10 h-10 ring-2 ring-background">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary font-medium">
                            {(user.display_name || user.user_email || 'U').charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {user.is_active && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-card" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {user.display_name || user.user_email?.split('@')[0] || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(user.created_at), 'MMM d, yyyy • h:mm a')}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={user.is_active ? 'default' : 'secondary'}
                      className={`text-xs ${
                        user.is_active
                          ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                      }`}
                    >
                      {user.is_active ? 'Active' : 'Pending'}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Growth + Churn row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <UserGrowthChart />
        </div>
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <ChurnAlerts />
        </div>
      </div>
    </div>
  );
};
