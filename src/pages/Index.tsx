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

        if (event === 'SIGNED_OUT') {
          cachedSession = null;
          cachedUser = null;
          cachedInitialized = true;
          setSession(null);
          setUser(null);
          setLoading(false);
          setIsInitialized(true);
        } else if (session) {
          // Any event that carries a session means we're authenticated:
          // SIGNED_IN (fresh login), INITIAL_SESSION (restored on reload or
          // returned from an OAuth redirect), TOKEN_REFRESHED, USER_UPDATED.
          // Previously only SIGNED_IN was handled, so a session arriving via
          // INITIAL_SESSION left the user stuck on the landing page.
          cachedSession = session;
          cachedUser = session.user;
          cachedInitialized = true;
          setSession(session);
          setUser(session.user);
          setIsInitialized(true);
        } else if (event === 'INITIAL_SESSION') {
          // Initial check completed with no session — show the landing page.
          cachedInitialized = true;
          setIsInitialized(true);
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

  if (user && session) {
    return <AuthedShell user={user} session={session} />;
  }
  return <LandingPage />;
};

// v2.10.0 — Route employers through the pending gate until an admin approves.
// v3.6.0 — an APPROVED employer lands in the hiring surface.
// v3.8.0 — a job seeker lands in Resume Hub. The open ended dashboard chat is
// gone; Ask AYN in the extension, grounded in a real job description, is where
// a seeker talks to AYN now.
const AuthedShell = ({ user, session: _session }: { user: User; session: Session }) => {
  const { loading, role, employerStatus, companyName } = useUserRole(user.id);
  if (loading) return <AYNLoader />;
  if (role === 'employer') {
    if (employerStatus !== 'approved') return <Navigate to="/employer/pending" replace />;
    return (
      <Suspense fallback={<DashboardLoader />}>
        <EmployerHub companyName={companyName} />
      </Suspense>
    );
  }
  return <Navigate to="/resume-hub" replace />;
};



export default Index;
