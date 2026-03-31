import { useState, useEffect, useCallback, useLayoutEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Session } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Sun, Moon, RefreshCw, Loader2, Sparkles } from 'lucide-react';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { AdminSidebar, AdminTabId } from '@/components/admin/AdminSidebar';
const AdminDashboard = lazy(() => import('@/components/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const UserManagement = lazy(() => import('@/components/admin/UserManagement').then(m => ({ default: m.UserManagement })));
const RateLimitMonitoring = lazy(() => import('@/components/admin/RateLimitMonitoring').then(m => ({ default: m.RateLimitMonitoring })));
const SystemSettings = lazy(() => import('@/components/admin/SystemSettings').then(m => ({ default: m.SystemSettings })));
const ApplicationManagement = lazy(() => import('@/components/admin/ApplicationManagement').then(m => ({ default: m.ApplicationManagement })));
import type { ServiceApplication } from '@/components/admin/ApplicationManagement';
const SupportManagement = lazy(() => import('@/components/admin/SupportManagement'));
const GoogleAnalytics = lazy(() => import('@/components/admin/GoogleAnalytics').then(m => ({ default: m.GoogleAnalytics })));
const AICostDashboard = lazy(() => import('@/components/admin/AICostDashboard').then(m => ({ default: m.AICostDashboard })));
const UserAILimits = lazy(() => import('@/components/admin/UserAILimits').then(m => ({ default: m.UserAILimits })));
const AdminAIAssistant = lazy(() => import('@/components/admin/AdminAIAssistant').then(m => ({ default: m.AdminAIAssistant })));
const TestResultsDashboard = lazy(() => import('@/components/admin/TestResultsDashboard'));
const SubscriptionManagement = lazy(() => import('@/components/admin/SubscriptionManagement').then(m => ({ default: m.SubscriptionManagement })));
const CreditGiftHistory = lazy(() => import('@/components/admin/CreditGiftHistory').then(m => ({ default: m.CreditGiftHistory })));
const BetaFeedbackViewer = lazy(() => import('@/components/admin/BetaFeedbackViewer').then(m => ({ default: m.BetaFeedbackViewer })));
const MessageFeedbackViewer = lazy(() => import('@/components/admin/MessageFeedbackViewer').then(m => ({ default: m.MessageFeedbackViewer })));
const MarketingCommandCenter = lazy(() => import('@/components/admin/marketing/MarketingCommandCenter').then(m => ({ default: m.MarketingCommandCenter })));
const AYNActivityLog = lazy(() => import('@/components/admin/AYNActivityLog').then(m => ({ default: m.AYNActivityLog })));
const ErrorMonitoring = lazy(() => import('@/components/admin/ErrorMonitoring').then(m => ({ default: m.ErrorMonitoring })));
const RevenueDashboard = lazy(() => import('@/components/admin/RevenueDashboard').then(m => ({ default: m.RevenueDashboard })));
const ConversationViewer = lazy(() => import('@/components/admin/ConversationViewer').then(m => ({ default: m.ConversationViewer })));
const UserDetailPage = lazy(() => import('@/components/admin/UserDetailPage').then(m => ({ default: m.UserDetailPage })));
const EmailBroadcast = lazy(() => import('@/components/admin/EmailBroadcast').then(m => ({ default: m.EmailBroadcast })));
const CustomOrders = lazy(() => import('@/components/admin/CustomOrders').then(m => ({ default: m.CustomOrders })));
const NDAManager = lazy(() => import('@/components/admin/NDAManager').then(m => ({ default: m.NDAManager })));
const DocumentStudio = lazy(() => import('@/components/admin/DocumentStudio').then(m => ({ default: m.DocumentStudio })));
const TermsConsentViewer = lazy(() => import('@/components/admin/TermsConsentViewer').then(m => ({ default: m.TermsConsentViewer })));
const CommandCenterPanel = lazy(() => import('@/components/admin/workforce/CommandCenterPanel').then(m => ({ default: m.CommandCenterPanel })));


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
  const [isLoading, setIsLoading] = useState(false);
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
      // All queries go through SECURITY DEFINER RPCs — they bypass RLS and check admin role internally
      const [dashboardRes, applicationsRes, configRes] = await Promise.allSettled([
        supabase.rpc('get_admin_dashboard_stats'),
        supabase.rpc('get_admin_applications'),
        supabase.rpc('get_admin_system_config'),
      ]);

      // Dashboard stats
      if (dashboardRes.status === 'fulfilled' && dashboardRes.value.data) {
        const stats = dashboardRes.value.data as any;
        setSystemMetrics({
          totalUsers: stats.total_users || 0,
          activeUsers: stats.active_users || 0,
          pendingUsers: 0,
          todayMessages: stats.today_messages || 0,
          weeklyGrowth: 0,
        });
        const recentUsers: AccessGrantWithProfile[] = (stats.recent_users || []).map((u: any) => ({
          id: u.id,
          user_id: u.id,
          is_active: u.is_active ?? false,
          granted_at: u.signed_up_at || null,
          expires_at: null,
          current_month_usage: null,
          monthly_limit: null,
          created_at: u.signed_up_at || new Date().toISOString(),
          user_email: u.email,
          profiles: { company_name: null, contact_person: u.display_name || u.email?.split('@')[0] || null, avatar_url: null },
        }));
        setAllUsers(recentUsers);
      }

      // Applications
      if (applicationsRes.status === 'fulfilled' && applicationsRes.value.data) {
        const appsData = applicationsRes.value.data as any;
        setApplications((Array.isArray(appsData) ? appsData : []) as ServiceApplication[]);
      }

      // System config
      if (configRes.status === 'fulfilled' && configRes.value.data) {
        const configResult = configRes.value.data as any;
        const configData = configResult?.config || [];
        if (configData.length > 0) {
          const configMap = new Map(configData.map((c: any) => [c.key, c.value]));
          setSystemConfig(prev => ({
            ...prev,
            maintenanceMode: configMap.get('maintenance_mode') as boolean || false,
            maintenanceMessage: configMap.get('maintenance_message') as string || '',
            maintenanceStartTime: configMap.get('maintenance_start_time') as string || '',
            maintenanceEndTime: configMap.get('maintenance_end_time') as string || '',
            preMaintenanceNotice: configMap.get('pre_maintenance_notice') as boolean || false,
            preMaintenanceMessage: configMap.get('pre_maintenance_message') as string || '',
            defaultMonthlyLimit: configMap.get('default_monthly_limit') as number || 100,
            requireApproval: configMap.get('require_approval') as boolean ?? true,
            maxLoginAttempts: configMap.get('max_login_attempts') as number || 5,
            sessionTimeout: configMap.get('session_timeout') as number || 30,
          }));
        }
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

  useEffect(() => { fetchData(); }, [fetchData]);

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

  // Don't block rendering — panels fetch their own data via Suspense

  const newAppsCount = applications.filter(a => a.status === 'new').length;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm">
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
      </header>

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
              <ErrorBoundary>
                  {activeTab === 'overview' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><AdminDashboard key={refreshKey} systemMetrics={systemMetrics} allUsers={allUsers} /></Suspense>}
                  {activeTab === 'google-analytics' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><GoogleAnalytics key={refreshKey} /></Suspense>}
                  {activeTab === 'applications' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><ApplicationManagement session={session} applications={applications} onRefresh={fetchData} /></Suspense>}
                  {activeTab === 'support' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><SupportManagement key={refreshKey} /></Suspense>}
                  {activeTab === 'users' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><UserManagement key={refreshKey} /></Suspense>}
                  {activeTab === 'rate-limits' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><RateLimitMonitoring key={refreshKey} session={session} /></Suspense>}
                  {activeTab === 'settings' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><SystemSettings systemConfig={systemConfig} onUpdateConfig={updateSystemConfig} /></Suspense>}
                  {activeTab === 'ai-costs' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><AICostDashboard key={refreshKey} /></Suspense>}
                  {activeTab === 'ai-limits' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><UserAILimits key={refreshKey} /></Suspense>}
                  {activeTab === 'ai-assistant' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><AdminAIAssistant key={refreshKey} /></Suspense>}
                  {activeTab === 'subscriptions' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><SubscriptionManagement key={refreshKey} /></Suspense>}
                  {activeTab === 'credit-history' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><CreditGiftHistory key={refreshKey} /></Suspense>}
                  {activeTab === 'beta-feedback' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><BetaFeedbackViewer key={refreshKey} /></Suspense>}
                  {activeTab === 'message-feedback' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><MessageFeedbackViewer key={refreshKey} /></Suspense>}
                  {activeTab === 'test-results' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><TestResultsDashboard key={refreshKey} /></Suspense>}
                  {activeTab === 'twitter-marketing' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><MarketingCommandCenter key={refreshKey} /></Suspense>}
                  {activeTab === 'terms-consent' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><TermsConsentViewer key={refreshKey} /></Suspense>}
                    {activeTab === 'ayn-logs' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><AYNActivityLog key={refreshKey} /></Suspense>}
                    {activeTab === 'ayn-mind' && <CommandCenterPanel key={refreshKey} />}
                    {activeTab === 'errors' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><ErrorMonitoring key={refreshKey} /></Suspense>}
                    {activeTab === 'revenue' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><RevenueDashboard key={refreshKey} /></Suspense>}
                    {activeTab === 'conversations' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><ConversationViewer key={refreshKey} /></Suspense>}
                    {activeTab === 'user-detail' && <UserDetailPage key={refreshKey} />}
                    {activeTab === 'email-broadcast' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><EmailBroadcast key={refreshKey} /></Suspense>}
                    {activeTab === 'nda' && <NDAManager key={refreshKey} />}
                    {activeTab === 'custom-orders' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><CustomOrders key={refreshKey} /></Suspense>}
                    {activeTab === 'document-studio' && <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><DocumentStudio key={refreshKey} /></Suspense>}
              </ErrorBoundary>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
