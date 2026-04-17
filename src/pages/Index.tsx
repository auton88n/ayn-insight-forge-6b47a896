import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { spineAuth, SpineUser, SpineSession } from '@/lib/spineAuth';
import { AYNLoader } from '@/components/ui/page-loader';
import { lazy, Suspense } from 'react';

import LandingPage from '@/components/LandingPage';
const Dashboard = lazy(() => import('@/components/Dashboard'));

const Index = () => {
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Get current session from Supabase (instant - reads from localStorage)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        setSession(session);
        setUser(session.user);
      }
      setIsInitialized(true);
    });

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        setIsInitialized(true);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!isInitialized) {
    return <AYNLoader />;
  }

  if (!user || !session) {
    return <LandingPage />;
  }

  return (
    <Suspense fallback={<AYNLoader />}>
      <Dashboard user={user} session={session} />
    </Suspense>
  );
};

export default Index;
