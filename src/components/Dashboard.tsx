import type { User, Session } from '@supabase/supabase-js';
import { DashboardContainer } from './dashboard/DashboardContainer';
import { TermsModal } from '@/components/shared/TermsModal';
import { AdminPinGate } from './admin/AdminPinGate';
import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect, lazy, Suspense } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Clock } from 'lucide-react';
const AdminPanel = lazy(() => import('./AdminPanel').then(m => ({ default: m.AdminPanel })));

interface DashboardProps {
  user: User;
  session: Session;
}

export interface MaintenanceConfig {
  enabled?: boolean;
  message?: string;
  startTime?: string;
  endTime?: string;
  preMaintenanceNotice?: boolean;
  preMaintenanceMessage?: string;
}

export interface BetaConfig {
  enabled: boolean;
  feedbackReward: number;
}

export default function Dashboard({ user, session }: DashboardProps) {
  const auth = useAuth(user, session);
  const [activeView, setActiveView] = useState<'chat' | 'admin'>('chat');
  const [showPinGate, setShowPinGate] = useState(false);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [maintenanceConfig, setMaintenanceConfig] = useState<MaintenanceConfig>({
    enabled: false,
    message: 'System is currently under maintenance.',
    startTime: '',
    endTime: '',
    preMaintenanceNotice: false,
    preMaintenanceMessage: ''
  });
  const [betaConfig, setBetaConfig] = useState<BetaConfig>({
    enabled: false,
    feedbackReward: 5
  });

  // Apply no-overscroll class to prevent pull-to-refresh on dashboard
  useEffect(() => {
    document.body.classList.add('no-overscroll');
    return () => document.body.classList.remove('no-overscroll');
  }, []);

  // Load maintenance config from database (reading separate keys)
  useEffect(() => {
    // Gate on valid session to prevent RLS errors during navigation transitions
    if (!session?.access_token) return;

    const loadMaintenanceConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('system_config')
          .select('key, value')
          .in('key', [
            'maintenance_mode',
            'maintenance_message',
            'maintenance_start_time',
            'maintenance_end_time',
            'pre_maintenance_notice',
            'pre_maintenance_message',
            'beta_mode',
            'beta_feedback_reward'
          ]);

        if (error) {
          console.error('Error loading maintenance config:', error);
          return;
        }

        if (data && data.length > 0) {
          const configMap = new Map(data.map(c => [c.key, c.value]));
          setMaintenanceConfig({
            enabled: configMap.get('maintenance_mode') === true || configMap.get('maintenance_mode') === 'true',
            message: (configMap.get('maintenance_message') as string) || 'System is currently under maintenance.',
            startTime: (configMap.get('maintenance_start_time') as string) || '',
            endTime: (configMap.get('maintenance_end_time') as string) || '',
            preMaintenanceNotice: configMap.get('pre_maintenance_notice') === true || configMap.get('pre_maintenance_notice') === 'true',
            preMaintenanceMessage: (configMap.get('pre_maintenance_message') as string) || ''
          });
          setBetaConfig({
            enabled: configMap.get('beta_mode') === true || configMap.get('beta_mode') === 'true',
            feedbackReward: parseInt(String(configMap.get('beta_feedback_reward'))) || 5
          });
        }
      } catch (error) {
        console.error('Error loading maintenance config:', error);
      }
    };

    loadMaintenanceConfig();

    // Set up realtime subscription to listen for any maintenance config changes
    const channel = supabase
      .channel('maintenance_config_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_config'
        },
        (payload) => {
          // Check if the changed key is maintenance or beta related
          if (payload.new && typeof payload.new === 'object' && 'key' in payload.new) {
            const key = payload.new.key as string;
            if (key.startsWith('maintenance_') || key.startsWith('pre_maintenance_') || key.startsWith('beta_')) {
              // Re-fetch all config on any related key change
              loadMaintenanceConfig();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.access_token]);

  // Handle admin panel access with PIN
  const handleAdminPanelClick = () => {
    if (isAdminUnlocked) {
      setActiveView('admin');
    } else {
      setShowPinGate(true);
    }
  };

  const handlePinSuccess = () => {
    setIsAdminUnlocked(true);
    setShowPinGate(false);
    setActiveView('admin');
  };

  const handlePinCancel = () => {
    setShowPinGate(false);
  };

  // Check if user is blocked by maintenance mode (non-admins only)
  const isBlockedByMaintenance = maintenanceConfig.enabled && !auth.hasDutyAccess;

  // Full-screen maintenance block for regular users
  if (isBlockedByMaintenance) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50 dark:from-background dark:to-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl p-8 border border-orange-200 dark:border-orange-800">
            <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-orange-600" />
            </div>
            
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
              🚧 System Maintenance
            </h1>
            
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              {maintenanceConfig.message || 'System is currently under maintenance. We apologize for any inconvenience.'}
            </p>
            
            {(maintenanceConfig.startTime || maintenanceConfig.endTime) && (
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-center gap-2 text-orange-700 dark:text-orange-400">
                  <Clock className="w-4 h-4" />
                  {maintenanceConfig.startTime && maintenanceConfig.endTime ? (
                    <span className="text-sm">
                      {new Date(maintenanceConfig.startTime).toLocaleString()} - {new Date(maintenanceConfig.endTime).toLocaleString()}
                    </span>
                  ) : maintenanceConfig.endTime ? (
                    <span className="text-sm">
                      Expected completion: {new Date(maintenanceConfig.endTime).toLocaleString()}
                    </span>
                  ) : null}
                </div>
              </div>
            )}
            
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Please check back later. We're working to get things back to normal.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="ltr" className="relative h-dvh overflow-hidden flex flex-col">
      {/* Terms Modal - shows when terms not accepted (only after auth loading completes) */}
      <TermsModal
        open={!auth.isAuthLoading && !auth.hasAcceptedTerms}
        onAccept={auth.acceptTerms}
      />

      {/* Admin PIN Gate */}
      <AdminPinGate
        open={showPinGate}
        onSuccess={handlePinSuccess}
        onCancel={handlePinCancel}
      />

      {/* Main Content - conditionally render based on active view */}
      {activeView === 'admin' && auth.hasDutyAccess && isAdminUnlocked ? (
        <div className="fixed inset-0 bg-background overflow-hidden z-50">
          <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            <AdminPanel 
              session={session} 
              onBackClick={() => setActiveView('chat')} 
              isAdmin={auth.isAdmin}
              isDuty={auth.isDuty}
            />
          </Suspense>
        </div>
      ) : (
        <SidebarProvider>
          <DashboardContainer 
            user={user}
            session={session}
            auth={auth}
            isAdmin={auth.isAdmin}
            hasDutyAccess={auth.hasDutyAccess}
            onAdminPanelClick={handleAdminPanelClick}
            maintenanceConfig={maintenanceConfig}
            betaConfig={betaConfig}
          />
        </SidebarProvider>
      )}
    </div>
  );
}
