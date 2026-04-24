import { useState, useEffect, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, HardHat } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { SEO } from '@/components/shared/SEO';
import { useIsMobile } from '@/hooks/use-mobile';
import MobileBlockScreen from '@/components/engineering/MobileBlockScreen';

const ComplianceWizard = lazy(() => import('@/components/engineering/compliance/ComplianceWizard'));

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-pulse flex flex-col items-center gap-3">
      <HardHat className="w-8 h-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
);

const CompliancePage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [userId, setUserId] = useState<string | undefined>();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
      setIsCheckingAuth(false);
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUserId(session?.user?.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isCheckingAuth && !userId) navigate('/');
  }, [isCheckingAuth, userId, navigate]);

  if (isCheckingAuth || !userId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center">
        <div className="animate-pulse">
          <ClipboardCheck className="w-12 h-12 text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (isMobile) return <MobileBlockScreen />;

  return (
    <>
      <SEO
        title="Code Compliance | Building Code Check"
        description="Check your residential building designs against IRC 2024 and NBC 2025 building codes with AI-powered compliance analysis."
      />

      <div className="h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/20">
        <header className="shrink-0 border-b border-border/50 bg-background/80 backdrop-blur-xl z-40">
          <div className="px-4 py-3 flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>

            <div className="h-6 w-px bg-border" />

            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20">
                <ClipboardCheck className="w-5 h-5 text-teal-500" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Code Compliance</h1>
                <p className="text-xs text-muted-foreground">Building Code Check</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-4xl mx-auto">
            <Suspense fallback={<LoadingFallback />}>
              <ComplianceWizard userId={userId} />
            </Suspense>
          </div>
        </main>
      </div>
    </>
  );
};

export default CompliancePage;
