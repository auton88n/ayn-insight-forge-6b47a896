import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { AYNLoader, DashboardLoader } from '@/components/ui/page-loader';
import { lazy, Suspense } from 'react';

// Lazy load Dashboard (authenticated users), direct import LandingPage (most common first view)
import LandingPage from '@/components/LandingPage';
const Dashboard = lazy(() => import('@/components/Dashboard'));

// Module-level cache: once auth has resolved, subsequent re-mounts of <Index>
// (e.g. navigating back to "/" from another route) reuse the result so we
// don't replay the AYNLoader flash on every return.
let cachedSession: Session | null = null;
let cachedUser: User | null = null;
let cachedInitialized = false;

const Index = () => {
  const [user, setUser] = useState<User | null>(cachedUser);
  const [session, setSession] = useState<Session | null>(cachedSession);
  const [loading, setLoading] = useState(false);
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

    let mounted = true;

    const initializeAuth = async () => {
      // Already resolved in a previous mount — skip the network round-trip
      // and the loader flash. onAuthStateChange below still keeps us in sync.
      if (cachedInitialized) return;
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted && data.session) {
          cachedSession = data.session;
          cachedUser = data.session.user;
          setSession(data.session);
          setUser(data.session.user);
          setLoading(true);
        }
      } catch {
        // Silent failure - show landing page
      } finally {
        if (mounted) {
          cachedInitialized = true;
          setIsInitialized(true);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_IN' && session) {
          cachedSession = session;
          cachedUser = session.user;
          cachedInitialized = true;
          setSession(session);
          setUser(session.user);
          setLoading(true);
          setIsInitialized(true);
        } else if (event === 'SIGNED_OUT') {
          cachedSession = null;
          cachedUser = null;
          setSession(null);
          setUser(null);
          setLoading(false);
        } else if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session) {
          cachedSession = session;
          cachedUser = session.user;
          setSession(session);
          setUser(session.user);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Show loader only during initial check OR when transitioning to dashboard
  if (!isInitialized || (loading && !user)) {
    return <AYNLoader />;
  }

  // Show dashboard if authenticated, landing page otherwise
  return user && session ? (
    <Suspense fallback={<DashboardLoader />}>
      <Dashboard user={user} session={session} />
    </Suspense>
  ) : (
    <LandingPage />
  );
};

export default Index;
