import { useState, useEffect } from 'react';
import { spineAuth, SpineUser, SpineSession } from '@/lib/spineAuth';
import { AYNLoader, DashboardLoader } from '@/components/ui/page-loader';
import { lazy, Suspense } from 'react';

// Lazy load Dashboard (authenticated users), direct import LandingPage (most common first view)
import LandingPage from '@/components/LandingPage';
const Dashboard = lazy(() => import('@/components/Dashboard'));

const Index = () => {
  const [user, setUser] = useState<SpineUser | null>(null);
  const [session, setSession] = useState<SpineSession | null>(null);
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
        const { data } = await spineAuth.getSession();
        if (mounted && data.session) {
          setSession(data.session);
          setUser(data.session.user);
        } else if (mounted) {
          // No spine session — try to auto-migrate from any existing browser state
          const SPINE = import.meta.env.VITE_AYN_BACKEND_URL || 'https://spine.aynn.io';
          
          // Try all possible Supabase localStorage key formats
          const sbKeys = Object.keys(localStorage).filter(k => 
            k.startsWith('sb-') && k.endsWith('-auth-token')
          );
          
          let migrated = false;
          for (const key of sbKeys) {
            try {
              const stored = localStorage.getItem(key);
              if (!stored) continue;
              const parsed = JSON.parse(stored);
              const sbUser = parsed?.user || parsed?.currentSession?.user;
              if (!sbUser?.email || !sbUser?.id) continue;
              
              const res = await fetch(`${SPINE}/auth/migrate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: sbUser.email,
                  user_id: sbUser.id,
                  first_name: sbUser.user_metadata?.full_name?.split(' ')[0] || '',
                  last_name: sbUser.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
                })
              });
              if (res.ok) {
                const d = await res.json();
                const { tokenStore } = await import('@/lib/spineAuth');
                tokenStore.save({ access_token: d.access_token, refresh_token: d.refresh_token, user: d.user });
                if (mounted) {
                  setSession({ access_token: d.access_token, refresh_token: d.refresh_token, user: d.user } as any);
                  setUser(d.user as any);
                }
                migrated = true;
                break;
              }
            } catch {}
          }
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
    const { data: { subscription } } = spineAuth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_IN' && session) {
          setSession(session);
          setUser(session.user);
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
