import { spineApi } from '@/lib/spineApi';
import { useState, useLayoutEffect, lazy, Suspense, useCallback } from 'react';
import { spineAuth } from '@/lib/spineAuth';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import type { SpineSession } from '@/lib/spineAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LogOut, Sun, Moon, RefreshCw, Sparkles } from 'lucide-react';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { adminApi as supabase } from '@/lib/adminApi';
import { AdminSidebar, AdminTabId } from '@/components/admin/AdminSidebar';
import { AdminSkeleton } from '@/admin-app/hooks/AdminSkeleton';
import {
  useAdminApplications,
  useAdminSystemConfig,
  useAdminRefresh,
  adminKeys,
} from '@/admin-app/hooks/useAdminQuery';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ── Lazy-loaded tab components (code-split per tab) ─────────
const AdminDashboard = lazy(() => import('@/components/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const UserManagement = lazy(() => import('@/components/admin/UserManagement').then(m => ({ default: m.UserManagement })));
const RateLimitMonitoring = lazy(() => import('@/components/admin/RateLimitMonitoring').then(m => ({ default: m.RateLimitMonitoring })));
const SystemSettings = lazy(() => import('@/components/admin/SystemSettings').then(m => ({ default: m.SystemSettings })));
const ApplicationManagement = lazy(() => import('@/components/admin/ApplicationManagement').then(m => ({ default: m.ApplicationManagement })));
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
const PredictionControlPanel = lazy(() => import('@/pages/PredictionControlPanel'));
const CronControl = lazy(() => import('@/components/admin/CronControl').then(m => ({ default: m.CronControl })));
const OperationsCenter = lazy(() => import('@/components/admin/OperationsCenter'));

// ── Suspense fallback with proper skeleton ──────────────────
const TabFallback = () => <div className="py-8"><AdminSkeleton variant="table" /></div>;

// ── Types ───────────────────────────────────────────────────
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
  session: SpineSession;
  onBackClick?: () => void;
  isAdmin?: boolean;
  isDuty?: boolean;
  onSignOut?: () => void;
}

export const AdminPanel = ({
  session,
  onBackClick,
  isAdmin = false,
  isDuty = false,
  onSignOut
}: AdminPanelProps) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const { refreshAll } = useAdminRefresh();

  // Tab state
  const defaultTab: AdminTabId = isAdmin ? 'overview' : 'applications';
  const [activeTab, setActiveTab] = useState<AdminTabId>(defaultTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── React Query hooks — only what the parent needs ─────────
  const applicationsQuery = useAdminApplications();
  const systemConfigQuery = useAdminSystemConfig();

  const applications = Array.isArray(applicationsQuery.data) ? applicationsQuery.data : [];

  // Parse system config from query
  const configData = systemConfigQuery.data || [];
  const configMap = new Map((Array.isArray(configData) ? configData : []).map((c: any) => [c.key, c.value]));
  const systemConfig: SystemConfig = {
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
  };

  // Lock body scroll
  useLayoutEffect(() => {
    const ob = document.body.style.overflow;
    const oh = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ob; document.documentElement.style.overflow = oh; };
  }, []);

  // ── Refresh: invalidate React Query cache (no unmount!) ───
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refreshAll();
    setTimeout(() => setIsRefreshing(false), 600);
    toast.success('Refreshing data...');
  }, [refreshAll]);

  const handleBackClick = () => onBackClick ? onBackClick() : navigate('/');

  const updateSystemConfig = async (updates: Partial<SystemConfig>) => {
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
    try {
      for (const [key, value] of Object.entries(updates)) {
        const dbKey = keyMap[key];
        if (dbKey) {
          await spineApi.req("POST", "/admin/config", { key: dbKey, value });
        }
      }
      queryClient.invalidateQueries({ queryKey: adminKeys.systemConfig() });
      toast.success('Settings updated');
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error updating config:', error);
      toast.error('Failed to update settings');
    }
  };

  const newAppsCount = (applications as any[]).filter((a: any) => a.status === 'new').length;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <div className="flex items-center gap-4">
          <Button onClick={() => onSignOut ? onSignOut() : spineAuth.signOut()} variant="ghost" size="icon"
            className="w-10 h-10 rounded-xl hover:bg-muted/50 border border-border/50"
            title="Sign Out">
            <LogOut className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                {isAdmin ? 'Admin Panel' : 'Duty Panel'}
              </h1>
              {isDuty && !isAdmin && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border border-primary/20">
                  <Sparkles className="w-3 h-3 mr-1" />Duty
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {isAdmin ? 'Manage users, settings, and system' : 'Manage applications and support'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isRefreshing}
            className="w-10 h-10 rounded-xl border border-border/50 hover:bg-muted/50">
            <RefreshCw className={`w-4 h-4 transition-transform ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-10 h-10 rounded-xl border border-border/50 hover:bg-muted/50">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex min-h-0">
        <AdminSidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          newAppsCount={newAppsCount}
          isAdmin={isAdmin}
        />

        <main className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="p-6 max-w-6xl mx-auto">
              <ErrorBoundary>
                {activeTab === 'overview' && <Suspense fallback={<TabFallback />}><AdminDashboard /></Suspense>}
                {activeTab === 'google-analytics' && <Suspense fallback={<TabFallback />}><GoogleAnalytics /></Suspense>}
                {activeTab === 'applications' && <Suspense fallback={<TabFallback />}><ApplicationManagement session={session as any} applications={applications as any} onRefresh={() => queryClient.invalidateQueries({ queryKey: adminKeys.applications() })} /></Suspense>}
                {activeTab === 'support' && <Suspense fallback={<TabFallback />}><SupportManagement /></Suspense>}
                {activeTab === 'users' && <Suspense fallback={<TabFallback />}><UserManagement /></Suspense>}
                {activeTab === 'rate-limits' && <Suspense fallback={<TabFallback />}><RateLimitMonitoring session={session as any} /></Suspense>}
                {activeTab === 'settings' && <Suspense fallback={<TabFallback />}><SystemSettings systemConfig={systemConfig} onUpdateConfig={updateSystemConfig} /></Suspense>}
                {activeTab === 'ai-costs' && <Suspense fallback={<TabFallback />}><AICostDashboard /></Suspense>}
                {activeTab === 'ai-limits' && <Suspense fallback={<TabFallback />}><UserAILimits /></Suspense>}
                {activeTab === 'ai-assistant' && <Suspense fallback={<TabFallback />}><AdminAIAssistant /></Suspense>}
                {activeTab === 'subscriptions' && <Suspense fallback={<TabFallback />}><SubscriptionManagement /></Suspense>}
                {activeTab === 'credit-history' && <Suspense fallback={<TabFallback />}><CreditGiftHistory /></Suspense>}
                {activeTab === 'beta-feedback' && <Suspense fallback={<TabFallback />}><BetaFeedbackViewer /></Suspense>}
                {activeTab === 'message-feedback' && <Suspense fallback={<TabFallback />}><MessageFeedbackViewer /></Suspense>}
                {activeTab === 'test-results' && <Suspense fallback={<TabFallback />}><TestResultsDashboard /></Suspense>}
                {activeTab === 'twitter-marketing' && <Suspense fallback={<TabFallback />}><MarketingCommandCenter /></Suspense>}
                {activeTab === 'terms-consent' && <Suspense fallback={<TabFallback />}><TermsConsentViewer /></Suspense>}
                {activeTab === 'ayn-logs' && <Suspense fallback={<TabFallback />}><AYNActivityLog /></Suspense>}
                {activeTab === 'ayn-mind' && <Suspense fallback={<TabFallback />}><CommandCenterPanel /></Suspense>}
                {activeTab === 'errors' && <Suspense fallback={<TabFallback />}><ErrorMonitoring /></Suspense>}
                {activeTab === 'revenue' && <Suspense fallback={<TabFallback />}><RevenueDashboard /></Suspense>}
                {activeTab === 'conversations' && <Suspense fallback={<TabFallback />}><ConversationViewer /></Suspense>}
                {activeTab === 'user-detail' && <Suspense fallback={<TabFallback />}><UserDetailPage /></Suspense>}
                {activeTab === 'email-broadcast' && <Suspense fallback={<TabFallback />}><EmailBroadcast /></Suspense>}
                {activeTab === 'nda' && <Suspense fallback={<TabFallback />}><NDAManager /></Suspense>}
                {activeTab === 'custom-orders' && <Suspense fallback={<TabFallback />}><CustomOrders /></Suspense>}
                {activeTab === 'document-studio' && <Suspense fallback={<TabFallback />}><DocumentStudio /></Suspense>}
                {activeTab === 'prediction-control' && <Suspense fallback={<TabFallback />}><PredictionControlPanel /></Suspense>}
                {activeTab === 'cron-control' && <Suspense fallback={<TabFallback />}><CronControl /></Suspense>}
                {activeTab === 'operations' && <Suspense fallback={<TabFallback />}><OperationsCenter /></Suspense>}
              </ErrorBoundary>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
