import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Users, 
  UserCheck, 
  Clock, 
  MessageSquare,
  TrendingUp,
  Activity
} from 'lucide-react';
import { format } from 'date-fns';
import { UserGrowthChart } from './UserGrowthChart';
import { ChurnAlerts } from './ChurnAlerts';
import { useEffect, useState } from 'react';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';

interface Profile {
  company_name: string | null;
  contact_person: string | null;
  avatar_url: string | null;
}

interface AccessGrantWithProfile {
  id: string;
  user_id: string;
  is_active: boolean;
  granted_at: string | null;
  expires_at: string | null;
  current_month_usage: number | null;
  monthly_limit: number | null;
  created_at: string;
  profiles: Profile | null;
  user_email?: string;
}

interface SystemMetrics {
  totalUsers: number;
  activeUsers: number;
  pendingUsers: number;
  todayMessages: number;
  weeklyGrowth: number;
}

interface AdminDashboardProps {
  systemMetrics: SystemMetrics;
  allUsers: AccessGrantWithProfile[];
}

// Animated counter component
const AnimatedCounter = ({ value, duration = 1000 }: { value: number; duration?: number }) => {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    let startTime: number;
    let animationFrame: number;
    
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setDisplayValue(Math.floor(progress * value));
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };
    
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);
  
  return <span>{displayValue}</span>;
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.4 }
  }
};

export const AdminDashboard = ({ systemMetrics, allUsers }: AdminDashboardProps) => {
  const metrics = [
    { 
      label: 'Total Users', 
      value: systemMetrics.totalUsers, 
      icon: Users, 
      gradient: 'from-blue-500/20 to-blue-600/5',
      iconColor: 'text-blue-500',
      iconBg: 'bg-blue-500/10 ring-1 ring-blue-500/20',
      glow: 'shadow-blue-500/20'
    },
    { 
      label: 'Active Users', 
      value: systemMetrics.activeUsers, 
      icon: UserCheck, 
      gradient: 'from-emerald-500/20 to-emerald-600/5',
      iconColor: 'text-emerald-500',
      iconBg: 'bg-emerald-500/10 ring-1 ring-emerald-500/20',
      glow: 'shadow-emerald-500/20'
    },
    { 
      label: 'Pending', 
      value: systemMetrics.pendingUsers, 
      icon: Clock, 
      gradient: 'from-amber-500/20 to-amber-600/5',
      iconColor: 'text-amber-500',
      iconBg: 'bg-amber-500/10 ring-1 ring-amber-500/20',
      glow: 'shadow-amber-500/20'
    },
    { 
      label: 'Messages Today', 
      value: systemMetrics.todayMessages, 
      icon: MessageSquare, 
      gradient: 'from-violet-500/20 to-violet-600/5',
      iconColor: 'text-violet-500',
      iconBg: 'bg-violet-500/10 ring-1 ring-violet-500/20',
      glow: 'shadow-violet-500/20'
    },
  ];

  const recentUsers = allUsers.slice(0, 10);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Premium Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <motion.div 
              key={metric.label} 
              variants={itemVariants}
            >
              <Card className={`relative overflow-hidden border border-border/50 shadow-lg ${metric.glow} bg-card/80 backdrop-blur-xl cursor-default`}>
                {/* Gradient background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${metric.gradient} opacity-60 group-hover:opacity-80 transition-opacity`} />
                
                {/* Subtle pattern overlay */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.1),transparent_70%)]" />
                
                <CardContent className="relative p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground font-medium">{metric.label}</p>
                      <p className="text-3xl font-bold tracking-tight">
                        <AnimatedCounter value={metric.value} />
                      </p>
                    </div>
                    <div className={`p-3.5 rounded-2xl ${metric.iconBg}`}>
                      <Icon className={`w-6 h-6 ${metric.iconColor}`} />
                    </div>
                  </div>
                  
                  {/* Trend indicator */}
                  <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border/30">
                    <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Updated just now</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Recent Activity - Premium Card */}
      <motion.div variants={itemVariants}>
        <Card className="relative overflow-hidden border border-border/50 shadow-lg bg-card/80 backdrop-blur-xl">
          {/* Gradient accent bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
          
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
                  recentUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 border border-transparent hover:border-border/50 transition-colors cursor-default"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className="w-10 h-10 ring-2 ring-background">
                            <AvatarFallback className="text-xs bg-gradient-to-br from-primary/20 to-primary/10 text-primary font-medium">
                              {(user.profiles?.contact_person || user.profiles?.company_name || user.user_email || 'U')
                                .charAt(0)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {/* Online indicator */}
                          {user.is_active && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-card" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {user.profiles?.contact_person || user.profiles?.company_name || user.user_email?.split('@')[0] || 'Unknown'}
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
      </motion.div>

      {/* Growth + Churn row */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <motion.div variants={itemVariants} className="bg-card border border-border/50 rounded-2xl p-5">
          <UserGrowthChart />
        </motion.div>
        <motion.div variants={itemVariants} className="bg-card border border-border/50 rounded-2xl p-5">
          <ChurnAlerts />
        </motion.div>
      </div>
    </motion.div>
  );
};
