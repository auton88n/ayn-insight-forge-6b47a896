import { useState, useEffect, lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { AYNLoader, DashboardLoader } from '@/components/ui/page-loader';
import { useUserRole } from '@/hooks/useUserRole';
import { useFeature } from '@/hooks/useFeatureFlags';
import { PlatformMaintenanceScreen } from '@/components/shared/MaintenanceNotice';
import { LegalConsentGate } from '@/components/auth/LegalConsentGate';
import LandingPage from '@/components/LandingPage';

const EmployerHub = lazy(() => import('@/pages/EmployerHub'));

// v3.210.0 -- "/employers" is now a real, dedicated page, not a toggle
// state on "/". It needs its own auth check for the same reason Index.tsx
// has one for "/": a signed-in employer landing here should go straight to
// their real dashboard, not see the marketing pitch again. Deliberately a
// separate, self-contained check rather than reusing Index.tsx's
// module-level session cache -- that cache has a documented history of
// subtle bugs from being shared across mount points (see CLAUDE.md
// v3.84.0/v3.87.0/v3.88.0), and this route doesn't need its lifecycle
// (it's a plain per-mount check, the same pattern Header.tsx already uses
// for its own signed-in state).
const Employers = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setIsInitialized(true);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setIsInitialized(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!isInitialized) return <AYNLoader />;
  if (user && session) return <EmployersAuthedShell user={user} />;
  return <LandingPage forcedAudience="employer" />;
};

const EmployersAuthedShell = ({ user }: { user: User }) => {
  const { loading, role, employerStatus, companyName } = useUserRole(user.id);
  const platform = useFeature('platform');
  if (loading) return <AYNLoader />;
  if (platform.loaded && !platform.enabled) return <PlatformMaintenanceScreen />;
  if (role === 'employer') {
    // Found live: a signed-in employer needing to re-accept an updated
    // terms/privacy version landed here (this page, not Index.tsx, is
    // every employer's real home) and had no way to know why -- the
    // backend correctly refused with 451 legal_reaccept_required on
    // employer_org_create, but nothing in this page's own tree ever
    // showed the reacceptance dialog Index.tsx already has for seekers.
    // "Continue" just silently did nothing, for an account that may be
    // new and have no other page to try instead.
    return (
      <LegalConsentGate userId={user.id}>
        {employerStatus !== 'approved'
          ? <Navigate to="/employer/pending" replace />
          : (
            <Suspense fallback={<DashboardLoader />}>
              <EmployerHub companyName={companyName} />
            </Suspense>
          )}
      </LegalConsentGate>
    );
  }
  // Marketing is public for every role. Reading it does not grant employer
  // access or change the seeker's role; those gates remain above/backend-side.
  return <LandingPage forcedAudience="employer" />;
};

export default Employers;
