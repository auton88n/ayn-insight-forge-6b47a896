import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Session } from '@supabase/supabase-js';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { 
  Shield, 
  AlertTriangle, 
  RefreshCw,
  Unlock,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { getErrorMessage, ErrorCodes } from '@/lib/errorMessages';

interface RateLimitStat {
  user_id: string;
  user_name?: string;
  user_email?: string;
  endpoint: string;
  request_count: number;
  max_requests: number;
  violation_count: number;
  is_blocked: boolean;
  blocked_until: string | null;
  last_activity: string;
}

interface RateLimitMonitoringProps {
  session: Session;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.2 }
  }
};

export const RateLimitMonitoring = ({ session }: RateLimitMonitoringProps) => {
  const [stats, setStats] = useState<RateLimitStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_rate_limit_stats');
      if (error) throw error;
      const statsData: RateLimitStat[] = Array.isArray(data) ? data : [];
      // Enrich with user names
      const userIds = statsData.map(s => s.user_id).filter(id => id && id.includes('-'));
      if (userIds.length > 0) {
        const { data: allUsers } = await supabase.rpc('get_admin_users');
        const userMap = new Map((allUsers as any[] || []).map((u: any) => [u.id, u]));
        statsData.forEach(s => {
          const u = userMap.get(s.user_id) as any;
          if (u) { s.user_name = u.display_name; s.user_email = u.email; }
        });
      }
      setStats(statsData);
    } catch (error) {
      console.error('Error fetching rate limit stats:', error);
      toast.error(getErrorMessage(ErrorCodes.DATA_LOAD_FAILED).description);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const handleUnblock = async (userId: string, endpoint: string) => {
    try {
      const { error } = await supabase.rpc('admin_unblock_user', {
        p_user_id: userId,
        p_endpoint: endpoint
      });
      if (error) throw error;
      toast.success('User unblocked');
      fetchStats();
    } catch (error) {
      console.error('Error unblocking user:', error);
      toast.error(getErrorMessage(ErrorCodes.GENERIC).description);
    }
  };

  const blockedUsers = stats.filter(s => s.is_blocked);
  const approachingLimit = stats.filter(s => !s.is_blocked && s.request_count > s.max_requests * 0.8);
  const totalViolations = stats.reduce((acc, s) => acc + s.violation_count, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Blocked Users</p>
                  <p className="text-3xl font-bold mt-1">{blockedUsers.length}</p>
                </div>
                <div className="p-3 rounded-xl bg-red-500/10">
                  <Shield className="w-6 h-6 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Approaching Limit</p>
                  <p className="text-3xl font-bold mt-1">{approachingLimit.length}</p>
                </div>
                <div className="p-3 rounded-xl bg-orange-500/10">
                  <AlertTriangle className="w-6 h-6 text-orange-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Violations</p>
                  <p className="text-3xl font-bold mt-1">{totalViolations}</p>
                </div>
                <div className="p-3 rounded-xl bg-purple-500/10">
                  <AlertTriangle className="w-6 h-6 text-purple-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Rate Limit Table */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Rate Limit Status</CardTitle>
                <CardDescription>{stats.length} entries</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsRefreshing(true);
                  fetchStats();
                }}
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {stats.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No rate limit data
                  </p>
                ) : (
                  stats.map((stat, index) => {
                    const usagePercent = (stat.request_count / stat.max_requests) * 100;
                    return (
                      <motion.div
                        key={`${stat.user_id}-${stat.endpoint}-${index}`}
                        variants={itemVariants}
                        className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                          stat.is_blocked 
                            ? 'bg-red-500/5 border-red-500/20' 
                            : usagePercent > 80 
                            ? 'bg-orange-500/5 border-orange-500/20' 
                            : 'bg-card border-transparent'
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">
                              {stat.user_name || (stat.user_id.includes('-') ? stat.user_email || stat.user_id.slice(0,8) : stat.user_id)}
                            </span>
                            <code className="text-xs bg-muted px-2 py-0.5 rounded">
                              {stat.endpoint}
                            </code>
                            {stat.is_blocked && (
                              <Badge variant="destructive" className="text-xs">
                                Blocked
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {stat.request_count} / {stat.max_requests} requests
                            {stat.violation_count > 0 && (
                              <span className="text-red-500 ml-2">
                                ({stat.violation_count} violations)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Last activity: {format(new Date(stat.last_activity), 'MMM d, HH:mm')}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Usage bar */}
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all ${
                                usagePercent > 100 ? 'bg-red-500' :
                                usagePercent > 80 ? 'bg-orange-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(usagePercent, 100)}%` }}
                            />
                          </div>

                          {stat.is_blocked && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUnblock(stat.user_id, stat.endpoint)}
                              className="text-xs"
                            >
                              <Unlock className="w-3 h-3 mr-1" />
                              Unblock
                            </Button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
};
