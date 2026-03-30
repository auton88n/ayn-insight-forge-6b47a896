import { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import { Session } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Sun, Moon, RefreshCw, Loader2, Sparkles } from 'lucide-react';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { AdminSidebar, AdminTabId } from '@/components/admin/AdminSidebar';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { UserManagement } from '@/components/admin/UserManagement';
import { RateLimitMonitoring } from '@/components/admin/RateLimitMonitoring';
import { SystemSettings } from '@/components/admin/SystemSettings';
import { ApplicationManagement, ServiceApplication } from '@/components/admin/ApplicationManagement';
import SupportManagement from '@/components/admin/SupportManagement';
import { GoogleAnalytics } from '@/components/admin/GoogleAnalytics';
import { AICostDashboard } from '@/components/admin/AICostDashboard';
import { UserAILimits } from '@/components/admin/UserAILimits';
import { AdminAIAssistant } from '@/components/admin/AdminAIAssistant';
import TestResultsDashboard from '@/components/admin/TestResultsDashboard';
import { SubscriptionManagement } from '@/components/admin/SubscriptionManagement';
import { CreditGiftHistory } from '@/components/admin/CreditGiftHistory';
import { BetaFeedbackViewer } from '@/components/admin/BetaFeedbackViewer';
import { MessageFeedbackViewer } from '@/components/admin/MessageFeedbackViewer';
import { MarketingCommandCenter } from '@/components/admin/marketing/MarketingCommandCenter';
import { AYNActivityLog } from '@/components/admin/AYNActivityLog';
import { ErrorMonitoring } from '@/components/admin/ErrorMonitoring';
import { RevenueDashboard } from '@/components/admin/RevenueDashboard';
import { ConversationViewer } from '@/components/admin/ConversationViewer';
import { UserDetailPage } from '@/components/admin/UserDetailPage';
import { EmailBroadcast } from '@/components/admin/EmailBroadcast';
import { CustomOrders } from '@/components/admin/CustomOrders';
import { NDAManager } from '@/components/admin/NDAManager';
import { DocumentStudio } from '@/components/admin/DocumentStudio';
import { TermsConsentViewer } from '@/components/admin/TermsConsentViewer';
import { CommandCenterPanel } from '@/components/admin/workforce/CommandCenterPanel';


// Types
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
interface SystemConfig {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  maintenanceStartTime: string;
  maintenanceEndTime: string;
  preMaintenanceNotice: boolean;
  preMaintenanceMessage: string;
  defaultMonthlyLimit: number;
  requireApproval: boolean;
  maxLoginAttempts: number;
  sessionTimeout: number;
}
interface AdminPanelProps {
  session: Session;
  onBackClick?: () => void;
  isAdmin?: boolean;
  isDuty?: boolean;
}

export const AdminPanel = ({
  session,
  onBackClick,
  isAdmin = false,
  isDuty = false
}: AdminPanelProps) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  // Set default tab based on role
  const defaultTab: AdminTabId = isAdmin ? 'overview' : 'applications';
  const [activeTab, setActiveTab] = useState<AdminTabId>(defaultTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [allUsers, setAllUsers] = useState<AccessGrantWithProfile[]>([]);
  const [applications, setApplications] = useState<ServiceApplication[]>([]);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics>({
    totalUsers: 0,
    activeUsers: 0,
    pendingUsers: 0,
    todayMessages: 0,
    weeklyGrowth: 0
  });
  const [systemConfig, setSystemConfig] = useState<SystemConfig>({
    maintenanceMode: false,
    maintenanceMessage: '',
    maintenanceStartTime: '',
    maintenanceEndTime: '',
    preMaintenanceNotice: false,
    preMaintenanceMessage: '',
    defaultMonthlyLimit: 100,
    requireApproval: true,
    maxLoginAttempts: 5,
    sessionTimeout: 30
  });

  const fetchData = useCallback(async () => {
    try {
      const [accessGrantsRes, adminUsersRes, messagesTodayRes, configRes, applicationsRes] = await Promise.allSettled([
        supabase.from('access_grants').select('*').order('created_at', { ascending: false }),
        supabase.from('admin_users_view').select('id,email,display_name,auth_provider,avatar_url,contact_person,company_name,is_active,signed_up_at,last_sign_in_at,subscription_tier,subscription_status,total_messages,messages_7d,messages_30d,last_active_at,days_since_last_use,is_unlimited,monthly_messages,current_monthly_messages,bonus_credits,role'),
        supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString()),
        supabase.from('system_config').select('key,value'),
        supabase.from('service_applications').select('*').order('created_at', { ascending: false }),
      ]);

      const accessGrantsData = accessGrantsRes.status === 'fulfilled' ? (accessGrantsRes.value.data || []) as AccessGrantWithProfile[] : [];
      const enrichedUsers = adminUsersRes.status === 'fulfilled' ? (adminUsersRes.value.data || []) as { id: string; email: string; display_name: string; auth_provider: string; avatar_url: string | null; contact_person: string | null; company_name: string | null; is_active: boolean | null; }[] : [];
      const todayMessageCount = messagesTodayRes.status === 'fulfilled' ? (messagesTodayRes.value.count || 0) : 0;
      const configData = configRes.status === 'fulfilled' ? (configRes.value.data || []) as { key: string; value: unknown; }[] : [];
      const applicationsData = applicationsRes.status === 'fulfilled' ? (applicationsRes.value.data || []) as ServiceApplication[] : [];
      const enrichedMap = new Map(enrichedUsers.map(u => [u.id, u]));

      if (applicationsData.length > 0) {
        supabase.from('security_logs').insert({ action: 'service_applications_view', details: { count: applicationsData.length, timestamp: new Date().toISOString() }, severity: 'high' });
      }

      const usersWithProfiles: AccessGrantWithProfile[] = accessGrantsData.map((user: AccessGrantWithProfile) => {
        const enriched = enrichedMap.get(user.user_id);
        return {
          ...user,
          user_email: enriched?.email || user.user_email,
          profiles: { company_name: enriched?.company_name || null, contact_person: enriched?.contact_person || enriched?.display_name || enriched?.email?.split('@')[0] || null, avatar_url: enriched?.avatar_url || null },
        };
      });
      enrichedUsers.forEach(enriched => {
        if (!usersWithProfiles.find(u => u.user_id === enriched.id)) {
          usersWithProfiles.push({ id: enriched.id, user_id: enriched.id, is_active: enriched.is_active ?? false, granted_at: null, expires_at: null, current_month_usage: null, monthly_limit: null, created_at: new Date().toISOString(), user_email: enriched.email, profiles: { company_name: enriched.company_name || null, contact_person: enriched.contact_person || enriched.display_name || enriched.email?.split('@')[0] || null, avatar_url: enriched.avatar_url || null } });
        }
      });

      setAllUsers(usersWithProfiles);
      setApplications(applicationsData);
      const activeCount = usersWithProfiles.filter((u: AccessGrantWithProfile) => u.is_active).length;
      const pendingCount = usersWithProfiles.filter((u: AccessGrantWithProfile) => !u.is_active && !u.granted_at).length;
      setSystemMetrics({ totalUsers: usersWithProfiles.length, activeUsers: activeCount, pendingUsers: pendingCount, todayMessages: todayMessageCount, weeklyGrowth: 0 });

      if (configData.length > 0) {
        const configMap = new Map(configData.map(c => [c.key, c.value]));
        setSystemConfig(prev => ({ ...prev, maintenanceMode: configMap.get('maintenance_mode') as boolean || false, maintenanceMessage: configMap.get('maintenance_message') as string || '', maintenanceStartTime: configMap.get('maintenance_start_time') as string || '', maintenanceEndTime: configMap.get('maintenance_end_time') as string || '', preMaintenanceNotice: configMap.get('pre_maintenance_notice') as boolean || false, preMaintenanceMessage: configMap.get('pre_maintenance_message') as string || '', defaultMonthlyLimit: configMap.get('default_monthly_limit') as number || 100, requireApproval: configMap.get('require_approval') as boolean ?? true, maxLoginAttempts: configMap.get('max_login_attempts') as number || 5, sessionTimeout: configMap.get('session_timeout') as number || 30 }));
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error fetching admin data:', error);
      toast.error('Failed to load admin data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Lock body scroll when admin panel is mounted
  useLayoutEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    return () => {
      document.body.style.overflow = originalOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    const initTimer = setTimeout(() => {
      fetchData();
    }, 100);

    const safetyTimeout = setTimeout(() => {
      setIsLoading(false);
      setIsRefreshing(false);
    }, 8000);
    
    return () => {
      clearTimeout(initTimer);
      clearTimeout(safetyTimeout);
    };
  }, [fetchData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshKey(k => k + 1);
    fetchData();
  };

  const handleBackClick = () => {
    if (onBackClick) {
      onBackClick();
    } else {
      navigate('/');
    }
  };

  const updateSystemConfig = async (updates: Partial<SystemConfig>) => {
    try {
      const keyMap: Record<string, string> = {
        maintenanceMode: 'maintenance_mode',
        maintenanceMessage: 'maintenance_message',
        maintenanceStartTime: 'maintenance_start_time',
        maintenanceEndTime: 'maintenance_end_time',
        preMaintenanceNotice: 'pre_maintenance_notice',
        preMaintenanceMessage: 'pre_maintenance_message',
        defaultMonthlyLimit: 'default_monthly_limit',
        requireApproval: 'require_approval',
        maxLoginAttempts: 'max_login_attempts',
        sessionTimeout: 'session_timeout'
      };
      
      for (const [key, value] of Object.entries(updates)) {
        const dbKey = keyMap[key];
        if (dbKey) {
          const { error: updateErr } = await supabase
            .from('system_config')
            .update({ value, updated_at: new Date().toISOString() })
            .eq('key', dbKey);
          if (updateErr) throw new Error(`Failed to update ${dbKey}: ${updateErr.message}`);
        }
      }
      
      setSystemConfig(prev => ({
        ...prev,
        ...updates
      }));
      toast.success('Settings updated');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error updating config:', error);
      }
      toast.error('Failed to update settings');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <motion.div
          className="relative"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        >
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/40 to-primary blur-xl" />
          <Loader2 className="w-10 h-10 text-primary relative z-10" />
        </motion.div>
      </div>
    );
  }

  const newAppsCount = applications.filter(a => a.status === 'new').length;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm"
      >
        <div className="flex items-center gap-4">
          {onBackClick && (
            <Button 
              onClick={handleBackClick} 
              variant="ghost" 
              size="icon" 
              className="w-10 h-10 rounded-xl hover:bg-muted/50 border border-border/50"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                {isAdmin ? 'Admin Panel' : 'Duty Panel'}
              </h1>
              {isDuty && !isAdmin && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border border-primary/20">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Duty
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {isAdmin ? 'Manage users, settings, and system' : 'Manage applications and support'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-10 h-10 rounded-xl border border-border/50 hover:bg-muted/50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-10 h-10 rounded-xl border border-border/50 hover:bg-muted/50"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </motion.header>

      {/* Main Layout: Sidebar + Content */}
      <div className="flex-1 flex min-h-0">
        <AdminSidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          newAppsCount={newAppsCount}
          isAdmin={isAdmin}
        />

        {/* Content Area - Fixed scroll containment */}
        <main className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="p-6 max-w-6xl mx-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <ErrorBoundary>
                    {activeTab === 'overview' && <AdminDashboard key={refreshKey} systemMetrics={systemMetrics} allUsers={allUsers} />}
                    {activeTab === 'google-analytics' && <GoogleAnalytics key={refreshKey} />}
                    {activeTab === 'applications' && <ApplicationManagement session={session} applications={applications} onRefresh={fetchData} />}
                    {activeTab === 'support' && <SupportManagement key={refreshKey} />}
                    {activeTab === 'users' && <UserManagement key={refreshKey} />}
                    {activeTab === 'rate-limits' && <RateLimitMonitoring key={refreshKey} session={session} />}
                    {activeTab === 'settings' && <SystemSettings systemConfig={systemConfig} onUpdateConfig={updateSystemConfig} />}
                    {activeTab === 'ai-costs' && <AICostDashboard key={refreshKey} />}
                    {activeTab === 'ai-limits' && <UserAILimits key={refreshKey} />}
                    {activeTab === 'ai-assistant' && <AdminAIAssistant key={refreshKey} />}
                    {activeTab === 'subscriptions' && <SubscriptionManagement key={refreshKey} />}
                    {activeTab === 'credit-history' && <CreditGiftHistory key={refreshKey} />}
                    {activeTab === 'beta-feedback' && <BetaFeedbackViewer key={refreshKey} />}
                    {activeTab === 'message-feedback' && <MessageFeedbackViewer key={refreshKey} />}
                    {activeTab === 'test-results' && <TestResultsDashboard key={refreshKey} />}
                    {activeTab === 'twitter-marketing' && <MarketingCommandCenter key={refreshKey} />}
                    {activeTab === 'terms-consent' && <TermsConsentViewer key={refreshKey} />}
                    {activeTab === 'ayn-logs' && <AYNActivityLog key={refreshKey} />}
                    {activeTab === 'ayn-mind' && <CommandCenterPanel key={refreshKey} />}
                    {activeTab === 'errors' && <ErrorMonitoring key={refreshKey} />}
                    {activeTab === 'revenue' && <RevenueDashboard key={refreshKey} />}
                    {activeTab === 'conversations' && <ConversationViewer key={refreshKey} />}
                    {activeTab === 'user-detail' && <UserDetailPage key={refreshKey} />}
                    {activeTab === 'email-broadcast' && <EmailBroadcast key={refreshKey} />}
                    {activeTab === 'nda' && <NDAManager key={refreshKey} />}
                    {activeTab === 'custom-orders' && <CustomOrders key={refreshKey} />}
                    {activeTab === 'document-studio' && <DocumentStudio key={refreshKey} />}
                  </ErrorBoundary>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
