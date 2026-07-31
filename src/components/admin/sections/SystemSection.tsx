// v3.20.0 SYSTEM — everything that keeps the product running, in one place.
import { lazy, Suspense, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { AdminSkeleton } from '@/admin-app/hooks/AdminSkeleton';
import { cn } from '@/lib/utils';
import { SectionHeader } from './ui';

const UserManagement = lazy(() => import('@/components/admin/UserManagement').then(m => ({ default: m.UserManagement })));
const SupportManagement = lazy(() => import('@/components/admin/SupportManagement'));
const ErrorMonitoring = lazy(() => import('@/components/admin/ErrorMonitoring').then(m => ({ default: m.ErrorMonitoring })));
const RateLimitMonitoring = lazy(() => import('@/components/admin/RateLimitMonitoring').then(m => ({ default: m.RateLimitMonitoring })));
const AICostDashboard = lazy(() => import('@/components/admin/AICostDashboard').then(m => ({ default: m.AICostDashboard })));
const EmailBroadcast = lazy(() => import('@/components/admin/EmailBroadcast').then(m => ({ default: m.EmailBroadcast })));
const TermsConsentViewer = lazy(() => import('@/components/admin/TermsConsentViewer').then(m => ({ default: m.TermsConsentViewer })));
const SystemSettings = lazy(() => import('@/components/admin/SystemSettings').then(m => ({ default: m.SystemSettings })));

const Fallback = () => <div className="py-8"><AdminSkeleton variant="table" /></div>;

type Pane = 'accounts' | 'support' | 'errors' | 'limits' | 'ai' | 'email' | 'consent' | 'settings';

const PANES: { id: Pane; label: string }[] = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'support', label: 'Support' },
  { id: 'errors', label: 'Errors' },
  { id: 'limits', label: 'Rate limits' },
  { id: 'ai', label: 'AI cost' },
  { id: 'email', label: 'Email' },
  { id: 'consent', label: 'Terms consent' },
  { id: 'settings', label: 'Settings' },
];

export default function SystemSection({
  session,
  systemConfig,
  onUpdateConfig,
}: {
  session: Session;
  systemConfig: any;
  onUpdateConfig: (updates: any) => Promise<void>;
}) {
  const [pane, setPane] = useState<Pane>('accounts');

  return (
    <div>
      <SectionHeader title="System" subtitle="Accounts, support, errors, limits and configuration." />

      <div className="flex flex-wrap gap-2 mb-6">
        {PANES.map(p => (
          <button
            key={p.id}
            onClick={() => setPane(p.id)}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-sm border transition-colors',
              pane === p.id
                ? 'bg-primary text-primary-foreground border-transparent'
                : 'bg-card text-muted-foreground border-border/60 hover:text-foreground'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <Suspense fallback={<Fallback />}>
        {pane === 'accounts' && <UserManagement />}
        {pane === 'support' && <SupportManagement />}
        {pane === 'errors' && <ErrorMonitoring />}
        {pane === 'limits' && <RateLimitMonitoring session={session} />}
        {pane === 'ai' && <AICostDashboard />}
        {pane === 'email' && <EmailBroadcast />}
        {pane === 'consent' && <TermsConsentViewer />}
        {pane === 'settings' && <SystemSettings systemConfig={systemConfig} onUpdateConfig={onUpdateConfig} />}
      </Suspense>
    </div>
  );
}
