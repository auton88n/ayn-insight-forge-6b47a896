import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { AYNLoader, DashboardLoader } from '@/components/ui/page-loader';
import { lazy, Suspense } from 'react';

// Lazy load Dashboard (authenticated users), direct import LandingPage (most common first view)
import LandingPage from '@/components/LandingPage';
const Dashboard = lazy(() => import('@/components/Dashboard'));

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false); // Start false - show landing page immediately
  const [isInitialized, setIsInitialized] = useState(false);

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
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted && data.session) {
          setSession(data.session);
          setUser(data.session.user);
          setLoading(true);
        }
      } catch {
        // Silent failure - show landing page
      } finally {
        if (mounted) {
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
          setSession(session);
          setUser(session.user);
          setLoading(true);
          setIsInitialized(true);
        } else if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setLoading(false);
        } else if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session) {
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
