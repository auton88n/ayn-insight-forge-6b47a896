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

  // v3.27.0 — the system_config settings form is gone. Maintenance is the
  // Kill switches pane, and every other key it wrote had no reader.



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
