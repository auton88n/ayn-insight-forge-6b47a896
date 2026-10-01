import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { AYNLoader, DashboardLoader } from '@/components/ui/page-loader';
import { lazy, Suspense } from 'react';
import { useUserRole } from '@/hooks/useUserRole';
import { Navigate } from 'react-router-dom';

// v3.8.0 — there is no seeker chat on the dashboard any more. A signed in job
// seeker lands in Resume Hub. The only conversational surface left is the
// employer candidate search in EmployerHub.
import LandingPage from '@/components/LandingPage';
const EmployerHub = lazy(() => import('@/pages/EmployerHub'));
import { useFeature } from '@/hooks/useFeatureFlags';
import { PlatformMaintenanceScreen } from '@/components/shared/MaintenanceNotice';



// Module-level cache: once auth has resolved, subsequent re-mounts of <Index>
// (e.g. navigating back to "/" from another route) reuse the result so we
// don't replay the AYNLoader flash on every return.
//
// v3.84.0 fix — the listener that kept this cache correct used to live
// inside <Index>'s own useEffect, so it only ever heard SIGNED_OUT while
// <Index> itself was mounted. Signing out from anywhere else (Resume Hub,
// Employer Hub, Settings — everywhere sign-out actually lives) left the
// cache stale, still "signed in." The next navigate("/") mounted a fresh
// <Index>, which trusted the stale cache without rechecking, rendered
// AuthedShell, and bounced straight back into /resume-hub — which ran its
// own real auth check, correctly found no session, toasted "Sign in
// required," and navigated back to "/" — which hit the same stale cache
// again. Infinite loop, visible as the page flickering between a loading
// spinner and the toast, reported live from production. Fixed by moving
// the auth listener to module scope: it now runs once for the app's whole
// lifetime, independent of whether <Index> happens to be mounted, so the
// cache can never go stale behind a sign-out that happens elsewhere.
let cachedSession: Session | null = null;
let cachedUser: User | null = null;
let cachedInitialized = false;
const cacheListeners = new Set<() => void>();

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    cachedSession = null;
    cachedUser = null;
  } else if (session) {
    // Any event that carries a session means we're authenticated:
    // SIGNED_IN (fresh login), INITIAL_SESSION (restored on reload or
    // returned from an OAuth redirect), TOKEN_REFRESHED, USER_UPDATED.
    cachedSession = session;
    cachedUser = session.user;
  }
  // INITIAL_SESSION with no session, or SIGNED_OUT: cache stays null above.
  cachedInitialized = true;
  cacheListeners.forEach((fn) => fn());
});

const Index = () => {
  const [user, setUser] = useState<User | null>(cachedUser);
  const [session, setSession] = useState<Session | null>(cachedSession);
  const [isInitialized, setIsInitialized] = useState(cachedInitialized);

  useEffect(() => {
    // Skip auth handling if on password reset flow - let ResetPassword page handle it
    const isRecoveryFlow = window.location.pathname === '/reset-password' ||
                           window.location.hash.includes('type=recovery') ||
                           (window.location.pathname === '/reset-password' && new URLSearchParams(window.location.search).has('code'));

    if (isRecoveryFlow) {
      if (import.meta.env.DEV) {
        console.log('[Index] Recovery flow detected, skipping auth intercept');
      }
      return;
    }

    // Adopt whatever the shared cache currently holds (covers both "the
    // module-level listener above already resolved before this mount" and
    // "it resolves later, while we're mounted") and re-sync on every change.
    const sync = () => {
      setUser(cachedUser);
      setSession(cachedSession);
      setIsInitialized(cachedInitialized);
    };
    sync();
    cacheListeners.add(sync);
    return () => {
      cacheListeners.delete(sync);
    };
  }, []);

  if (!isInitialized) {
    return <AYNLoader />;
  }

  if (user && session) {
    return <AuthedShell user={user} session={session} />;
  }
  return <LandingPage />;
};

// v2.10.0 — Route employers through the pending gate until an admin approves.
// v3.6.0 — an APPROVED employer lands in the hiring surface.
// v3.8.0 — a job seeker lands in Resume Hub. The open ended dashboard chat is
// gone in favor of grounded, per-job actions (score, tailor, cover letter).
// v3.164.0 — the Chrome extension that later carried "Ask AYN" is retired too;
// every seeker-facing capability now lives in Resume Hub itself.
// v3.228.0 — reported directly, the exact "sign in and I see a different
// dashboard" complaint this whole redesign effort started from: a signed
// in job seeker no longer gets hard-navigated to the separate /resume-hub
// shell at all. LandingPage is the same component a signed-out visitor
// sees; Profile, Saved jobs, Proposals, Assessments and Settings are now
// real tabs inside it (AccountTabs.tsx), gated on auth per tab rather than
// the whole page swapping to a different shell the moment you sign in.
const AuthedShell = ({ user, session: _session }: { user: User; session: Session }) => {
  const { loading, role, employerStatus, companyName } = useUserRole(user.id);
  const platform = useFeature('platform');
  if (loading) return <AYNLoader />;
  if (platform.loaded && !platform.enabled) return <PlatformMaintenanceScreen />;
  if (role === 'employer') {
    if (employerStatus !== 'approved') return <Navigate to="/employer/pending" replace />;
    return (
      <Suspense fallback={<DashboardLoader />}>
        <EmployerHub companyName={companyName} />
      </Suspense>
    );
  }
  return <LandingPage />;
};




export default Index;
