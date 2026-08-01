// v3.22.0 — the admin for the product AYN actually is: a two sided
// hiring marketplace. Six sections, AYN ember branding, real data, light only.
import { useState, useLayoutEffect, useEffect, lazy, Suspense, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { LogOut, RefreshCw } from 'lucide-react';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { AdminSidebar, AdminTabId } from '@/components/admin/AdminSidebar';
import { AdminSkeleton } from '@/admin-app/hooks/AdminSkeleton';
import aynMark from '/ayn-mark.svg';

import {
  useAdminSystemConfig,
  useSetSystemConfig,
  useAdminRefresh,
  useAdminOverview,
} from '@/admin-app/hooks/useAdminQuery';


const OverviewSection = lazy(() => import('@/components/admin/sections/OverviewSection'));
const EmployersSection = lazy(() => import('@/components/admin/sections/EmployersSection'));
const CandidatesSection = lazy(() => import('@/components/admin/sections/CandidatesSection'));
const MarketplaceSection = lazy(() => import('@/components/admin/sections/MarketplaceSection'));
const MoneySection = lazy(() => import('@/components/admin/sections/MoneySection'));
const SystemSection = lazy(() => import('@/components/admin/sections/SystemSection'));

const Fallback = () => <div className="py-8"><AdminSkeleton variant="table" /></div>;

interface AdminPanelProps {
  session: Session;
  onBackClick?: () => void;
  isAdmin?: boolean;
  isDuty?: boolean;
}

export const AdminPanel = (_props: AdminPanelProps) => {
  const { refreshAll } = useAdminRefresh();
  const { refreshAll } = useAdminRefresh();
  const [activeTab, setActiveTab] = useState<AdminTabId>('overview');
  const [collapsed, setCollapsed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const systemConfigQuery = useAdminSystemConfig();
  const overviewQuery = useAdminOverview();
  const pendingEmployers = Number((overviewQuery.data as any)?.employers_pending || 0);

  // Ember scope lives on <body> so Radix portals inherit it too.
  // Admin is light only, so the dark class comes off while it is mounted.
  useEffect(() => {
    document.body.classList.add('admin-surface');
    const wasDark = document.documentElement.classList.contains('dark');
    if (wasDark) document.documentElement.classList.remove('dark');
    return () => {
      document.body.classList.remove('admin-surface');
      if (wasDark) document.documentElement.classList.add('dark');
    };
  }, []);


  useLayoutEffect(() => {
    const ob = document.body.style.overflow;
    const oh = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ob; document.documentElement.style.overflow = oh; };
  }, []);

  const configData = (systemConfigQuery.data as any)?.config || [];
  const configMap = new Map((Array.isArray(configData) ? configData : []).map((c: any) => [c.key, c.value]));
  const systemConfig = {
    maintenanceMode: (configMap.get('maintenance_mode') as boolean) || false,
    maintenanceMessage: (configMap.get('maintenance_message') as string) || '',
    maintenanceStartTime: (configMap.get('maintenance_start_time') as string) || '',
    maintenanceEndTime: (configMap.get('maintenance_end_time') as string) || '',
    preMaintenanceNotice: (configMap.get('pre_maintenance_notice') as boolean) || false,
    preMaintenanceMessage: (configMap.get('pre_maintenance_message') as string) || '',
    defaultMonthlyLimit: (configMap.get('default_monthly_limit') as number) || 100,
    requireApproval: (configMap.get('require_approval') as boolean) ?? true,
    maxLoginAttempts: (configMap.get('max_login_attempts') as number) || 5,
    sessionTimeout: (configMap.get('session_timeout') as number) || 30,
  };

  const setConfig = useSetSystemConfig();

  const updateSystemConfig = async (updates: Record<string, unknown>) => {
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
      sessionTimeout: 'session_timeout',
    };
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      const dbKey = keyMap[key];
      if (dbKey) mapped[dbKey] = value;
    }
    if (Object.keys(mapped).length === 0) return;
    await setConfig.mutateAsync(mapped);
  };


  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    refreshAll();
    setTimeout(() => setRefreshing(false), 600);
  }, [refreshAll]);

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <img src={aynMark} alt="AYN" className="h-7 w-7" />
          <div>
            <h1 className="text-base font-bold leading-tight">Admin</h1>
            <p className="text-[11px] text-muted-foreground leading-tight">Employers, candidates, marketplace, money</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleRefresh} className="w-9 h-9 rounded-xl border border-border/60">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => supabase.auth.signOut()} title="Sign out" className="w-9 h-9 rounded-xl border border-border/60">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <AdminSidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isCollapsed={collapsed}
          onToggleCollapse={() => setCollapsed(c => !c)}
          pendingEmployers={pendingEmployers}
        />
        <main className="flex-1 overflow-y-auto overscroll-contain">
          <div className="p-6 max-w-6xl mx-auto">
            <ErrorBoundary>
              <Suspense fallback={<Fallback />}>
                {activeTab === 'overview' && <OverviewSection onGoto={(id) => setActiveTab(id as AdminTabId)} />}
                {activeTab === 'employers' && <EmployersSection />}
                {activeTab === 'candidates' && <CandidatesSection />}
                {activeTab === 'marketplace' && <MarketplaceSection />}
                {activeTab === 'money' && <MoneySection />}
                {activeTab === 'system' && (
                  <SystemSection systemConfig={systemConfig} onUpdateConfig={updateSystemConfig} />
                )}
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
};
