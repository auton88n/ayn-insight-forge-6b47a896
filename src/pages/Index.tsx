import { useState, useEffect } from 'react';
import { spineAuth, SpineUser, SpineSession, tokenStore } from '@/lib/spineAuth';
import { AYNLoader } from '@/components/ui/page-loader';
import { lazy, Suspense } from 'react';

import LandingPage from '@/components/LandingPage';
const Dashboard = lazy(() => import('@/components/Dashboard'));

const Index = () => {
  const [user, setUser] = useState<SpineUser | null>(null);
  const [session, setSession] = useState<SpineSession | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Step 1: Check if we already have a spine session in localStorage (instant)
    const storedToken = tokenStore.getAccessToken();
    const storedUser = tokenStore.getUser();

    if (storedToken && storedUser) {
      // We have a session — validate it's not expired
      try {
        const payload = JSON.parse(atob(storedToken.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) {
          // Token still valid — show dashboard immediately
          if (mounted) {
            setUser(storedUser);
            setSession({ access_token: storedToken, refresh_token: tokenStore.getRefreshToken()!, user: storedUser });
            setIsInitialized(true);
          }
          return;
        }
      } catch {}
    }

    // Step 2: Try refreshing the token
    spineAuth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        setUser(data.session.user);
        setSession(data.session);
      }
      setIsInitialized(true);
    }).catch(() => {
      if (mounted) setIsInitialized(true);
    });

    // Step 3: Listen for auth state changes (login/logout)
    const { data: { subscription } } = spineAuth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_IN' && session) {
        setUser(session.user);
        setSession(session);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setSession(null);
      }
      setIsInitialized(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!isInitialized) return <AYNLoader />;
  if (!user || !session) return <LandingPage />;

  return (
    <Suspense fallback={<AYNLoader />}>
      <Dashboard user={user} session={session} />
    </Suspense>
  );
};

export default Index;
